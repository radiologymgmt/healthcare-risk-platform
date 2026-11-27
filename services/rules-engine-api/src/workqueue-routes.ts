import crypto from "node:crypto";
import { Router, type NextFunction, type Response } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { type HipaaLogger } from "@healthcare/shared-contracts";
import { writeAuditLog } from "./audit.js";
import { requireRole, type AuthenticatedRequest } from "./rbac.js";

const UuidSchema = z.string().uuid();

const ApproveOrderSchema = z.object({
  pathway_ids: z.array(z.string().uuid()).optional(),
  disposition: z.enum(["APPROVED", "ORDERED", "DECLINED"]).default("ORDERED"),
  order_format: z.enum(["FHIR_SERVICE_REQUEST", "HL7_ORM"]).default("FHIR_SERVICE_REQUEST"),
  notes: z.string().max(1000).optional(),
});

function extractIp(req: AuthenticatedRequest): string | null {
  const raw = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!raw) return null;
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function buildInlineOrderPayload(params: {
  format: "FHIR_SERVICE_REQUEST" | "HL7_ORM";
  orderId: string;
  patientId: string;
  mrn: string | null;
  fhirPatientId: string | null;
  firstName: string;
  lastName: string;
  dob: string;
  sexAtBirth: string;
  providerId: string;
  cptCodes: string[];
  icd10Codes: string[];
  intervention: string;
  priority: "stat" | "urgent" | "routine";
}): unknown {
  if (params.format === "HL7_ORM") {
    const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const hl7Dob = params.dob.replace(/-/g, "");
    const sexChar = params.sexAtBirth === "Female" ? "F" : params.sexAtBirth === "Male" ? "M" : "U";
    return [
      `MSH|^~\\&|HEALTHCARE_RISK_PLATFORM|PROVIDER_DASHBOARD|EHR_ORDERS|HOSPITAL|${ts}||ORM^O01|${params.orderId}|P|2.5.1`,
      `PID|1||${params.mrn ?? params.patientId}^^^MRN||${params.lastName}^${params.firstName}||${hl7Dob}|${sexChar}`,
      `ORC|NW|${params.orderId}|||||||${ts}|||${params.providerId}`,
      `OBR|1|${params.orderId}||${params.cptCodes[0] ?? "99214"}^${params.intervention}^CPT|||${ts}|||||||||${params.providerId}`,
      `DG1|1|I10|${params.icd10Codes[0] ?? "Z13.9"}^^^ICD10|||F`,
    ].join("\r");
  }

  return {
    resourceType: "ServiceRequest",
    id: params.orderId,
    status: "active",
    intent: "order",
    priority: params.priority,
    code: {
      coding: params.cptCodes.map((code) => ({
        system: "http://www.ama-assn.org/go/cpt",
        code,
        display: params.intervention,
      })),
      text: params.intervention,
    },
    subject: { reference: `Patient/${params.fhirPatientId ?? params.patientId}` },
    requester: { reference: `Practitioner/${params.providerId}` },
    reasonCode: params.icd10Codes.map((code) => ({
      coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code }],
    })),
    authoredOn: new Date().toISOString(),
  };
}

