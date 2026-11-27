import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool } from "pg";
import { createPool, runMigrations, seedDatabase } from "@healthcare/database";
import { createHipaaLogger } from "@healthcare/shared-contracts";
import { createInteropApp } from "../src/app.js";
import type { ParserDispatchPayload } from "../src/ingestion-service.js";

describe("Component 6: Interop Ingestion Worker Integration Tests", () => {
  const testDbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  let pool: Pool;
  const dispatchedToParser: ParserDispatchPayload[] = [];
  const capturedLogs: string[] = [];

  beforeAll(async () => {
    pool = createPool(testDbUrl);
    await runMigrations(pool);
    await seedDatabase(pool);
  });

  beforeEach(async () => {
    dispatchedToParser.length = 0;
    capturedLogs.length = 0;
    await pool.query(
      "DELETE FROM patients WHERE mrn LIKE 'SYN-INTEROP-%' OR fhir_patient_id LIKE 'fhir-syn-interop-%'",
    );
  });

  afterAll(async () => {
    await pool.query(
      "DELETE FROM patients WHERE mrn LIKE 'SYN-INTEROP-%' OR fhir_patient_id LIKE 'fhir-syn-interop-%'",
    );
    await pool.end();
  });

  function buildApp() {
    return createInteropApp(pool, {
      logger: createHipaaLogger("interop-test", (line) => capturedLogs.push(line)),
      dispatchToParser: async (payload) => {
        dispatchedToParser.push(payload);
        return { dispatched: true, extracted_count: 2, status_code: 200 };
      },
    });
  }

  it("ingests HL7 v2 ORU^R01 labs (AST/ALT/Platelets/PSA) + DG1 + narrative note and dispatches to clinical-parser-worker", async () => {
    const app = buildApp();
    const hl7 = [
      "MSH|^~\\&|LABSYS|SYN_CLINIC|HRP|GCP|20260601103000||ORU^R01|CTRL-9001|P|2.5.1",
      "PID|1||SYN-INTEROP-001^^^MRN||SyntheticLast^SyntheticFirst||19600514|M|||123 Main^^San Francisco^CA^94107||555-0188",
      "OBR|1|ORD-1|FIL-1|CMP^Comprehensive Metabolic Panel",
      "OBX|1|NM|1920-8^AST^LN||96|U/L|10-40|H|||F",
      "OBX|2|NM|1742-6^ALT^LN||52|U/L|7-56|N|||F",
      "OBX|3|NM|777-3^Platelets^LN||108|10^9/L|150-400|L|||F",
      "OBX|4|NM|2857-1^PSA^LN||5.1|ng/mL|0-4.0|H|||F",
      "OBX|5|TX|NOTE^Clinical Note||Patient is a current smoker with 25 pack-years and COPD.||||||F",
      "DG1|1|I10|E11.9^Type 2 diabetes mellitus^I10|||F",
    ].join("\r");

    const res = await request(app)
      .post("/api/v1/interop/hl7")
      .set("content-type", "text/plain")
      .send(hl7);

    expect(res.status).toBe(201);
    expect(res.body.source_type).toBe("HL7_ORU");
    expect(res.body.structured_answers_saved).toBe(5);
    expect(dispatchedToParser).toHaveLength(1);
    expect(dispatchedToParser[0]!.raw_text).toContain("25 pack-years");

    // Verify EHR_LAB_IMPORT answers persisted in PostgreSQL
    const dbAnswers = await pool.query<{
      question_key: string;
      answer_value: unknown;
      provenance: string;
      source_excerpt: string;
    }>(
      `SELECT question_key, answer_value, provenance, source_excerpt
       FROM assessment_responses WHERE session_id = $1 ORDER BY question_key`,
      [res.body.session_id],
    );
    expect(dbAnswers.rowCount).toBe(5);
    const byKey = new Map(dbAnswers.rows.map((r) => [r.question_key, r]));
    expect(byKey.get("lab_ast_u_l")?.answer_value).toBe(96);
    expect(byKey.get("lab_psa_ng_ml")?.answer_value).toBe(5.1);
    expect(byKey.get("has_diabetes")?.answer_value).toBe(true);
    expect(byKey.get("lab_ast_u_l")?.provenance).toBe("EHR_LAB_IMPORT");
    expect(byKey.get("lab_ast_u_l")?.source_excerpt).toContain("1920-8");

    // Zero PHI leaked in logs
    const logs = capturedLogs.join("\n");
    expect(logs).not.toContain("SyntheticLast");
    expect(logs).not.toContain("SYN-INTEROP-001");
    expect(logs).not.toContain("555-0188");
  });

  it("ingests FHIR R4 Bundle (Patient + Observation + Condition + DocumentReference)", async () => {
    const app = buildApp();
    const noteB64 = Buffer.from(
      "Synthetic visit note: Former smoker, 22 pack-years, quit 5 years ago. BI-RADS density C.",
      "utf8",
    ).toString("base64");

    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "Patient",
            id: "fhir-syn-interop-002",
            identifier: [{ value: "SYN-INTEROP-002" }],
            name: [{ family: "SyntheticFhir", given: ["Elena"] }],
            gender: "female",
            birthDate: "1968-09-20",
            address: [{ postalCode: "94107" }],
          },
        },
        {
          resource: {
            resourceType: "Observation",
            code: { coding: [{ system: "http://loinc.org", code: "10334-1", display: "CA-125" }] },
            valueQuantity: { value: 185, unit: "U/mL" },
          },
        },
        {
          resource: {
            resourceType: "Condition",
            code: { coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code: "I48.91", display: "AFib" }] },
          },
        },
        {
          resource: {
            resourceType: "DocumentReference",
            id: "docref-syn-01",
            content: [{ attachment: { contentType: "text/plain", data: noteB64 } }],
          },
        },
      ],
    };

    const res = await request(app).post("/api/v1/interop/fhir").send(bundle);
    expect(res.status).toBe(201);
    expect(res.body.structured_answers_saved).toBe(2);
    expect(res.body.attached_documents_dispatched).toBe(1);
    expect(dispatchedToParser).toHaveLength(1);
    expect(dispatchedToParser[0]!.raw_text).toContain("BI-RADS density C");
  });

  it("handles GCS Eventarc folder-drop webhook and resolves patient by <MRN>_filename convention", async () => {
    const app = buildApp();
    await pool.query(
      `
      INSERT INTO patients (mrn, first_name, last_name, dob, sex_at_birth)
      VALUES ('SYN-INTEROP-003', 'Synthetic', 'FolderDrop', '1965-02-10', 'Male')
      `,
    );

    const cloudEvent = {
      type: "google.cloud.storage.object.v1.finalized",
      data: {
        bucket: "synthetic-clinic-drops",
        name: "inbox/SYN-INTEROP-003_lab_panel.pdf",
        raw_text: "Synthetic lab: AST 88 U/L, ALT 44 U/L, Platelets 120 K/uL.",
      },
    };

    const res = await request(app).post("/api/v1/interop/gcs-event").send(cloudEvent);
    expect(res.status).toBe(201);
    expect(res.body.source_type).toBe("FOLDER_PDF");
    expect(res.body.gcs_uri).toBe("gs://synthetic-clinic-drops/inbox/SYN-INTEROP-003_lab_panel.pdf");
    expect(dispatchedToParser).toHaveLength(1);
    expect(dispatchedToParser[0]!.document_category).toBe("LAB");
  });

  it("generates outbound FHIR R4 ServiceRequest and HL7 ORM^O01 orders with audit logging", async () => {
    const app = buildApp();
    const pRes = await pool.query<{ id: string }>(
      `
      INSERT INTO patients (mrn, fhir_patient_id, first_name, last_name, dob, sex_at_birth)
      VALUES ('SYN-INTEROP-004', 'fhir-syn-interop-004', 'Synthetic', 'OrderTest', '1960-01-01', 'Male')
      RETURNING id
      `,
    );
    const patientId = pRes.rows[0]!.id;

    const fhirOrder = await request(app).post("/api/v1/interop/dispatch-order").send({
      format: "FHIR_SERVICE_REQUEST",
      order_id: "ORD-SYN-100",
      patient_id: patientId,
      provider_id: "dr-synthetic-01",
      cpt_codes: ["71271"],
      icd10_codes: ["Z87.891"],
      intervention: "Low-Dose CT Thorax (LDCT)",
      priority: "urgent",
    });
    expect(fhirOrder.status).toBe(201);
    expect(fhirOrder.body.payload.resourceType).toBe("ServiceRequest");
    expect(fhirOrder.body.payload.code.coding[0].code).toBe("71271");

    const hl7Order = await request(app).post("/api/v1/interop/dispatch-order").send({
      format: "HL7_ORM",
      order_id: "ORD-SYN-101",
      patient_id: patientId,
      provider_id: "dr-synthetic-01",
      cpt_codes: ["77049"],
      icd10_codes: ["Z15.01"],
      intervention: "High-Risk Breast MRI",
      priority: "routine",
    });
    expect(hl7Order.status).toBe(201);
    expect(hl7Order.body.payload).toContain("ORM^O01");
    expect(hl7Order.body.payload).toContain("77049^High-Risk Breast MRI^CPT");
  });
});
