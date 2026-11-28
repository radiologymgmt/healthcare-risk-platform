import type { NextFunction, Response, Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import jsonLogic from "json-logic-js";
import { HARDCODED_SUPER_ADMIN_EMAIL, type HipaaLogger } from "@healthcare/shared-contracts";
import { writeAuditLog } from "./audit.js";
import { hashPassword } from "./password-hash.js";
import type { AuthenticatedRequest } from "./rbac.js";

const UuidSchema = z.string().uuid();

const UserRoleEnum = z.enum(["VIEWER", "ADMIN", "PROVIDER", "COORDINATOR", "AUDITOR"]);

const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  full_name: z.string().min(2).max(200),
  role: UserRoleEnum.default("VIEWER"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128).optional(),
  organization: z.string().max(200).nullable().optional(),
  npi_number: z.string().max(20).nullable().optional(),
  specialty: z.string().max(120).nullable().optional(),
  requires_demo_agreement: z.boolean().optional(),
});

const UpdateUserSchema = z.object({
  full_name: z.string().min(2).max(200).optional(),
  role: UserRoleEnum.optional(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128).optional(),
  organization: z.string().max(200).nullable().optional(),
  npi_number: z.string().max(20).nullable().optional(),
  specialty: z.string().max(120).nullable().optional(),
  requires_demo_agreement: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

const CreatePayerSchema = z.object({
  payer_code: z.string().min(2).max(64).regex(/^[A-Z0-9_]+$/),
  stedi_trading_partner_id: z.string().min(2).max(64),
  payer_name: z.string().min(2).max(200),
  acceptance_status: z.enum(["IN_NETWORK", "OUT_OF_NETWORK_ACCEPTED", "NOT_ACCEPTED"]),
  accepted_plan_types: z.array(z.string().min(1).max(60)).default([]),
  excluded_plan_keywords: z.array(z.string().min(1).max(80)).default([]),
  requires_pcp_referral: z.boolean().default(false),
  prior_auth_modalities: z.array(z.string().min(1).max(40)).default([]),
  self_pay_available: z.boolean().default(true),
  patient_guidance_note: z.string().max(1000).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).default(100),
});

const UpdatePayerSchema = CreatePayerSchema.partial().extend({
  is_active: z.boolean().optional(),
});

const UpdateSettingSchema = z.object({
  label: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  value_json: z.record(z.unknown()),
});

const CreateSnapshotSchema = z.object({
  label: z.string().min(2).max(160),
  notes: z.string().max(1000).optional(),
});

function extractIp(req: AuthenticatedRequest): string | null {
  const raw = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!raw) return null;
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

async function captureCurrentConfigPayload(client: {
  query: Pool["query"];
}): Promise<{
  questions: unknown[];
  clinical_rules: unknown[];
  accepted_payers: unknown[];
  platform_settings: unknown[];
}> {
  const [qRows, rRows, pRows, sRows] = await Promise.all([
    client.query("SELECT * FROM questions ORDER BY sort_order ASC, question_key ASC"),
    client.query("SELECT * FROM clinical_rules ORDER BY rule_code ASC"),
    client.query("SELECT * FROM accepted_payers ORDER BY sort_order ASC, payer_code ASC"),
    client.query("SELECT * FROM platform_settings ORDER BY setting_key ASC"),
  ]);
  return {
    questions: qRows.rows,
    clinical_rules: rRows.rows,
    accepted_payers: pRows.rows,
    platform_settings: sRows.rows,
  };
}

function countDiffs(
  liveRows: Array<Record<string, unknown>>,
  snapRows: Array<Record<string, unknown>>,
  keyField: string,
  ignoreFields: string[],
): { added: number; removed: number; modified: number } {
  const strip = (row: Record<string, unknown>) => {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!ignoreFields.includes(k)) copy[k] = v;
    }
    return JSON.stringify(copy);
  };
  const liveMap = new Map(liveRows.map((r) => [String(r[keyField]), strip(r)]));
  const snapMap = new Map(snapRows.map((r) => [String(r[keyField]), strip(r)]));

  let added = 0;
  let removed = 0;
  let modified = 0;

  for (const [k, snapVal] of snapMap.entries()) {
    const liveVal = liveMap.get(k);
    if (liveVal === undefined) added += 1;
    else if (liveVal !== snapVal) modified += 1;
  }
  for (const k of liveMap.keys()) {
    if (!snapMap.has(k)) removed += 1;
  }
  return { added, removed, modified };
}

