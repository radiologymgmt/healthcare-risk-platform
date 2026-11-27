import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool } from "pg";
import { createPool, runMigrations, seedDatabase } from "@healthcare/database";
import { createHipaaLogger } from "@healthcare/shared-contracts";
import { createApp } from "../src/app.js";

describe("Component 3 & 4 API Integration Tests (Stedi Eligibility, Scheduling, Magic-Link Verification)", () => {
  const testDbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  let pool: Pool;

  beforeAll(async () => {
    pool = createPool(testDbUrl);
    await runMigrations(pool);
    await seedDatabase(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM patients WHERE first_name = 'SyntheticPhase4'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM patients WHERE first_name = 'SyntheticPhase4'");
    await pool.end();
  });

  function buildApp() {
    return createApp(pool, createHipaaLogger("patient-api-test", () => {}));
  }

  it("supports patient intake session creation, Stedi X12 270/271 eligibility verification, and appointment booking", async () => {
    const app = buildApp();

    // 1. Create intake session
    const sessRes = await request(app).post("/api/v1/patients/sessions").send({
      first_name: "SyntheticPhase4",
      last_name: "WebIntake",
      dob: "1960-03-15",
      sex_at_birth: "Male",
      zip_code: "94107",
      selected_modules: ["pulmonology", "cardio"],
    });
    expect(sessRes.status).toBe(201);
    const { patient_id, session_id } = sessRes.body as { patient_id: string; session_id: string };

    // 2. Verify Stedi insurance eligibility (synthetic X12 271 mock)
    const insRes = await request(app).post("/api/v1/insurance/verify").send({
      patient_id,
      payer_id: "60054",
      payer_name: "Aetna Commercial",
      member_id: "SYN-MEM-8899",
    });
    expect(insRes.status).toBe(200);
    expect(insRes.body.insurance_status.eligible).toBe(true);
    expect(insRes.body.insurance_status.coverage_status).toBe("ACTIVE");

    // 3. Evaluate session and book appointment
    const evalRes = await request(app)
      .post(`/api/v1/sessions/${session_id}/evaluate`)
      .send({
        actor_id: `PATIENT:${patient_id}`,
        actor_role: "PATIENT",
        responses: [
          { question_key: "smoking_status", answer_value: "current", provenance: "PATIENT_ENTERED" },
          { question_key: "pack_years", answer_value: 25, provenance: "PATIENT_ENTERED" },
        ],
      });
    expect(evalRes.status).toBe(200);
    expect(evalRes.body.workqueue_item_id).toBeTruthy();

    const slotsRes = await request(app).get("/api/v1/appointments/slots");
    expect(slotsRes.status).toBe(200);
    const firstSlot = slotsRes.body.slots[0];

    const bookRes = await request(app).post("/api/v1/appointments").send({
      patient_id,
      workqueue_item_id: evalRes.body.workqueue_item_id,
      scheduled_start: firstSlot.scheduled_start,
      scheduled_end: firstSlot.scheduled_end,
    });
    expect(bookRes.status).toBe(201);
    expect(bookRes.body.appointment.status).toBe("BOOKED");

    // Confirm workqueue item moved to SCHEDULED
    const wq = await pool.query<{ status: string }>(
      "SELECT status FROM workqueue_items WHERE id = $1",
      [evalRes.body.workqueue_item_id],
    );
    expect(wq.rows[0]!.status).toBe("APPOINTMENT_SCHEDULED");
  });

  it("enforces tokenized magic-link DOB + ZIP verification, AI Review & Confirm provenance, and single-use invalidation", async () => {
    const app = buildApp();

    // Seed synthetic patient + AI pre-populated session
    const pRes = await pool.query<{ id: string }>(
      `
      INSERT INTO patients (first_name, last_name, dob, sex_at_birth, zip_code)
      VALUES ('SyntheticPhase4', 'MobileUser', '1962-04-15', 'Female', '94107')
      RETURNING id
      `,
    );
    const patientId = pRes.rows[0]!.id;

    const sRes = await pool.query<{ id: string }>(
      `
      INSERT INTO assessment_sessions (patient_id, channel, status)
      VALUES ($1, 'MOBILE_MAGIC_LINK', 'PREPOPULATED')
      RETURNING id
      `,
      [patientId],
    );
    const sessionId = sRes.rows[0]!.id;

    await pool.query(
      `
      INSERT INTO assessment_responses (
        session_id, patient_id, question_key, answer_value, provenance, confidence_score, source_excerpt
      )
      VALUES
        ($1, $2, 'smoking_status', '"former"'::jsonb, 'AI_PARSED', 0.960, 'Former smoker, quit 5 years ago.'),
        ($1, $2, 'pack_years', '25'::jsonb, 'AI_PARSED', 0.950, 'History of 25 pack-years.'),
        ($1, $2, 'years_since_quit_smoking', '5'::jsonb, 'AI_PARSED', 0.930, 'Quit 5 years ago.')
      `,
      [sessionId, patientId],
    );

    // 1. Create single-use magic link
    const mlRes = await request(app)
      .post("/api/v1/magic-link/create")
      .send({ patient_id: patientId, session_id: sessionId });
    expect(mlRes.status).toBe(201);
    const token = mlRes.body.token as string;

    // 2. Wrong ZIP rejected with 403
    const badVerify = await request(app)
      .post("/api/v1/magic-link/verify")
      .send({ token, dob: "1962-04-15", zip_code: "10001" });
    expect(badVerify.status).toBe(403);

    // 3. Correct DOB + ZIP succeeds and issues short-lived signed session token
    const goodVerify = await request(app)
      .post("/api/v1/magic-link/verify")
      .send({ token, dob: "1962-04-15", zip_code: "94107" });
    expect(goodVerify.status).toBe(200);
    const sessionToken = goodVerify.body.session_token as string;

    // 4. Fetch AI pre-populated review cards
    const reviewRes = await request(app)
      .get("/api/v1/magic-link/session")
      .set("authorization", `Bearer ${sessionToken}`);
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.items).toHaveLength(3);
    expect(reviewRes.body.items[0].source_excerpt).toBeTruthy();

    // 5. Confirm AI answers -> upgrades provenance to PATIENT_CONFIRMED_AI & triggers USPSTF_LUNG
    const confirmRes = await request(app)
      .post("/api/v1/magic-link/confirm")
      .set("authorization", `Bearer ${sessionToken}`)
      .send({
        confirmations: [
          { question_key: "smoking_status", answer_value: "former", confirmed_as_parsed: true },
          { question_key: "pack_years", answer_value: 25, confirmed_as_parsed: true },
          { question_key: "years_since_quit_smoking", answer_value: 5, confirmed_as_parsed: true },
        ],
      });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.completed).toBe(true);
    expect(
      confirmRes.body.triggered_pathways.some(
        (p: { rule_code: string }) => p.rule_code === "USPSTF_LUNG",
      ),
    ).toBe(true);

    // Verify provenance upgraded in DB
    const provDb = await pool.query<{ provenance: string }>(
      "SELECT provenance FROM assessment_responses WHERE session_id = $1 AND question_key = 'pack_years'",
      [sessionId],
    );
    expect(provDb.rows[0]!.provenance).toBe("PATIENT_CONFIRMED_AI");

    // 6. Single-use enforcement: verifying or confirming the same magic link again fails with 401
    const replayRes = await request(app)
      .post("/api/v1/magic-link/verify")
      .send({ token, dob: "1962-04-15", zip_code: "94107" });
    expect(replayRes.status).toBe(401);
  });
});
