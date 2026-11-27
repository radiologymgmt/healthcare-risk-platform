import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool } from "pg";
import { createPool, runMigrations, seedDatabase } from "@healthcare/database";
import { createHipaaLogger } from "@healthcare/shared-contracts";
import { createApp } from "../src/app.js";

describe("Rules Engine API Integration Tests (PostgreSQL 16 + Synthetic Data)", () => {
  const testDbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  let pool: Pool;
  const capturedLogs: string[] = [];

  beforeAll(async () => {
    pool = createPool(testDbUrl);
    await runMigrations(pool);
    await seedDatabase(pool);
  });

  beforeEach(async () => {
    capturedLogs.length = 0;
    await pool.query(
      "TRUNCATE TABLE audit_logs, workqueue_items, triggered_pathways, assessment_responses, assessment_sessions, clinical_documents, patients RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  function buildApp() {
    const logger = createHipaaLogger("rules-engine-api-test", (line) => capturedLogs.push(line));
    return createApp(pool, logger);
  }

  it("GET /health returns ok", async () => {
    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "rules-engine-api" });
  });

  it("GET /api/v1/questionnaire/config returns active questions, knockout gates, and respects filters", async () => {
    const app = buildApp();

    // Default (patient-facing, excludes EHR_LAB only questions)
    const allRes = await request(app).get("/api/v1/questionnaire/config");
    expect(allRes.status).toBe(200);
    expect(allRes.body.rules_version_snapshot).toBeGreaterThanOrEqual(1);
    expect(allRes.body.total_questions).toBeGreaterThan(40);
    expect(allRes.body.knockout_gates.length).toBeGreaterThan(5);
    expect(
      allRes.body.questions.every((q: { data_source: string }) => q.data_source !== "EHR_LAB"),
    ).toBe(true);

    // Filter by modules=oncology and sex_at_birth=Male (should exclude female-only questions)
    const maleOncRes = await request(app).get(
      "/api/v1/questionnaire/config?modules=oncology&sex_at_birth=Male&age=35",
    );
    expect(maleOncRes.status).toBe(200);
    const keys: string[] = maleOncRes.body.questions.map(
      (q: { question_key: string }) => q.question_key,
    );
    expect(keys).toContain("family_cancer_pedigree");
    expect(keys).toContain("smoking_status");
    expect(keys).not.toContain("age_at_menarche");
    expect(keys).not.toContain("has_headache_new_onset_over_50"); // min_age: 50 filtered out
    expect(keys).not.toContain("ipss_symptom_score"); // Urology module not requested
  });

  it("POST /api/v1/sessions/:id/evaluate merges patient answers + EHR labs, writes triggered_pathways, workqueue_items, and immutable HIPAA audit_logs", async () => {
    const app = buildApp();

    // 1. Seed synthetic patient (zero real PHI)
    const patientRes = await pool.query<{ id: string }>(
      `
      INSERT INTO patients (mrn, first_name, last_name, dob, sex_at_birth, email, phone, zip_code)
      VALUES ('SYN-MRN-1001', 'Synthetic', 'TestPatient', '1962-04-15', 'Male', 'syn@example.test', '555-0199', '94107')
      RETURNING id
      `,
    );
    const patientId = patientRes.rows[0]!.id;

    // 2. Seed prior EHR lab session (Component 6/2 auto-ingested labs: AST/ALT/Platelets + PSA)
    const ehrSessionRes = await pool.query<{ id: string }>(
      `
      INSERT INTO assessment_sessions (patient_id, channel, status)
      VALUES ($1, 'AUTO_EHR_EVAL', 'PREPOPULATED')
      RETURNING id
      `,
      [patientId],
    );
    const ehrSessionId = ehrSessionRes.rows[0]!.id;

    await pool.query(
      `
      INSERT INTO assessment_responses (session_id, patient_id, question_key, answer_value, provenance)
      VALUES
        ($1, $2, 'lab_ast_u_l', '92'::jsonb, 'EHR_LAB_IMPORT'),
        ($1, $2, 'lab_alt_u_l', '50'::jsonb, 'EHR_LAB_IMPORT'),
        ($1, $2, 'lab_platelets_10e9_l', '110'::jsonb, 'EHR_LAB_IMPORT'),
        ($1, $2, 'lab_psa_ng_ml', '4.8'::jsonb, 'EHR_LAB_IMPORT')
      `,
      [ehrSessionId, patientId],
    );

    // 3. Create patient web intake session
    const webSessionRes = await pool.query<{ id: string }>(
      `
      INSERT INTO assessment_sessions (patient_id, channel, status)
      VALUES ($1, 'WEB_PORTAL', 'IN_PROGRESS')
      RETURNING id
      `,
      [patientId],
    );
    const webSessionId = webSessionRes.rows[0]!.id;

    // 4. Submit patient-entered responses & evaluate across all 54 rules
    const evalRes = await request(app)
      .post(`/api/v1/sessions/${webSessionId}/evaluate`)
      .send({
        actor_id: "SYN-PATIENT-1001",
        actor_role: "PATIENT",
        responses: [
          { question_key: "smoking_status", answer_value: "current", provenance: "PATIENT_ENTERED" },
          { question_key: "pack_years", answer_value: 28, provenance: "PATIENT_ENTERED" },
          { question_key: "has_thunderclap_headache", answer_value: true, provenance: "PATIENT_ENTERED" },
        ],
      });

    expect(evalRes.status).toBe(200);
    expect(evalRes.body.evaluated_rule_count).toBe(54);
    expect(evalRes.body.highest_acuity).toBe("ACUTE_RED_FLAG");
    expect(evalRes.body.workqueue_priority).toBe("STAT");
    expect(evalRes.body.workqueue_item_id).toBeTruthy();

    const codes: string[] = evalRes.body.triggered_pathways.map(
      (p: { rule_code: string }) => p.rule_code,
    );
    // Patient-reported rules triggered
    expect(codes).toContain("SNNOOP10");
    expect(codes).toContain("USPSTF_LUNG");
    // EHR-lab-dependent rules ALSO triggered via unified data model merge!
    expect(codes).toContain("FIB4");
    expect(codes).toContain("APRI");
    expect(codes).toContain("PCPT_2_FULL_PSA");

    // Verify DB persistence
    const pathwaysDb = await pool.query(
      "SELECT rule_code, acuity_level FROM triggered_pathways WHERE session_id = $1",
      [webSessionId],
    );
    expect(pathwaysDb.rowCount).toBe(evalRes.body.triggered_count);

    const wqDb = await pool.query<{ priority: string; status: string }>(
      "SELECT priority, status FROM workqueue_items WHERE session_id = $1",
      [webSessionId],
    );
    expect(wqDb.rowCount).toBe(1);
    expect(wqDb.rows[0]).toEqual({ priority: "STAT", status: "NEW" });

    const sessionDb = await pool.query<{ status: string; completed_at: Date | null }>(
      "SELECT status, completed_at FROM assessment_sessions WHERE id = $1",
      [webSessionId],
    );
    expect(sessionDb.rows[0]!.status).toBe("SUBMITTED");
    expect(sessionDb.rows[0]!.completed_at).not.toBeNull();

    // Verify immutable HIPAA audit log was recorded with ZERO PHI
    const auditDb = await pool.query<{
      actor_id: string;
      action: string;
      resource_id: string;
      metadata: Record<string, unknown>;
    }>("SELECT actor_id, action, resource_id, metadata FROM audit_logs");
    expect(auditDb.rowCount).toBe(1);
    expect(auditDb.rows[0]!.actor_id).toBe("SYN-PATIENT-1001");
    expect(auditDb.rows[0]!.action).toBe("EVALUATE_SESSION");
    expect(auditDb.rows[0]!.resource_id).toBe(webSessionId);

    const auditJson = JSON.stringify(auditDb.rows[0]!.metadata);
    expect(auditJson).not.toContain("TestPatient");
    expect(auditJson).not.toContain("SYN-MRN-1001");
    expect(auditJson).not.toContain("1962-04-15");

    // Verify ZERO PHI in application logs
    const allLogs = capturedLogs.join("\n");
    expect(allLogs).not.toContain("TestPatient");
    expect(allLogs).not.toContain("SYN-MRN-1001");
    expect(allLogs).not.toContain("syn@example.test");
    expect(allLogs).not.toContain("555-0199");

    // 5. Re-evaluating the same session is idempotent (no duplicate pathways or workqueue rows)
    const reEvalRes = await request(app)
      .post(`/api/v1/sessions/${webSessionId}/evaluate`)
      .send({ actor_id: "SYSTEM_RULES_ENGINE", actor_role: "SYSTEM" });
    expect(reEvalRes.status).toBe(200);
    expect(reEvalRes.body.workqueue_item_id).toBe(evalRes.body.workqueue_item_id);

    const wqAfter = await pool.query("SELECT id FROM workqueue_items WHERE session_id = $1", [
      webSessionId,
    ]);
    expect(wqAfter.rowCount).toBe(1);
  });

  it("returns 400 on invalid session UUID or missing AI_PARSED provenance, and 404 on missing session", async () => {
    const app = buildApp();

    const badUuid = await request(app).post("/api/v1/sessions/not-a-uuid/evaluate").send({});
    expect(badUuid.status).toBe(400);

    const missingSession = await request(app)
      .post("/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000/evaluate")
      .send({});
    expect(missingSession.status).toBe(404);

    const badProvenance = await request(app)
      .post("/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000/evaluate")
      .send({
        responses: [
          { question_key: "smoking_status", answer_value: "former", provenance: "AI_PARSED" },
        ],
      });
    expect(badProvenance.status).toBe(400);
  });
});
