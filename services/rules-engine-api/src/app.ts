import express, { type Express, type Request, type Response, type NextFunction } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import {
  EvaluateSessionRequestSchema,
  QuestionnaireConfigQuerySchema,
  createHipaaLogger,
  type AcuityLevel,
  type HipaaLogger,
  type QuestionDto,
} from "@healthcare/shared-contracts";
import { evaluateClinicalRules, type ClinicalRuleRecord } from "./evaluator.js";
import { writeAuditLog } from "./audit.js";
import { createAdminRouter } from "./admin-routes.js";
import { createPatientAndMagicLinkRouter } from "./patient-routes.js";
import { createWorkqueueRouter } from "./workqueue-routes.js";

const UuidParamSchema = z.string().uuid();

const MODULE_TO_DOMAINS: Record<string, string[]> = {
  demographics: ["Demographics"],
  acute: ["Acute"],
  oncology: ["Oncology"],
  pulmonology: ["Pulmonology", "Demographics"],
  urology: ["Urology"],
  obgyn: ["OBGYN"],
  cardio: ["Cardio"],
  cardiology: ["Cardio"],
  neurology: ["Neurology", "Acute"],
  sleep: ["Sleep"],
  bone: ["Bone"],
  msk: ["MSK"],
  hematology: ["Hematology", "Acute"],
  hepatology: ["Hepatology"],
};

function matchesDemographicConditions(
  displayConditions: Record<string, unknown>,
  sexAtBirth?: string,
  age?: number,
): boolean {
  if (sexAtBirth && displayConditions.sex_at_birth !== undefined) {
    const allowed = Array.isArray(displayConditions.sex_at_birth)
      ? displayConditions.sex_at_birth
      : [displayConditions.sex_at_birth];
    if (!allowed.includes(sexAtBirth)) return false;
  }
  if (age !== undefined) {
    if (typeof displayConditions.min_age === "number" && age < displayConditions.min_age) {
      return false;
    }
    if (typeof displayConditions.max_age === "number" && age > displayConditions.max_age) {
      return false;
    }
  }
  return true;
}

function extractClientIp(req: Request): string | null {
  const raw = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!raw) return null;
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

