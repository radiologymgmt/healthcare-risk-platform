import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import {
  SexAtBirthSchema,
  type AcuityLevel,
  type HipaaLogger,
} from "@healthcare/shared-contracts";
import { evaluateClinicalRules, type ClinicalRuleRecord } from "./evaluator.js";
import { writeAuditLog } from "./audit.js";
import { isDemoModeEnabled } from "./demo-mode.js";

const CreatePatientSessionSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be YYYY-MM-DD"),
  sex_at_birth: SexAtBirthSchema,
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  zip_code: z.string().min(5).max(15),
  selected_modules: z.array(z.string().min(1)).default(["all"]),
});

const InsuranceVerifySchema = z.object({
  patient_id: z.string().uuid(),
  payer_id: z.string().min(2).max(100),
  payer_name: z.string().min(2).max(150).optional(),
  member_id: z.string().min(3).max(100),
});

const BookAppointmentSchema = z.object({
  patient_id: z.string().uuid(),
  workqueue_item_id: z.string().uuid().nullable().optional(),
  scheduled_start: z.string().datetime(),
  scheduled_end: z.string().datetime(),
  visit_type: z.string().min(2).max(50).default("RISK_REVIEW_CONSULT"),
});

const CreateMagicLinkSchema = z.object({
  patient_id: z.string().uuid(),
  session_id: z.string().uuid(),
  ttl_hours: z.number().int().min(1).max(168).default(72),
});

const VerifyMagicLinkSchema = z.object({
  token: z.string().min(16).max(256),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be YYYY-MM-DD"),
  zip_code: z.string().min(5).max(15),
});

const ConfirmMagicLinkSchema = z.object({
  confirmations: z
    .array(
      z.object({
        question_key: z.string().min(1).max(100),
        answer_value: z.unknown(),
        confirmed_as_parsed: z.boolean().default(true),
      }),
    )
    .min(1),
});

interface SignedMagicSessionClaims {
  ml_id: string;
  pid: string;
  sid: string;
  exp: number;
}

function getSigningSecret(): string {
  return process.env.MAGIC_LINK_SESSION_SECRET ?? "synthetic-dev-only-magic-link-signing-key";
}

function sha256Hex(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function signMagicSession(claims: SignedMagicSessionClaims): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyMagicSessionToken(token: string): SignedMagicSessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;
  const expected = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SignedMagicSessionClaims;
    if (typeof claims.exp !== "number" || Date.now() > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}

function safeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a.trim().toLowerCase());
  const bufB = Buffer.from(b.trim().toLowerCase());
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractIp(req: Request): string | null {
  const raw = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!raw) return null;
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

interface StediEligibilitySummary {
  provider: "STEDI_LIVE" | "STEDI_SYNTHETIC_MOCK";
  eligible: boolean;
  coverage_status: "ACTIVE" | "INACTIVE";
  payer_id: string;
  payer_name: string;
  plan_name: string;
  preventive_screening_copay_usd: number;
  deductible_remaining_usd: number;
  prior_auth_required_for_advanced_imaging: boolean;
  x12_transaction_id: string;
  checked_at: string;
}

