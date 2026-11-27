/**
 * Canonical clinical code mappings from LOINC and ICD-10-CM into the unified
 * PostgreSQL `questions.question_key` registry.
 */

export const LOINC_TO_QUESTION_KEY: Record<string, string> = {
  // Hepatology Labs
  "1920-8": "lab_ast_u_l",
  "1742-6": "lab_alt_u_l",
  "777-3": "lab_platelets_10e9_l",
  "26515-7": "lab_platelets_10e9_l",
  "1751-7": "lab_albumin_g_dl",

  // Urology & OBGYN Biomarkers
  "2857-1": "lab_psa_ng_ml",
  "10334-1": "lab_ca125_u_ml",
  "55180-4": "lab_he4_pmol_l",

  // Cardiovascular & Metabolic Labs / Vitals
  "2093-3": "lab_total_cholesterol_mg_dl",
  "2085-9": "lab_hdl_mg_dl",
  "33914-3": "lab_egfr_ml_min",
  "98979-8": "lab_egfr_ml_min",
  "8480-6": "systolic_bp_mmhg",
  "8867-4": "heart_rate_bpm",
  "8302-2": "height_cm",
  "29463-7": "weight_kg",
  "89251-3": "coronary_calcium_agatston_score",

  // Neurology & Bone Clinical Scores
  "72172-0": "cognitive_moca_score",
  "38265-5": "dexa_femoral_neck_t_score",
};

export const LAB_NAME_FALLBACK_MAP: Record<string, string> = {
  AST: "lab_ast_u_l",
  SGOT: "lab_ast_u_l",
  ALT: "lab_alt_u_l",
  SGPT: "lab_alt_u_l",
  PLT: "lab_platelets_10e9_l",
  PLATELETS: "lab_platelets_10e9_l",
  ALB: "lab_albumin_g_dl",
  ALBUMIN: "lab_albumin_g_dl",
  PSA: "lab_psa_ng_ml",
  CA125: "lab_ca125_u_ml",
  "CA-125": "lab_ca125_u_ml",
  HE4: "lab_he4_pmol_l",
  CHOL: "lab_total_cholesterol_mg_dl",
  HDL: "lab_hdl_mg_dl",
  EGFR: "lab_egfr_ml_min",
  SBP: "systolic_bp_mmhg",
  HR: "heart_rate_bpm",
};

export const ICD10_PREFIX_TO_QUESTION_KEY: ReadonlyArray<{ prefix: string; questionKey: string }> = [
  { prefix: "I48", questionKey: "has_atrial_fibrillation" },
  { prefix: "E10", questionKey: "has_diabetes" },
  { prefix: "E11", questionKey: "has_diabetes" },
  { prefix: "I10", questionKey: "has_hypertension" },
  { prefix: "I50", questionKey: "has_heart_failure" },
  { prefix: "I63", questionKey: "has_prior_stroke_or_tia" },
  { prefix: "G45", questionKey: "has_prior_stroke_or_tia" },
  { prefix: "I73", questionKey: "has_vascular_disease" },
  { prefix: "I25", questionKey: "has_vascular_disease" },
  { prefix: "I42.2", questionKey: "has_hcm_diagnosis_or_family_scd" },
  { prefix: "J44", questionKey: "copd_history" },
  { prefix: "K74", questionKey: "has_chronic_hbv_or_cirrhosis" },
  { prefix: "B18.1", questionKey: "has_chronic_hbv_or_cirrhosis" },
  { prefix: "M05", questionKey: "has_rheumatoid_arthritis" },
  { prefix: "M06", questionKey: "has_rheumatoid_arthritis" },
  { prefix: "I26", questionKey: "has_prior_dvt_or_pe" },
  { prefix: "I82", questionKey: "has_prior_dvt_or_pe" },
  { prefix: "C50", questionKey: "has_personal_breast_cancer" },
  { prefix: "C56", questionKey: "has_personal_ovarian_cancer" },
  { prefix: "C18", questionKey: "has_personal_colorectal_cancer" },
  { prefix: "C19", questionKey: "has_personal_colorectal_cancer" },
  { prefix: "C20", questionKey: "has_personal_colorectal_cancer" },
  { prefix: "C54", questionKey: "has_personal_endometrial_cancer" },
];

export function mapObservationCodeToQuestionKey(code?: string, display?: string): string | null {
  if (code) {
    const clean = code.trim();
    if (LOINC_TO_QUESTION_KEY[clean]) return LOINC_TO_QUESTION_KEY[clean]!;
    const upper = clean.toUpperCase();
    if (LAB_NAME_FALLBACK_MAP[upper]) return LAB_NAME_FALLBACK_MAP[upper]!;
  }
  if (display) {
    const upper = display.trim().toUpperCase();
    if (LAB_NAME_FALLBACK_MAP[upper]) return LAB_NAME_FALLBACK_MAP[upper]!;
  }
  return null;
}

export function mapIcd10ToQuestionKey(code: string): string | null {
  const clean = code.trim().toUpperCase();
  for (const entry of ICD10_PREFIX_TO_QUESTION_KEY) {
    if (clean.startsWith(entry.prefix)) return entry.questionKey;
  }
  return null;
}
