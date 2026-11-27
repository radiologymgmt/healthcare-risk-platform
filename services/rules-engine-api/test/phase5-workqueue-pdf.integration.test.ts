import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool } from "pg";
import { createPool, runMigrations, seedDatabase } from "@healthcare/database";
import { createHipaaLogger } from "@healthcare/shared-contracts";
import { createApp } from "../src/app.js";

const PROVIDER_HEADERS = {
  "x-actor-id": "dr-provider-phase5",
  "x-actor-role": "PROVIDER",
};

const ADMIN_HEADERS = {
  "x-actor-id": "admin-phase5",
  "x-actor-role": "ADMIN",
};

describe("Phase 5: Provider Workqueue, Order Approval, Executive Analytics & Headless PDF Engine", () => {
  const testDbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  let pool: Pool;

  beforeAll(async () => {
    pool = createPool(testDbUrl);
    await runMigrations(pool);
    await seedDatabase(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM patients WHERE mrn LIKE 'SYN-WQ-%'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM patients WHERE mrn LIKE 'SYN-WQ-%'");
    await pool.end();
  });

  function buildApp() {
    return createApp(pool, createHipaaLogger("phase5-test", () => {}));
  }

  it("enforces RBAC on /api/v1/workqueue, sorts STAT first, and approves orders with outbound FHIR/HL7 payloads", async () => {
    const app = buildApp();

    // PATIENT blocked with 403
    const denied = await request(app)
      .get("/api/v1/workqueue")
      .set("x-actor-id", "syn-pat-1")
      .set("x-actor-role", "PATIENT");
    expect(denied.status).toBe(403);

    // Seed synthetic STAT & HIGH workqueue cases
    const seedRes = await request(app).post("/api/v1/workqueue/demo-seed").set(PROVIDER_HEADERS);
    expect(seedRes.status).toBe(201);

    const wqRes = await request(app).get("/api/v1/workqueue").set(PROVIDER_HEADERS);
    expect(wqRes.status).toBe(200);
    expect(wqRes.body.items.length).toBeGreaterThanOrEqual(2);

    // STAT acute red flag case MUST appear first
    const statItem = wqRes.body.items[0];
    expect(statItem.priority).toBe("HIGH");
    expect(statItem.triggered_pathways[0].acuity_level).toBe("ACUTE_RED_FLAG");
    expect(statItem.responses.some((r: { source_excerpt: string | null }) => Boolean(r.source_excerpt))).toBe(true);
    expect(statItem.documents.length).toBeGreaterThanOrEqual(1);

    // One-click order approval -> dispatches FHIR ServiceRequest and completes item
    const orderRes = await request(app)
      .post(`/api/v1/workqueue/${statItem.id}/order`)
      .set(PROVIDER_HEADERS)
      .send({
        disposition: "ORDERED",
        order_format: "FHIR_SERVICE_REQUEST",
      });
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.status).toBe("EXAMS_ORDERED");
    expect(orderRes.body.dispatched_orders.length).toBe(statItem.triggered_pathways.length);
    expect(orderRes.body.dispatched_orders[0].payload.resourceType).toBe("ServiceRequest");

    // Approve second HIGH item with HL7 ORM^O01 format
    const secondHighItem = wqRes.body.items[1];
    const hl7OrderRes = await request(app)
      .post(`/api/v1/workqueue/${secondHighItem.id}/order`)
      .set(PROVIDER_HEADERS)
      .send({
        disposition: "ORDERED",
        order_format: "HL7_ORM",
      });
    expect(hl7OrderRes.status).toBe(200);
    expect(hl7OrderRes.body.dispatched_orders[0].payload).toContain("ORM^O01");
  });

  it("serves live Executive Analytics and generates real PDF binaries for all 3 report types", async () => {
    const app = buildApp();

    // Seed synthetic data so analytics and session PDFs have rich records
    const seedRes = await request(app).post("/api/v1/workqueue/demo-seed").set(ADMIN_HEADERS);
    expect(seedRes.status).toBe(201);
    const sessionId = seedRes.body.session_ids[0] as string;

    const analyticsRes = await request(app).get("/api/v1/admin/analytics").set(ADMIN_HEADERS);
    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.kpis.total_sessions).toBeGreaterThanOrEqual(2);
    expect(analyticsRes.body.kpis.total_triggered_pathways).toBeGreaterThanOrEqual(4);
    expect(analyticsRes.body.by_specialty.length).toBeGreaterThanOrEqual(2);
    expect(analyticsRes.body.top_cpt_codes.length).toBeGreaterThanOrEqual(2);

    // Generate all 3 PDF types via headless Chromium PDF engine
    for (const pdfType of ["executive_overview", "patient_summary", "prior_auth_packet"] as const) {
      const pdfRes = await request(app)
        .post(`/api/v1/admin/pdf/${pdfType}`)
        .set(ADMIN_HEADERS)
        .send(pdfType === "executive_overview" ? {} : { session_id: sessionId })
        .buffer(true);

      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers["content-type"]).toContain("application/pdf");
      const buf = Buffer.isBuffer(pdfRes.body) ? pdfRes.body : Buffer.from(pdfRes.text, "binary");
      expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(buf.length).toBeGreaterThan(500);
    }

    // Confirm EXPORT_PDF audit logs recorded
    const auditRes = await pool.query<{ count: string }>(
      "SELECT COUNT(*) FROM audit_logs WHERE action = 'EXPORT_PDF'",
    );
    expect(Number(auditRes.rows[0]!.count)).toBeGreaterThanOrEqual(3);
  }, 30000);
});
