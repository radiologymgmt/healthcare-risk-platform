import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool } from "pg";
import { createPool, runMigrations, seedDatabase } from "@healthcare/database";
import {
  HARDCODED_SUPER_ADMIN_EMAIL,
  createHipaaLogger,
  signDemoSessionToken,
  verifyDemoSessionToken,
} from "@healthcare/shared-contracts";
import { createApp } from "../src/app.js";

describe("Demo Hub Auth, Hardcoded Super-Admin & NY Pre-Demo Contract Signing", () => {
  const testDbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  let pool: Pool;

  beforeAll(async () => {
    pool = createPool(testDbUrl);
    await runMigrations(pool);
    await seedDatabase(pool);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM demo_agreements WHERE email LIKE '%@demo-test.org'");
    await pool.query("DELETE FROM users WHERE email LIKE '%@demo-test.org'");
    await pool.end();
  });

  function buildApp() {
    return createApp(pool, createHipaaLogger("demo-auth-test", () => {}));
  }

  it("signs & verifies cross-subdomain Demo Session tokens and always exempts radiologymgmt@gmail.com", async () => {
    const secret = "test-demo-session-secret-at-least-32-chars";
    const superToken = await signDemoSessionToken(
      {
        email: HARDCODED_SUPER_ADMIN_EMAIL,
        fullName: "Platform Owner",
        role: "VIEWER",
        agreementSigned: false,
        authMethod: "google",
      },
      secret,
    );
    const verified = await verifyDemoSessionToken(superToken, secret);
    expect(verified).not.toBeNull();
    expect(verified!.email).toBe("radiologymgmt@gmail.com");
    expect(verified!.isSuperAdmin).toBe(true);
    expect(verified!.role).toBe("ADMIN");
    expect(verified!.agreementSigned).toBe(true);

    // Tampered token rejected
    expect(await verifyDemoSessionToken(`${superToken}tamper`, secret)).toBeNull();
  });

  it("authenticates hardcoded radiologymgmt@gmail.com via Google with zero agreement requirement and protects it from demotion", async () => {
    const app = buildApp();
    const googleRes = await request(app)
      .post("/api/v1/demo-auth/google-verify")
      .send({
        email: "radiologymgmt@gmail.com",
        full_name: "RadManagement Owner",
        google_sub: "google-sub-owner-001",
      });

    expect(googleRes.status).toBe(200);
    expect(googleRes.body.user.role).toBe("ADMIN");
    expect(googleRes.body.user.is_hardcoded_admin).toBe(true);
    expect(googleRes.body.requires_agreement).toBe(false);
    expect(googleRes.body.agreement_signed).toBe(true);

    // Attempt to deactivate hardcoded super-admin via Admin API -> blocked 403
    const adminId = googleRes.body.user.id as string;
    const blockRes = await request(app)
      .patch(`/api/v1/admin/users/${adminId}`)
      .set("x-actor-id", "radiologymgmt@gmail.com")
      .set("x-actor-role", "ADMIN")
      .send({ is_active: false });
    expect(blockRes.status).toBe(403);
  });

  it("lets Admin create a VIEWER with password, enforces NY contract signature before access, and records it in /admin/agreements", async () => {
    const app = buildApp();
    const testEmail = `viewer-${Date.now()}@demo-test.org`;
    const testPassword = "ViewerPass!2026";

    // 1. Admin creates VIEWER user with password
    const createRes = await request(app)
      .post("/api/v1/admin/users")
      .set("x-actor-id", "radiologymgmt@gmail.com")
      .set("x-actor-role", "ADMIN")
      .send({
        email: testEmail,
        full_name: "Dr. Taylor Evaluator",
        role: "VIEWER",
        password: testPassword,
        organization: "NY Radiology Partners",
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.user.role).toBe("VIEWER");
    expect(createRes.body.user.has_password).toBe(true);

    // 2. Wrong password rejected
    const badLogin = await request(app)
      .post("/api/v1/demo-auth/login")
      .send({ email: testEmail, password: "wrong-password" });
    expect(badLogin.status).toBe(401);

    // 3. Valid password succeeds -> requires NY pre-demo agreement signature
    const loginRes = await request(app)
      .post("/api/v1/demo-auth/login")
      .send({ email: testEmail, password: testPassword });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.requires_agreement).toBe(true);
    expect(loginRes.body.agreement_signed).toBe(false);

    // 4. Sign NY Pre-Demo Contracts (Full Name, Email, Date)
    const signRes = await request(app)
      .post("/api/v1/demo-auth/sign-agreement")
      .send({
        email: testEmail,
        full_name: "Dr. Taylor Evaluator",
        organization: "NY Radiology Partners",
        signed_date: "2026-11-28",
        accepted_mnda: true,
        accepted_sandbox: true,
        accepted_non_phi: true,
        accepted_pre_prod_notice: true,
      });
    expect(signRes.status).toBe(201);
    expect(signRes.body.agreement.agreement_version).toBe("NY-v1.0");
    expect(signRes.body.agreement.signed_date).toBe("2026-11-28");

    // 5. Subsequent login recognizes signed agreement automatically
    const loginAfter = await request(app)
      .post("/api/v1/demo-auth/login")
      .send({ email: testEmail, password: testPassword });
    expect(loginAfter.status).toBe(200);
    expect(loginAfter.body.requires_agreement).toBe(false);
    expect(loginAfter.body.agreement_signed).toBe(true);

    // 6. Admin Signed Agreements Ledger lists the signed contract
    const ledgerRes = await request(app)
      .get("/api/v1/admin/agreements")
      .set("x-actor-id", "radiologymgmt@gmail.com")
      .set("x-actor-role", "ADMIN");
    expect(ledgerRes.status).toBe(200);
    const found = (ledgerRes.body.agreements as Array<{ email: string }>).find(
      (a) => a.email === testEmail,
    );
    expect(found).toBeTruthy();
  });
});