export function createApp(
  pool: Pool,
  logger: HipaaLogger = createHipaaLogger("rules-engine-api"),
): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Healthcheck
  app.get("/health", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", service: "rules-engine-api" });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/v1/questionnaire/config
   * Returns active questions, knockout rules, and plain-English tooltips
   * filtered by selected modules and optional patient demographics.
   */
  app.get(
    "/api/v1/questionnaire/config",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsedQuery = QuestionnaireConfigQuerySchema.safeParse(req.query);
        if (!parsedQuery.success) {
          res.status(400).json({
            error: "Invalid query parameters",
            details: parsedQuery.error.flatten().fieldErrors,
          });
          return;
        }

        const { modules, sex_at_birth, age, data_source, include_ehr_only } = parsedQuery.data;

        const selectedModules = modules
          ? modules
              .split(",")
              .map((m) => m.trim().toLowerCase())
              .filter(Boolean)
          : ["all"];

        const isAllModules = selectedModules.length === 0 || selectedModules.includes("all");

        let domainFilter: string[] | null = null;
        if (!isAllModules) {
          const domains = new Set<string>(["Demographics", "Acute"]);
          for (const mod of selectedModules) {
            const mapped = MODULE_TO_DOMAINS[mod];
            if (mapped) {
              for (const d of mapped) domains.add(d);
            } else {
              domains.add(mod);
            }
          }
          domainFilter = Array.from(domains);
        }

        const [questionsResult, versionResult] = await Promise.all([
          pool.query<{
            id: string;
            question_key: string;
            domain: string;
            label_plain_english: string;
            helper_tooltip: string | null;
            input_type: QuestionDto["input_type"];
            options_json: QuestionDto["options_json"];
            data_source: QuestionDto["data_source"];
            is_knockout_gate: boolean;
            display_conditions: Record<string, unknown>;
            sort_order: number;
            is_active: boolean;
            version: number;
          }>(
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
              version
            FROM questions
            WHERE is_active = TRUE
            ORDER BY sort_order ASC, question_key ASC
            `,
          ),
          pool.query<{ max_version: number }>(
            `SELECT COALESCE(MAX(version), 1)::int AS max_version FROM clinical_rules WHERE is_active = TRUE`,
          ),
        ]);

        const filtered: QuestionDto[] = questionsResult.rows.filter((q) => {
          if (domainFilter && !domainFilter.some((d) => d.toLowerCase() === q.domain.toLowerCase())) {
            return false;
          }
          if (data_source && q.data_source !== data_source) {
            return false;
          }
          if (!data_source && !include_ehr_only && q.data_source === "EHR_LAB") {
            return false;
          }
          if (!matchesDemographicConditions(q.display_conditions ?? {}, sex_at_birth, age)) {
            return false;
          }
          return true;
        });

        const knockout_gates = filtered.filter((q) => q.is_knockout_gate);
        const rules_version_snapshot = versionResult.rows[0]?.max_version ?? 1;

        logger.info("Served questionnaire configuration", {
          selected_modules: selectedModules,
          returned_count: filtered.length,
          knockout_count: knockout_gates.length,
        });

        res.json({
          rules_version_snapshot,
          selected_modules: selectedModules,
          total_questions: filtered.length,
          knockout_gates,
          questions: filtered,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * POST /api/v1/sessions/:id/evaluate
   * Merges patient answers + EHR labs, runs all 54 active JsonLogic rules,
   * writes `triggered_pathways` & `workqueue_items`, and logs an immutable HIPAA audit event.
   */
  app.post(
    "/api/v1/sessions/:id/evaluate",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const idCheck = UuidParamSchema.safeParse(req.params.id);
        if (!idCheck.success) {
          res.status(400).json({ error: "Invalid session UUID format" });
          return;
        }
        const sessionId = idCheck.data;

        const bodyCheck = EvaluateSessionRequestSchema.safeParse(req.body ?? {});
        if (!bodyCheck.success) {
          res.status(400).json({
            error: "Invalid evaluation payload",
            details: bodyCheck.error.flatten(),
          });
          return;
        }
        const payload = bodyCheck.data;

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // 1. Load session & patient demographics
          const sessionRes = await client.query<{
            session_id: string;
            patient_id: string;
            dob: Date | string;
            sex_at_birth: string | null;
          }>(
            `
            SELECT
              s.id AS session_id,
              s.patient_id,
              p.dob,
              p.sex_at_birth
            FROM assessment_sessions s
            INNER JOIN patients p ON p.id = s.patient_id
            WHERE s.id = $1
            `,
            [sessionId],
          );

          if (sessionRes.rowCount === 0) {
            await client.query("ROLLBACK");
            res.status(404).json({ error: "Assessment session not found" });
            return;
          }

          const session = sessionRes.rows[0]!;

          // 2. Upsert any newly submitted responses into unified `assessment_responses`
          if (payload.responses && payload.responses.length > 0) {
            for (const item of payload.responses) {
              await client.query(
                `
                INSERT INTO assessment_responses (
                  session_id,
                  patient_id,
                  question_key,
                  answer_value,
                  provenance,
                  confidence_score,
                  source_document_id,
                  source_excerpt,
                  updated_at
                )
                VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, NOW())
                ON CONFLICT (session_id, question_key) DO UPDATE SET
                  answer_value = EXCLUDED.answer_value,
                  provenance = EXCLUDED.provenance,
                  confidence_score = EXCLUDED.confidence_score,
                  source_document_id = EXCLUDED.source_document_id,
                  source_excerpt = EXCLUDED.source_excerpt,
                  updated_at = NOW()
                `,
                [
                  sessionId,
                  session.patient_id,
                  item.question_key,
                  JSON.stringify(item.answer_value),
                  item.provenance,
                  item.confidence_score ?? null,
                  item.source_document_id ?? null,
                  item.source_excerpt ?? null,
                ],
              );
            }
          }

          // 3. Load unified patient answers + EHR labs for this session
          // Also merge any prior EHR_LAB_IMPORT responses for this patient so EHR labs
          // automatically feed patient-submitted sessions, with current session answers taking precedence.
          const responsesRes = await client.query<{
            question_key: string;
            answer_value: unknown;
            is_current_session: boolean;
          }>(
            `
            SELECT question_key, answer_value, (session_id = $1) AS is_current_session
            FROM assessment_responses
            WHERE session_id = $1
               OR (patient_id = $2 AND provenance IN ('EHR_LAB_IMPORT', 'AI_PARSED'))
            ORDER BY (session_id = $1) ASC, updated_at ASC
            `,
            [sessionId, session.patient_id],
          );

          const mergedAnswers: Record<string, unknown> = {};
          for (const row of responsesRes.rows) {
            mergedAnswers[row.question_key] = row.answer_value;
          }

          // 4. Load all active clinical rules
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
            `
            SELECT
              rule_code,
              display_name,
              specialty,
              rule_type,
              acuity_level,
              logic_expression,
              recommended_intervention,
              cpt_codes,
              icd10_codes,
              version
            FROM clinical_rules
            WHERE is_active = TRUE
            ORDER BY rule_code ASC
            `,
          );

          const rules: ClinicalRuleRecord[] = rulesRes.rows;
          const rulesVersionSnapshot = rules.reduce((max, r) => Math.max(max, r.version), 1);

          // 5. Evaluate all 54 JsonLogic rules
          const outcome = evaluateClinicalRules(
            { dob: session.dob, sex_at_birth: session.sex_at_birth },
            mergedAnswers,
            rules,
          );

          // 6. Persist triggered pathways (replace prior pending evaluation outputs for idempotent re-eval)
          await client.query(`DELETE FROM triggered_pathways WHERE session_id = $1`, [sessionId]);

          const persistedPathways = [];
          for (const pathway of outcome.triggered_pathways) {
            const insertRes = await client.query<{
              id: string;
              clinician_disposition: string;
            }>(
              `
              INSERT INTO triggered_pathways (
                session_id,
                patient_id,
                rule_code,
                calculated_score,
                acuity_level,
                recommended_intervention,
                cpt_codes,
                icd10_codes,
                clinician_disposition
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], 'PENDING')
              RETURNING id, clinician_disposition
              `,
              [
                sessionId,
                session.patient_id,
                pathway.rule_code,
                pathway.calculated_score,
                pathway.acuity_level,
                pathway.recommended_intervention,
                pathway.cpt_codes,
                pathway.icd10_codes,
              ],
            );

            persistedPathways.push({
              id: insertRes.rows[0]!.id,
              session_id: sessionId,
              patient_id: session.patient_id,
              rule_code: pathway.rule_code,
              display_name: pathway.display_name,
              specialty: pathway.specialty,
              rule_type: pathway.rule_type,
              calculated_score: pathway.calculated_score,
              acuity_level: pathway.acuity_level,
              recommended_intervention: pathway.recommended_intervention,
              cpt_codes: pathway.cpt_codes,
              icd10_codes: pathway.icd10_codes,
              clinician_disposition: insertRes.rows[0]!.clinician_disposition,
            });
          }

          // 7. Create or update provider workqueue item if any pathway triggered
          let workqueueItemId: string | null = null;
          if (outcome.workqueue_priority) {
            const existingWq = await client.query<{ id: string }>(
              `SELECT id FROM workqueue_items WHERE session_id = $1 LIMIT 1`,
              [sessionId],
            );

            if (existingWq.rowCount && existingWq.rowCount > 0) {
              workqueueItemId = existingWq.rows[0]!.id;
              await client.query(
                `
                UPDATE workqueue_items
                SET priority = $1, updated_at = NOW()
                WHERE id = $2
                `,
                [outcome.workqueue_priority, workqueueItemId],
              );
            } else {
              const wqInsert = await client.query<{ id: string }>(
                `
                INSERT INTO workqueue_items (patient_id, session_id, priority, status)
                VALUES ($1, $2, $3, 'NEW')
                RETURNING id
                `,
                [session.patient_id, sessionId, outcome.workqueue_priority],
              );
              workqueueItemId = wqInsert.rows[0]!.id;
            }
          }

          // 8. Update assessment session snapshot & status
          await client.query(
            `
            UPDATE assessment_sessions
            SET status = 'SUBMITTED',
                rules_version_snapshot = $1,
                completed_at = NOW()
            WHERE id = $2
            `,
            [rulesVersionSnapshot, sessionId],
          );

          // 9. Write immutable HIPAA audit log (zero PHI in metadata)
          await writeAuditLog(client, {
            actor_id: payload.actor_id,
            actor_role: payload.actor_role,
            action: "EVALUATE_SESSION",
            resource_type: "assessment_session",
            resource_id: sessionId,
            ip_address: extractClientIp(req),
            metadata: {
              patient_id: session.patient_id,
              rules_version_snapshot: rulesVersionSnapshot,
              evaluated_rule_count: outcome.evaluated_rule_count,
              triggered_count: persistedPathways.length,
              highest_acuity: outcome.highest_acuity,
              workqueue_priority: outcome.workqueue_priority,
            },
          });

          await client.query("COMMIT");

          logger.info("Evaluated assessment session", {
            session_id: sessionId,
            evaluated_rule_count: outcome.evaluated_rule_count,
            triggered_count: persistedPathways.length,
            highest_acuity: outcome.highest_acuity,
            workqueue_priority: outcome.workqueue_priority,
          });

          res.json({
            session_id: sessionId,
            patient_id: session.patient_id,
            rules_version_snapshot: rulesVersionSnapshot,
            evaluated_rule_count: outcome.evaluated_rule_count,
            triggered_count: persistedPathways.length,
            highest_acuity: outcome.highest_acuity,
            workqueue_priority: outcome.workqueue_priority,
            workqueue_item_id: workqueueItemId,
            derived_metrics: outcome.derived_metrics,
            triggered_pathways: persistedPathways,
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

  // Mount Component 3 & 4 Patient Portal & Magic-Link APIs
  app.use("/api/v1", createPatientAndMagicLinkRouter(pool, logger));

  // Mount Component 5 Provider Workqueue & Order Approval API (/api/v1/workqueue)
  app.use("/api/v1/workqueue", createWorkqueueRouter(pool, logger));

  // Mount RBAC-protected Admin Portal CRUD, Analytics & PDF API (/api/v1/admin/*)
  app.use("/api/v1/admin", createAdminRouter(pool, logger));

  // HIPAA-safe error handler (never echoes PHI or raw SQL details)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const pgCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : undefined;

    if (pgCode === "23503") {
      res.status(400).json({ error: "Referenced question_key or foreign record does not exist" });
      return;
    }
    if (pgCode === "23505") {
      res.status(409).json({ error: "A record with that unique key already exists" });
      return;
    }

    logger.error("Unhandled request error", {
      error_name: err instanceof Error ? err.name : "UnknownError",
      pg_code: pgCode ?? null,
    });
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
