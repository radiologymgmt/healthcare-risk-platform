import type { NextFunction, Response, Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import type { HipaaLogger } from "@healthcare/shared-contracts";
import { writeAuditLog } from "./audit.js";
import type { AuthenticatedRequest } from "./rbac.js";
import { escapeHtml, renderHtmlToPdf, wrapBrandedClinicalHtml } from "./pdf-generator.js";

const PdfTypeSchema = z.enum(["patient_summary", "prior_auth_packet", "executive_overview"]);

const PdfRequestBodySchema = z.object({
  session_id: z.string().uuid().optional(),
});

function extractIp(req: AuthenticatedRequest): string | null {
  const raw = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!raw) return null;
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function acuityBadgeClass(acuity: string): string {
  if (acuity === "ACUTE_RED_FLAG") return "acute";
  if (acuity === "HIGH_RISK") return "high";
  if (acuity === "MODERATE_RISK") return "moderate";
  return "routine";
}

export async function collectExecutiveAnalytics(pool: Pool) {
  const [
    totalsRes,
    specialtyRes,
    acuityRes,
    channelRes,
    funnelRes,
    cptRes,
    aiStatsRes,
    recentSessionsRes,
  ] = await Promise.all([
    pool.query<{
      total_sessions: string;
      total_triggered: string;
      open_workqueue: string;
      stat_count: string;
      orders_approved: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM assessment_sessions) AS total_sessions,
        (SELECT COUNT(*) FROM triggered_pathways) AS total_triggered,
        (SELECT COUNT(*) FROM workqueue_items WHERE status <> 'COMPLETED') AS open_workqueue,
        (SELECT COUNT(*) FROM workqueue_items WHERE priority = 'STAT') AS stat_count,
        (SELECT COUNT(*) FROM triggered_pathways WHERE clinician_disposition IN ('APPROVED', 'ORDERED')) AS orders_approved
    `),
    pool.query<{ specialty: string; triggered_count: string; ordered_count: string }>(`
      SELECT
        cr.specialty,
        COUNT(*)::text AS triggered_count,
        COUNT(*) FILTER (WHERE tp.clinician_disposition IN ('APPROVED', 'ORDERED'))::text AS ordered_count
      FROM triggered_pathways tp
      INNER JOIN clinical_rules cr ON cr.rule_code = tp.rule_code
      GROUP BY cr.specialty
      ORDER BY COUNT(*) DESC, cr.specialty ASC
    `),
    pool.query<{ acuity_level: string; count: string }>(`
      SELECT acuity_level, COUNT(*)::text AS count
      FROM triggered_pathways
      GROUP BY acuity_level
    `),
    pool.query<{ channel: string; count: string }>(`
      SELECT channel, COUNT(*)::text AS count
      FROM assessment_sessions
      GROUP BY channel
      ORDER BY COUNT(*) DESC
    `),
    pool.query<{ status: string; count: string }>(`
      SELECT status, COUNT(*)::text AS count
      FROM workqueue_items
      GROUP BY status
    `),
    pool.query<{ cpt_code: string; count: string }>(`
      SELECT code AS cpt_code, COUNT(*)::text AS count
      FROM triggered_pathways, UNNEST(cpt_codes) AS code
      GROUP BY code
      ORDER BY COUNT(*) DESC, code ASC
      LIMIT 10
    `),
    pool.query<{ ai_count: string; avg_confidence: string | null }>(`
      SELECT
        COUNT(*) FILTER (WHERE provenance IN ('AI_PARSED', 'PATIENT_CONFIRMED_AI'))::text AS ai_count,
        ROUND(AVG(confidence_score) FILTER (WHERE confidence_score IS NOT NULL), 3)::text AS avg_confidence
      FROM assessment_responses
    `),
    pool.query<{
      session_id: string;
      channel: string;
      status: string;
      triggered_count: string;
      started_at: Date;
    }>(`
      SELECT
        s.id AS session_id,
        s.channel,
        s.status,
        COUNT(tp.id)::text AS triggered_count,
        s.started_at
      FROM assessment_sessions s
      LEFT JOIN triggered_pathways tp ON tp.session_id = s.id
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT 15
    `),
  ]);

  const t = totalsRes.rows[0]!;
  return {
    kpis: {
      total_sessions: Number(t.total_sessions),
      total_triggered_pathways: Number(t.total_triggered),
      open_workqueue_items: Number(t.open_workqueue),
      stat_triage_count: Number(t.stat_count),
      orders_approved_count: Number(t.orders_approved),
      ai_parsed_answers_count: Number(aiStatsRes.rows[0]?.ai_count ?? 0),
      avg_ai_confidence: aiStatsRes.rows[0]?.avg_confidence
        ? Number(aiStatsRes.rows[0].avg_confidence)
        : null,
    },
    by_specialty: specialtyRes.rows.map((r) => ({
      specialty: r.specialty,
      triggered_count: Number(r.triggered_count),
      ordered_count: Number(r.ordered_count),
    })),
    by_acuity: acuityRes.rows.map((r) => ({
      acuity_level: r.acuity_level,
      count: Number(r.count),
    })),
    by_channel: channelRes.rows.map((r) => ({
      channel: r.channel,
      count: Number(r.count),
    })),
    workqueue_funnel: funnelRes.rows.map((r) => ({
      status: r.status,
      count: Number(r.count),
    })),
    top_cpt_codes: cptRes.rows.map((r) => ({
      cpt_code: r.cpt_code,
      count: Number(r.count),
    })),
    recent_sessions: recentSessionsRes.rows.map((r) => ({
      session_id: r.session_id,
      channel: r.channel,
      status: r.status,
      triggered_count: Number(r.triggered_count),
      started_at: r.started_at,
    })),
  };
}

/**
 * Registers Phase 5 Executive Analytics & Headless PDF routes onto the RBAC-protected Admin Router.
 */
export function registerAdminAnalyticsAndPdfRoutes(
  router: Router,
  pool: Pool,
  logger: HipaaLogger,
): void {
  router.get("/analytics", async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const analytics = await collectExecutiveAnalytics(pool);
      res.json(analytics);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/v1/admin/pdf/:type (Section 5 — Comp 8)
   * Generates branded PDFs: `patient_summary`, `prior_auth_packet`, `executive_overview`.
   */
  router.post(
    "/pdf/:type",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const typeCheck = PdfTypeSchema.safeParse(req.params.type);
        if (!typeCheck.success) {
          res.status(400).json({
            error: "Invalid PDF type. Expected patient_summary, prior_auth_packet, or executive_overview",
          });
          return;
        }
        const pdfType = typeCheck.data;
        const bodyCheck = PdfRequestBodySchema.safeParse(req.body ?? {});
        if (!bodyCheck.success) {
          res.status(400).json({ error: "Invalid PDF request payload" });
          return;
        }

        let html = "";
        let fallbackTitle = "";
        let fallbackLines: string[] = [];
        let resourceId: string | null = bodyCheck.data.session_id ?? null;

        if (pdfType === "executive_overview") {
          const analytics = await collectExecutiveAnalytics(pool);
          fallbackTitle = "Executive Clinical Risk Platform Overview";
          fallbackLines = [
            `Total Sessions: ${analytics.kpis.total_sessions}`,
            `Triggered Pathways: ${analytics.kpis.total_triggered_pathways}`,
            `Open Workqueue Items: ${analytics.kpis.open_workqueue_items} (STAT: ${analytics.kpis.stat_triage_count})`,
            `Approved/Ordered Pathways: ${analytics.kpis.orders_approved_count}`,
          ];

          const specRows = analytics.by_specialty
            .map(
              (s) =>
                `<tr><td>${escapeHtml(s.specialty)}</td><td>${s.triggered_count}</td><td>${s.ordered_count}</td></tr>`,
            )
            .join("");

          const cptRows = analytics.top_cpt_codes
            .map((c) => `<tr><td><code>${escapeHtml(c.cpt_code)}</code></td><td>${c.count}</td></tr>`)
            .join("");

          html = wrapBrandedClinicalHtml(
            "Executive Clinical Risk Overview",
            "Population Screening Utilization & Order Conversion",
            `
            <div class="kpi-grid">
              <div class="kpi"><div class="kpi-val">${analytics.kpis.total_sessions}</div><div class="kpi-label">Assessment Sessions</div></div>
              <div class="kpi"><div class="kpi-val">${analytics.kpis.total_triggered_pathways}</div><div class="kpi-label">Triggered Pathways</div></div>
              <div class="kpi"><div class="kpi-val">${analytics.kpis.stat_triage_count}</div><div class="kpi-label">STAT Acute Flags</div></div>
              <div class="kpi"><div class="kpi-val">${analytics.kpis.orders_approved_count}</div><div class="kpi-label">Orders Approved</div></div>
            </div>
            <h2>Triggered Pathways by Clinical Specialty</h2>
            <table>
              <thead><tr><th>Specialty</th><th>Triggered Pathways</th><th>Approved / Ordered</th></tr></thead>
              <tbody>${specRows || '<tr><td colspan="3">No pathways triggered yet</td></tr>'}</tbody>
            </table>
            <h2>Top Preventive CPT Procedure Codes</h2>
            <table>
              <thead><tr><th>CPT Code</th><th>Volume</th></tr></thead>
              <tbody>${cptRows || '<tr><td colspan="2">No CPT activity yet</td></tr>'}</tbody>
            </table>
            `,
          );
        } else {
          // Resolve target session (provided session_id or most recent session with pathways)
          const sessLookup = bodyCheck.data.session_id
            ? await pool.query(
                `
                SELECT s.id AS session_id, s.channel, s.rules_version_snapshot, s.completed_at,
                       p.id AS patient_id, p.mrn, p.first_name, p.last_name, p.dob, p.sex_at_birth, p.insurance_status
                FROM assessment_sessions s
                INNER JOIN patients p ON p.id = s.patient_id
                WHERE s.id = $1
                `,
                [bodyCheck.data.session_id],
              )
            : await pool.query(`
                SELECT s.id AS session_id, s.channel, s.rules_version_snapshot, s.completed_at,
                       p.id AS patient_id, p.mrn, p.first_name, p.last_name, p.dob, p.sex_at_birth, p.insurance_status
                FROM assessment_sessions s
                INNER JOIN patients p ON p.id = s.patient_id
                ORDER BY s.started_at DESC
                LIMIT 1
              `);

          if (sessLookup.rowCount === 0) {
            res.status(404).json({ error: "No assessment session available to generate PDF" });
            return;
          }
          const sess = sessLookup.rows[0]!;
          resourceId = String(sess.session_id);
          const dobStr =
            sess.dob instanceof Date
              ? sess.dob.toISOString().slice(0, 10)
              : String(sess.dob).slice(0, 10);

          const [pathwaysRes, evidenceRes] = await Promise.all([
            pool.query(
              `
              SELECT tp.rule_code, cr.display_name, cr.specialty, cr.prior_auth_rationale_template,
                     tp.calculated_score, tp.acuity_level, tp.recommended_intervention,
                     tp.cpt_codes, tp.icd10_codes, tp.clinician_disposition
              FROM triggered_pathways tp
              INNER JOIN clinical_rules cr ON cr.rule_code = tp.rule_code
              WHERE tp.session_id = $1
              ORDER BY tp.acuity_level ASC, tp.rule_code ASC
              `,
              [sess.session_id],
            ),
            pool.query(
              `
              SELECT ar.question_key, q.label_plain_english, ar.answer_value, ar.provenance,
                     ar.confidence_score, ar.source_excerpt
              FROM assessment_responses ar
              INNER JOIN questions q ON q.question_key = ar.question_key
              WHERE ar.session_id = $1
              ORDER BY q.sort_order ASC
              `,
              [sess.session_id],
            ),
          ]);

          if (pdfType === "patient_summary") {
            fallbackTitle = "Patient Preventive Risk Summary";
            fallbackLines = [
              `Session: ${sess.session_id}`,
              `Pathways Triggered: ${pathwaysRes.rowCount}`,
              ...pathwaysRes.rows.map(
                (p) => `- ${p.display_name}: ${p.recommended_intervention}`,
              ),
            ];
            const pathwayCards = pathwaysRes.rows
              .map(
                (p) => `
                <div class="card">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <strong>${escapeHtml(String(p.display_name))}</strong>
                    <span class="badge ${acuityBadgeClass(String(p.acuity_level))}">${escapeHtml(String(p.acuity_level))}</span>
                  </div>
                  <p style="margin:6px 0 0;color:#334155;">Recommended Next Step: ${escapeHtml(String(p.recommended_intervention))}</p>
                </div>`,
              )
              .join("");

            html = wrapBrandedClinicalHtml(
              "Patient Preventive Risk Summary",
              `Assessment Session ${String(sess.session_id).slice(0, 8)}`,
              `
              <div class="card">
                <strong>Patient:</strong> ${escapeHtml(`${sess.first_name} ${sess.last_name}`)} &nbsp;|&nbsp;
                <strong>DOB:</strong> ${escapeHtml(dobStr)} &nbsp;|&nbsp;
                <strong>Sex:</strong> ${escapeHtml(String(sess.sex_at_birth ?? "Unknown"))}
              </div>
              <h2>Personalized Screening Recommendations (${pathwaysRes.rowCount ?? 0})</h2>
              ${pathwayCards || "<p>No elevated preventive pathways were triggered during this assessment.</p>"}
              `,
            );
          } else {
            // prior_auth_packet
            fallbackTitle = "Clinical Prior-Authorization Packet";
            fallbackLines = [
              `Session: ${sess.session_id}`,
              `Rules Version Snapshot: v${sess.rules_version_snapshot}`,
              ...pathwaysRes.rows.map(
                (p) =>
                  `${p.rule_code} | CPT: ${(p.cpt_codes as string[]).join(",")} | ICD-10: ${(p.icd10_codes as string[]).join(",")}`,
              ),
            ];

            const authRows = pathwaysRes.rows
              .map(
                (p) => `
                <tr>
                  <td><strong>${escapeHtml(String(p.rule_code))}</strong><br/>${escapeHtml(String(p.display_name))}</td>
                  <td><span class="badge ${acuityBadgeClass(String(p.acuity_level))}">${escapeHtml(String(p.acuity_level))}</span>${p.calculated_score !== null ? `<br/>Score: ${escapeHtml(String(p.calculated_score))}` : ""}</td>
                  <td><code>${escapeHtml((p.cpt_codes as string[]).join(", "))}</code></td>
                  <td><code>${escapeHtml((p.icd10_codes as string[]).join(", "))}</code></td>
                  <td>${escapeHtml(String(p.prior_auth_rationale_template ?? p.recommended_intervention))}</td>
                </tr>`,
              )
              .join("");

            const evidenceRows = evidenceRes.rows
              .map(
                (e) => `
                <tr>
                  <td><code>${escapeHtml(String(e.question_key))}</code></td>
                  <td>${escapeHtml(JSON.stringify(e.answer_value))}</td>
                  <td>${escapeHtml(String(e.provenance))}${e.confidence_score ? ` (${Math.round(Number(e.confidence_score) * 100)}%)` : ""}</td>
                  <td>${escapeHtml(String(e.source_excerpt ?? "Patient-entered response"))}</td>
                </tr>`,
              )
              .join("");

            html = wrapBrandedClinicalHtml(
              "Prior-Authorization Medical Necessity Packet",
              `Rules Snapshot v${sess.rules_version_snapshot}`,
              `
              <div class="card">
                <strong>Patient:</strong> ${escapeHtml(`${sess.first_name} ${sess.last_name}`)} &nbsp;|&nbsp;
                <strong>MRN:</strong> ${escapeHtml(String(sess.mrn ?? "N/A"))} &nbsp;|&nbsp;
                <strong>DOB:</strong> ${escapeHtml(dobStr)} &nbsp;|&nbsp;
                <strong>Session:</strong> ${escapeHtml(String(sess.session_id))}
              </div>
              <h2>CPT / ICD-10 Medical Necessity &amp; Rationale</h2>
              <table>
                <thead><tr><th>Pathway</th><th>Acuity / Score</th><th>CPT</th><th>ICD-10</th><th>Clinical Rationale</th></tr></thead>
                <tbody>${authRows || '<tr><td colspan="5">No triggered pathways</td></tr>'}</tbody>
              </table>
              <h2>Supporting Clinical Provenance &amp; Document Excerpts</h2>
              <table>
                <thead><tr><th>Question Key</th><th>Value</th><th>Provenance</th><th>Source Excerpt</th></tr></thead>
                <tbody>${evidenceRows || '<tr><td colspan="4">No supporting responses recorded</td></tr>'}</tbody>
              </table>
              `,
            );
          }
        }

        const pdfBuffer = await renderHtmlToPdf(html, fallbackTitle, fallbackLines);

        await writeAuditLog(pool, {
          actor_id: req.actor!.actor_id,
          actor_role: req.actor!.actor_role,
          action: "EXPORT_PDF",
          resource_type: "pdf_report",
          resource_id: resourceId,
          ip_address: extractIp(req),
          metadata: { pdf_type: pdfType, byte_length: pdfBuffer.length },
        });

        logger.info("Exported clinical PDF document", {
          pdf_type: pdfType,
          byte_length: pdfBuffer.length,
        });

        res.setHeader("content-type", "application/pdf");
        res.setHeader("content-disposition", `attachment; filename="${pdfType}.pdf"`);
        res.send(pdfBuffer);
      } catch (err) {
        next(err);
      }
    },
  );
}
