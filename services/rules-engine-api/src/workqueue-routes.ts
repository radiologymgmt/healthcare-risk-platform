import crypto from "node:crypto";
import { Router, type NextFunction, type Response } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import {
  getCloudRunAuthHeaders,
  normalizeWorkqueuePriority,
  normalizeWorkqueueStatus,
  WorkqueueStatusSchema,
  type HipaaLogger,
} from "@healthcare/shared-contracts";
import { writeAuditLog } from "./audit.js";
import { requireRole, type AuthenticatedRequest } from "./rbac.js";
import { isDemoModeEnabled } from "./demo-mode.js";
import { registerWorkqueueClinicalRoutes } from "./workqueue-clinical-routes.js";

const UuidSchema = z.string().uuid();

const ApproveOrderSchema = z.object({
  pathway_ids: z.array(z.string().uuid()).optional(),
  disposition: z.enum(["APPROVED", "ORDERED", "DECLINED"]).default("ORDERED"),
  order_format: z.enum(["FHIR_SERVICE_REQUEST", "HL7_ORM"]).default("FHIR_SERVICE_REQUEST"),
  notes: z.string().max(1000).optional(),
});

const UpdateStatusSchema = z.object({
  status: WorkqueueStatusSchema,
  notes: z.string().max(1000).optional(),
});

