import { Router, type NextFunction, type Response } from "express";
import type { Pool } from "pg";
import jsonLogic from "json-logic-js";
import { z } from "zod";
import {
  AdminQuestionCreateSchema,
  AdminQuestionUpdateSchema,
  AdminRuleCreateSchema,
  AdminRuleDryRunRequestSchema,
  AdminRuleUpdateSchema,
  CLINICAL_TOOL_MAP,
  type HipaaLogger,
} from "@healthcare/shared-contracts";
import { computeDerivedMetrics, enrichAnswersFromPedigree } from "./derived-metrics.js";
import { writeAuditLog } from "./audit.js";
import { requireRole, type AuthenticatedRequest } from "./rbac.js";
import { registerAdminAnalyticsAndPdfRoutes } from "./admin-analytics-pdf.js";

const UuidParamSchema = z.string().uuid();

function extractClientIp(req: AuthenticatedRequest): string | null {
  const raw = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!raw) return null;
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

export function createAdminRouter(pool: Pool, logger: HipaaLogger): Router {
  const router = Router();

  // Enforce strict ADMIN RBAC across all /api/v1/admin/* endpoints
  router.use(requireRole(["ADMIN"], pool, logger));

  // =========================================================================
  // QUESTIONS CRUD + VERSION SNAPSHOTTING
  // =========================================================================

  router.get("/questions", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const domain = typeof req.query.domain === "string" ? req.query.domain.trim() : "";
      const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
      const includeInactive = req.query.include_inactive !== "false";

      const result = await pool.query(
        `
        SELECT
          id,
          question_key,
          domain,
          label_plain_english,
          helper_tooltip,
          input_type,
          options_json,
          data_source,
          is_knockout_gate,
          display_conditions,
          sort_order,
          is_active,
          version,
          updated_at
        FROM questions
        WHERE ($1::boolean = TRUE OR is_active = TRUE)
          AND ($2 = '' OR LOWER(domain) = LOWER($2))
        ORDER BY sort_order ASC, question_key ASC
        `,
        [includeInactive, domain],
      );

      const rows = search
        ? result.rows.filter(
            (q) =>
              String(q.question_key).toLowerCase().includes(search) ||
              String(q.label_plain_english).toLowerCase().includes(search) ||
              String(q.domain).toLowerCase().includes(search),
          )
        : result.rows;

      const domains = Array.from(new Set(result.rows.map((r) => String(r.domain)))).sort();
      const maxVersion = result.rows.reduce((max, r) => Math.max(max, Number(r.version ?? 1)), 1);

      res.json({
        questions_version_snapshot: maxVersion,
        total: rows.length,
        domains,
        questions: rows,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/questions", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = AdminQuestionCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid question payload", details: parsed.error.flatten() });
        return;
      }

      const d = parsed.data;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          `
          INSERT INTO questions (
            question_key,
            domain,
            label_plain_english,
            helper_tooltip,
            input_type,
            options_json,
            data_source,
            is_knockout_gate,
            display_conditions,
            sort_order,
            is_active,
            version
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, $11, 1)
          RETURNING *
          `,
          [
            d.question_key,
            d.domain,
            d.label_plain_english,
            d.helper_tooltip ?? null,
            d.input_type,
            JSON.stringify(d.options_json),
            d.data_source,
            d.is_knockout_gate,
            JSON.stringify(d.display_conditions),
            d.sort_order,
            d.is_active,
          ],
        );

        const created = inserted.rows[0]!;
        await writeAuditLog(client, {
          actor_id: req.actor!.actor_id,
          actor_role: req.actor!.actor_role,
          action: "CREATE_QUESTION",
          resource_type: "question",
          resource_id: created.id,
          ip_address: extractClientIp(req),
          metadata: {
            question_key: created.question_key,
            domain: created.domain,
            new_version: created.version,
          },
        });

        await client.query("COMMIT");
        logger.info("Admin created question", {
          actor_id: req.actor!.actor_id,
          question_key: created.question_key,
          version: created.version,
        });
        res.status(201).json({ question: created });
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

  router.put(
    "/questions/:id",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const idCheck = UuidParamSchema.safeParse(req.params.id);
        if (!idCheck.success) {
          res.status(400).json({ error: "Invalid question UUID" });
          return;
        }
        const parsed = AdminQuestionUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "Invalid question update payload", details: parsed.error.flatten() });
          return;
        }

        const d = parsed.data;
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const existing = await client.query(`SELECT * FROM questions WHERE id = $1 FOR UPDATE`, [
            idCheck.data,
          ]);
          if (existing.rowCount === 0) {
            await client.query("ROLLBACK");
            res.status(404).json({ error: "Question not found" });
            return;
          }
          const prev = existing.rows[0]!;

          const updatedRes = await client.query(
            `
            UPDATE questions
            SET
              domain = $1,
              label_plain_english = $2,
              helper_tooltip = $3,
              input_type = $4,
              options_json = $5::jsonb,
              data_source = $6,
              is_knockout_gate = $7,
              display_conditions = $8::jsonb,
              sort_order = $9,
              is_active = $10,
              version = version + 1,
              updated_at = NOW()
            WHERE id = $11
            RETURNING *
            `,
            [
              d.domain ?? prev.domain,
              d.label_plain_english ?? prev.label_plain_english,
              d.helper_tooltip !== undefined ? d.helper_tooltip : prev.helper_tooltip,
              d.input_type ?? prev.input_type,
              JSON.stringify(d.options_json ?? prev.options_json),
              d.data_source ?? prev.data_source,
              d.is_knockout_gate ?? prev.is_knockout_gate,
              JSON.stringify(d.display_conditions ?? prev.display_conditions),
              d.sort_order ?? prev.sort_order,
              d.is_active ?? prev.is_active,
              idCheck.data,
            ],
          );

          const updated = updatedRes.rows[0]!;
          await writeAuditLog(client, {
            actor_id: req.actor!.actor_id,
            actor_role: req.actor!.actor_role,
            action: "UPDATE_QUESTION",
            resource_type: "question",
            resource_id: updated.id,
            ip_address: extractClientIp(req),
            metadata: {
              question_key: updated.question_key,
              previous_version: prev.version,
              new_version: updated.version,
              is_active: updated.is_active,
            },
          });

          await client.query("COMMIT");
          logger.info("Admin updated question", {
            actor_id: req.actor!.actor_id,
            question_key: updated.question_key,
            previous_version: prev.version,
            new_version: updated.version,
          });
          res.json({ question: updated });
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

  router.delete(
    "/questions/:id",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const idCheck = UuidParamSchema.safeParse(req.params.id);
        if (!idCheck.success) {
          res.status(400).json({ error: "Invalid question UUID" });
          return;
        }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const updatedRes = await client.query(
            `
            UPDATE questions
            SET is_active = FALSE, version = version + 1, updated_at = NOW()
            WHERE id = $1
            RETURNING *
            `,
            [idCheck.data],
          );
          if (updatedRes.rowCount === 0) {
            await client.query("ROLLBACK");
            res.status(404).json({ error: "Question not found" });
            return;
          }
          const updated = updatedRes.rows[0]!;

          await writeAuditLog(client, {
            actor_id: req.actor!.actor_id,
            actor_role: req.actor!.actor_role,
            action: "DEACTIVATE_QUESTION",
            resource_type: "question",
            resource_id: updated.id,
            ip_address: extractClientIp(req),
            metadata: {
              question_key: updated.question_key,
              new_version: updated.version,
            },
          });

          await client.query("COMMIT");
          res.json({ question: updated });
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

  // =========================================================================
  // CLINICAL RULES CRUD + VERSION SNAPSHOTTING + DRY-RUN SANDBOX
  // =========================================================================

  router.get("/rules", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const specialty = typeof req.query.specialty === "string" ? req.query.specialty.trim() : "";
      const acuity = typeof req.query.acuity_level === "string" ? req.query.acuity_level.trim() : "";
      const ruleType = typeof req.query.rule_type === "string" ? req.query.rule_type.trim() : "";
      const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
      const includeInactive = req.query.include_inactive !== "false";

      const [rulesRes, historyRes] = await Promise.all([
        pool.query(
          `
          SELECT
            id,
            rule_code,
            display_name,
            specialty,
            rule_type,
            acuity_level,
            logic_expression,
            recommended_intervention,
            cpt_codes,
            icd10_codes,
            prior_auth_rationale_template,
            is_active,
            version,
            updated_at
          FROM clinical_rules
          WHERE ($1::boolean = TRUE OR is_active = TRUE)
            AND ($2 = '' OR LOWER(specialty) = LOWER($2))
            AND ($3 = '' OR acuity_level = $3)
            AND ($4 = '' OR rule_type = $4)
          ORDER BY
            CASE acuity_level
              WHEN 'ACUTE_RED_FLAG' THEN 1
              WHEN 'HIGH_RISK' THEN 2
              WHEN 'MODERATE_RISK' THEN 3
              ELSE 4
            END,
            specialty ASC,
            rule_code ASC
          `,
          [includeInactive, specialty, acuity, ruleType],
        ),
        pool.query(
          `
          SELECT id, actor_id, action, resource_id, metadata, created_at
          FROM audit_logs
          WHERE resource_type IN ('clinical_rule', 'question')
          ORDER BY created_at DESC
          LIMIT 25
          `,
        ),
      ]);

      const rows = search
        ? rulesRes.rows.filter(
            (r) =>
              String(r.rule_code).toLowerCase().includes(search) ||
              String(r.display_name).toLowerCase().includes(search) ||
              String(r.specialty).toLowerCase().includes(search) ||
              (Array.isArray(r.cpt_codes) &&
                r.cpt_codes.some((c: string) => c.toLowerCase().includes(search))) ||
              (Array.isArray(r.icd10_codes) &&
                r.icd10_codes.some((c: string) => c.toLowerCase().includes(search))),
          )
        : rulesRes.rows;

      const specialties = Array.from(new Set(rulesRes.rows.map((r) => String(r.specialty)))).sort();
      const maxVersion = rulesRes.rows.reduce((max, r) => Math.max(max, Number(r.version ?? 1)), 1);

      res.json({
        rules_version_snapshot: maxVersion,
        total: rows.length,
        specialties,
        rules: rows,
        recent_version_history: historyRes.rows,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/rules/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const idCheck = UuidParamSchema.safeParse(req.params.id);
      if (!idCheck.success) {
        res.status(400).json({ error: "Invalid rule UUID" });
        return;
      }

      const [ruleRes, historyRes] = await Promise.all([
        pool.query(`SELECT * FROM clinical_rules WHERE id = $1`, [idCheck.data]),
        pool.query(
          `
          SELECT id, actor_id, action, resource_id, metadata, created_at
          FROM audit_logs
          WHERE resource_type = 'clinical_rule' AND resource_id = $1
          ORDER BY created_at DESC
          LIMIT 20
          `,
          [idCheck.data],
        ),
      ]);

      if (ruleRes.rowCount === 0) {
        res.status(404).json({ error: "Clinical rule not found" });
        return;
      }

      res.json({
        rule: ruleRes.rows[0],
        version_history: historyRes.rows,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/rules", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = AdminRuleCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid clinical rule payload", details: parsed.error.flatten() });
        return;
      }

      const d = parsed.data;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const snapRes = await client.query<{ next_ver: number }>(
          `SELECT COALESCE(MAX(version), 0)::int + 1 AS next_ver FROM clinical_rules`,
        );
        const nextVersion = snapRes.rows[0]?.next_ver ?? 1;

        const inserted = await client.query(
          `
          INSERT INTO clinical_rules (
            rule_code,
            display_name,
            specialty,
            rule_type,
            acuity_level,
            logic_expression,
            recommended_intervention,
            cpt_codes,
            icd10_codes,
            prior_auth_rationale_template,
            is_active,
            version
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::text[], $9::text[], $10, $11, $12)
          RETURNING *
          `,
          [
            d.rule_code,
            d.display_name,
            d.specialty,
            d.rule_type,
            d.acuity_level,
            JSON.stringify(d.logic_expression),
            d.recommended_intervention,
            d.cpt_codes,
            d.icd10_codes,
            d.prior_auth_rationale_template ?? null,
            d.is_active,
            nextVersion,
          ],
        );

        const created = inserted.rows[0]!;
        await writeAuditLog(client, {
          actor_id: req.actor!.actor_id,
          actor_role: req.actor!.actor_role,
          action: "CREATE_RULE",
          resource_type: "clinical_rule",
          resource_id: created.id,
          ip_address: extractClientIp(req),
          metadata: {
            rule_code: created.rule_code,
            specialty: created.specialty,
            acuity_level: created.acuity_level,
            new_version: created.version,
            cpt_codes: created.cpt_codes,
            icd10_codes: created.icd10_codes,
          },
        });

        await client.query("COMMIT");
        logger.info("Admin created clinical rule", {
          actor_id: req.actor!.actor_id,
          rule_code: created.rule_code,
          version: created.version,
        });
        res.status(201).json({ rule: created, rules_version_snapshot: created.version });
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

  router.put("/rules/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const idCheck = UuidParamSchema.safeParse(req.params.id);
      if (!idCheck.success) {
        res.status(400).json({ error: "Invalid rule UUID" });
        return;
      }
      const parsed = AdminRuleUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid clinical rule update payload", details: parsed.error.flatten() });
        return;
      }

      const d = parsed.data;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query(
          `SELECT * FROM clinical_rules WHERE id = $1 FOR UPDATE`,
          [idCheck.data],
        );
        if (existing.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Clinical rule not found" });
          return;
        }
        const prev = existing.rows[0]!;

        const snapRes = await client.query<{ next_ver: number }>(
          `SELECT GREATEST(COALESCE(MAX(version), 0), $1)::int + 1 AS next_ver FROM clinical_rules`,
          [prev.version],
        );
        const nextVersion = snapRes.rows[0]!.next_ver;

        const updatedRes = await client.query(
          `
          UPDATE clinical_rules
          SET
            display_name = $1,
            specialty = $2,
            rule_type = $3,
            acuity_level = $4,
            logic_expression = $5::jsonb,
            recommended_intervention = $6,
            cpt_codes = $7::text[],
            icd10_codes = $8::text[],
            prior_auth_rationale_template = $9,
            is_active = $10,
            version = $11,
            updated_at = NOW()
          WHERE id = $12
          RETURNING *
          `,
          [
            d.display_name ?? prev.display_name,
            d.specialty ?? prev.specialty,
            d.rule_type ?? prev.rule_type,
            d.acuity_level ?? prev.acuity_level,
            JSON.stringify(d.logic_expression ?? prev.logic_expression),
            d.recommended_intervention ?? prev.recommended_intervention,
            d.cpt_codes ?? prev.cpt_codes,
            d.icd10_codes ?? prev.icd10_codes,
            d.prior_auth_rationale_template !== undefined
              ? d.prior_auth_rationale_template
              : prev.prior_auth_rationale_template,
            d.is_active ?? prev.is_active,
            nextVersion,
            idCheck.data,
          ],
        );

        const updated = updatedRes.rows[0]!;
        await writeAuditLog(client, {
          actor_id: req.actor!.actor_id,
          actor_role: req.actor!.actor_role,
          action: "UPDATE_RULE",
          resource_type: "clinical_rule",
          resource_id: updated.id,
          ip_address: extractClientIp(req),
          metadata: {
            rule_code: updated.rule_code,
            previous_version: prev.version,
            new_version: updated.version,
            logic_changed: d.logic_expression !== undefined,
            codes_changed: d.cpt_codes !== undefined || d.icd10_codes !== undefined,
            cpt_codes: updated.cpt_codes,
            icd10_codes: updated.icd10_codes,
            is_active: updated.is_active,
          },
        });

        await client.query("COMMIT");
        logger.info("Admin updated clinical rule", {
          actor_id: req.actor!.actor_id,
          rule_code: updated.rule_code,
          previous_version: prev.version,
          new_version: updated.version,
        });
        res.json({ rule: updated, rules_version_snapshot: updated.version });
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

  router.delete(
    "/rules/:id",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const idCheck = UuidParamSchema.safeParse(req.params.id);
        if (!idCheck.success) {
          res.status(400).json({ error: "Invalid rule UUID" });
          return;
        }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const existing = await client.query(
            `SELECT * FROM clinical_rules WHERE id = $1 FOR UPDATE`,
            [idCheck.data],
          );
          if (existing.rowCount === 0) {
            await client.query("ROLLBACK");
            res.status(404).json({ error: "Clinical rule not found" });
            return;
          }
          const prev = existing.rows[0]!;
          const snapRes = await client.query<{ next_ver: number }>(
            `SELECT GREATEST(COALESCE(MAX(version), 0), $1)::int + 1 AS next_ver FROM clinical_rules`,
            [prev.version],
          );
          const nextVersion = snapRes.rows[0]!.next_ver;

          const updatedRes = await client.query(
            `
            UPDATE clinical_rules
            SET is_active = FALSE, version = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
            `,
            [nextVersion, idCheck.data],
          );
          const updated = updatedRes.rows[0]!;

          await writeAuditLog(client, {
            actor_id: req.actor!.actor_id,
            actor_role: req.actor!.actor_role,
            action: "DEACTIVATE_RULE",
            resource_type: "clinical_rule",
            resource_id: updated.id,
            ip_address: extractClientIp(req),
            metadata: {
              rule_code: updated.rule_code,
              previous_version: prev.version,
              new_version: updated.version,
            },
          });

          await client.query("COMMIT");
          res.json({ rule: updated, rules_version_snapshot: updated.version });
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
   * POST /api/v1/admin/rules/dry-run
   * Live synthetic rule evaluation sandbox for testing JsonLogic edits before saving.
   */
  router.post(
    "/rules/dry-run",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const parsed = AdminRuleDryRunRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "Invalid dry-run payload", details: parsed.error.flatten() });
          return;
        }

        const { logic_expression, rule_code, synthetic_patient, answers } = parsed.data;
        const enrichedAnswers = enrichAnswersFromPedigree(answers);
        const derived = computeDerivedMetrics(synthetic_patient, enrichedAnswers);
        const context = {
          patient: { sex_at_birth: synthetic_patient.sex_at_birth },
          answers: enrichedAnswers,
          derived,
        };

        const rawResult = jsonLogic.apply(logic_expression, context);
        const matched = Boolean(rawResult);
        const scoreKey = rule_code ? CLINICAL_TOOL_MAP.get(rule_code)?.score_derived_key : undefined;
        const calculatedScore =
          scoreKey && typeof derived[scoreKey] === "number" ? derived[scoreKey] : null;

        res.json({
          matched,
          raw_result: rawResult,
          calculated_score: calculatedScore,
          derived_metrics: derived,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Phase 5: Executive Analytics & Headless PDF Engine
  registerAdminAnalyticsAndPdfRoutes(router, pool, logger);

  return router;
}
