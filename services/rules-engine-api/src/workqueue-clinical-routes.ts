import type { NextFunction, Response, Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import {
  normalizeWorkqueuePriority,
  normalizeWorkqueueStatus,
  type AcuityLevel,
  type HipaaLogger,
} from "@healthcare/shared-contracts";
import { writeAuditLog } from "./audit.js";
import { evaluateClinicalRules, type ClinicalRuleRecord } from "./evaluator.js";
import { escapeHtml, renderHtmlToPdf, wrapBrandedClinicalHtml } from "./pdf-generator.js";
import type { AuthenticatedRequest } from "./rbac.js";

const UuidSchema = z.string().uuid();

const UpdateAppointmentSchema = z.object({
  scheduled_start: z.string().datetime().optional(),
  scheduled_end: z.string().datetime().optional(),
  visit_type: z.string().min(2).max(80).optional(),
  status: z.enum(["BOOKED", "CONFIRMED", "COMPLETED", "CANCELLED"]).optional(),
});

const CorrectResponseSchema = z.object({
  answer_value: z.unknown(),
  correction_reason: z.string().max(500).optional(),
  re_evaluate: z.boolean().default(true),
});

const RunAssessmentSchema = z.object({
  overrides: z.record(z.unknown()).default({}),
  commit: z.boolean().default(false),
  correction_reason: z.string().max(500).optional(),
});

const ProviderPdfSchema = z.object({
  pdf_type: z
    .enum(["full_clinical_packet", "patient_summary", "prior_auth_packet"])
    .default("full_clinical_packet"),
});

/**
 * Maps derived metric keys back to their primary patient/EHR question_keys so the
 * Individual Assessment Runner can show every populated and missing input for any rule.
 */
const DERIVED_TO_QUESTION_KEYS: Record<string, string[]> = {
  bmi: ["height_cm", "weight_kg"],
  tyrer_cuzick_lifetime_risk: [
    "height_cm",
    "weight_kg",
    "age_at_menarche",
    "age_at_first_live_birth",
    "breast_biopsy_count",
    "has_atypical_hyperplasia_or_lcis",
    "breast_density_birads",
    "first_degree_breast_cancer_count",
    "youngest_family_breast_cancer_age",
  ],
  gail_5yr_risk: [
    "age_at_menarche",
    "age_at_first_live_birth",
    "breast_biopsy_count",
    "has_atypical_hyperplasia_or_lcis",
    "first_degree_breast_cancer_count",
  ],
  plcom2012_6yr_risk: ["smoking_status", "pack_years", "years_since_quit_smoking", "copd_history", "height_cm", "weight_kg"],
  bach_10yr_lung_risk: ["smoking_status", "pack_years", "years_since_quit_smoking", "asbestos_exposure_years"],
  aha_prevent_10yr_ascvd: [
    "smoking_status",
    "has_hypertension",
    "systolic_bp_mmhg",
    "has_diabetes",
    "lab_total_cholesterol_mg_dl",
    "lab_hdl_mg_dl",
    "lab_egfr_ml_min",
    "height_cm",
    "weight_kg",
  ],
  cha2ds2_vasc_score: [
    "has_atrial_fibrillation",
    "has_heart_failure",
    "has_hypertension",
    "has_diabetes",
    "has_prior_stroke_or_tia",
    "has_vascular_disease",
  ],
  has_bled_score: [
    "has_hypertension",
    "systolic_bp_mmhg",
    "has_abnormal_renal_or_liver_function",
    "has_prior_stroke_or_tia",
    "has_prior_major_bleeding",
    "has_labile_inr",
    "uses_nsaid_or_antiplatelet",
    "alcohol_drinks_per_week",
  ],
  add_rs_score: ["has_high_risk_aortic_condition", "has_acute_tearing_chest_back_pain", "has_aortic_exam_deficit"],
  abcd2_score: [
    "has_transient_neuro_symptoms",
    "has_hypertension",
    "systolic_bp_mmhg",
    "tia_unilateral_weakness",
    "tia_speech_impairment_without_weakness",
    "tia_duration_minutes",
    "has_diabetes",
  ],
  stop_bang_score: [
    "snoring_loud",
    "daytime_fatigue_tired",
    "observed_apnea",
    "has_hypertension",
    "height_cm",
    "weight_kg",
    "neck_circumference_over_40cm",
  ],
  frax_10yr_major_risk: [
    "height_cm",
    "weight_kg",
    "has_prior_fragility_fracture",
    "parent_hip_fracture_history",
    "smoking_status",
    "uses_long_term_glucocorticoids",
    "has_rheumatoid_arthritis",
    "alcohol_drinks_per_week",
    "dexa_femoral_neck_t_score",
  ],
  osta_score: ["weight_kg"],
  garvan_10yr_fracture_risk: ["has_prior_fragility_fracture", "fall_count_past_12_months", "dexa_femoral_neck_t_score"],
  wells_dvt_pe_score: [
    "has_acute_leg_swelling_or_dyspnea",
    "has_active_cancer",
    "has_recent_immobilization_or_surgery",
    "has_clinical_signs_dvt",
    "has_prior_dvt_or_pe",
    "has_hemoptysis",
  ],
  geneva_pe_score: [
    "has_acute_leg_swelling_or_dyspnea",
    "has_prior_dvt_or_pe",
    "has_recent_immobilization_or_surgery",
    "has_active_cancer",
    "has_hemoptysis",
    "has_clinical_signs_dvt",
    "heart_rate_bpm",
  ],
  fib4_score: ["lab_ast_u_l", "lab_alt_u_l", "lab_platelets_10e9_l"],
  nafld_fibrosis_score: ["height_cm", "weight_kg", "has_diabetes", "lab_ast_u_l", "lab_alt_u_l", "lab_platelets_10e9_l", "lab_albumin_g_dl"],
  apri_score: ["lab_ast_u_l", "lab_platelets_10e9_l"],
  premm5_score: [
    "has_personal_colorectal_cancer",
    "personal_crc_age",
    "has_personal_endometrial_cancer",
    "first_degree_crc_count",
    "youngest_family_crc_age",
  ],
  brcapro_probability: [
    "ethnicity_ancestry",
    "has_personal_breast_cancer",
    "personal_breast_cancer_age",
    "has_personal_ovarian_cancer",
    "first_degree_breast_cancer_count",
    "first_degree_ovarian_cancer_count",
    "youngest_family_breast_cancer_age",
  ],
  pcpt2_high_grade_risk: [
    "has_prostate_cancer_family_history",
    "ethnicity_ancestry",
    "lab_psa_ng_ml",
    "dre_abnormal",
    "prior_negative_prostate_biopsy",
  ],
  roma_score: ["is_postmenopausal", "has_adnexal_mass", "lab_ca125_u_ml", "lab_he4_pmol_l"],
  mesa_10yr_chd_risk: [
    "smoking_status",
    "has_hypertension",
    "has_diabetes",
    "lab_total_cholesterol_mg_dl",
    "lab_hdl_mg_dl",
    "coronary_calcium_agatston_score",
  ],
  dutch_lipid_fh_score: [
    "has_very_high_cholesterol_or_early_heart_disease",
    "has_tendon_xanthomas_or_corneal_arcus",
    "has_family_premature_cad_or_fh",
    "lab_ldl_mg_dl",
    "lab_lpa_nmol_l",
  ],
  odi_score: ["has_back_or_neck_pain", "has_cauda_equina_red_flags", "odi_disability_percent"],
  ad8_score: ["has_memory_or_thinking_changes", "ad8_total_score"],
  cat_score: ["copd_history", "copd_cat_score", "mmrc_dyspnea_grade"],
  mmrc_grade: ["copd_history", "mmrc_dyspnea_grade"],
  kccq12_score: ["has_hf_symptoms_shortness_breath_swelling", "kccq12_symptom_score", "lab_nt_probnp_pg_ml"],
  hf_risk_score: [
    "has_heart_failure",
    "has_hf_symptoms_shortness_breath_swelling",
    "has_hypertension",
    "has_diabetes",
    "kccq12_symptom_score",
    "lab_nt_probnp_pg_ml",
  ],
  sarc_f_score: ["has_muscle_weakness_or_mobility_difficulty", "sarc_f_total_score"],
  ada_diabetes_risk_score: [
    "has_diabetes_or_kidney_risk_check",
    "has_family_history_diabetes",
    "is_physically_active_regularly",
    "has_history_gestational_diabetes",
    "has_hypertension",
    "height_cm",
    "weight_kg",
    "lab_hba1c_percent",
    "lab_uacr_mg_g",
    "lab_egfr_ml_min",
  ],
  audit_c_score: [
    "consumes_alcohol",
    "audit_c_frequency_score",
    "audit_c_quantity_score",
    "audit_c_binge_score",
  ],
  phq9_score: ["has_mood_or_anxiety_concerns", "phq9_total_score"],
  gad7_score: ["has_mood_or_anxiety_concerns", "gad7_total_score"],
  behavioral_max_score: ["has_mood_or_anxiety_concerns", "phq9_total_score", "gad7_total_score"],
};

function extractIp(req: AuthenticatedRequest): string | null {
  const raw = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!raw) return null;
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function extractQuestionKeysFromLogic(expr: unknown, out = new Set<string>()): Set<string> {
  if (!expr || typeof expr !== "object") return out;
  if (Array.isArray(expr)) {
    for (const item of expr) extractQuestionKeysFromLogic(item, out);
    return out;
  }
  const obj = expr as Record<string, unknown>;
  if (typeof obj.var === "string") {
    const v = obj.var;
    if (v.startsWith("answers.")) {
      out.add(v.slice("answers.".length));
    } else if (v.startsWith("derived.")) {
      const derivedKey = v.slice("derived.".length);
      for (const qk of DERIVED_TO_QUESTION_KEYS[derivedKey] ?? []) {
        out.add(qk);
      }
    }
    return out;
  }
  for (const val of Object.values(obj)) {
    extractQuestionKeysFromLogic(val, out);
  }
  return out;
}

function formatAnswerForPdf(questionKey: string, val: unknown): string {
  if (questionKey === "height_cm" && typeof val === "number" && val > 0) {
    const totalIn = Math.round(val / 2.54);
    return `${Math.floor(totalIn / 12)}' ${totalIn % 12}"`;
  }
  if (questionKey === "weight_kg" && typeof val === "number" && val > 0) {
    return `${Math.round(val / 0.45359237)} lbs`;
  }
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  return JSON.stringify(val);
}

function formatVisitTypeForPdf(vt: string): string {
  const acronyms = new Set(["MRI", "CT", "LDCT", "DEXA", "CAC", "CTA", "MRA", "US", "PET"]);
  return vt
    .split("_")
    .map((w) => {
      const upper = w.toUpperCase();
      if (acronyms.has(upper)) return upper;
      return upper.charAt(0) + upper.slice(1).toLowerCase();
    })
    .join(" ");
}

function acuityBadgeClass(acuity: string): string {
  if (acuity === "ACUTE_RED_FLAG") return "acute";
  if (acuity === "HIGH_RISK") return "high";
  if (acuity === "MODERATE_RISK") return "moderate";
  return "routine";
}

/**
 * Registers Batch B & Batch C Provider Clinical Power Tools onto the Workqueue Router:
 * - PATCH /appointments/:appointmentId (Calendar Reschedule / Confirm / Complete / Cancel)
 * - PATCH /:id/responses/:questionKey (Clinician inline answer correction + re-evaluation)
 * - GET /:id/assessments (All clinical models + auto-populated answers/provenance)
 * - POST /:id/assessments/:ruleCode/run (Individual model runner: dry-run or commit)
 * - POST /:id/pdf (One-click Provider PDF: full_clinical_packet, patient_summary, prior_auth_packet)
 */
export function registerWorkqueueClinicalRoutes(
  router: Router,
  pool: Pool,
  logger: HipaaLogger,
): void {
  // =========================================================================
  // 1. CALENDAR RESCHEDULE / CONFIRM / CANCEL (/api/v1/workqueue/appointments/:appointmentId)
  // =========================================================================
  router.patch(
    "/appointments/:appointmentId",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const idCheck = UuidSchema.safeParse(req.params.appointmentId);
        if (!idCheck.success) {
          res.status(400).json({ error: "Invalid appointment UUID" });
          return;
        }
        const parsed = UpdateAppointmentSchema.safeParse(req.body);
        if (!parsed.success) {
          res
            .status(400)
            .json({ error: "Invalid appointment update payload", details: parsed.error.flatten() });
          return;
        }
        const d = parsed.data;
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const updated = await client.query<{
            id: string;
            patient_id: string;
            workqueue_item_id: string | null;
            scheduled_start: Date;
            scheduled_end: Date;
            visit_type: string;
            status: string;
          }>(
            `
            UPDATE appointments
            SET
              scheduled_start = COALESCE($1::timestamptz, scheduled_start),
              scheduled_end = COALESCE($2::timestamptz, scheduled_end),
              visit_type = COALESCE($3, visit_type),
              status = COALESCE($4, status)
            WHERE id = $5
            RETURNING id, patient_id, workqueue_item_id, scheduled_start, scheduled_end, visit_type, status
            `,
            [
              d.scheduled_start ?? null,
              d.scheduled_end ?? null,
              d.visit_type ?? null,
              d.status ?? null,
              idCheck.data,
            ],
          );

          if (updated.rowCount === 0) {
            await client.query("ROLLBACK");
            res.status(404).json({ error: "Appointment not found" });
            return;
          }

          const appt = updated.rows[0]!;
          if (appt.workqueue_item_id && d.status) {
            if (d.status === "COMPLETED") {
              await client.query(
                `UPDATE workqueue_items SET status = 'PATIENT_COMPLETED', updated_at = NOW() WHERE id = $1`,
                [appt.workqueue_item_id],
              );
            } else if (d.status === "CANCELLED") {
              await client.query(
                `UPDATE workqueue_items SET status = 'CONTACT_PENDING', updated_at = NOW() WHERE id = $1 AND status = 'APPOINTMENT_SCHEDULED'`,
                [appt.workqueue_item_id],
              );
            }
          }

          await writeAuditLog(client, {
            actor_id: req.actor!.actor_id,
            actor_role: req.actor!.actor_role,
            action: "UPDATE_APPOINTMENT",
            resource_type: "appointment",
            resource_id: appt.id,
            ip_address: extractIp(req),
            metadata: {
              patient_id: appt.patient_id,
              status: appt.status,
              rescheduled: Boolean(d.scheduled_start),
            },
          });

          await client.query("COMMIT");
          res.json({ appointment: appt });
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
  // 2. CLINICIAN INLINE ANSWER CORRECTION + RE-EVALUATION
  // =========================================================================
  router.patch(
    "/:id/responses/:questionKey",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const idCheck = UuidSchema.safeParse(req.params.id);
        if (!idCheck.success) {
          res.status(400).json({ error: "Invalid workqueue item UUID" });
          return;
        }
        const questionKey = String(req.params.questionKey ?? "").trim();
        if (!/^[a-z0-9_]{2,100}$/.test(questionKey)) {
          res.status(400).json({ error: "Invalid question key" });
          return;
        }
        const parsed = CorrectResponseSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "Invalid response correction payload" });
          return;
        }
        const d = parsed.data;
        const client = await pool.connect();

        try {
          await client.query("BEGIN");
          const wqRes = await client.query<{
            id: string;
            session_id: string;
            patient_id: string;
            dob: Date | string;
            sex_at_birth: string | null;
          }>(
            `
            SELECT w.id, w.session_id, w.patient_id, p.dob, p.sex_at_birth
            FROM workqueue_items w
            INNER JOIN patients p ON p.id = w.patient_id
            WHERE w.id = $1
            `,
            [idCheck.data],
          );
          if (wqRes.rowCount === 0) {
            await client.query("ROLLBACK");
            res.status(404).json({ error: "Workqueue item not found" });
            return;
          }
          const wq = wqRes.rows[0]!;

          // Verify question exists
          const qCheck = await client.query(
            "SELECT question_key FROM questions WHERE question_key = $1",
            [questionKey],
          );
          if (qCheck.rowCount === 0) {
            await client.query("ROLLBACK");
            res.status(404).json({ error: `Question '${questionKey}' not found` });
            return;
          }

          // Preserve original answer on first clinician edit
          const existingRes = await client.query<{
            id: string;
            answer_value: unknown;
            original_answer_value: unknown;
          }>(
            `
            SELECT id, answer_value, original_answer_value
            FROM assessment_responses
            WHERE session_id = $1 AND question_key = $2
            `,
            [wq.session_id, questionKey],
          );

          if (existingRes.rowCount && existingRes.rowCount > 0) {
            const existing = existingRes.rows[0]!;
            const preservedOriginal =
              existing.original_answer_value !== null && existing.original_answer_value !== undefined
                ? existing.original_answer_value
                : existing.answer_value;

            await client.query(
              `
              UPDATE assessment_responses
              SET
                original_answer_value = $1::jsonb,
                answer_value = $2::jsonb,
                provenance = 'CLINICIAN_CORRECTED',
                corrected_by = $3,
                correction_reason = $4,
                corrected_at = NOW(),
                updated_at = NOW()
              WHERE id = $5
              `,
              [
                JSON.stringify(preservedOriginal),
                JSON.stringify(d.answer_value),
                req.actor!.actor_id,
                d.correction_reason?.trim() || "Clinician chart verification",
                existing.id,
              ],
            );
          } else {
            await client.query(
              `
              INSERT INTO assessment_responses (
                session_id, patient_id, question_key, answer_value, provenance,
                confidence_score, corrected_by, correction_reason, corrected_at
              )
              VALUES ($1, $2, $3, $4::jsonb, 'CLINICIAN_CORRECTED', 1.0, $5, $6, NOW())
              `,
              [
                wq.session_id,
                wq.patient_id,
                questionKey,
                JSON.stringify(d.answer_value),
                req.actor!.actor_id,
                d.correction_reason?.trim() || "Added by clinician during review",
              ],
            );
          }

          let reEvaluatedCount = 0;
          if (d.re_evaluate) {
            const [allRespRes, activeRulesRes] = await Promise.all([
              client.query<{ question_key: string; answer_value: unknown }>(
                `
                SELECT question_key, answer_value
                FROM assessment_responses
                WHERE session_id = $1
                   OR (patient_id = $2 AND provenance IN ('AI_PARSED', 'EHR_LAB_IMPORT'))
                ORDER BY updated_at ASC
                `,
                [wq.session_id, wq.patient_id],
              ),
              client.query<ClinicalRuleRecord>(
                `
                SELECT rule_code, display_name, specialty, rule_type, acuity_level,
                       logic_expression, recommended_intervention, cpt_codes, icd10_codes, version
                FROM clinical_rules
                WHERE is_active = TRUE
                `,
              ),
            ]);

            const answerMap: Record<string, unknown> = {};
            for (const row of allRespRes.rows) {
              answerMap[row.question_key] = row.answer_value;
            }
            const dobStr =
              wq.dob instanceof Date ? wq.dob.toISOString().slice(0, 10) : String(wq.dob).slice(0, 10);
            const outcome = evaluateClinicalRules(
              { dob: dobStr, sex_at_birth: wq.sex_at_birth ?? "Unknown" },
              answerMap,
              activeRulesRes.rows,
            );
            reEvaluatedCount = outcome.triggered_pathways.length;

            // Upsert triggered pathways without wiping clinician dispositions on already-ordered pathways
            const existingPathwaysRes = await client.query<{
              rule_code: string;
              clinician_disposition: string;
            }>(
              `SELECT rule_code, clinician_disposition FROM triggered_pathways WHERE session_id = $1`,
              [wq.session_id],
            );
            const existingDisp = new Map(
              existingPathwaysRes.rows.map((r) => [r.rule_code, r.clinician_disposition]),
            );

            await client.query(
              `DELETE FROM triggered_pathways WHERE session_id = $1 AND clinician_disposition = 'PENDING'`,
              [wq.session_id],
            );

            for (const tp of outcome.triggered_pathways) {
              if (existingDisp.has(tp.rule_code) && existingDisp.get(tp.rule_code) !== "PENDING") {
                continue;
              }
              await client.query(
                `
                INSERT INTO triggered_pathways (
                  session_id, patient_id, rule_code, calculated_score, acuity_level,
                  recommended_intervention, cpt_codes, icd10_codes, clinician_disposition
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], 'PENDING')
                `,
                [
                  wq.session_id,
                  wq.patient_id,
                  tp.rule_code,
                  tp.calculated_score,
                  tp.acuity_level,
                  tp.recommended_intervention,
                  tp.cpt_codes,
                  tp.icd10_codes,
                ],
              );
            }

            if (outcome.workqueue_priority) {
              await client.query(
                `UPDATE workqueue_items SET priority = $1, updated_at = NOW() WHERE id = $2`,
                [normalizeWorkqueuePriority(outcome.workqueue_priority), wq.id],
              );
            }
          }

          await writeAuditLog(client, {
            actor_id: req.actor!.actor_id,
            actor_role: req.actor!.actor_role,
            action: "CLINICIAN_EDIT_RESPONSE",
            resource_type: "assessment_response",
            resource_id: wq.session_id,
            ip_address: extractIp(req),
            metadata: {
              workqueue_item_id: wq.id,
              patient_id: wq.patient_id,
              question_key: questionKey,
              re_evaluated: d.re_evaluate,
              triggered_pathways_count: reEvaluatedCount,
            },
          });

          await client.query("COMMIT");
          res.json({
            updated: true,
            question_key: questionKey,
            provenance: "CLINICIAN_CORRECTED",
            re_evaluated: d.re_evaluate,
            triggered_pathways_count: reEvaluatedCount,
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

  // =========================================================================
  // 3. INDIVIDUAL ASSESSMENT RUNNER — LIST MODELS + POPULATED ANSWERS
  // =========================================================================
  router.get(
    "/:id/assessments",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const idCheck = UuidSchema.safeParse(req.params.id);
        if (!idCheck.success) {
          res.status(400).json({ error: "Invalid workqueue item UUID" });
          return;
        }
        const wqRes = await pool.query<{
          id: string;
          session_id: string;
          patient_id: string;
          dob: Date | string;
          sex_at_birth: string | null;
        }>(
          `
          SELECT w.id, w.session_id, w.patient_id, p.dob, p.sex_at_birth
          FROM workqueue_items w
          INNER JOIN patients p ON p.id = w.patient_id
          WHERE w.id = $1
          `,
          [idCheck.data],
        );
        if (wqRes.rowCount === 0) {
          res.status(404).json({ error: "Workqueue item not found" });
          return;
        }
        const wq = wqRes.rows[0]!;

        const [rulesRes, questionsRes, respRes, triggeredRes] = await Promise.all([
          pool.query<ClinicalRuleRecord & { prior_auth_rationale_template: string }>(
            `
            SELECT rule_code, display_name, specialty, rule_type, acuity_level,
                   logic_expression, recommended_intervention, cpt_codes, icd10_codes,
                   prior_auth_rationale_template, version
            FROM clinical_rules
            WHERE is_active = TRUE
            ORDER BY specialty ASC, display_name ASC
            `,
          ),
          pool.query<{
            question_key: string;
            domain: string;
            label_plain_english: string;
            input_type: string;
            options_json: Array<{ value: string | number | boolean; label: string }>;
            data_source: string;
          }>(
            `SELECT question_key, domain, label_plain_english, input_type, options_json, data_source FROM questions`,
          ),
          pool.query<{
            question_key: string;
            answer_value: unknown;
            original_answer_value: unknown;
            provenance: string;
            confidence_score: number | null;
            source_excerpt: string | null;
          }>(
            `
            SELECT question_key, answer_value, original_answer_value, provenance, confidence_score, source_excerpt
            FROM assessment_responses
            WHERE session_id = $1
               OR (patient_id = $2 AND provenance IN ('AI_PARSED', 'EHR_LAB_IMPORT'))
            ORDER BY updated_at ASC
            `,
            [wq.session_id, wq.patient_id],
          ),
          pool.query<{ rule_code: string; calculated_score: number | null; clinician_disposition: string }>(
            `SELECT rule_code, calculated_score, clinician_disposition FROM triggered_pathways WHERE session_id = $1`,
            [wq.session_id],
          ),
        ]);

        const qMap = new Map(questionsRes.rows.map((q) => [q.question_key, q]));
        const rMap = new Map(respRes.rows.map((r) => [r.question_key, r]));
        const tMap = new Map(triggeredRes.rows.map((t) => [t.rule_code, t]));

        const assessments = rulesRes.rows.map((rule) => {
          const requiredKeys = Array.from(extractQuestionKeysFromLogic(rule.logic_expression));
          const inputs = requiredKeys.map((qk) => {
            const qMeta = qMap.get(qk);
            const resp = rMap.get(qk);
            return {
              question_key: qk,
              label: qMeta?.label_plain_english ?? qk,
              input_type: qMeta?.input_type ?? "number",
              options_json: qMeta?.options_json ?? [],
              data_source: qMeta?.data_source ?? "HYBRID",
              current_value: resp ? resp.answer_value : null,
              original_value: resp ? resp.original_answer_value : null,
              provenance: resp ? resp.provenance : "MISSING",
              source_excerpt: resp?.source_excerpt ?? null,
            };
          });
          const existingTriggered = tMap.get(rule.rule_code);
          const populatedCount = inputs.filter((i) => i.provenance !== "MISSING").length;

          return {
            rule_code: rule.rule_code,
            display_name: rule.display_name,
            specialty: rule.specialty,
            rule_type: rule.rule_type,
            acuity_level: rule.acuity_level,
            recommended_intervention: rule.recommended_intervention,
            cpt_codes: rule.cpt_codes,
            icd10_codes: rule.icd10_codes,
            currently_triggered: Boolean(existingTriggered),
            current_score: existingTriggered?.calculated_score ?? null,
            current_disposition: existingTriggered?.clinician_disposition ?? null,
            populated_count: populatedCount,
            total_inputs: inputs.length,
            inputs,
          };
        });

        res.json({
          workqueue_item_id: wq.id,
          session_id: wq.session_id,
          assessments,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // =========================================================================
  // 4. INDIVIDUAL ASSESSMENT RUNNER — RUN DRY-RUN OR COMMIT SINGLE RULE
  // =========================================================================
  router.post(
    "/:id/assessments/:ruleCode/run",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const idCheck = UuidSchema.safeParse(req.params.id);
        if (!idCheck.success) {
          res.status(400).json({ error: "Invalid workqueue item UUID" });
          return;
        }
        const ruleCode = String(req.params.ruleCode ?? "").trim().toUpperCase();
        const parsed = RunAssessmentSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          res.status(400).json({ error: "Invalid assessment runner payload" });
          return;
        }
        const d = parsed.data;
        const client = await pool.connect();

        try {
          await client.query("BEGIN");
          const [wqRes, ruleRes] = await Promise.all([
            client.query<{
              id: string;
              session_id: string;
              patient_id: string;
              dob: Date | string;
              sex_at_birth: string | null;
            }>(
              `
              SELECT w.id, w.session_id, w.patient_id, p.dob, p.sex_at_birth
              FROM workqueue_items w
              INNER JOIN patients p ON p.id = w.patient_id
              WHERE w.id = $1
              `,
              [idCheck.data],
            ),
            client.query<ClinicalRuleRecord & { prior_auth_rationale_template: string }>(
              `
              SELECT rule_code, display_name, specialty, rule_type, acuity_level,
                     logic_expression, recommended_intervention, cpt_codes, icd10_codes,
                     prior_auth_rationale_template, version
              FROM clinical_rules
              WHERE rule_code = $1
              `,
              [ruleCode],
            ),
          ]);

          if (wqRes.rowCount === 0) {
            await client.query("ROLLBACK");
            res.status(404).json({ error: "Workqueue item not found" });
            return;
          }
          if (ruleRes.rowCount === 0) {
            await client.query("ROLLBACK");
            res.status(404).json({ error: `Clinical rule '${ruleCode}' not found` });
            return;
          }

          const wq = wqRes.rows[0]!;
          const rule = ruleRes.rows[0]!;

          const existingResp = await client.query<{ question_key: string; answer_value: unknown }>(
            `
            SELECT question_key, answer_value
            FROM assessment_responses
            WHERE session_id = $1
               OR (patient_id = $2 AND provenance IN ('AI_PARSED', 'EHR_LAB_IMPORT'))
            ORDER BY updated_at ASC
            `,
            [wq.session_id, wq.patient_id],
          );

          const mergedAnswers: Record<string, unknown> = {};
          for (const row of existingResp.rows) {
            mergedAnswers[row.question_key] = row.answer_value;
          }
          for (const [k, v] of Object.entries(d.overrides)) {
            if (v !== undefined && v !== null && v !== "") {
              mergedAnswers[k] = v;
            }
          }

          const dobStr =
            wq.dob instanceof Date ? wq.dob.toISOString().slice(0, 10) : String(wq.dob).slice(0, 10);
          const outcome = evaluateClinicalRules(
            { dob: dobStr, sex_at_birth: wq.sex_at_birth ?? "Unknown" },
            mergedAnswers,
            [rule],
          );
          const triggeredPathway = outcome.triggered_pathways[0] ?? null;

          if (d.commit) {
            // Persist any clinician overrides as CLINICIAN_CORRECTED responses
            for (const [qk, val] of Object.entries(d.overrides)) {
              if (val === undefined || val === null || val === "") continue;
              const qExists = await client.query(
                "SELECT 1 FROM questions WHERE question_key = $1",
                [qk],
              );
              if (qExists.rowCount === 0) continue;

              const prev = await client.query<{
                id: string;
                answer_value: unknown;
                original_answer_value: unknown;
              }>(
                "SELECT id, answer_value, original_answer_value FROM assessment_responses WHERE session_id = $1 AND question_key = $2",
                [wq.session_id, qk],
              );
              if (prev.rowCount && prev.rowCount > 0) {
                const pRow = prev.rows[0]!;
                if (JSON.stringify(pRow.answer_value) !== JSON.stringify(val)) {
                  await client.query(
                    `
                    UPDATE assessment_responses
                    SET original_answer_value = COALESCE(original_answer_value, answer_value),
                        answer_value = $1::jsonb,
                        provenance = 'CLINICIAN_CORRECTED',
                        corrected_by = $2,
                        correction_reason = $3,
                        corrected_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $4
                    `,
                    [
                      JSON.stringify(val),
                      req.actor!.actor_id,
                      d.correction_reason?.trim() || `Entered during ${ruleCode} assessment`,
                      pRow.id,
                    ],
                  );
                }
              } else {
                await client.query(
                  `
                  INSERT INTO assessment_responses (
                    session_id, patient_id, question_key, answer_value, provenance,
                    confidence_score, corrected_by, correction_reason, corrected_at
                  )
                  VALUES ($1, $2, $3, $4::jsonb, 'CLINICIAN_CORRECTED', 1.0, $5, $6, NOW())
                  `,
                  [
                    wq.session_id,
                    wq.patient_id,
                    qk,
                    JSON.stringify(val),
                    req.actor!.actor_id,
                    d.correction_reason?.trim() || `Entered during ${ruleCode} assessment`,
                  ],
                );
              }
            }

            if (triggeredPathway) {
              const existingTp = await client.query<{ id: string }>(
                "SELECT id FROM triggered_pathways WHERE session_id = $1 AND rule_code = $2",
                [wq.session_id, ruleCode],
              );
              if (existingTp.rowCount && existingTp.rowCount > 0) {
                await client.query(
                  `
                  UPDATE triggered_pathways
                  SET calculated_score = $1, acuity_level = $2, recommended_intervention = $3,
                      cpt_codes = $4::text[], icd10_codes = $5::text[]
                  WHERE id = $6
                  `,
                  [
                    triggeredPathway.calculated_score,
                    triggeredPathway.acuity_level,
                    triggeredPathway.recommended_intervention,
                    triggeredPathway.cpt_codes,
                    triggeredPathway.icd10_codes,
                    existingTp.rows[0]!.id,
                  ],
                );
              } else {
                await client.query(
                  `
                  INSERT INTO triggered_pathways (
                    session_id, patient_id, rule_code, calculated_score, acuity_level,
                    recommended_intervention, cpt_codes, icd10_codes, clinician_disposition
                  )
                  VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], 'PENDING')
                  `,
                  [
                    wq.session_id,
                    wq.patient_id,
                    triggeredPathway.rule_code,
                    triggeredPathway.calculated_score,
                    triggeredPathway.acuity_level,
                    triggeredPathway.recommended_intervention,
                    triggeredPathway.cpt_codes,
                    triggeredPathway.icd10_codes,
                  ],
                );
              }

              if (outcome.workqueue_priority === "HIGH") {
                await client.query(
                  `UPDATE workqueue_items SET priority = 'HIGH', updated_at = NOW() WHERE id = $1`,
                  [wq.id],
                );
              }
            }

            await writeAuditLog(client, {
              actor_id: req.actor!.actor_id,
              actor_role: req.actor!.actor_role,
              action: "RUN_INDIVIDUAL_ASSESSMENT",
              resource_type: "workqueue_item",
              resource_id: wq.id,
              ip_address: extractIp(req),
              metadata: {
                patient_id: wq.patient_id,
                rule_code: ruleCode,
                triggered: Boolean(triggeredPathway),
                committed: true,
              },
            });
          }

          await client.query("COMMIT");
          res.json({
            rule_code: rule.rule_code,
            display_name: rule.display_name,
            specialty: rule.specialty,
            triggered: Boolean(triggeredPathway),
            committed: d.commit,
            calculated_score: triggeredPathway?.calculated_score ?? null,
            acuity_level: triggeredPathway?.acuity_level ?? (rule.acuity_level as AcuityLevel),
            recommended_intervention: rule.recommended_intervention,
            cpt_codes: rule.cpt_codes,
            icd10_codes: rule.icd10_codes,
            rationale: rule.prior_auth_rationale_template,
            derived_metrics: outcome.derived_metrics,
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

  // =========================================================================
  // 5. ONE-CLICK PROVIDER PDF REPORTS (/api/v1/workqueue/:id/pdf)
  // =========================================================================
  router.post(
    "/:id/pdf",
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const idCheck = UuidSchema.safeParse(req.params.id);
        if (!idCheck.success) {
          res.status(400).json({ error: "Invalid workqueue item UUID" });
          return;
        }
        const parsed = ProviderPdfSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          res.status(400).json({ error: "Invalid PDF report type" });
          return;
        }
        const pdfType = parsed.data.pdf_type;

        const wqRes = await pool.query<{
          id: string;
          session_id: string;
          patient_id: string;
          priority: string;
          status: string;
          mrn: string | null;
          first_name: string;
          last_name: string;
          dob: Date | string;
          sex_at_birth: string | null;
          phone: string | null;
          email: string | null;
          insurance_status: Record<string, unknown> | null;
        }>(
          `
          SELECT w.id, w.session_id, w.patient_id, w.priority, w.status,
                 p.mrn, p.first_name, p.last_name, p.dob, p.sex_at_birth, p.phone, p.email, p.insurance_status
          FROM workqueue_items w
          INNER JOIN patients p ON p.id = w.patient_id
          WHERE w.id = $1
          `,
          [idCheck.data],
        );

        if (wqRes.rowCount === 0) {
          res.status(404).json({ error: "Workqueue item not found" });
          return;
        }
        const wq = wqRes.rows[0]!;
        const dobStr =
          wq.dob instanceof Date ? wq.dob.toISOString().slice(0, 10) : String(wq.dob).slice(0, 10);
        const fullName = `${wq.first_name} ${wq.last_name}`.trim();

        const [pathwaysRes, respRes, apptsRes] = await Promise.all([
          pool.query<{
            rule_code: string;
            display_name: string;
            specialty: string;
            acuity_level: string;
            calculated_score: number | null;
            recommended_intervention: string;
            cpt_codes: string[];
            icd10_codes: string[];
            clinician_disposition: string;
            prior_auth_rationale_template: string;
          }>(
            `
            SELECT tp.rule_code, cr.display_name, cr.specialty, tp.acuity_level,
                   tp.calculated_score, tp.recommended_intervention, tp.cpt_codes,
                   tp.icd10_codes, tp.clinician_disposition, cr.prior_auth_rationale_template
            FROM triggered_pathways tp
            INNER JOIN clinical_rules cr ON cr.rule_code = tp.rule_code
            WHERE tp.session_id = $1
            ORDER BY CASE tp.acuity_level WHEN 'ACUTE_RED_FLAG' THEN 1 WHEN 'HIGH_RISK' THEN 2 WHEN 'MODERATE_RISK' THEN 3 ELSE 4 END ASC
            `,
            [wq.session_id],
          ),
          pool.query<{
            question_key: string;
            domain: string;
            label_plain_english: string;
            answer_value: unknown;
            original_answer_value: unknown;
            provenance: string;
            confidence_score: number | null;
            source_excerpt: string | null;
            corrected_by: string | null;
            correction_reason: string | null;
          }>(
            `
            SELECT ar.question_key, q.domain, q.label_plain_english, ar.answer_value,
                   ar.original_answer_value, ar.provenance, ar.confidence_score,
                   ar.source_excerpt, ar.corrected_by, ar.correction_reason
            FROM assessment_responses ar
            INNER JOIN questions q ON q.question_key = ar.question_key
            WHERE ar.session_id = $1
               OR (ar.patient_id = $2 AND ar.provenance IN ('AI_PARSED', 'EHR_LAB_IMPORT'))
            ORDER BY q.sort_order ASC
            `,
            [wq.session_id, wq.patient_id],
          ),
          pool.query<{
            scheduled_start: Date;
            visit_type: string;
            status: string;
          }>(
            `SELECT scheduled_start, visit_type, status FROM appointments WHERE patient_id = $1 ORDER BY scheduled_start ASC`,
            [wq.patient_id],
          ),
        ]);

        const insurancePlan =
          typeof wq.insurance_status?.plan_name === "string"
            ? `${wq.insurance_status.coverage_status ?? "ACTIVE"} — ${wq.insurance_status.plan_name}`
            : "Pending Verification";

        const pathwaysRows = pathwaysRes.rows
          .map(
            (p) => `
            <tr>
              <td><strong>${escapeHtml(p.display_name)}</strong><br/><span style="color:#64748b;font-size:10px">${escapeHtml(p.specialty)}${p.calculated_score !== null ? ` · Score: ${p.calculated_score}` : ""}</span></td>
              <td><span class="badge ${acuityBadgeClass(p.acuity_level)}">${escapeHtml(p.acuity_level.replace(/_/g, " "))}</span></td>
              <td>${escapeHtml(p.recommended_intervention)}${pdfType === "prior_auth_packet" ? `<div style="margin-top:4px;font-size:10px;color:#334155"><em>Rationale: ${escapeHtml(p.prior_auth_rationale_template)}</em></div>` : ""}</td>
              <td><code>${escapeHtml(p.cpt_codes.join(", "))}</code><br/><code style="color:#475569">${escapeHtml(p.icd10_codes.join(", "))}</code></td>
              <td><strong>${escapeHtml(p.clinician_disposition)}</strong></td>
            </tr>
          `,
          )
          .join("");

        const responsesRows = respRes.rows
          .map((r) => {
            const valStr = formatAnswerForPdf(r.question_key, r.answer_value);
            const origStr =
              r.original_answer_value !== null && r.original_answer_value !== undefined
                ? ` <span style="color:#64748b;text-decoration:line-through;font-size:10px">(Orig: ${escapeHtml(formatAnswerForPdf(r.question_key, r.original_answer_value))})</span>`
                : "";
            const excerptHtml = r.source_excerpt
              ? `<div style="color:#475569;font-size:10px;font-style:italic;margin-top:2px">&ldquo;${escapeHtml(r.source_excerpt)}&rdquo;</div>`
              : "";
            const correctionHtml = r.corrected_by
              ? `<div style="color:#0369a1;font-size:10px;margin-top:2px">Corrected by ${escapeHtml(r.corrected_by)}${r.correction_reason ? ` — ${escapeHtml(r.correction_reason)}` : ""}</div>`
              : "";
            return `
              <tr>
                <td><strong>${escapeHtml(r.domain)}</strong></td>
                <td>${escapeHtml(r.label_plain_english)}${excerptHtml}${correctionHtml}</td>
                <td><strong>${escapeHtml(valStr)}</strong>${origStr}</td>
                <td><span style="font-size:10px">${escapeHtml(r.provenance.replace(/_/g, " "))}</span></td>
              </tr>
            `;
          })
          .join("");

        const visitsRows = apptsRes.rows
          .map(
            (a) => `
            <tr>
              <td>${escapeHtml(formatVisitTypeForPdf(a.visit_type))}</td>
              <td>${escapeHtml(new Date(a.scheduled_start).toLocaleString("en-US"))}</td>
              <td><strong>${escapeHtml(a.status)}</strong></td>
            </tr>
          `,
          )
          .join("");

        const reportTitle =
          pdfType === "patient_summary"
            ? "Personalized Preventive Screening Summary"
            : pdfType === "prior_auth_packet"
              ? "Clinical Prior-Authorization Evidence Packet"
              : "Complete Clinical Risk Assessment & Orders Report";

        const html = wrapBrandedClinicalHtml(
          reportTitle,
          `Patient: ${fullName} · MRN: ${wq.mrn ?? "N/A"} · DOB: ${dobStr} · Sex: ${wq.sex_at_birth ?? "Unknown"}`,
          `
          <div class="kpi-grid">
            <div class="kpi"><div class="kpi-val">${escapeHtml(normalizeWorkqueuePriority(wq.priority))}</div><div class="kpi-label">Workqueue Priority</div></div>
            <div class="kpi"><div class="kpi-val">${escapeHtml(normalizeWorkqueueStatus(wq.status).replace(/_/g, " "))}</div><div class="kpi-label">Workflow Status</div></div>
            <div class="kpi"><div class="kpi-val">${pathwaysRes.rows.length}</div><div class="kpi-label">Assessment Findings</div></div>
            <div class="kpi"><div class="kpi-val">${respRes.rows.length}</div><div class="kpi-label">Documented Responses</div></div>
          </div>
          <p style="font-size:11px;color:#334155;margin:10px 0 14px">
            <strong>Insurance Coverage:</strong> ${escapeHtml(insurancePlan)}
            ${wq.phone ? ` &nbsp;|&nbsp; <strong>Phone:</strong> ${escapeHtml(wq.phone)}` : ""}
            ${wq.email ? ` &nbsp;|&nbsp; <strong>Email:</strong> ${escapeHtml(wq.email)}` : ""}
          </p>

          <h2>1. Assessment Findings &amp; Recommended Imaging Orders</h2>
          <table>
            <thead>
              <tr><th>Clinical Model</th><th>Acuity</th><th>Recommended Order / Intervention</th><th>CPT &amp; ICD-10</th><th>Disposition</th></tr>
            </thead>
            <tbody>${pathwaysRows || '<tr><td colspan="5">No high-risk screening pathways triggered.</td></tr>'}</tbody>
          </table>

          ${
            pdfType !== "patient_summary"
              ? `
          <h2>2. Patient Responses, AI Evidence &amp; Clinician Corrections</h2>
          <table>
            <thead>
              <tr><th>Domain</th><th>Question &amp; Clinical Evidence</th><th>Answer</th><th>Provenance</th></tr>
            </thead>
            <tbody>${responsesRows || '<tr><td colspan="4">No responses recorded.</td></tr>'}</tbody>
          </table>
          `
              : ""
          }

          ${
            apptsRes.rows.length > 0
              ? `
          <h2>${pdfType === "patient_summary" ? "2" : "3"}. Scheduled Imaging Visits &amp; Consultations</h2>
          <table>
            <thead><tr><th>Visit Type</th><th>Scheduled Date &amp; Time</th><th>Status</th></tr></thead>
            <tbody>${visitsRows}</tbody>
          </table>
          `
              : ""
          }
          `,
        );

        const pdfBuffer = await renderHtmlToPdf(html, reportTitle, [
          `Patient: ${fullName} (MRN: ${wq.mrn ?? "N/A"}, DOB: ${dobStr})`,
          `Findings: ${pathwaysRes.rows.length} · Responses: ${respRes.rows.length}`,
        ]);

        await writeAuditLog(pool, {
          actor_id: req.actor!.actor_id,
          actor_role: req.actor!.actor_role,
          action: "EXPORT_PDF",
          resource_type: "workqueue_pdf_report",
          resource_id: wq.id,
          ip_address: extractIp(req),
          metadata: {
            patient_id: wq.patient_id,
            pdf_type: pdfType,
            byte_length: pdfBuffer.length,
          },
        });

        logger.info("Provider exported clinical PDF report", {
          workqueue_item_id: wq.id,
          pdf_type: pdfType,
          byte_length: pdfBuffer.length,
        });

        const safeMrn = (wq.mrn ?? wq.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="RadManagement_${pdfType}_${safeMrn}.pdf"`,
        );
        res.send(pdfBuffer);
      } catch (err) {
        next(err);
      }
    },
  );
}
