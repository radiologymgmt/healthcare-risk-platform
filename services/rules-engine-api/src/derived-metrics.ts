import type { SexAtBirth } from "@healthcare/shared-contracts";

export interface PatientDemographics {
  dob: string | Date;
  sex_at_birth: SexAtBirth | string | null;
}

export interface PedigreeEntry {
  relation?: string;
  degree?: number;
  cancer_type?: string;
  age_at_diagnosis?: number;
}

export type AnswerMap = Record<string, unknown>;

export interface DerivedMetrics {
  age: number;
  bmi: number | null;
  fib4_score: number | null;
  apri_score: number | null;
  nfs_score: number | null;
  osta_score: number | null;
  cha2ds2_vasc_score: number;
  has_bled_score: number;
  stop_bang_score: number;
  abcd2_score: number;
  add_rs_score: number;
  wells_dvt_pe_score: number;
  geneva_pe_score: number;
  roma_score: number | null;
  rotterdam_criteria_count: number;
  ipss_score: number | null;
  shim_score: number | null;
  pfdi20_score: number | null;
  hit6_score: number | null;
  isth_bat_score: number | null;
  tyrer_cuzick_lifetime_risk: number;
  canrisk_lifetime_risk: number;
  gail_5yr_risk: number;
  premm5_score: number;
  plcom2012_6yr_risk: number;
  aha_prevent_10yr_risk: number;
  frax_major_risk: number;
  mesa_cac_score: number | null;
  [key: string]: number | boolean | null;
}

function num(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bool(val: unknown): boolean {
  return val === true || val === "true" || val === 1;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function calculateAgeYears(dob: string | Date, referenceDate: Date = new Date()): number {
  const birth = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(birth.getTime())) {
    throw new Error("Invalid patient date of birth");
  }
  let age = referenceDate.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = referenceDate.getUTCMonth() - birth.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && referenceDate.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }
  return Math.max(0, age);
}

/**
 * Normalizes optional structured pedigree_array entries into scalar summary counts
 * when explicit counts were not separately provided.
 */
export function enrichAnswersFromPedigree(answers: AnswerMap): AnswerMap {
  const enriched: AnswerMap = { ...answers };
  const pedigree = answers.family_cancer_pedigree;
  if (!Array.isArray(pedigree)) return enriched;

  let firstDegBreast = 0;
  let firstDegOvarian = 0;
  let firstDegCrc = 0;
  let firstDegPancreatic = 0;
  let firstDegGastric = 0;
  let youngestBreast: number | null = null;
  let youngestCrc: number | null = null;

  for (const raw of pedigree) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as PedigreeEntry;
    const cancer = (entry.cancer_type ?? "").toLowerCase();
    const relation = (entry.relation ?? "").toLowerCase();
    const isFirstDegree =
      entry.degree === 1 ||
      ["mother", "father", "sister", "brother", "daughter", "son", "parent", "sibling"].includes(
        relation,
      );
    const diagAge = num(entry.age_at_diagnosis);

    if (cancer.includes("breast")) {
      if (isFirstDegree) firstDegBreast += 1;
      if (diagAge !== null && (youngestBreast === null || diagAge < youngestBreast)) {
        youngestBreast = diagAge;
      }
    }
    if (cancer.includes("ovarian") && isFirstDegree) {
      firstDegOvarian += 1;
    }
    if (cancer.includes("colon") || cancer.includes("colorectal") || cancer.includes("endometrial")) {
      if (isFirstDegree) firstDegCrc += 1;
      if (diagAge !== null && (youngestCrc === null || diagAge < youngestCrc)) {
        youngestCrc = diagAge;
      }
    }
    if (cancer.includes("pancrea") && isFirstDegree) {
      firstDegPancreatic += 1;
    }
    if (cancer.includes("gastric") || cancer.includes("stomach")) {
      firstDegGastric += 1;
    }
  }

  if (num(enriched.first_degree_breast_cancer_count) === null && firstDegBreast > 0) {
    enriched.first_degree_breast_cancer_count = firstDegBreast;
  }
  if (num(enriched.first_degree_ovarian_cancer_count) === null && firstDegOvarian > 0) {
    enriched.first_degree_ovarian_cancer_count = firstDegOvarian;
  }
  if (num(enriched.first_degree_crc_count) === null && firstDegCrc > 0) {
    enriched.first_degree_crc_count = firstDegCrc;
  }
  if (num(enriched.first_degree_pancreatic_cancer_count) === null && firstDegPancreatic > 0) {
    enriched.first_degree_pancreatic_cancer_count = firstDegPancreatic;
  }
  if (num(enriched.first_degree_gastric_cancer_count) === null && firstDegGastric > 0) {
    enriched.first_degree_gastric_cancer_count = firstDegGastric;
  }
  if (num(enriched.youngest_family_breast_cancer_age) === null && youngestBreast !== null) {
    enriched.youngest_family_breast_cancer_age = youngestBreast;
  }
  if (num(enriched.youngest_family_crc_age) === null && youngestCrc !== null) {
    enriched.youngest_family_crc_age = youngestCrc;
  }

  return enriched;
}