const ScheduleVisitSchema = z.object({
  scheduled_start: z.string().datetime(),
  scheduled_end: z.string().datetime(),
  visit_type: z.string().min(2).max(80).default("IMAGING_RISK_CONSULT"),
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
   * GET /api/v1/workqueue (Component 5)
   * Returns priority-sorted queue (HIGH first, then STANDARD) with workflow statuses
   * (CONTACT_PENDING, APPOINTMENT_SCHEDULED, EXAMS_ORDERED, PATIENT_COMPLETED),
   * triggered pathways, AI-parsed response excerpts, clinical documents, and appointments.
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
          p.phone,
          p.email,
          p.insurance_status,
          s.channel AS session_channel,
          s.rules_version_snapshot
        FROM workqueue_items w
        INNER JOIN patients p ON p.id = w.patient_id
        INNER JOIN assessment_sessions s ON s.id = w.session_id
        ORDER BY
          CASE WHEN w.priority IN ('STAT', 'HIGH') THEN 1 ELSE 2 END ASC,
          w.created_at DESC
        LIMIT 100
        `,
      );

      const filteredRows = wqRes.rows.filter((row) => {
        const normP = normalizeWorkqueuePriority(row.priority as string);
        const normS = normalizeWorkqueueStatus(row.status as string);
        if (priorityFilter && normP !== normalizeWorkqueuePriority(priorityFilter)) return false;
        if (statusFilter && normS !== normalizeWorkqueueStatus(statusFilter)) return false;
        return true;
      });

      const sessionIds = filteredRows.map((r) => r.session_id as string);
      const patientIds = Array.from(new Set(filteredRows.map((r) => r.patient_id as string)));

      const [pathwaysRes, responsesRes, docsRes, apptsRes] =
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
                  q.input_type,
                  q.options_json,
                  ar.answer_value,
                  ar.original_answer_value,
                  ar.provenance,
                  ar.confidence_score,
                  ar.source_document_id,
                  ar.source_excerpt,
                  ar.corrected_by,
                  ar.correction_reason,
                  ar.corrected_at,
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
              pool.query(
                `
                SELECT
                  id,
                  patient_id,
                  workqueue_item_id,
                  scheduled_start,
                  scheduled_end,
                  visit_type,
                  status,
                  created_at
                FROM appointments
                WHERE patient_id = ANY($1::uuid[])
                ORDER BY scheduled_start ASC
                `,
                [patientIds],
              ),
            ])
          : [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }];

      const items = filteredRows.map((row) => {
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
        const appointments = apptsRes.rows.filter((a) => a.patient_id === row.patient_id);

        return {
          id: row.id,
          patient_id: row.patient_id,
          session_id: row.session_id,
          assigned_provider_id: row.assigned_provider_id,
          priority: normalizeWorkqueuePriority(row.priority as string),
          status: normalizeWorkqueueStatus(row.status as string),
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
            phone: row.phone,
            email: row.email,
            insurance_status: row.insurance_status ?? {},
          },
          triggered_pathways: pathways,
          responses,
          documents,
          appointments,
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
   * GET /api/v1/workqueue/appointments
   * Returns all scheduled patient visits for the Provider Calendar & Visits view.
   */
  router.get("/appointments", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const appts = await pool.query(
        `
        SELECT
          a.id,
          a.patient_id,
          a.workqueue_item_id,
          a.scheduled_start,
          a.scheduled_end,
          a.visit_type,
          a.status,
          a.created_at,
          p.first_name,
          p.last_name,
          p.mrn,
          p.dob,
          w.priority AS workqueue_priority,
          w.status AS workqueue_status
        FROM appointments a
        INNER JOIN patients p ON p.id = a.patient_id
        LEFT JOIN workqueue_items w ON w.id = a.workqueue_item_id
        ORDER BY a.scheduled_start ASC
        LIMIT 200
        `,
      );

      const appointments = appts.rows.map((r) => ({
        id: r.id,
        patient_id: r.patient_id,
        workqueue_item_id: r.workqueue_item_id,
        scheduled_start: r.scheduled_start,
        scheduled_end: r.scheduled_end,
        visit_type: r.visit_type,
        status: r.status,
        patient_name: `${r.first_name} ${r.last_name}`,
        mrn: r.mrn,
        dob: r.dob instanceof Date ? r.dob.toISOString().slice(0, 10) : String(r.dob).slice(0, 10),
        priority: normalizeWorkqueuePriority(r.workqueue_priority as string | null),
        workqueue_status: normalizeWorkqueueStatus(r.workqueue_status as string | null),
      }));

      await writeAuditLog(pool, {
        actor_id: req.actor!.actor_id,
        actor_role: req.actor!.actor_role,
        action: "VIEW_CALENDAR",
        resource_type: "appointments",
        ip_address: extractIp(req),
        metadata: { count: appointments.length },
      });

      res.json({ appointments });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /api/v1/workqueue/:id/status
   * Updates workqueue status (CONTACT_PENDING | APPOINTMENT_SCHEDULED | EXAMS_ORDERED | PATIENT_COMPLETED).
   */
  router.patch("/:id/status", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const idCheck = UuidSchema.safeParse(req.params.id);
      if (!idCheck.success) {
        res.status(400).json({ error: "Invalid workqueue_item_id UUID" });
        return;
      }
      const parsed = UpdateStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid status payload", details: parsed.error.flatten() });
        return;
      }
      const d = parsed.data;
      const updated = await pool.query(
        `
        UPDATE workqueue_items
        SET status = $1,
            assigned_provider_id = COALESCE(assigned_provider_id, $2),
            notes = COALESCE($3, notes),
            updated_at = NOW()
        WHERE id = $4
        RETURNING id, patient_id, session_id, priority, status, notes, updated_at
        `,
        [d.status, req.actor!.actor_id, d.notes ?? null, idCheck.data],
      );
      if (!updated.rowCount) {
        res.status(404).json({ error: "Workqueue item not found" });
        return;
      }
      const row = updated.rows[0]!;
      if (d.status === "PATIENT_COMPLETED") {
        await pool.query(`UPDATE assessment_sessions SET status = 'REVIEWED' WHERE id = $1`, [
          row.session_id,
        ]);
      }

      await writeAuditLog(pool, {
        actor_id: req.actor!.actor_id,
        actor_role: req.actor!.actor_role,
        action: "UPDATE_WORKQUEUE_STATUS",
        resource_type: "workqueue_item",
        resource_id: row.id,
        ip_address: extractIp(req),
        metadata: { status: d.status },
      });

      res.json({
        workqueue_item: {
          ...row,
          priority: normalizeWorkqueuePriority(row.priority as string),
          status: normalizeWorkqueueStatus(row.status as string),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/v1/workqueue/:id/schedule
   * Schedules a patient visit from the Provider Workqueue and transitions status -> APPOINTMENT_SCHEDULED.
   */
  router.post("/:id/schedule", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const idCheck = UuidSchema.safeParse(req.params.id);
      if (!idCheck.success) {
        res.status(400).json({ error: "Invalid workqueue_item_id UUID" });
        return;
      }
      const parsed = ScheduleVisitSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid visit payload", details: parsed.error.flatten() });
        return;
      }
      const wq = await pool.query<{ id: string; patient_id: string }>(
        `SELECT id, patient_id FROM workqueue_items WHERE id = $1`,
        [idCheck.data],
      );
      if (!wq.rowCount) {
        res.status(404).json({ error: "Workqueue item not found" });
        return;
      }
      const d = parsed.data;
      const inserted = await pool.query(
        `
        INSERT INTO appointments (patient_id, workqueue_item_id, scheduled_start, scheduled_end, visit_type, status)
        VALUES ($1, $2, $3, $4, $5, 'BOOKED')
        RETURNING id, patient_id, workqueue_item_id, scheduled_start, scheduled_end, visit_type, status
        `,
        [wq.rows[0]!.patient_id, wq.rows[0]!.id, d.scheduled_start, d.scheduled_end, d.visit_type],
      );
      await pool.query(
        `UPDATE workqueue_items SET status = 'APPOINTMENT_SCHEDULED', updated_at = NOW() WHERE id = $1`,
        [wq.rows[0]!.id],
      );

      await writeAuditLog(pool, {
        actor_id: req.actor!.actor_id,
        actor_role: req.actor!.actor_role,
        action: "SCHEDULE_VISIT",
        resource_type: "appointment",
        resource_id: inserted.rows[0]!.id,
        ip_address: extractIp(req),
        metadata: { workqueue_item_id: wq.rows[0]!.id, visit_type: d.visit_type },
      });

      res.status(201).json({ appointment: inserted.rows[0]! });
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
          d.disposition === "ORDERED" || d.disposition === "APPROVED"
            ? "EXAMS_ORDERED"
            : Number(remainingPending.rows[0]!.cnt) === 0
              ? "PATIENT_COMPLETED"
              : "CONTACT_PENDING";

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

        if (nextStatus === "PATIENT_COMPLETED" || nextStatus === "EXAMS_ORDERED") {
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
              p.acuity_level === "ACUTE_RED_FLAG" || p.acuity_level === "HIGH_RISK"
                ? "urgent"
                : "routine";

            let dispatchedVia: "INTEROP_SERVICE" | "LOCAL_SERIALIZER" = "LOCAL_SERIALIZER";
            let payload: unknown = null;

            if (interopBase) {
              try {
                const authHeaders = await getCloudRunAuthHeaders(interopBase);
                const resp = await fetch(`${interopBase}/api/v1/interop/dispatch-order`, {
                  method: "POST",
                  headers: { ...authHeaders, "content-type": "application/json" },
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

  // Synthetic demo seeder for Provider Workqueue & Visits Calendar (HIGH & STANDARD priorities across all 4 workflow statuses)
  router.post("/demo-seed", async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!isDemoModeEnabled()) {
      res.status(403).json({ error: "Demo seed disabled in production" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
      const now = new Date();
      const addDaysAt = (days: number, hourUtc: number) => {
        const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        d.setUTCHours(hourUtc, 0, 0, 0);
        return d.toISOString();
      };

      // Case 1: HIGH Priority — Contact Pending
      const p1 = await client.query<{ id: string }>(
        `INSERT INTO patients (mrn, first_name, last_name, dob, sex_at_birth, zip_code, phone, email, insurance_status)
         VALUES ($1, 'Robert', 'Caldwell', '1960-04-12', 'Male', '94107', '(555) 201-4410', 'r.caldwell.synthetic@example.org', '{"eligible":true,"coverage_status":"ACTIVE","plan_name":"PPO Gold (Synthetic)"}'::jsonb)
         RETURNING id`,
        [`SYN-HIGH-${suffix}A`],
      );
      const d1 = await client.query<{ id: string }>(
        `INSERT INTO clinical_documents (patient_id, source_type, document_category, gcs_uri, extracted_text, parsed_status)
         VALUES ($1, 'FOLDER_PDF', 'VISIT_NOTE', 'gs://synthetic-clinic/triage-note.pdf',
                 'SYNTHETIC TRIAGE NOTE: Patient (5 ft 10 in, 198 lbs) reports severe sudden headache onset and 32 pack-year smoking history with mild COPD.', 'PARSED')
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
           ($1, $2, 'height_cm', '177.8'::jsonb, 'PATIENT_ENTERED', 1.0, $3, 'Patient height recorded at 5 ft 10 in.'),
           ($1, $2, 'weight_kg', '89.8'::jsonb, 'PATIENT_ENTERED', 1.0, $3, 'Patient weight recorded at 198 lbs.'),
           ($1, $2, 'has_thunderclap_headache', 'true'::jsonb, 'PATIENT_ENTERED', 1.0, $3, 'Patient reports severe sudden headache onset.'),
           ($1, $2, 'smoking_status', '"current"'::jsonb, 'AI_PARSED', 0.96, $3, '32 pack-year smoking history with mild COPD.'),
           ($1, $2, 'pack_years', '32'::jsonb, 'AI_PARSED', 0.95, $3, '32 pack-year smoking history with mild COPD.')`,
        [s1.rows[0]!.id, p1.rows[0]!.id, d1.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO triggered_pathways (session_id, patient_id, rule_code, calculated_score, acuity_level, recommended_intervention, cpt_codes, icd10_codes)
         VALUES
           ($1, $2, 'SNNOOP10', NULL, 'ACUTE_RED_FLAG', 'Priority Neuroimaging (CT Head Non-Contrast / MRI Brain) & Neurology Triage', ARRAY['70450','70553'], ARRAY['R51.9','G44.53']),
           ($1, $2, 'USPSTF_LUNG', NULL, 'HIGH_RISK', 'Low-Dose CT Thorax (LDCT)', ARRAY['71271'], ARRAY['Z87.891'])`,
        [s1.rows[0]!.id, p1.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO workqueue_items (patient_id, session_id, priority, status, notes)
         VALUES ($1, $2, 'HIGH', 'CONTACT_PENDING', 'Awaiting care coordinator outreach to schedule imaging consult.')`,
        [p1.rows[0]!.id, s1.rows[0]!.id],
      );

      // Case 2: HIGH Priority — Appointment Scheduled
      const p2 = await client.query<{ id: string }>(
        `INSERT INTO patients (mrn, first_name, last_name, dob, sex_at_birth, zip_code, phone, email, insurance_status)
         VALUES ($1, 'Elena', 'Vance', '1978-08-22', 'Female', '94107', '(555) 201-8824', 'e.vance.synthetic@example.org', '{"eligible":true,"coverage_status":"ACTIVE","plan_name":"Commercial HMO (Synthetic)"}'::jsonb)
         RETURNING id`,
        [`SYN-HIGH-${suffix}B`],
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
           ($1, $2, 'height_cm', '165.1'::jsonb, 'PATIENT_ENTERED', 1.0, $3, 'Height 5 ft 5 in.'),
           ($1, $2, 'weight_kg', '64.4'::jsonb, 'PATIENT_ENTERED', 1.0, $3, 'Weight 142 lbs.'),
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
      const w2 = await client.query<{ id: string }>(
        `INSERT INTO workqueue_items (patient_id, session_id, priority, status, notes)
         VALUES ($1, $2, 'HIGH', 'APPOINTMENT_SCHEDULED', 'Breast MRI consult booked; prior-auth documentation verified.') RETURNING id`,
        [p2.rows[0]!.id, s2.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO appointments (patient_id, workqueue_item_id, scheduled_start, scheduled_end, visit_type, status)
         VALUES ($1, $2, $3, $4, 'HIGH_RISK_BREAST_MRI_CONSULT', 'CONFIRMED')`,
        [p2.rows[0]!.id, w2.rows[0]!.id, addDaysAt(1, 16), addDaysAt(1, 17)],
      );

      // Case 3: STANDARD Priority — Exams Ordered
      const p3 = await client.query<{ id: string }>(
        `INSERT INTO patients (mrn, first_name, last_name, dob, sex_at_birth, zip_code, phone, email, insurance_status)
         VALUES ($1, 'David', 'Morales', '1969-11-05', 'Male', '94107', '(555) 201-6731', 'd.morales.synthetic@example.org', '{"eligible":true,"coverage_status":"ACTIVE","plan_name":"Blue Shield PPO (Synthetic)"}'::jsonb)
         RETURNING id`,
        [`SYN-STD-${suffix}C`],
      );
      const s3 = await client.query<{ id: string }>(
        `INSERT INTO assessment_sessions (patient_id, channel, status) VALUES ($1, 'WEB_PORTAL', 'REVIEWED') RETURNING id`,
        [p3.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO assessment_responses (session_id, patient_id, question_key, answer_value, provenance)
         VALUES
           ($1, $2, 'height_cm', '180.3'::jsonb, 'PATIENT_ENTERED'),
           ($1, $2, 'weight_kg', '88.5'::jsonb, 'PATIENT_ENTERED')`,
        [s3.rows[0]!.id, p3.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO triggered_pathways (session_id, patient_id, rule_code, calculated_score, acuity_level, recommended_intervention, cpt_codes, icd10_codes, clinician_disposition)
         VALUES
           ($1, $2, 'MESA_CAC', 11.4, 'MODERATE_RISK', 'Coronary Artery Calcium (CAC) CT Scan & Preventive Cardiology Review', ARRAY['75571'], ARRAY['Z13.6','E78.5'], 'ORDERED')`,
        [s3.rows[0]!.id, p3.rows[0]!.id],
      );
      const w3 = await client.query<{ id: string }>(
        `INSERT INTO workqueue_items (patient_id, session_id, priority, status, notes)
         VALUES ($1, $2, 'STANDARD', 'EXAMS_ORDERED', 'CAC CT (CPT 75571) ordered via FHIR ServiceRequest; imaging center scheduled.') RETURNING id`,
        [p3.rows[0]!.id, s3.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO appointments (patient_id, workqueue_item_id, scheduled_start, scheduled_end, visit_type, status)
         VALUES ($1, $2, $3, $4, 'CORONARY_CALCIUM_CT', 'BOOKED')`,
        [p3.rows[0]!.id, w3.rows[0]!.id, addDaysAt(2, 18), addDaysAt(2, 19)],
      );

      // Case 4: STANDARD Priority — Patient Completed
      const p4 = await client.query<{ id: string }>(
        `INSERT INTO patients (mrn, first_name, last_name, dob, sex_at_birth, zip_code, phone, email, insurance_status)
         VALUES ($1, 'Margaret', 'Chen', '1958-02-19', 'Female', '94107', '(555) 201-9102', 'm.chen.synthetic@example.org', '{"eligible":true,"coverage_status":"ACTIVE","plan_name":"Medicare Part B (Synthetic)"}'::jsonb)
         RETURNING id`,
        [`SYN-STD-${suffix}D`],
      );
      const s4 = await client.query<{ id: string }>(
        `INSERT INTO assessment_sessions (patient_id, channel, status) VALUES ($1, 'WEB_PORTAL', 'REVIEWED') RETURNING id`,
        [p4.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO triggered_pathways (session_id, patient_id, rule_code, calculated_score, acuity_level, recommended_intervention, cpt_codes, icd10_codes, clinician_disposition)
         VALUES
           ($1, $2, 'OSTA', NULL, 'ROUTINE', 'Dual-Energy X-Ray Absorptiometry (DEXA) Bone Mineral Density Scan', ARRAY['77080'], ARRAY['Z13.820'], 'ORDERED')`,
        [s4.rows[0]!.id, p4.rows[0]!.id],
      );
      const w4 = await client.query<{ id: string }>(
        `INSERT INTO workqueue_items (patient_id, session_id, priority, status, notes)
         VALUES ($1, $2, 'STANDARD', 'PATIENT_COMPLETED', 'DEXA imaging completed; report delivered to referring provider.') RETURNING id`,
        [p4.rows[0]!.id, s4.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO appointments (patient_id, workqueue_item_id, scheduled_start, scheduled_end, visit_type, status)
         VALUES ($1, $2, $3, $4, 'DEXA_BONE_DENSITY_SCAN', 'COMPLETED')`,
        [p4.rows[0]!.id, w4.rows[0]!.id, addDaysAt(0, 15), addDaysAt(0, 16)],
      );

      await client.query("COMMIT");
      res.status(201).json({
        seeded: 4,
        session_ids: [s1.rows[0]!.id, s2.rows[0]!.id, s3.rows[0]!.id, s4.rows[0]!.id],
      });
    } catch (err) {
      await client.query("ROLLBACK");
      next(err);
    } finally {
      client.release();
    }
  });

  // Provider Clinical Power Tools: Calendar Reschedule/Cancel, Clinician Answer Corrections, Individual Assessment Runner & Clinical PDFs
  registerWorkqueueClinicalRoutes(router, pool, logger);

  return router;
}