/**
 * Registers Enterprise Admin Governance routes onto the RBAC-protected Admin Router:
 * - /users (User creation with passwords, VIEWER demo access & hardcoded Super-Admin protection)
 * - /agreements (Signed Pre-Demo MNDA & Sandbox Agreement audit ledger)
 * - /payers (Organization accepted payers & Stedi coverage rules)
 * - /settings (No-code & sandboxed light-code DB-backed platform settings)
 * - /snapshots (In-app database configuration restore points & atomic rollback)
 */
export function registerAdminGovernanceRoutes(
  router: Router,
  pool: Pool,
  logger: HipaaLogger,
): void {
  // =========================================================================
  // 1. USER CREATION, DEMO ACCESS & RBAC DIRECTORY (/api/v1/admin/users)
  // =========================================================================
  router.get("/users", async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `
        SELECT
          u.id,
          u.email,
          u.full_name,
          u.role,
          u.organization,
          u.npi_number,
          u.specialty,
          u.is_active,
          u.is_hardcoded_admin,
          u.requires_demo_agreement,
          (u.password_hash IS NOT NULL) AS has_password,
          u.last_login_at,
          u.created_by,
          u.created_at,
          u.updated_at,
          (
            SELECT da.signed_at
            FROM demo_agreements da
            WHERE LOWER(da.email) = LOWER(u.email)
            ORDER BY da.signed_at DESC
            LIMIT 1
          ) AS agreement_signed_at
        FROM users u
        ORDER BY u.is_hardcoded_admin DESC, u.is_active DESC, u.role ASC, u.full_name ASC
        `,
      );
      res.json({ users: result.rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/users", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid user payload", details: parsed.error.flatten() });
        return;
      }
      const d = parsed.data;
      const normalizedEmail = d.email.toLowerCase().trim();
      const passwordHash = d.password ? hashPassword(d.password) : null;
      const isSuperAdmin = normalizedEmail === HARDCODED_SUPER_ADMIN_EMAIL;

      const inserted = await pool.query(
        `
        INSERT INTO users (
          email, full_name, role, organization, npi_number, specialty,
          password_hash, is_active, is_hardcoded_admin, requires_demo_agreement, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $10)
        RETURNING id, email, full_name, role, organization, npi_number, specialty,
                  is_active, is_hardcoded_admin, requires_demo_agreement,
                  (password_hash IS NOT NULL) AS has_password,
                  last_login_at, created_by, created_at, updated_at
        `,
        [
          normalizedEmail,
          d.full_name.trim(),
          isSuperAdmin ? "ADMIN" : d.role,
          d.organization?.trim() || null,
          d.npi_number?.trim() || null,
          d.specialty?.trim() || null,
          passwordHash,
          isSuperAdmin,
          isSuperAdmin ? false : (d.requires_demo_agreement ?? true),
          req.actor!.actor_id,
        ],
      );
      const user = inserted.rows[0]!;
      await writeAuditLog(pool, {
        actor_id: req.actor!.actor_id,
        actor_role: req.actor!.actor_role,
        action: "CREATE_USER",
        resource_type: "user",
        resource_id: user.id as string,
        ip_address: extractIp(req),
        metadata: { role: user.role, has_password: Boolean(passwordHash) },
      });
      logger.info("Admin created RBAC/Demo user", { user_id: user.id, role: user.role });
      res.status(201).json({ user });
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr?.code === "23505") {
        res.status(409).json({ error: "A user with this email address already exists" });
        return;
      }
      next(err);
    }
  });

  router.patch("/users/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const idCheck = UuidSchema.safeParse(req.params.id);
      if (!idCheck.success) {
        res.status(400).json({ error: "Invalid user UUID" });
        return;
      }
      const parsed = UpdateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid user update payload", details: parsed.error.flatten() });
        return;
      }
      const d = parsed.data;

      const targetRes = await pool.query<{
        email: string;
        role: string;
        is_active: boolean;
        is_hardcoded_admin: boolean;
      }>(
        "SELECT email, role, is_active, is_hardcoded_admin FROM users WHERE id = $1",
        [idCheck.data],
      );
      const target = targetRes.rows[0];
      if (!target) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Hardcoded Super-Admin (radiologymgmt@gmail.com) cannot be deactivated, demoted, or forced to sign agreements
      if (
        (target.is_hardcoded_admin || target.email.toLowerCase() === HARDCODED_SUPER_ADMIN_EMAIL) &&
        (d.is_active === false || (d.role && d.role !== "ADMIN") || d.requires_demo_agreement === true)
      ) {
        res.status(403).json({
          error: "Hardcoded Super-Admin (radiologymgmt@gmail.com) cannot be deactivated, demoted, or required to sign demo agreements.",
        });
        return;
      }

      // Prevent deactivating or demoting the last active ADMIN
      if (d.is_active === false || (d.role && d.role !== "ADMIN")) {
        if (target.role === "ADMIN" && target.is_active) {
          const activeAdmins = await pool.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM users WHERE role = 'ADMIN' AND is_active = TRUE",
          );
          if (Number(activeAdmins.rows[0]?.count ?? 0) <= 1) {
            res.status(409).json({
              error: "Cannot deactivate or demote the last active ADMIN account.",
            });
            return;
          }
        }
      }

      const nextPasswordHash = d.password ? hashPassword(d.password) : null;

      const updated = await pool.query(
        `
        UPDATE users
        SET
          full_name = COALESCE($1, full_name),
          role = COALESCE($2, role),
          organization = CASE WHEN $3::boolean THEN $4 ELSE organization END,
          npi_number = CASE WHEN $5::boolean THEN $6 ELSE npi_number END,
          specialty = CASE WHEN $7::boolean THEN $8 ELSE specialty END,
          password_hash = COALESCE($9, password_hash),
          requires_demo_agreement = COALESCE($10, requires_demo_agreement),
          is_active = COALESCE($11, is_active),
          updated_at = NOW()
        WHERE id = $12
        RETURNING id, email, full_name, role, organization, npi_number, specialty,
                  is_active, is_hardcoded_admin, requires_demo_agreement,
                  (password_hash IS NOT NULL) AS has_password,
                  last_login_at, created_by, created_at, updated_at
        `,
        [
          d.full_name?.trim() ?? null,
          d.role ?? null,
          d.organization !== undefined,
          d.organization?.trim() || null,
          d.npi_number !== undefined,
          d.npi_number?.trim() || null,
          d.specialty !== undefined,
          d.specialty?.trim() || null,
          nextPasswordHash,
          d.requires_demo_agreement ?? null,
          d.is_active ?? null,
          idCheck.data,
        ],
      );
      await writeAuditLog(pool, {
        actor_id: req.actor!.actor_id,
        actor_role: req.actor!.actor_role,
        action: "UPDATE_USER",
        resource_type: "user",
        resource_id: idCheck.data,
        ip_address: extractIp(req),
        metadata: {
          role: d.role,
          is_active: d.is_active,
          password_updated: Boolean(nextPasswordHash),
        },
      });
      res.json({ user: updated.rows[0] });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/admin/agreements — Signed Pre-Demo Agreements Ledger
  router.get("/agreements", async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `
        SELECT id, user_id, email, full_name, organization,
               signed_date::text AS signed_date, agreement_version,
               agreements_accepted, agreement_hash, ip_address::text AS ip_address,
               signed_at
        FROM demo_agreements
        ORDER BY signed_at DESC
        LIMIT 500
        `,
      );
      res.json({ agreements: result.rows });
    } catch (err) {
      next(err);
    }
  });

  // =========================================================================
  // 2. ORGANIZATION ACCEPTED PAYERS (/api/v1/admin/payers)
  // =========================================================================
  router.get("/payers", async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT * FROM accepted_payers ORDER BY sort_order ASC, payer_name ASC`,
      );
      res.json({ payers: result.rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/payers", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = CreatePayerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid payer payload", details: parsed.error.flatten() });
        return;
      }
      const d = parsed.data;
      const inserted = await pool.query(
        `
        INSERT INTO accepted_payers (
          payer_code, stedi_trading_partner_id, payer_name, acceptance_status,
          accepted_plan_types, excluded_plan_keywords, requires_pcp_referral,
          prior_auth_modalities, self_pay_available, patient_guidance_note, sort_order
        )
        VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8::text[], $9, $10, $11)
        RETURNING *
        `,
        [
          d.payer_code,
          d.stedi_trading_partner_id,
          d.payer_name,
          d.acceptance_status,
          d.accepted_plan_types,
          d.excluded_plan_keywords,
          d.requires_pcp_referral,
          d.prior_auth_modalities,
          d.self_pay_available,
          d.patient_guidance_note ?? null,
          d.sort_order,
        ],
      );
      await writeAuditLog(pool, {
        actor_id: req.actor!.actor_id,
        actor_role: req.actor!.actor_role,
        action: "CREATE_PAYER",
        resource_type: "accepted_payer",
        resource_id: inserted.rows[0]!.id as string,
        ip_address: extractIp(req),
        metadata: { payer_code: d.payer_code, acceptance_status: d.acceptance_status },
      });
      res.status(201).json({ payer: inserted.rows[0] });
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr?.code === "23505") {
        res.status(409).json({ error: "A payer with this payer_code already exists" });
        return;
      }
      next(err);
    }
  });

  router.patch("/payers/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const idCheck = UuidSchema.safeParse(req.params.id);
      if (!idCheck.success) {
        res.status(400).json({ error: "Invalid payer UUID" });
        return;
      }
      const parsed = UpdatePayerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid payer update payload", details: parsed.error.flatten() });
        return;
      }
      const d = parsed.data;
      const updated = await pool.query(
        `
        UPDATE accepted_payers
        SET
          stedi_trading_partner_id = COALESCE($1, stedi_trading_partner_id),
          payer_name = COALESCE($2, payer_name),
          acceptance_status = COALESCE($3, acceptance_status),
          accepted_plan_types = COALESCE($4::text[], accepted_plan_types),
          excluded_plan_keywords = COALESCE($5::text[], excluded_plan_keywords),
          requires_pcp_referral = COALESCE($6, requires_pcp_referral),
          prior_auth_modalities = COALESCE($7::text[], prior_auth_modalities),
          self_pay_available = COALESCE($8, self_pay_available),
          patient_guidance_note = CASE WHEN $9::boolean THEN $10 ELSE patient_guidance_note END,
          is_active = COALESCE($11, is_active),
          sort_order = COALESCE($12, sort_order),
          updated_at = NOW()
        WHERE id = $13
        RETURNING *
        `,
        [
          d.stedi_trading_partner_id ?? null,
          d.payer_name ?? null,
          d.acceptance_status ?? null,
          d.accepted_plan_types ?? null,
          d.excluded_plan_keywords ?? null,
          d.requires_pcp_referral ?? null,
          d.prior_auth_modalities ?? null,
          d.self_pay_available ?? null,
          d.patient_guidance_note !== undefined,
          d.patient_guidance_note ?? null,
          d.is_active ?? null,
          d.sort_order ?? null,
          idCheck.data,
        ],
      );
      if (updated.rowCount === 0) {
        res.status(404).json({ error: "Accepted payer not found" });
        return;
      }
      await writeAuditLog(pool, {
        actor_id: req.actor!.actor_id,
        actor_role: req.actor!.actor_role,
        action: "UPDATE_PAYER",
        resource_type: "accepted_payer",
        resource_id: idCheck.data,
        ip_address: extractIp(req),
        metadata: { acceptance_status: d.acceptance_status, is_active: d.is_active },
      });
      res.json({ payer: updated.rows[0] });
    } catch (err) {
      next(err);
    }
  });

  // =========================================================================
  // 3. FRONT-END PLATFORM SETTINGS & LIGHT-CODE STUDIO (/api/v1/admin/settings)
  // =========================================================================
  router.get("/settings", async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT * FROM platform_settings ORDER BY category ASC, setting_key ASC`,
      );
      res.json({ settings: result.rows });
    } catch (err) {
      next(err);
    }
  });

  router.put(
    "/settings/:settingKey",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const settingKey = String(req.params.settingKey ?? "").trim();
        if (!/^[a-z0-9_]{2,120}$/.test(settingKey)) {
          res.status(400).json({ error: "Invalid setting key" });
          return;
        }
        const parsed = UpdateSettingSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "Invalid setting payload", details: parsed.error.flatten() });
          return;
        }
        const d = parsed.data;

        // Safe validation for sandboxed custom derived metric formulas (JsonLogic AST only, never eval)
        if (settingKey === "derived_metric_overrides") {
          const metrics = (d.value_json.custom_metrics ?? []) as Array<{
            key?: string;
            formula?: unknown;
          }>;
          if (!Array.isArray(metrics)) {
            res.status(400).json({ error: "custom_metrics must be an array" });
            return;
          }
          for (const m of metrics) {
            if (!m.key || !/^[a-z0-9_]+$/.test(m.key)) {
              res.status(400).json({ error: `Invalid metric key: ${String(m.key)}` });
              return;
            }
            try {
              jsonLogic.apply(m.formula, { answers: {}, derived: {}, patient: {} });
            } catch {
              res.status(400).json({ error: `Invalid JsonLogic formula for metric ${m.key}` });
              return;
            }
          }
        }

        const updated = await pool.query(
          `
          UPDATE platform_settings
          SET
            label = COALESCE($1, label),
            description = CASE WHEN $2::boolean THEN $3 ELSE description END,
            value_json = $4::jsonb,
            version = version + 1,
            updated_by = $5,
            updated_at = NOW()
          WHERE setting_key = $6
          RETURNING *
          `,
          [
            d.label ?? null,
            d.description !== undefined,
            d.description ?? null,
            JSON.stringify(d.value_json),
            req.actor!.actor_id,
            settingKey,
          ],
        );

        if (updated.rowCount === 0) {
          res.status(404).json({ error: `Setting '${settingKey}' not found` });
          return;
        }

        await writeAuditLog(pool, {
          actor_id: req.actor!.actor_id,
          actor_role: req.actor!.actor_role,
          action: "UPDATE_PLATFORM_SETTING",
          resource_type: "platform_setting",
          resource_id: null,
          ip_address: extractIp(req),
          metadata: { setting_key: settingKey, new_version: updated.rows[0]!.version },
        });

        res.json({ setting: updated.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // =========================================================================
  // 4. IN-APP CONFIGURATION RESTORE POINTS (/api/v1/admin/snapshots)
  // =========================================================================
  router.get("/snapshots", async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query<{
        id: string;
        label: string;
        notes: string | null;
        trigger_type: string;
        created_by: string;
        created_at: Date;
        questions_count: number;
        rules_count: number;
        payers_count: number;
        settings_count: number;
      }>(`
        SELECT
          id,
          label,
          notes,
          trigger_type,
          created_by,
          created_at,
          COALESCE(jsonb_array_length(payload->'questions'), 0) AS questions_count,
          COALESCE(jsonb_array_length(payload->'clinical_rules'), 0) AS rules_count,
          COALESCE(jsonb_array_length(payload->'accepted_payers'), 0) AS payers_count,
          COALESCE(jsonb_array_length(payload->'platform_settings'), 0) AS settings_count
        FROM config_snapshots
        ORDER BY created_at DESC
        LIMIT 50
      `);
      res.json({ snapshots: result.rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/snapshots", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateSnapshotSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid snapshot payload", details: parsed.error.flatten() });
        return;
      }
      const payload = await captureCurrentConfigPayload(pool);
      const inserted = await pool.query(
        `
        INSERT INTO config_snapshots (label, notes, trigger_type, created_by, payload)
        VALUES ($1, $2, 'MANUAL', $3, $4::jsonb)
        RETURNING id, label, notes, trigger_type, created_by, created_at
        `,
        [
          parsed.data.label.trim(),
          parsed.data.notes?.trim() || null,
          req.actor!.actor_id,
          JSON.stringify(payload),
        ],
      );
      await writeAuditLog(pool, {
        actor_id: req.actor!.actor_id,
        actor_role: req.actor!.actor_role,
        action: "CREATE_CONFIG_SNAPSHOT",
        resource_type: "config_snapshot",
        resource_id: inserted.rows[0]!.id as string,
        ip_address: extractIp(req),
        metadata: {
          label: parsed.data.label,
          questions_count: payload.questions.length,
          rules_count: payload.clinical_rules.length,
          payers_count: payload.accepted_payers.length,
          settings_count: payload.platform_settings.length,
        },
      });
      res.status(201).json({
        snapshot: {
          ...inserted.rows[0],
          questions_count: payload.questions.length,
          rules_count: payload.clinical_rules.length,
          payers_count: payload.accepted_payers.length,
          settings_count: payload.platform_settings.length,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/snapshots/:id/diff",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const idCheck = UuidSchema.safeParse(req.params.id);
        if (!idCheck.success) {
          res.status(400).json({ error: "Invalid snapshot UUID" });
          return;
        }
        const snapRes = await pool.query<{
          id: string;
          label: string;
          created_at: Date;
          payload: {
            questions?: Array<Record<string, unknown>>;
            clinical_rules?: Array<Record<string, unknown>>;
            accepted_payers?: Array<Record<string, unknown>>;
            platform_settings?: Array<Record<string, unknown>>;
          };
        }>("SELECT id, label, created_at, payload FROM config_snapshots WHERE id = $1", [
          idCheck.data,
        ]);
        if (snapRes.rowCount === 0) {
          res.status(404).json({ error: "Restore point not found" });
          return;
        }
        const live = await captureCurrentConfigPayload(pool);
        const snap = snapRes.rows[0]!.payload;
        const ignore = ["created_at", "updated_at", "id"];

        res.json({
          snapshot_id: idCheck.data,
          label: snapRes.rows[0]!.label,
          diff: {
            questions: countDiffs(
              live.questions as Array<Record<string, unknown>>,
              snap.questions ?? [],
              "question_key",
              ignore,
            ),
            clinical_rules: countDiffs(
              live.clinical_rules as Array<Record<string, unknown>>,
              snap.clinical_rules ?? [],
              "rule_code",
              ignore,
            ),
            accepted_payers: countDiffs(
              live.accepted_payers as Array<Record<string, unknown>>,
              snap.accepted_payers ?? [],
              "payer_code",
              ignore,
            ),
            platform_settings: countDiffs(
              live.platform_settings as Array<Record<string, unknown>>,
              snap.platform_settings ?? [],
              "setting_key",
              ignore,
            ),
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/snapshots/:id/restore",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const idCheck = UuidSchema.safeParse(req.params.id);
        if (!idCheck.success) {
          res.status(400).json({ error: "Invalid snapshot UUID" });
          return;
        }
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const snapRes = await client.query<{
            id: string;
            label: string;
            payload: {
              questions?: Array<Record<string, unknown>>;
              clinical_rules?: Array<Record<string, unknown>>;
              accepted_payers?: Array<Record<string, unknown>>;
              platform_settings?: Array<Record<string, unknown>>;
            };
          }>("SELECT id, label, payload FROM config_snapshots WHERE id = $1", [idCheck.data]);

          if (snapRes.rowCount === 0) {
            await client.query("ROLLBACK");
            res.status(404).json({ error: "Restore point not found" });
            return;
          }

          // 1. Always capture an automatic pre-restore safety snapshot first
          const preRestorePayload = await captureCurrentConfigPayload(client);
          await client.query(
            `
            INSERT INTO config_snapshots (label, notes, trigger_type, created_by, payload)
            VALUES ($1, $2, 'AUTO_PRE_RESTORE', $3, $4::jsonb)
            `,
            [
              `Auto-Backup Before Restore (${snapRes.rows[0]!.label})`,
              `Automatic safety restore point created before reverting to snapshot ${idCheck.data}.`,
              req.actor!.actor_id,
              JSON.stringify(preRestorePayload),
            ],
          );

          const snap = snapRes.rows[0]!.payload;

          // 2. Restore questions
          if (Array.isArray(snap.questions)) {
            const snapKeys: string[] = [];
            for (const q of snap.questions) {
              snapKeys.push(String(q.question_key));
              await client.query(
                `
                INSERT INTO questions (
                  question_key, domain, label_plain_english, helper_tooltip, input_type,
                  options_json, data_source, is_knockout_gate, display_conditions,
                  sort_order, is_active, version
                )
                VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, $11, $12)
                ON CONFLICT (question_key) DO UPDATE SET
                  domain = EXCLUDED.domain,
                  label_plain_english = EXCLUDED.label_plain_english,
                  helper_tooltip = EXCLUDED.helper_tooltip,
                  input_type = EXCLUDED.input_type,
                  options_json = EXCLUDED.options_json,
                  data_source = EXCLUDED.data_source,
                  is_knockout_gate = EXCLUDED.is_knockout_gate,
                  display_conditions = EXCLUDED.display_conditions,
                  sort_order = EXCLUDED.sort_order,
                  is_active = EXCLUDED.is_active,
                  version = EXCLUDED.version,
                  updated_at = NOW()
                `,
                [
                  q.question_key,
                  q.domain,
                  q.label_plain_english,
                  q.helper_tooltip ?? "",
                  q.input_type,
                  JSON.stringify(q.options_json ?? []),
                  q.data_source,
                  Boolean(q.is_knockout_gate),
                  JSON.stringify(q.display_conditions ?? {}),
                  Number(q.sort_order ?? 100),
                  q.is_active !== false,
                  Number(q.version ?? 1),
                ],
              );
            }
            if (snapKeys.length > 0) {
              await client.query(
                `UPDATE questions SET is_active = FALSE, updated_at = NOW() WHERE NOT (question_key = ANY($1::text[]))`,
                [snapKeys],
              );
            }
          }

          // 3. Restore clinical_rules
          if (Array.isArray(snap.clinical_rules)) {
            const snapCodes: string[] = [];
            for (const r of snap.clinical_rules) {
              snapCodes.push(String(r.rule_code));
              await client.query(
                `
                INSERT INTO clinical_rules (
                  rule_code, display_name, specialty, rule_type, acuity_level,
                  logic_expression, recommended_intervention, cpt_codes, icd10_codes,
                  prior_auth_rationale_template, is_active, version
                )
                VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::text[], $9::text[], $10, $11, $12)
                ON CONFLICT (rule_code) DO UPDATE SET
                  display_name = EXCLUDED.display_name,
                  specialty = EXCLUDED.specialty,
                  rule_type = EXCLUDED.rule_type,
                  acuity_level = EXCLUDED.acuity_level,
                  logic_expression = EXCLUDED.logic_expression,
                  recommended_intervention = EXCLUDED.recommended_intervention,
                  cpt_codes = EXCLUDED.cpt_codes,
                  icd10_codes = EXCLUDED.icd10_codes,
                  prior_auth_rationale_template = EXCLUDED.prior_auth_rationale_template,
                  is_active = EXCLUDED.is_active,
                  version = EXCLUDED.version,
                  updated_at = NOW()
                `,
                [
                  r.rule_code,
                  r.display_name,
                  r.specialty,
                  r.rule_type,
                  r.acuity_level,
                  JSON.stringify(r.logic_expression ?? {}),
                  r.recommended_intervention,
                  Array.isArray(r.cpt_codes) ? r.cpt_codes : [],
                  Array.isArray(r.icd10_codes) ? r.icd10_codes : [],
                  r.prior_auth_rationale_template ?? "",
                  r.is_active !== false,
                  Number(r.version ?? 1),
                ],
              );
            }
            if (snapCodes.length > 0) {
              await client.query(
                `UPDATE clinical_rules SET is_active = FALSE, updated_at = NOW() WHERE NOT (rule_code = ANY($1::text[]))`,
                [snapCodes],
              );
            }
          }

          // 4. Restore accepted_payers
          if (Array.isArray(snap.accepted_payers)) {
            const payerCodes: string[] = [];
            for (const p of snap.accepted_payers) {
              payerCodes.push(String(p.payer_code));
              await client.query(
                `
                INSERT INTO accepted_payers (
                  payer_code, stedi_trading_partner_id, payer_name, acceptance_status,
                  accepted_plan_types, excluded_plan_keywords, requires_pcp_referral,
                  prior_auth_modalities, self_pay_available, patient_guidance_note,
                  is_active, sort_order
                )
                VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8::text[], $9, $10, $11, $12)
                ON CONFLICT (payer_code) DO UPDATE SET
                  stedi_trading_partner_id = EXCLUDED.stedi_trading_partner_id,
                  payer_name = EXCLUDED.payer_name,
                  acceptance_status = EXCLUDED.acceptance_status,
                  accepted_plan_types = EXCLUDED.accepted_plan_types,
                  excluded_plan_keywords = EXCLUDED.excluded_plan_keywords,
                  requires_pcp_referral = EXCLUDED.requires_pcp_referral,
                  prior_auth_modalities = EXCLUDED.prior_auth_modalities,
                  self_pay_available = EXCLUDED.self_pay_available,
                  patient_guidance_note = EXCLUDED.patient_guidance_note,
                  is_active = EXCLUDED.is_active,
                  sort_order = EXCLUDED.sort_order,
                  updated_at = NOW()
                `,
                [
                  p.payer_code,
                  p.stedi_trading_partner_id,
                  p.payer_name,
                  p.acceptance_status,
                  Array.isArray(p.accepted_plan_types) ? p.accepted_plan_types : [],
                  Array.isArray(p.excluded_plan_keywords) ? p.excluded_plan_keywords : [],
                  Boolean(p.requires_pcp_referral),
                  Array.isArray(p.prior_auth_modalities) ? p.prior_auth_modalities : [],
                  p.self_pay_available !== false,
                  p.patient_guidance_note ?? null,
                  p.is_active !== false,
                  Number(p.sort_order ?? 100),
                ],
              );
            }
            if (payerCodes.length > 0) {
              await client.query(
                `UPDATE accepted_payers SET is_active = FALSE, updated_at = NOW() WHERE NOT (payer_code = ANY($1::text[]))`,
                [payerCodes],
              );
            }
          }

          // 5. Restore platform_settings
          if (Array.isArray(snap.platform_settings)) {
            for (const s of snap.platform_settings) {
              await client.query(
                `
                INSERT INTO platform_settings (
                  setting_key, category, label, description, value_json, version, updated_by
                )
                VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
                ON CONFLICT (setting_key) DO UPDATE SET
                  category = EXCLUDED.category,
                  label = EXCLUDED.label,
                  description = EXCLUDED.description,
                  value_json = EXCLUDED.value_json,
                  version = EXCLUDED.version,
                  updated_by = EXCLUDED.updated_by,
                  updated_at = NOW()
                `,
                [
                  s.setting_key,
                  s.category,
                  s.label,
                  s.description ?? null,
                  JSON.stringify(s.value_json ?? {}),
                  Number(s.version ?? 1),
                  req.actor!.actor_id,
                ],
              );
            }
          }

          await writeAuditLog(client, {
            actor_id: req.actor!.actor_id,
            actor_role: req.actor!.actor_role,
            action: "RESTORE_CONFIG_SNAPSHOT",
            resource_type: "config_snapshot",
            resource_id: idCheck.data,
            ip_address: extractIp(req),
            metadata: { restored_label: snapRes.rows[0]!.label },
          });

          await client.query("COMMIT");
          logger.info("Restored configuration snapshot atomically", {
            snapshot_id: idCheck.data,
            restored_label: snapRes.rows[0]!.label,
          });
          res.json({
            restored: true,
            snapshot_id: idCheck.data,
            label: snapRes.rows[0]!.label,
            safety_backup_created: true,
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
}