/**
 * Computes all derived clinical calculator metrics used by the 54 JsonLogic rules.
 */
export function computeDerivedMetrics(
  patient: PatientDemographics,
  answers: AnswerMap,
  referenceDate: Date = new Date(),
): DerivedMetrics {
  const age = calculateAgeYears(patient.dob, referenceDate);
  const sex = patient.sex_at_birth ?? "Unknown";
  const isFemale = sex === "Female";
  const isMale = sex === "Male";

  const heightInches = num(answers.height_inches);
  const heightCm =
    num(answers.height_cm) ?? (heightInches !== null && heightInches > 0 ? round3(heightInches * 2.54) : null);
  const weightLbs = num(answers.weight_lbs);
  const weightKg =
    num(answers.weight_kg) ?? (weightLbs !== null && weightLbs > 0 ? round3(weightLbs * 0.45359237) : null);
  const bmi =
    heightCm !== null && heightCm > 0 && weightKg !== null && weightKg > 0
      ? round3(weightKg / Math.pow(heightCm / 100, 2))
      : null;

  // --- Hepatology Scores (FIB-4, APRI, NAFLD NFS) ---
  const ast = num(answers.lab_ast_u_l);
  const alt = num(answers.lab_alt_u_l);
  const platelets = num(answers.lab_platelets_10e9_l);
  const albumin = num(answers.lab_albumin_g_dl);

  const fib4_score =
    ast !== null && alt !== null && alt > 0 && platelets !== null && platelets > 0
      ? round3((age * ast) / (platelets * Math.sqrt(alt)))
      : null;

  const apri_score =
    ast !== null && platelets !== null && platelets > 0
      ? round3(((ast / 40) / platelets) * 100)
      : null;

  const nfs_score =
    ast !== null &&
    alt !== null &&
    alt > 0 &&
    platelets !== null &&
    albumin !== null &&
    bmi !== null
      ? round3(
          -1.675 +
            0.037 * age +
            0.094 * bmi +
            1.13 * (bool(answers.has_diabetes) ? 1 : 0) +
            0.99 * (ast / alt) -
            0.013 * platelets -
            0.66 * albumin,
        )
      : null;

  // --- Bone: OSTA ---
  const osta_score = weightKg !== null ? round3(0.2 * (weightKg - age)) : null;

  // --- Cardiology: CHA2DS2-VASc ---
  let cha2ds2_vasc_score = 0;
  if (bool(answers.has_heart_failure)) cha2ds2_vasc_score += 1;
  if (bool(answers.has_hypertension)) cha2ds2_vasc_score += 1;
  if (age >= 75) cha2ds2_vasc_score += 2;
  else if (age >= 65) cha2ds2_vasc_score += 1;
  if (bool(answers.has_diabetes)) cha2ds2_vasc_score += 1;
  if (bool(answers.has_prior_stroke_or_tia)) cha2ds2_vasc_score += 2;
  if (bool(answers.has_vascular_disease)) cha2ds2_vasc_score += 1;
  if (isFemale) cha2ds2_vasc_score += 1;

  // --- Cardiology: HAS-BLED ---
  const sbp = num(answers.systolic_bp_mmhg);
  const alcoholDrinks = num(answers.alcohol_drinks_per_week) ?? 0;
  let has_bled_score = 0;
  if ((sbp !== null && sbp > 160) || bool(answers.has_hypertension)) has_bled_score += 1;
  if (bool(answers.has_abnormal_renal_or_liver_function)) has_bled_score += 1;
  if (bool(answers.has_prior_stroke_or_tia)) has_bled_score += 1;
  if (bool(answers.has_prior_major_bleeding)) has_bled_score += 1;
  if (bool(answers.has_labile_inr)) has_bled_score += 1;
  if (age > 65) has_bled_score += 1;
  if (bool(answers.uses_nsaid_or_antiplatelet)) has_bled_score += 1;
  if (alcoholDrinks >= 8) has_bled_score += 1;

  // --- Sleep: STOP-BANG ---
  let stop_bang_score = 0;
  if (bool(answers.snoring_loud)) stop_bang_score += 1;
  if (bool(answers.daytime_fatigue_tired)) stop_bang_score += 1;
  if (bool(answers.observed_apnea)) stop_bang_score += 1;
  if (bool(answers.has_hypertension)) stop_bang_score += 1;
  if (bmi !== null && bmi > 35) stop_bang_score += 1;
  if (age > 50) stop_bang_score += 1;
  if (bool(answers.neck_circumference_over_40cm)) stop_bang_score += 1;
  if (isMale) stop_bang_score += 1;

  // --- Acute Neurology: ABCD2 ---
  const tiaDuration = num(answers.tia_duration_minutes) ?? 0;
  let abcd2_score = 0;
  if (age >= 60) abcd2_score += 1;
  if (sbp !== null && sbp >= 140) abcd2_score += 1;
  if (bool(answers.tia_unilateral_weakness)) abcd2_score += 2;
  else if (bool(answers.tia_speech_impairment_without_weakness)) abcd2_score += 1;
  if (tiaDuration >= 60) abcd2_score += 2;
  else if (tiaDuration >= 10) abcd2_score += 1;
  if (bool(answers.has_diabetes)) abcd2_score += 1;

  // --- Acute Cardiology: ADD-RS ---
  let add_rs_score = 0;
  if (bool(answers.has_high_risk_aortic_condition)) add_rs_score += 1;
  if (bool(answers.has_acute_tearing_chest_back_pain)) add_rs_score += 1;
  if (bool(answers.has_aortic_exam_deficit)) add_rs_score += 1;

  // --- Acute Hematology: Wells DVT/PE & Revised Geneva PE ---
  const hr = num(answers.heart_rate_bpm);
  let wells_dvt_pe_score = 0;
  if (bool(answers.has_clinical_signs_dvt)) wells_dvt_pe_score += 3;
  if (hr !== null && hr > 100) wells_dvt_pe_score += 1.5;
  if (bool(answers.has_recent_immobilization_or_surgery)) wells_dvt_pe_score += 1.5;
  if (bool(answers.has_prior_dvt_or_pe)) wells_dvt_pe_score += 1.5;
  if (bool(answers.has_hemoptysis)) wells_dvt_pe_score += 1;
  if (bool(answers.has_active_cancer)) wells_dvt_pe_score += 1;

  let geneva_pe_score = 0;
  if (age > 65) geneva_pe_score += 1;
  if (bool(answers.has_prior_dvt_or_pe)) geneva_pe_score += 3;
  if (bool(answers.has_recent_immobilization_or_surgery)) geneva_pe_score += 2;
  if (bool(answers.has_active_cancer)) geneva_pe_score += 2;
  if (bool(answers.has_clinical_signs_dvt)) geneva_pe_score += 4;
  if (bool(answers.has_hemoptysis)) geneva_pe_score += 2;
  if (hr !== null && hr >= 95) geneva_pe_score += 5;
  else if (hr !== null && hr >= 75) geneva_pe_score += 3;

  // --- OBGYN: ROMA (Moore et al. logistic equation) ---
  const ca125 = num(answers.lab_ca125_u_ml);
  const he4 = num(answers.lab_he4_pmol_l);
  let roma_score: number | null = null;
  if (ca125 !== null && ca125 > 0 && he4 !== null && he4 > 0) {
    const postMeno = bool(answers.is_postmenopausal);
    const pi = postMeno
      ? -8.09 + 1.04 * Math.log(he4) + 0.732 * Math.log(ca125)
      : -12.0 + 2.38 * Math.log(he4) + 0.0626 * Math.log(ca125);
    roma_score = round3((Math.exp(pi) / (1 + Math.exp(pi))) * 100);
  }

  // --- OBGYN: Rotterdam PCOS count ---
  let rotterdam_criteria_count = 0;
  if (bool(answers.has_oligo_anovulation)) rotterdam_criteria_count += 1;
  if (bool(answers.has_hyperandrogenism_signs)) rotterdam_criteria_count += 1;
  if (bool(answers.ultrasound_polycystic_ovaries)) rotterdam_criteria_count += 1;

  // --- Oncology Risk Estimators (Tyrer-Cuzick, CanRisk, Gail, PREMM5, PLCOm2012) ---
  const fdBreast = num(answers.first_degree_breast_cancer_count) ?? 0;
  const fdOvarian = num(answers.first_degree_ovarian_cancer_count) ?? 0;
  const fdCrc = num(answers.first_degree_crc_count) ?? 0;
  const biopsies = num(answers.breast_biopsy_count) ?? 0;
  const menarche = num(answers.age_at_menarche);
  const firstBirth = num(answers.age_at_first_live_birth);
  const birads = typeof answers.breast_density_birads === "string" ? answers.breast_density_birads : null;
  const youngestBreastAge = num(answers.youngest_family_breast_cancer_age);

  let tyrer_cuzick_lifetime_risk = isFemale ? 11.5 : 0;
  if (isFemale) {
    tyrer_cuzick_lifetime_risk += fdBreast * 7.5;
    tyrer_cuzick_lifetime_risk += fdOvarian * 5.0;
    if (youngestBreastAge !== null && youngestBreastAge < 50) tyrer_cuzick_lifetime_risk += 5.0;
    if (bool(answers.has_atypical_hyperplasia_or_lcis)) tyrer_cuzick_lifetime_risk += 14.0;
    if (birads === "D") tyrer_cuzick_lifetime_risk += 5.5;
    else if (birads === "C") tyrer_cuzick_lifetime_risk += 2.5;
    if (menarche !== null && menarche < 12) tyrer_cuzick_lifetime_risk += 1.5;
    if (firstBirth !== null && (firstBirth === 0 || firstBirth >= 30)) tyrer_cuzick_lifetime_risk += 2.0;
    if (biopsies >= 2) tyrer_cuzick_lifetime_risk += 2.5;
    tyrer_cuzick_lifetime_risk = round3(Math.min(85, tyrer_cuzick_lifetime_risk));
  }

  let canrisk_lifetime_risk = tyrer_cuzick_lifetime_risk;
  if (isFemale && answers.ethnicity_ancestry === "ashkenazi_jewish" && (fdBreast > 0 || fdOvarian > 0)) {
    canrisk_lifetime_risk = round3(Math.min(85, canrisk_lifetime_risk + 8.0));
  }

  let gail_5yr_risk = 0;
  if (isFemale && age >= 35) {
    let baseline = age >= 60 ? 1.5 : age >= 50 ? 1.1 : age >= 40 ? 0.7 : 0.4;
    let rr = 1.0;
    if (menarche !== null && menarche < 12) rr *= 1.21;
    if (biopsies === 1) rr *= 1.27;
    else if (biopsies >= 2) rr *= 1.62;
    if (bool(answers.has_atypical_hyperplasia_or_lcis)) rr *= 1.82;
    if (fdBreast === 1) rr *= 2.1;
    else if (fdBreast >= 2) rr *= 3.8;
    if (firstBirth !== null && (firstBirth === 0 || firstBirth >= 30)) rr *= 1.35;
    gail_5yr_risk = round3(baseline * rr);
  }

  let premm5_score = 0.5;
  if (bool(answers.has_personal_colorectal_cancer)) {
    const crcAge = num(answers.personal_crc_age) ?? age;
    premm5_score += crcAge < 50 ? 6.5 : 2.2;
  }
  if (bool(answers.has_personal_endometrial_cancer)) premm5_score += 2.5;
  premm5_score += fdCrc * 1.8;
  const youngestCrcAge = num(answers.youngest_family_crc_age);
  if (youngestCrcAge !== null && youngestCrcAge < 50 && fdCrc > 0) premm5_score += 2.0;
  premm5_score = round3(Math.min(99, premm5_score));

  const packYears = num(answers.pack_years) ?? 0;
  const quitYears = num(answers.years_since_quit_smoking) ?? 0;
  const smokingStatus = typeof answers.smoking_status === "string" ? answers.smoking_status : "never";
  let plcom2012_6yr_risk = 0;
  if (smokingStatus === "current" || smokingStatus === "former") {
    let risk = 0.25;
    if (age >= 55) risk += (age - 54) * 0.08;
    risk += packYears * 0.04;
    if (smokingStatus === "current") risk += 0.55;
    else risk = Math.max(0.1, risk - quitYears * 0.05);
    if (bool(answers.copd_history)) risk += 0.85;
    if (bmi !== null && bmi < 25) risk += 0.2;
    plcom2012_6yr_risk = round3(Math.min(40, risk));
  }

  // --- Cardiology: AHA PREVENT 10-yr ASCVD & MESA CAC ---
  const totalChol = num(answers.lab_total_cholesterol_mg_dl);
  const hdl = num(answers.lab_hdl_mg_dl);
  const egfr = num(answers.lab_egfr_ml_min);
  const cac = num(answers.coronary_calcium_agatston_score);

  let aha_prevent_10yr_risk = 0;
  if (age >= 30) {
    let score = Math.max(0.5, (age - 30) * 0.22);
    if (isMale) score += 1.5;
    if (bool(answers.has_hypertension) || (sbp !== null && sbp >= 130)) {
      score += sbp !== null && sbp >= 150 ? 3.5 : 2.0;
    }
    if (bool(answers.has_diabetes)) score += 3.5;
    if (smokingStatus === "current") score += 3.0;
    if (totalChol !== null && totalChol >= 240) score += 2.0;
    if (hdl !== null && hdl < 40) score += 1.5;
    if (egfr !== null && egfr < 60) score += 2.5;
    aha_prevent_10yr_risk = round3(Math.min(60, score));
  }

  const mesa_cac_score =
    cac !== null
      ? round3(
          Math.min(
            50,
            aha_prevent_10yr_risk * (cac === 0 ? 0.5 : cac < 100 ? 1.0 : cac < 300 ? 1.8 : 2.5) +
              (cac >= 100 ? 2.5 : 0),
          ),
        )
      : null;

  // --- Bone: FRAX 10-year major osteoporotic fracture risk ---
  const tScore = num(answers.dexa_femoral_neck_t_score);
  let frax_major_risk = 0;
  if (age >= 40) {
    let risk = Math.max(1.5, (age - 40) * 0.35);
    if (isFemale) risk += 3.0;
    if (bool(answers.has_prior_fragility_fracture)) risk += 8.0;
    if (bool(answers.parent_hip_fracture_history)) risk += 4.5;
    if (bool(answers.uses_long_term_glucocorticoids)) risk += 5.0;
    if (bool(answers.has_rheumatoid_arthritis)) risk += 3.5;
    if (smokingStatus === "current") risk += 2.0;
    if (alcoholDrinks >= 21) risk += 2.5;
    if (tScore !== null && tScore <= -2.5) risk += 10.0;
    else if (tScore !== null && tScore <= -1.5) risk += 4.0;
    frax_major_risk = round3(Math.min(75, risk));
  }

  return {
    age,
    bmi,
    fib4_score,
    apri_score,
    nfs_score,
    osta_score,
    cha2ds2_vasc_score,
    has_bled_score,
    stop_bang_score,
    abcd2_score,
    add_rs_score,
    wells_dvt_pe_score,
    geneva_pe_score,
    roma_score,
    rotterdam_criteria_count,
    ipss_score: num(answers.ipss_symptom_score),
    shim_score: num(answers.shim_erectile_score),
    pfdi20_score: num(answers.pfdi20_total_score),
    hit6_score: num(answers.hit6_total_score),
    isth_bat_score: num(answers.isth_bat_bleeding_score),
    tyrer_cuzick_lifetime_risk,
    canrisk_lifetime_risk,
    gail_5yr_risk,
    premm5_score,
    plcom2012_6yr_risk,
    aha_prevent_10yr_risk,
    frax_major_risk,
    mesa_cac_score,
  };
}