export function createWorkqueueRouter(pool: Pool, logger: HipaaLogger): Router {
  const router = Router();

  // Component 5 Provider Dashboard requires PROVIDER or ADMIN role
  router.use(requireRole(["PROVIDER", "ADMIN"], pool, logger));

  /**
   * GET /api/v1/workqueue (Section 5 — Comp 5)
   * Returns priority-sorted queue (STAT acute triage first, then HIGH, then STANDARD)
   * with linked triggered pathways, AI-parsed response excerpts, and clinical document URIs.
   */
  router.get("/", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const priorityFilter = typeof req.query.priority === "string" ? req.query.priority.trim().toUpperCase() : "";
      const statusFilter = typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : "";

      const wqRes = await pool.query(
        `
        SELECT
          w.id,
          w.patient_id,
          w.session_id,
          w.assigned_provider_id,
          w.priority,
          w.status,
          w.notes,
          w.created_at,
          w.updated_at,
          p.mrn,
          p.fhir_patient_id,
          p.first_name,
          p.last_name,
          p.dob,
          p.sex_at_birth,
          p.insurance_status,
          s.channel AS session_channel,
          s.rules_version_snapshot
        FROM workqueue_items w
        INNER JOIN patients p ON p.id = w.patient_id
        INNER JOIN assessment_sessions s ON s.id = w.session_id
        WHERE ($1 = '' OR w.priority = $1)
          AND ($2 = '' OR w.status = $2)
        ORDER BY
          CASE w.priority
            WHEN 'STAT' THEN 1
            WHEN 'HIGH' THEN 2
            ELSE 3
          END ASC,
          w.created_at DESC
        LIMIT 100
        `,
        [priorityFilter, statusFilter],
      );

      const sessionIds = wqRes.rows.map((r) => r.session_id as string);
      const patientIds = Array.from(new Set(wqRes.rows.map((r) => r.patient_id as string)));

      const [pathwaysRes, responsesRes, docsRes] =
        sessionIds.length > 0
          ? await Promise.all([
              pool.query(
                `
                SELECT
                  tp.id,
                  tp.session_id,
                  tp.rule_code,
                  cr.display_name,
                  cr.specialty,
                  cr.prior_auth_rationale_template,
                  tp.calculated_score,
                  tp.acuity_level,
                  tp.recommended_intervention,
                  tp.cpt_codes,
                  tp.icd10_codes,
                  tp.clinician_disposition,
                  tp.created_at
                FROM triggered_pathways tp
                INNER JOIN clinical_rules cr ON cr.rule_code = tp.rule_code
                WHERE tp.session_id = ANY($1::uuid[])
                ORDER BY
                  CASE tp.acuity_level
                    WHEN 'ACUTE_RED_FLAG' THEN 1
                    WHEN 'HIGH_RISK' THEN 2
                    WHEN 'MODERATE_RISK' THEN 3
                    ELSE 4
                  END ASC,
                  tp.rule_code ASC
                `,
                [sessionIds],
              ),
              pool.query(
                `
                SELECT
                  ar.id,
                  ar.session_id,
                  ar.patient_id,
                  ar.question_key,
                  q.domain,
                  q.label_plain_english,
                  ar.answer_value,
                  ar.provenance,
                  ar.confidence_score,
                  ar.source_document_id,
                  ar.source_excerpt,
                  ar.updated_at
                FROM assessment_responses ar
                INNER JOIN questions q ON q.question_key = ar.question_key
                WHERE ar.session_id = ANY($1::uuid[])
                   OR (ar.patient_id = ANY($2::uuid[]) AND ar.provenance IN ('AI_PARSED', 'EHR_LAB_IMPORT'))
                ORDER BY q.sort_order ASC
                `,
                [sessionIds, patientIds],
              ),
              pool.query(
                `
                SELECT
                  id,
                  patient_id,
                  source_type,
                  document_category,
                  gcs_uri,
                  extracted_text,
                  parsed_status,
                  document_date,
                  created_at
                FROM clinical_documents
                WHERE patient_id = ANY($1::uuid[])
                ORDER BY created_at DESC
                `,
                [patientIds],
              ),
            ])
          : [{ rows: [] }, { rows: [] }, { rows: [] }];

      const items = wqRes.rows.map((row) => {
        const dobStr =
          row.dob instanceof Date ? row.dob.toISOString().slice(0, 10) : String(row.dob).slice(0, 10);
        const pathways = pathwaysRes.rows
          .filter((p) => p.session_id === row.session_id)
          .map((p) => ({
            ...p,
            calculated_score: p.calculated_score !== null ? Number(p.calculated_score) : null,
          }));
        const responses = responsesRes.rows
          .filter((r) => r.session_id === row.session_id || r.patient_id === row.patient_id)
          .map((r) => ({
            ...r,
            confidence_score: r.confidence_score !== null ? Number(r.confidence_score) : null,
          }));
        const documents = docsRes.rows.filter((d) => d.patient_id === row.patient_id);

        return {
          id: row.id,
          patient_id: row.patient_id,
          session_id: row.session_id,
          assigned_provider_id: row.assigned_provider_id,
          priority: row.priority,
          status: row.status,
          notes: row.notes,
          session_channel: row.session_channel,
          rules_version_snapshot: row.rules_version_snapshot,
          created_at: row.created_at,
          updated_at: row.updated_at,
          patient: {
            id: row.patient_id,
            mrn: row.mrn,
            first_name: row.first_name,
            last_name: row.last_name,
            dob: dobStr,
            sex_at_birth: row.sex_at_birth,
            insurance_status: row.insurance_status ?? {},
          },
          triggered_pathways: pathways,
          responses,
          documents,
        };
      });

      await writeAuditLog(pool, {
        actor_id: req.actor!.actor_id,
        actor_role: req.actor!.actor_role,
        action: "VIEW_WORKQUEUE",
        resource_type: "workqueue",
        ip_address: extractIp(req),
        metadata: { returned_count: items.length, priority_filter: priorityFilter || "ALL" },
      });

      res.json({ total: items.length, items });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/v1/workqueue/:id/order (Section 5 — Comp 5 → Comp 6)
   * Approves CPT/ICD-10 orders for selected (or all pending) pathways and dispatches
   * outbound FHIR ServiceRequest or HL7 ORM^O01 message.
   */
  router.post("/:id/order", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const idCheck = UuidSchema.safeParse(req.params.id);
      if (!idCheck.success) {
        res.status(400).json({ error: "Invalid workqueue item UUID" });
        return;
      }
      const parsed = ApproveOrderSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid order approval payload", details: parsed.error.flatten() });
        return;
      }
      const d = parsed.data;
      const providerId = req.actor!.actor_id;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const wqRes = await client.query<{
          id: string;
          patient_id: string;
          session_id: string;
          priority: string;
          mrn: string | null;
          fhir_patient_id: string | null;
          first_name: string;
          last_name: string;
          dob: Date | string;
          sex_at_birth: string | null;
        }>(
          `
          SELECT
            w.id, w.patient_id, w.session_id, w.priority,
            p.mrn, p.fhir_patient_id, p.first_name, p.last_name, p.dob, p.sex_at_birth
          FROM workqueue_items w
          INNER JOIN patients p ON p.id = w.patient_id
          WHERE w.id = $1
          FOR UPDATE OF w
          `,
          [idCheck.data],
        );

        if (wqRes.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Workqueue item not found" });
          return;
        }
        const wq = wqRes.rows[0]!;
        const dobStr =
          wq.dob instanceof Date ? wq.dob.toISOString().slice(0, 10) : String(wq.dob).slice(0, 10);

        const targetPathways =
          d.pathway_ids && d.pathway_ids.length > 0
            ? await client.query<{
                id: string;
                rule_code: string;
                recommended_intervention: string;
                cpt_codes: string[];
                icd10_codes: string[];
                acuity_level: string;
              }>(
                `
                UPDATE triggered_pathways
                SET clinician_disposition = $1
                WHERE session_id = $2 AND id = ANY($3::uuid[])
                RETURNING id, rule_code, recommended_intervention, cpt_codes, icd10_codes, acuity_level
                `,
                [d.disposition, wq.session_id, d.pathway_ids],
              )
            : await client.query<{
                id: string;
                rule_code: string;
                recommended_intervention: string;
                cpt_codes: string[];
                icd10_codes: string[];
                acuity_level: string;
              }>(
                `
                UPDATE triggered_pathways
                SET clinician_disposition = $1
                WHERE session_id = $2 AND clinician_disposition = 'PENDING'
                RETURNING id, rule_code, recommended_intervention, cpt_codes, icd10_codes, acuity_level
                `,
                [d.disposition, wq.session_id],
              );

        // Determine updated workqueue status
        const remainingPending = await client.query<{ cnt: string }>(
          `SELECT COUNT(*) AS cnt FROM triggered_pathways WHERE session_id = $1 AND clinician_disposition = 'PENDING'`,
          [wq.session_id],
        );
        const nextStatus =
          Number(remainingPending.rows[0]!.cnt) === 0
            ? "COMPLETED"
            : d.disposition === "ORDERED"
              ? "PENDING_PRIOR_AUTH"
              : "IN_REVIEW";

        await client.query(
          `
          UPDATE workqueue_items
          SET assigned_provider_id = $1,
              status = $2,
              notes = COALESCE($3, notes),
              updated_at = NOW()
          WHERE id = $4
          `,
          [providerId, nextStatus, d.notes ?? null, wq.id],
        );

        if (nextStatus === "COMPLETED") {
          await client.query(`UPDATE assessment_sessions SET status = 'REVIEWED' WHERE id = $1`, [
            wq.session_id,
          ]);
        }

        // Dispatch outbound FHIR ServiceRequest or HL7 ORM^O01 for each approved/ordered pathway
        const dispatchedOrders: Array<{
          order_id: string;
          rule_code: string;
          format: string;
          dispatched_via: "INTEROP_SERVICE" | "LOCAL_SERIALIZER";
          payload: unknown;
        }> = [];

        const interopBase = process.env.INTEROP_WORKER_URL?.replace(/\/$/, "");
        if (d.disposition === "ORDERED" || d.disposition === "APPROVED") {
          for (const p of targetPathways.rows) {
            const orderId = `ORD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
            const orderPriority =
              p.acuity_level === "ACUTE_RED_FLAG"
                ? "stat"
                : p.acuity_level === "HIGH_RISK"
                  ? "urgent"
                  : "routine";

            let dispatchedVia: "INTEROP_SERVICE" | "LOCAL_SERIALIZER" = "LOCAL_SERIALIZER";
            let payload: unknown = null;

            if (interopBase) {
              try {
                const resp = await fetch(`${interopBase}/api/v1/interop/dispatch-order`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    format: d.order_format,
                    order_id: orderId,
                    patient_id: wq.patient_id,
                    provider_id: providerId,
                    cpt_codes: p.cpt_codes,
                    icd10_codes: p.icd10_codes,
                    intervention: p.recommended_intervention,
                    priority: orderPriority,
                  }),
                });
                if (resp.ok) {
                  const json = (await resp.json()) as { payload?: unknown };
                  payload = json.payload;
                  dispatchedVia = "INTEROP_SERVICE";
                }
              } catch {
                // Fall back to deterministic local serializer if interop worker is offline
              }
            }

            if (!payload) {
              payload = buildInlineOrderPayload({
                format: d.order_format,
                orderId,
                patientId: wq.patient_id,
                mrn: wq.mrn,
                fhirPatientId: wq.fhir_patient_id,
                firstName: wq.first_name,
                lastName: wq.last_name,
                dob: dobStr,
                sexAtBirth: wq.sex_at_birth ?? "Unknown",
                providerId,
                cptCodes: p.cpt_codes,
                icd10Codes: p.icd10_codes,
                intervention: p.recommended_intervention,
                priority: orderPriority,
              });
            }

            dispatchedOrders.push({
              order_id: orderId,
              rule_code: p.rule_code,
              format: d.order_format,
              dispatched_via: dispatchedVia,
              payload,
            });
          }
        }

        await writeAuditLog(client, {
          actor_id: providerId,
          actor_role: req.actor!.actor_role,
          action: "APPROVE_ORDER",
          resource_type: "workqueue_item",
          resource_id: wq.id,
          ip_address: extractIp(req),
          metadata: {
            patient_id: wq.patient_id,
            disposition: d.disposition,
            updated_pathway_count: targetPathways.rowCount,
            order_format: d.order_format,
            workqueue_status: nextStatus,
          },
        });

        await client.query("COMMIT");
        logger.info("Provider processed workqueue order approval", {
          workqueue_item_id: wq.id,
          disposition: d.disposition,
          orders_dispatched: dispatchedOrders.length,
        });

        res.json({
          workqueue_item_id: wq.id,
          status: nextStatus,
          disposition: d.disposition,
          updated_pathway_count: targetPathways.rowCount,
          dispatched_orders: dispatchedOrders,
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

  // Non-production synthetic demo seeder so Provider Dashboard & Analytics showcase realistic triage data
  router.post("/demo-seed", async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === "production") {
      res.status(403).json({ error: "Demo seed disabled in production" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();

      // Case 1: STAT Acute Red Flag (SNNOOP10 + USPSTF Lung)
      const p1 = await client.query<{ id: string }>(
        `INSERT INTO patients (mrn, first_name, last_name, dob, sex_at_birth, zip_code, insurance_status)
         VALUES ($1, 'Synthetic', 'AcuteCase', '1960-04-12', 'Male', '94107', '{"eligible":true,"coverage_status":"ACTIVE","plan_name":"PPO Gold (Synthetic)"}'::jsonb)
         RETURNING id`,
        [`SYN-WQ-STAT-${suffix}`],
      );
      const d1 = await client.query<{ id: string }>(
        `INSERT INTO clinical_documents (patient_id, source_type, document_category, gcs_uri, extracted_text, parsed_status)
         VALUES ($1, 'FOLDER_PDF', 'VISIT_NOTE', 'gs://synthetic-clinic/triage-note.pdf',
                 'SYNTHETIC TRIAGE NOTE: Patient reports sudden thunderclap headache onset 2 hours ago. Current smoker with 32 pack-year history and COPD.', 'PARSED')
         RETURNING id`,
        [p1.rows[0]!.id],
      );
      const s1 = await client.query<{ id: string }>(
        `INSERT INTO assessment_sessions (patient_id, channel, status) VALUES ($1, 'WEB_PORTAL', 'SUBMITTED') RETURNING id`,
        [p1.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO assessment_responses (session_id, patient_id, question_key, answer_value, provenance, confidence_score, source_document_id, source_excerpt)
         VALUES
           ($1, $2, 'has_thunderclap_headache', 'true'::jsonb, 'PATIENT_ENTERED', 1.0, $3, 'Patient reports sudden thunderclap headache onset 2 hours ago.'),
           ($1, $2, 'smoking_status', '"current"'::jsonb, 'AI_PARSED', 0.96, $3, 'Current smoker with 32 pack-year history and COPD.'),
           ($1, $2, 'pack_years', '32'::jsonb, 'AI_PARSED', 0.95, $3, 'Current smoker with 32 pack-year history and COPD.')`,
        [s1.rows[0]!.id, p1.rows[0]!.id, d1.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO triggered_pathways (session_id, patient_id, rule_code, calculated_score, acuity_level, recommended_intervention, cpt_codes, icd10_codes)
         VALUES
           ($1, $2, 'SNNOOP10', NULL, 'ACUTE_RED_FLAG', 'STAT Urgent Neuroimaging (CT Head Non-Contrast / MRI Brain) & Acute Neurology Triage', ARRAY['70450','70553'], ARRAY['R51.9','G44.53']),
           ($1, $2, 'USPSTF_LUNG', NULL, 'HIGH_RISK', 'Low-Dose CT Thorax (LDCT)', ARRAY['71271'], ARRAY['Z87.891'])`,
        [s1.rows[0]!.id, p1.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO workqueue_items (patient_id, session_id, priority, status) VALUES ($1, $2, 'STAT', 'NEW')`,
        [p1.rows[0]!.id, s1.rows[0]!.id],
      );

      // Case 2: HIGH Risk Oncology & Hepatology EHR Labs
      const p2 = await client.query<{ id: string }>(
        `INSERT INTO patients (mrn, first_name, last_name, dob, sex_at_birth, zip_code, insurance_status)
         VALUES ($1, 'Synthetic', 'HighRiskOnc', '1978-08-22', 'Female', '94107', '{"eligible":true,"coverage_status":"ACTIVE","plan_name":"Commercial HMO (Synthetic)"}'::jsonb)
         RETURNING id`,
        [`SYN-WQ-HIGH-${suffix}`],
      );
      const d2 = await client.query<{ id: string }>(
        `INSERT INTO clinical_documents (patient_id, source_type, document_category, gcs_uri, extracted_text, parsed_status)
         VALUES ($1, 'HL7_ORU', 'LAB', 'gs://synthetic-clinic/onc-lab-panel.pdf',
                 'SYNTHETIC PATHOLOGY & LAB REPORT: Breast biopsy positive for atypical ductal hyperplasia (ADH). Mammogram BI-RADS density D. AST 94 U/L, ALT 51 U/L, Platelets 112 K/uL.', 'PARSED')
         RETURNING id`,
        [p2.rows[0]!.id],
      );
      const s2 = await client.query<{ id: string }>(
        `INSERT INTO assessment_sessions (patient_id, channel, status) VALUES ($1, 'MOBILE_MAGIC_LINK', 'SUBMITTED') RETURNING id`,
        [p2.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO assessment_responses (session_id, patient_id, question_key, answer_value, provenance, confidence_score, source_document_id, source_excerpt)
         VALUES
           ($1, $2, 'has_atypical_hyperplasia_or_lcis', 'true'::jsonb, 'PATIENT_CONFIRMED_AI', 0.95, $3, 'Breast biopsy positive for atypical ductal hyperplasia (ADH).'),
           ($1, $2, 'breast_density_birads', '"D"'::jsonb, 'AI_PARSED', 0.97, $3, 'Mammogram BI-RADS density D.'),
           ($1, $2, 'lab_ast_u_l', '94'::jsonb, 'EHR_LAB_IMPORT', 1.0, $3, 'AST 94 U/L, ALT 51 U/L, Platelets 112 K/uL.')`,
        [s2.rows[0]!.id, p2.rows[0]!.id, d2.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO triggered_pathways (session_id, patient_id, rule_code, calculated_score, acuity_level, recommended_intervention, cpt_codes, icd10_codes)
         VALUES
           ($1, $2, 'TYRER_CUZICK', 31.0, 'HIGH_RISK', 'Annual High-Risk Breast MRI with & without contrast + Mammogram + Genetic Counseling', ARRAY['77049','96040'], ARRAY['Z15.01','Z80.3']),
           ($1, $2, 'FIB4', 5.56, 'HIGH_RISK', 'Vibration-Controlled Transient Elastography (FibroScan) & Hepatology Referral', ARRAY['91200','99244'], ARRAY['K76.0','K74.00'])`,
        [s2.rows[0]!.id, p2.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO workqueue_items (patient_id, session_id, priority, status) VALUES ($1, $2, 'HIGH', 'NEW')`,
        [p2.rows[0]!.id, s2.rows[0]!.id],
      );

      await client.query("COMMIT");
      res.status(201).json({ seeded: 2, session_ids: [s1.rows[0]!.id, s2.rows[0]!.id] });
    } catch (err) {
      await client.query("ROLLBACK");
      next(err);
    } finally {
      client.release();
    }
  });

  return router;
}
