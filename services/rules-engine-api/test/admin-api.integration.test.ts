import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool } from "pg";
import { createPool, runMigrations, seedDatabase } from "@healthcare/database";
import { createHipaaLogger } from "@healthcare/shared-contracts";
import { createApp } from "../src/app.js";

const ADMIN_HEADERS = {
  "x-actor-id": "admin-clinician-01",
  "x-actor-role": "ADMIN",
};

describe("Admin API & RBAC Middleware Integration Tests", () => {
  const testDbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  let pool: Pool;

  beforeAll(async () => {
    pool = createPool(testDbUrl);
    await runMigrations(pool);
    await seedDatabase(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM questions WHERE question_key LIKE 'test_admin_%'");
    await pool.query("DELETE FROM clinical_rules WHERE rule_code LIKE 'TEST_ADMIN_%'");
    await pool.query("TRUNCATE TABLE audit_logs RESTART IDENTITY");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM questions WHERE question_key LIKE 'test_admin_%'");
    await pool.query("DELETE FROM clinical_rules WHERE rule_code LIKE 'TEST_ADMIN_%'");
    await pool.end();
  });

  function buildApp() {
    return createApp(pool, createHipaaLogger("rules-engine-api-admin-test", () => {}));
  }

  it("enforces strict RBAC: 401 unauthenticated, 403 for PATIENT/PROVIDER with ACCESS_DENIED audit log, 200 for ADMIN and IAP allowlist", async () => {
    const app = buildApp();

    // Unauthenticated -> 401
    const unauth = await request(app).get("/api/v1/admin/rules");
    expect(unauth.status).toBe(401);

    // PATIENT -> 403
    const patientRes = await request(app)
      .get("/api/v1/admin/rules")
      .set("x-actor-id", "syn-patient-1")
      .set("x-actor-role", "PATIENT");
    expect(patientRes.status).toBe(403);

    // PROVIDER -> 403
    const providerRes = await request(app)
      .post("/api/v1/admin/questions")
      .set("x-actor-id", "dr-provider-1")
      .set("x-actor-role", "PROVIDER")
      .send({});
    expect(providerRes.status).toBe(403);

    // Confirm ACCESS_DENIED audit logs were recorded
    const auditRes = await pool.query<{ action: string; actor_role: string }>(
      "SELECT action, actor_role FROM audit_logs WHERE action = 'ACCESS_DENIED' ORDER BY id ASC",
    );
    expect(auditRes.rowCount).toBe(2);
    expect(auditRes.rows[0]!.actor_role).toBe("PATIENT");
    expect(auditRes.rows[1]!.actor_role).toBe("PROVIDER");

    // GCP IAP allowlisted email -> 200
    process.env.ADMIN_EMAIL_ALLOWLIST = "chief-medical-officer@hospital.test";
    const iapAdminRes = await request(app)
      .get("/api/v1/admin/rules")
      .set("x-goog-authenticated-user-email", "accounts.google.com:chief-medical-officer@hospital.test")
      .set("x-goog-authenticated-user-id", "accounts.google.com:10987654321");
    expect(iapAdminRes.status).toBe(200);
    expect(iapAdminRes.body.total).toBeGreaterThanOrEqual(54);
    delete process.env.ADMIN_EMAIL_ALLOWLIST;
  });

  it("supports Question Editor CRUD with automatic version bumping and immutable audit logging", async () => {
    const app = buildApp();

    // Create question
    const createRes = await request(app)
      .post("/api/v1/admin/questions")
      .set(ADMIN_HEADERS)
      .send({
        question_key: "test_admin_radon_exposure",
        domain: "Pulmonology",
        label_plain_english: "Have you lived in a home with elevated radon levels?",
        helper_tooltip: "Radon is a secondary lung cancer risk factor.",
        input_type: "boolean",
        data_source: "PATIENT",
        is_knockout_gate: false,
        sort_order: 299,
      });
    expect(createRes.status).toBe(201);
    const createdId = createRes.body.question.id as string;
    expect(createRes.body.question.version).toBe(1);

    // Duplicate question_key -> 409 Conflict
    const dupRes = await request(app)
      .post("/api/v1/admin/questions")
      .set(ADMIN_HEADERS)
      .send({
        question_key: "test_admin_radon_exposure",
        domain: "Pulmonology",
        label_plain_english: "Duplicate key test",
        input_type: "boolean",
      });
    expect(dupRes.status).toBe(409);

    // Update question -> version bumps 1 -> 2
    const updateRes = await request(app)
      .put(`/api/v1/admin/questions/${createdId}`)
      .set(ADMIN_HEADERS)
      .send({
        label_plain_english: "Have you ever tested your home for elevated radon gas (>4 pCi/L)?",
        is_knockout_gate: true,
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.question.version).toBe(2);
    expect(updateRes.body.question.is_knockout_gate).toBe(true);

    // Soft-deactivate -> is_active = false, version bumps 2 -> 3
    const deleteRes = await request(app)
      .delete(`/api/v1/admin/questions/${createdId}`)
      .set(ADMIN_HEADERS);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.question.is_active).toBe(false);
    expect(deleteRes.body.question.version).toBe(3);

    // Verify audit trail
    const logs = await pool.query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE resource_id = $1 ORDER BY id ASC",
      [createdId],
    );
    expect(logs.rows.map((r) => r.action)).toEqual([
      "CREATE_QUESTION",
      "UPDATE_QUESTION",
      "DEACTIVATE_QUESTION",
    ]);
  });

  it("supports Clinical Rule & CPT/ICD-10 CRUD with global version snapshotting and live JsonLogic dry-run", async () => {
    const app = buildApp();

    // Create custom clinical rule
    const createRes = await request(app)
      .post("/api/v1/admin/rules")
      .set(ADMIN_HEADERS)
      .send({
        rule_code: "TEST_ADMIN_CUSTOM_LUNG",
        display_name: "Custom Extended Lung Screening Rule",
        specialty: "Pulmonology",
        rule_type: "PATIENT_REPORTED",
        acuity_level: "HIGH_RISK",
        logic_expression: {
          and: [
            { ">=": [{ var: "derived.age" }, 45] },
            { ">=": [{ var: "answers.pack_years" }, 15] },
          ],
        },
        recommended_intervention: "Low-Dose CT Thorax (Extended Criteria)",
        cpt_codes: ["71271"],
        icd10_codes: ["Z87.891"],
        prior_auth_rationale_template: "Custom screening threshold satisfied.",
      });
    expect(createRes.status).toBe(201);
    const ruleId = createRes.body.rule.id as string;
    const v1 = createRes.body.rule.version as number;
    expect(v1).toBeGreaterThanOrEqual(2);

    // Update CPT/ICD-10 & threshold -> version snapshot increments
    const updateRes = await request(app)
      .put(`/api/v1/admin/rules/${ruleId}`)
      .set(ADMIN_HEADERS)
      .send({
        logic_expression: {
          and: [
            { ">=": [{ var: "derived.age" }, 50] },
            { ">=": [{ var: "answers.pack_years" }, 20] },
          ],
        },
        cpt_codes: ["71271", "99406"],
        icd10_codes: ["Z87.891", "F17.210"],
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.rule.version).toBe(v1 + 1);
    expect(updateRes.body.rule.cpt_codes).toEqual(["71271", "99406"]);
    expect(updateRes.body.rules_version_snapshot).toBe(v1 + 1);

    // Fetch single rule with version history
    const detailRes = await request(app)
      .get(`/api/v1/admin/rules/${ruleId}`)
      .set(ADMIN_HEADERS);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.version_history.length).toBe(2);

    // Invalid ICD-10 format rejected with 400
    const badCodeRes = await request(app)
      .put(`/api/v1/admin/rules/${ruleId}`)
      .set(ADMIN_HEADERS)
      .send({ icd10_codes: ["INVALID_CODE!!"] });
    expect(badCodeRes.status).toBe(400);

    // Live JsonLogic dry-run sandbox (synthetic patient)
    const dryRunMatch = await request(app)
      .post("/api/v1/admin/rules/dry-run")
      .set(ADMIN_HEADERS)
      .send({
        rule_code: "FIB4",
        logic_expression: { ">=": [{ var: "derived.fib4_score" }, 2.67] },
        synthetic_patient: { dob: "1964-01-01", sex_at_birth: "Male" },
        answers: {
          lab_ast_u_l: 95,
          lab_alt_u_l: 52,
          lab_platelets_10e9_l: 115,
        },
      });
    expect(dryRunMatch.status).toBe(200);
    expect(dryRunMatch.body.matched).toBe(true);
    expect(dryRunMatch.body.calculated_score).toBeGreaterThan(2.67);

    const dryRunMiss = await request(app)
      .post("/api/v1/admin/rules/dry-run")
      .set(ADMIN_HEADERS)
      .send({
        rule_code: "FIB4",
        logic_expression: { ">=": [{ var: "derived.fib4_score" }, 2.67] },
        synthetic_patient: { dob: "1992-01-01", sex_at_birth: "Female" },
        answers: {
          lab_ast_u_l: 22,
          lab_alt_u_l: 24,
          lab_platelets_10e9_l: 260,
        },
      });
    expect(dryRunMiss.status).toBe(200);
    expect(dryRunMiss.body.matched).toBe(false);
  });
});