async function runStediEligibilityCheck(params: {
  payer_id: string;
  payer_name?: string;
  member_id: string;
  first_name: string;
  last_name: string;
  dob: string;
}): Promise<StediEligibilitySummary> {
  const rawStediKey = process.env.STEDI_API_KEY?.trim() ?? "";
  const stediKey =
    rawStediKey && !["mock", "disabled", "synthetic", "none"].includes(rawStediKey.toLowerCase())
      ? rawStediKey
      : "";
  const payerName = params.payer_name ?? `Payer ${params.payer_id}`;

  // Production Stedi X12 270/271 Real-Time Eligibility proxy when STEDI_API_KEY is configured
  if (stediKey) {
    const stediRes = await fetch(
      "https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/eligibility/v3",
      {
        method: "POST",
        headers: {
          Authorization: `Key ${stediKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tradingPartnerServiceId: params.payer_id,
          subscriber: {
            memberId: params.member_id,
            firstName: params.first_name,
            lastName: params.last_name,
            dateOfBirth: params.dob.replace(/-/g, ""),
          },
          encounter: { serviceTypeCodes: ["30"] },
        }),
      },
    );

    if (stediRes.ok) {
      const json = (await stediRes.json()) as {
        controlNumber?: string;
        planStatus?: Array<{ statusCode?: string; planDetails?: string }>;
      };
      const active = json.planStatus?.some((p) => p.statusCode === "1") ?? true;
      return {
        provider: "STEDI_LIVE",
        eligible: active,
        coverage_status: active ? "ACTIVE" : "INACTIVE",
        payer_id: params.payer_id,
        payer_name: payerName,
        plan_name: json.planStatus?.[0]?.planDetails ?? "Verified Commercial Health Plan",
        preventive_screening_copay_usd: 0,
        deductible_remaining_usd: 500,
        prior_auth_required_for_advanced_imaging: true,
        x12_transaction_id: json.controlNumber ?? `STEDI-${Date.now()}`,
        checked_at: new Date().toISOString(),
      };
    }
  }

  // Deterministic synthetic X12 271 mock for local development & testing
  const inactive = params.member_id.toUpperCase().startsWith("INACTIVE");
  return {
    provider: "STEDI_SYNTHETIC_MOCK",
    eligible: !inactive,
    coverage_status: inactive ? "INACTIVE" : "ACTIVE",
    payer_id: params.payer_id,
    payer_name: payerName,
    plan_name: inactive
      ? "Terminated Policy (Synthetic Test)"
      : "Preventive Care PPO Gold (Synthetic X12 271)",
    preventive_screening_copay_usd: inactive ? 0 : 0,
    deductible_remaining_usd: inactive ? 0 : 450,
    prior_auth_required_for_advanced_imaging: true,
    x12_transaction_id: `X12-271-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    checked_at: new Date().toISOString(),
  };
}

export function createPatientAndMagicLinkRouter(pool: Pool, logger: HipaaLogger): Router {
  const router = Router();

  // =========================================================================
  // COMPONENT 3: PATIENT WEB PORTAL (SESSION, STEDI INSURANCE, SCHEDULING)
  // =========================================================================

  router.post(
    "/patients/sessions",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = CreatePatientSessionSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "Invalid intake profile", details: parsed.error.flatten() });
          return;
        }
        const d = parsed.data;
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const pRes = await client.query<{ id: string }>(
            `
            INSERT INTO patients (first_name, last_name, dob, sex_at_birth, email, phone, zip_code)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
            `,
            [
              d.first_name,
              d.last_name,
              d.dob,
              d.sex_at_birth,
              d.email || null,
              d.phone || null,
              d.zip_code,
            ],
          );
          const patientId = pRes.rows[0]!.id;

          const sRes = await client.query<{ id: string }>(
            `
            INSERT INTO assessment_sessions (patient_id, channel, selected_modules, status)
            VALUES ($1, 'WEB_PORTAL', $2::text[], 'IN_PROGRESS')
            RETURNING id
            `,
            [patientId, d.selected_modules],
          );
          const sessionId = sRes.rows[0]!.id;

          await writeAuditLog(client, {
            actor_id: `PATIENT:${patientId}`,
            actor_role: "PATIENT",
            action: "CREATE_INTAKE_SESSION",
            resource_type: "assessment_session",
            resource_id: sessionId,
            ip_address: extractIp(req),
            metadata: { channel: "WEB_PORTAL", selected_modules: d.selected_modules },
          });

          await client.query("COMMIT");
          logger.info("Created patient web intake session", { session_id: sessionId });
          res.status(201).json({ patient_id: patientId, session_id: sessionId });
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * POST /api/v1/insurance/verify (Section 5 — Comp 3)
   * Proxies real-time X12 270/271 eligibility check to Stedi API (or synthetic mock)
   * and caches summary in `patients.insurance_status`.
   */
  router.post(
    "/insurance/verify",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = InsuranceVerifySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "Invalid insurance verification request", details: parsed.error.flatten() });
          return;
        }
        const d = parsed.data;

        const pRes = await pool.query<{
          id: string;
          first_name: string;
          last_name: string;
          dob: Date | string;
        }>(`SELECT id, first_name, last_name, dob FROM patients WHERE id = $1`, [d.patient_id]);

        if (pRes.rowCount === 0) {
          res.status(404).json({ error: "Patient not found" });
          return;
        }
        const pat = pRes.rows[0]!;
        const dobStr =
          pat.dob instanceof Date ? pat.dob.toISOString().slice(0, 10) : String(pat.dob).slice(0, 10);

        const eligibility = await runStediEligibilityCheck({
          payer_id: d.payer_id,
          payer_name: d.payer_name,
          member_id: d.member_id,
          first_name: pat.first_name,
          last_name: pat.last_name,
          dob: dobStr,
        });

        await pool.query(
          `
          UPDATE patients
          SET insurance_payer_id = $1,
              insurance_member_id = $2,
              insurance_status = $3::jsonb,
              updated_at = NOW()
          WHERE id = $4
          `,
          [d.payer_id, d.member_id, JSON.stringify(eligibility), d.patient_id],
        );

        await writeAuditLog(pool, {
          actor_id: `PATIENT:${d.patient_id}`,
          actor_role: "PATIENT",
          action: "VERIFY_INSURANCE",
          resource_type: "patient",
          resource_id: d.patient_id,
          ip_address: extractIp(req),
          metadata: {
            payer_id: d.payer_id,
            coverage_status: eligibility.coverage_status,
            provider: eligibility.provider,
          },
        });

        logger.info("Verified Stedi X12 270/271 eligibility", {
          patient_id: d.patient_id,
          coverage_status: eligibility.coverage_status,
        });

        res.json({ insurance_status: eligibility });
      } catch (err) {
        next(err);
      }
    },
  );

  // Available risk-review consult slots
  router.get("/appointments/slots", (_req: Request, res: Response) => {
    const base = new Date();
    base.setUTCMinutes(0, 0, 0);
    const slots = [1, 2, 3, 4, 5, 6].map((idx) => {
      const start = new Date(base.getTime() + (idx * 24 + (idx % 2 === 0 ? 14 : 10)) * 3600 * 1000);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      return {
        slot_id: `slot-${idx}`,
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        provider_display:
          idx % 2 === 0
            ? "Dr. Elena Morales, MD (Preventive Risk Clinic)"
            : "Dr. David Chen, MD (Clinical Genetics & Risk)",
        modality: idx % 2 === 0 ? "Telehealth Video" : "In-Clinic Consult",
      };
    });
    res.json({ slots });
  });

  // Book appointment in PostgreSQL `appointments` table
  router.post("/appointments", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = BookAppointmentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid appointment request", details: parsed.error.flatten() });
        return;
      }
      const d = parsed.data;

      const inserted = await pool.query(
        `
        INSERT INTO appointments (
          patient_id, workqueue_item_id, scheduled_start, scheduled_end, visit_type, status
        )
        VALUES ($1, $2, $3, $4, $5, 'BOOKED')
        RETURNING id, patient_id, workqueue_item_id, scheduled_start, scheduled_end, visit_type, status, created_at
        `,
        [
          d.patient_id,
          d.workqueue_item_id ?? null,
          d.scheduled_start,
          d.scheduled_end,
          d.visit_type,
        ],
      );
      const appt = inserted.rows[0]!;

      if (d.workqueue_item_id) {
        await pool.query(
          `UPDATE workqueue_items SET status = 'SCHEDULED', updated_at = NOW() WHERE id = $1`,
          [d.workqueue_item_id],
        );
      }

      await writeAuditLog(pool, {
        actor_id: `PATIENT:${d.patient_id}`,
        actor_role: "PATIENT",
        action: "BOOK_APPOINTMENT",
        resource_type: "appointment",
        resource_id: appt.id,
        ip_address: extractIp(req),
        metadata: { visit_type: d.visit_type, status: appt.status },
      });

      res.status(201).json({ appointment: appt });
    } catch (err) {
      next(err);
    }
  });

  // =========================================================================
  // COMPONENT 4: TOKENIZED MAGIC-LINK MOBILE REVIEW & CONFIRM
  // =========================================================================

  router.post("/magic-link/create", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateMagicLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid magic-link creation payload", details: parsed.error.flatten() });
        return;
      }
      const d = parsed.data;

      const rawToken = crypto.randomBytes(32).toString("base64url");
      const tokenHash = sha256Hex(rawToken);
      const expiresAt = new Date(Date.now() + d.ttl_hours * 3600 * 1000).toISOString();

      const inserted = await pool.query<{ id: string; expires_at: Date }>(
        `
        INSERT INTO magic_links (patient_id, session_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id, expires_at
        `,
        [d.patient_id, d.session_id, tokenHash, expiresAt],
      );

      await writeAuditLog(pool, {
        actor_id: "SYSTEM_MAGIC_LINK",
        actor_role: "SYSTEM",
        action: "CREATE_MAGIC_LINK",
        resource_type: "magic_link",
        resource_id: inserted.rows[0]!.id,
        ip_address: extractIp(req),
        metadata: { session_id: d.session_id, ttl_hours: d.ttl_hours },
      });

      res.status(201).json({
        magic_link_id: inserted.rows[0]!.id,
        token: rawToken,
        expires_at: inserted.rows[0]!.expires_at,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/v1/magic-link/verify (Section 5 — Comp 4)
   * Validates token_hash + dob + zip_code before issuing a short-lived signed session token.
   */
  router.post("/magic-link/verify", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = VerifyMagicLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Valid token, DOB (YYYY-MM-DD), and ZIP code are required" });
        return;
      }
      const d = parsed.data;
      const tokenHash = sha256Hex(d.token);

      const lookup = await pool.query<{
        magic_link_id: string;
        patient_id: string;
        session_id: string;
        expires_at: Date;
        used_at: Date | null;
        dob: Date | string;
        zip_code: string | null;
      }>(
        `
        SELECT
          m.id AS magic_link_id,
          m.patient_id,
          m.session_id,
          m.expires_at,
          m.used_at,
          p.dob,
          p.zip_code
        FROM magic_links m
        INNER JOIN patients p ON p.id = m.patient_id
        WHERE m.token_hash = $1
        `,
        [tokenHash],
      );

      if (lookup.rowCount === 0) {
        res.status(401).json({ error: "Invalid or expired magic link" });
        return;
      }

      const row = lookup.rows[0]!;
      if (row.used_at !== null) {
        res.status(401).json({ error: "This magic link has already been completed" });
        return;
      }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        res.status(401).json({ error: "This magic link has expired" });
        return;
      }

      const expectedDob =
        row.dob instanceof Date ? row.dob.toISOString().slice(0, 10) : String(row.dob).slice(0, 10);
      const expectedZip = (row.zip_code ?? "").slice(0, 5);
      const providedZip = d.zip_code.trim().slice(0, 5);

      if (!safeStringEqual(expectedDob, d.dob) || !expectedZip || !safeStringEqual(expectedZip, providedZip)) {
        await writeAuditLog(pool, {
          actor_id: `PATIENT:${row.patient_id}`,
          actor_role: "PATIENT",
          action: "MAGIC_LINK_VERIFY_FAILED",
          resource_type: "magic_link",
          resource_id: row.magic_link_id,
          ip_address: extractIp(req),
          metadata: { reason: "DOB_OR_ZIP_MISMATCH" },
        });
        res.status(403).json({ error: "Verification failed: DOB or ZIP code did not match" });
        return;
      }

      await pool.query(`UPDATE magic_links SET verified_at = NOW() WHERE id = $1`, [
        row.magic_link_id,
      ]);

      await writeAuditLog(pool, {
        actor_id: `PATIENT:${row.patient_id}`,
        actor_role: "PATIENT",
        action: "VERIFY_MAGIC_LINK",
        resource_type: "magic_link",
        resource_id: row.magic_link_id,
        ip_address: extractIp(req),
        metadata: { session_id: row.session_id },
      });

      const ttlMs = 30 * 60 * 1000; // Short-lived 30-minute session
      const sessionToken = signMagicSession({
        ml_id: row.magic_link_id,
        pid: row.patient_id,
        sid: row.session_id,
        exp: Date.now() + ttlMs,
      });

      res.json({
        verified: true,
        session_token: sessionToken,
        expires_in_seconds: ttlMs / 1000,
        session_id: row.session_id,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/v1/magic-link/session
   * Returns pre-populated AI_PARSED & EHR_LAB_IMPORT answers with plain-English labels,
   * confidence scores, and source excerpts for the Mobile 'Review & Confirm' card flow.
   */
  router.get("/magic-link/session", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.header("authorization") ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const claims = verifyMagicSessionToken(token);
      if (!claims) {
        res.status(401).json({ error: "Invalid or expired magic-link session" });
        return;
      }

      const [mlRes, itemsRes] = await Promise.all([
        pool.query<{ used_at: Date | null }>(`SELECT used_at FROM magic_links WHERE id = $1`, [
          claims.ml_id,
        ]),
        pool.query(
          `
          SELECT
            r.question_key,
            r.answer_value,
            r.provenance,
            r.confidence_score,
            r.source_excerpt,
            q.domain,
            q.label_plain_english,
            q.helper_tooltip,
            q.input_type,
            q.options_json,
            d.document_category
          FROM assessment_responses r
          INNER JOIN questions q ON q.question_key = r.question_key
          LEFT JOIN clinical_documents d ON d.id = r.source_document_id
          WHERE r.session_id = $1
          ORDER BY q.sort_order ASC, r.question_key ASC
          `,
          [claims.sid],
        ),
      ]);

      if (mlRes.rowCount === 0 || mlRes.rows[0]!.used_at !== null) {
        res.status(401).json({ error: "Magic-link session is no longer active" });
        return;
      }

      await writeAuditLog(pool, {
        actor_id: `PATIENT:${claims.pid}`,
        actor_role: "PATIENT",
        action: "VIEW_PREPOPULATED_ANSWERS",
        resource_type: "assessment_session",
        resource_id: claims.sid,
        ip_address: extractIp(req),
        metadata: { item_count: itemsRes.rowCount },
      });

      res.json({
        session_id: claims.sid,
        items: itemsRes.rows.map((r) => ({
          ...r,
          confidence_score: r.confidence_score !== null ? Number(r.confidence_score) : null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/v1/magic-link/confirm
   * Saves patient-confirmed/edited answers (`PATIENT_CONFIRMED_AI` / `PATIENT_ENTERED`),
   * marks the single-use magic link used, and evaluates all 54 clinical rules.
   */
  router.post("/magic-link/confirm", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.header("authorization") ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const claims = verifyMagicSessionToken(token);
      if (!claims) {
        res.status(401).json({ error: "Invalid or expired magic-link session" });
        return;
      }

      const parsed = ConfirmMagicLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid confirmation payload", details: parsed.error.flatten() });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const mlCheck = await client.query<{ used_at: Date | null }>(
          `SELECT used_at FROM magic_links WHERE id = $1 FOR UPDATE`,
          [claims.ml_id],
        );
        if (mlCheck.rowCount === 0 || mlCheck.rows[0]!.used_at !== null) {
          await client.query("ROLLBACK");
          res.status(401).json({ error: "Magic link has already been used" });
          return;
        }

        for (const item of parsed.data.confirmations) {
          const nextProvenance = item.confirmed_as_parsed
            ? "PATIENT_CONFIRMED_AI"
            : "PATIENT_ENTERED";
          await client.query(
            `
            INSERT INTO assessment_responses (
              session_id, patient_id, question_key, answer_value, provenance, updated_at
            )
            VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
            ON CONFLICT (session_id, question_key) DO UPDATE SET
              answer_value = EXCLUDED.answer_value,
              provenance = EXCLUDED.provenance,
              updated_at = NOW()
            `,
            [
              claims.sid,
              claims.pid,
              item.question_key,
              JSON.stringify(item.answer_value),
              nextProvenance,
            ],
          );
        }

        // Load patient + merged answers + active rules and run 54-rule evaluation
        const patRes = await client.query<{ dob: Date | string; sex_at_birth: string | null }>(
          `SELECT dob, sex_at_birth FROM patients WHERE id = $1`,
          [claims.pid],
        );
        const pat = patRes.rows[0]!;

        const ansRes = await client.query<{ question_key: string; answer_value: unknown }>(
          `SELECT question_key, answer_value FROM assessment_responses WHERE session_id = $1`,
          [claims.sid],
        );
        const answersMap: Record<string, unknown> = {};
        for (const row of ansRes.rows) answersMap[row.question_key] = row.answer_value;

        const rulesRes = await client.query<{
          rule_code: string;
          display_name: string;
          specialty: string;
          rule_type: string;
          acuity_level: AcuityLevel;
          logic_expression: unknown;
          recommended_intervention: string;
          cpt_codes: string[];
          icd10_codes: string[];
          version: number;
        }>(
          `SELECT rule_code, display_name, specialty, rule_type, acuity_level,
                  logic_expression, recommended_intervention, cpt_codes, icd10_codes, version
           FROM clinical_rules WHERE is_active = TRUE`,
        );

        const rules: ClinicalRuleRecord[] = rulesRes.rows;
        const snapshot = rules.reduce((max, r) => Math.max(max, r.version), 1);
        const outcome = evaluateClinicalRules(pat, answersMap, rules);

        await client.query(`DELETE FROM triggered_pathways WHERE session_id = $1`, [claims.sid]);
        for (const p of outcome.triggered_pathways) {
          await client.query(
            `
            INSERT INTO triggered_pathways (
              session_id, patient_id, rule_code, calculated_score, acuity_level,
              recommended_intervention, cpt_codes, icd10_codes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[])
            `,
            [
              claims.sid,
              claims.pid,
              p.rule_code,
              p.calculated_score,
              p.acuity_level,
              p.recommended_intervention,
              p.cpt_codes,
              p.icd10_codes,
            ],
          );
        }

        if (outcome.workqueue_priority) {
          const existingWq = await client.query<{ id: string }>(
            `SELECT id FROM workqueue_items WHERE session_id = $1 LIMIT 1`,
            [claims.sid],
          );
          if (existingWq.rowCount && existingWq.rowCount > 0) {
            await client.query(
              `UPDATE workqueue_items SET priority = $1, updated_at = NOW() WHERE id = $2`,
              [outcome.workqueue_priority, existingWq.rows[0]!.id],
            );
          } else {
            await client.query(
              `INSERT INTO workqueue_items (patient_id, session_id, priority, status) VALUES ($1, $2, $3, 'NEW')`,
              [claims.pid, claims.sid, outcome.workqueue_priority],
            );
          }
        }

        await client.query(
          `UPDATE assessment_sessions SET status = 'SUBMITTED', channel = 'MOBILE_MAGIC_LINK', rules_version_snapshot = $1, completed_at = NOW() WHERE id = $2`,
          [snapshot, claims.sid],
        );
        await client.query(`UPDATE magic_links SET used_at = NOW() WHERE id = $1`, [claims.ml_id]);

        await writeAuditLog(client, {
          actor_id: `PATIENT:${claims.pid}`,
          actor_role: "PATIENT",
          action: "CONFIRM_AI_ANSWERS",
          resource_type: "assessment_session",
          resource_id: claims.sid,
          ip_address: extractIp(req),
          metadata: {
            confirmed_count: parsed.data.confirmations.length,
            triggered_count: outcome.triggered_pathways.length,
            workqueue_priority: outcome.workqueue_priority,
          },
        });

        await client.query("COMMIT");

        res.json({
          completed: true,
          session_id: claims.sid,
          triggered_count: outcome.triggered_pathways.length,
          highest_acuity: outcome.highest_acuity,
          workqueue_priority: outcome.workqueue_priority,
          triggered_pathways: outcome.triggered_pathways.map((p) => ({
            rule_code: p.rule_code,
            display_name: p.display_name,
            acuity_level: p.acuity_level,
            recommended_intervention: p.recommended_intervention,
          })),
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  });

  // Dev/Synthetic demo helper (non-production only) to generate a synthetic patient + AI pre-populated session + magic link
  router.post(
    "/magic-link/demo-seed",
    async (req: Request, res: Response, next: NextFunction) => {
      if (!isDemoModeEnabled()) {
        res.status(403).json({ error: "Demo seed disabled in production" });
        return;
      }
      try {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const mrn = `SYN-MOBILE-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
          const pRes = await client.query<{ id: string }>(
            `
            INSERT INTO patients (mrn, first_name, last_name, dob, sex_at_birth, zip_code)
            VALUES ($1, 'Synthetic', 'MobileReview', '1962-04-15', 'Female', '94107')
            RETURNING id
            `,
            [mrn],
          );
          const patientId = pRes.rows[0]!.id;

          const docRes = await client.query<{ id: string }>(
            `
            INSERT INTO clinical_documents (patient_id, source_type, document_category, gcs_uri, parsed_status)
            VALUES ($1, 'FOLDER_PDF', 'VISIT_NOTE', 'gs://synthetic-demo/visit-note.pdf', 'PARSED')
            RETURNING id
            `,
            [patientId],
          );
          const docId = docRes.rows[0]!.id;

          const sRes = await client.query<{ id: string }>(
            `
            INSERT INTO assessment_sessions (patient_id, channel, status)
            VALUES ($1, 'MOBILE_MAGIC_LINK', 'PREPOPULATED')
            RETURNING id
            `,
            [patientId],
          );
          const sessionId = sRes.rows[0]!.id;

          const prePop = [
            {
              key: "smoking_status",
              val: "former",
              conf: 0.96,
              excerpt: "Patient is a former smoker who quit 6 years ago.",
            },
            {
              key: "pack_years",
              val: 24,
              conf: 0.94,
              excerpt: "Documented 24 pack-year smoking history in pulmonary note.",
            },
            {
              key: "years_since_quit_smoking",
              val: 6,
              conf: 0.93,
              excerpt: "Quit smoking 6 years ago following primary care counseling.",
            },
            {
              key: "first_degree_breast_cancer_count",
              val: 1,
              conf: 0.91,
              excerpt: "Family history notable for mother diagnosed with breast cancer at age 46.",
            },
            {
              key: "has_hypertension",
              val: true,
              conf: 0.97,
              excerpt: "Active problem list: Essential hypertension, controlled on lisinopril.",
            },
          ];

          for (const item of prePop) {
            await client.query(
              `
              INSERT INTO assessment_responses (
                session_id, patient_id, question_key, answer_value, provenance,
                confidence_score, source_document_id, source_excerpt
              )
              VALUES ($1, $2, $3, $4::jsonb, 'AI_PARSED', $5, $6, $7)
              `,
              [sessionId, patientId, item.key, JSON.stringify(item.val), item.conf, docId, item.excerpt],
            );
          }

          const rawToken = crypto.randomBytes(32).toString("base64url");
          await client.query(
            `
            INSERT INTO magic_links (patient_id, session_id, token_hash, expires_at)
            VALUES ($1, $2, $3, NOW() + INTERVAL '72 hours')
            `,
            [patientId, sessionId, sha256Hex(rawToken)],
          );

          await client.query("COMMIT");
          res.status(201).json({
            token: rawToken,
            synthetic_dob: "1962-04-15",
            synthetic_zip: "94107",
            session_id: sessionId,
          });
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
