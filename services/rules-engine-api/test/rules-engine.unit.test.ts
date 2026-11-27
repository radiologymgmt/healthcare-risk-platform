import { describe, expect, it } from "vitest";
import { SEED_CLINICAL_RULES } from "@healthcare/database";
import { computeDerivedMetrics } from "../src/derived-metrics.js";
import { evaluateClinicalRules, type ClinicalRuleRecord } from "../src/evaluator.js";

const REF_DATE = new Date("2026-06-01T00:00:00Z");

const ALL_54_RULES: ClinicalRuleRecord[] = SEED_CLINICAL_RULES.map((r) => ({
  ...r,
  version: 1,
}));

function triggeredCodes(outcome: ReturnType<typeof evaluateClinicalRules>): string[] {
  return outcome.triggered_pathways.map((p) => p.rule_code);
}

describe("Rules Engine Unit Tests (Synthetic Patient Profiles)", () => {
  it("Profile 1: Healthy 32yo synthetic adult triggers zero clinical pathways", () => {
    const outcome = evaluateClinicalRules(
      { dob: "1994-03-10", sex_at_birth: "Female" },
      {
        height_cm: 165,
        weight_kg: 60,
        smoking_status: "never",
        has_personal_breast_cancer: false,
        has_atrial_fibrillation: false,
        is_planning_pregnancy: false,
        has_headaches: false,
      },
      ALL_54_RULES,
      REF_DATE,
    );

    expect(outcome.evaluated_rule_count).toBe(54);
    expect(outcome.triggered_pathways).toHaveLength(0);
    expect(outcome.highest_acuity).toBeNull();
    expect(outcome.workqueue_priority).toBeNull();
    expect(outcome.derived_metrics.age).toBe(32);
    expect(outcome.derived_metrics.bmi).toBeCloseTo(22.039, 2);
  });

  it("Profile 2: 66yo male heavy smoker with COPD triggers USPSTF_LUNG, PLCOM2012, BACH_MODEL, SVS_AAA", () => {
    const outcome = evaluateClinicalRules(
      { dob: "1960-01-15", sex_at_birth: "Male" },
      {
        height_cm: 178,
        weight_kg: 76,
        smoking_status: "current",
        pack_years: 32,
        copd_history: true,
        asbestos_exposure_years: 6,
      },
      ALL_54_RULES,
      REF_DATE,
    );

    const codes = triggeredCodes(outcome);
    expect(codes).toContain("USPSTF_LUNG");
    expect(codes).toContain("PLCOM2012");
    expect(codes).toContain("BACH_MODEL");
    expect(codes).toContain("SVS_AAA");

    const uspstf = outcome.triggered_pathways.find((p) => p.rule_code === "USPSTF_LUNG")!;
    expect(uspstf.cpt_codes).toContain("71271");
    expect(uspstf.icd10_codes).toContain("Z87.891");
    expect(outcome.workqueue_priority).toBe("HIGH");
  });

  it("Profile 3: 42yo Ashkenazi female with pedigree_array triggers Tyrer-Cuzick, CanRisk, Gail, BRCAPRO", () => {
    const outcome = evaluateClinicalRules(
      { dob: "1984-05-01", sex_at_birth: "Female" },
      {
        ethnicity_ancestry: "ashkenazi_jewish",
        has_personal_breast_cancer: false,
        breast_density_birads: "D",
        breast_biopsy_count: 2,
        age_at_menarche: 11,
        age_at_first_live_birth: 0,
        family_cancer_pedigree: [
          { relation: "mother", degree: 1, cancer_type: "Breast Cancer", age_at_diagnosis: 44 },
          { relation: "sister", degree: 1, cancer_type: "Breast Cancer", age_at_diagnosis: 47 },
          { relation: "sister", degree: 1, cancer_type: "Ovarian Cancer", age_at_diagnosis: 48 },
        ],
      },
      ALL_54_RULES,
      REF_DATE,
    );

    const codes = triggeredCodes(outcome);
    expect(codes).toContain("TYRER_CUZICK");
    expect(codes).toContain("BOADICEA_CANRISK");
    expect(codes).toContain("GAIL_BCRAT");
    expect(codes).toContain("BRCAPRO");
    expect(codes).toContain("CLAUS_MODEL");

    const tc = outcome.triggered_pathways.find((p) => p.rule_code === "TYRER_CUZICK")!;
    expect(tc.calculated_score).toBeGreaterThanOrEqual(20);
    expect(tc.cpt_codes).toContain("77049");
  });

  it("Profile 4: STAT Acute Red Flags (SNNOOP10, ADD_RS, ABCD2, WELLS_DVT_PE, GENEVA_PE) sort FIRST and set STAT priority", () => {
    const outcome = evaluateClinicalRules(
      { dob: "1958-02-20", sex_at_birth: "Male" },
      {
        has_thunderclap_headache: true,
        has_acute_tearing_chest_back_pain: true,
        has_high_risk_aortic_condition: true,
        has_transient_neuro_symptoms: true,
        tia_unilateral_weakness: true,
        tia_duration_minutes: 75,
        systolic_bp_mmhg: 168,
        has_diabetes: true,
        has_acute_leg_swelling_or_dyspnea: true,
        has_clinical_signs_dvt: true,
        has_prior_dvt_or_pe: true,
        heart_rate_bpm: 112,
      },
      ALL_54_RULES,
      REF_DATE,
    );

    const codes = triggeredCodes(outcome);
    expect(codes).toContain("SNNOOP10");
    expect(codes).toContain("ADD_RS");
    expect(codes).toContain("ABCD2_STROKE");
    expect(codes).toContain("WELLS_DVT_PE");
    expect(codes).toContain("GENEVA_PE");
    expect(outcome.highest_acuity).toBe("ACUTE_RED_FLAG");
    expect(outcome.workqueue_priority).toBe("STAT");
    // Every ACUTE_RED_FLAG pathway must precede non-acute pathways
    expect(outcome.triggered_pathways[0]!.acuity_level).toBe("ACUTE_RED_FLAG");
  });

  it("Profile 5: EHR Hepatology labs accurately compute FIB-4, APRI, NAFLD NFS & trigger AASLD HCC", () => {
    const answers = {
      height_cm: 170,
      weight_kg: 96, // BMI ~33.2
      has_diabetes: true,
      lab_ast_u_l: 95,
      lab_alt_u_l: 52,
      lab_platelets_10e9_l: 115,
      lab_albumin_g_dl: 3.2,
      has_chronic_hbv_or_cirrhosis: true,
    };
    const patient = { dob: "1964-01-01", sex_at_birth: "Male" as const };
    const derived = computeDerivedMetrics(patient, answers, REF_DATE);

    // FIB-4 = (62 * 95) / (115 * sqrt(52)) = 5890 / 829.277 = ~7.103
    expect(derived.fib4_score).toBeCloseTo(7.103, 2);
    // APRI = ((95/40) / 115) * 100 = 2.065
    expect(derived.apri_score).toBeCloseTo(2.065, 2);
    // NFS > 0.676
    expect(derived.nfs_score!).toBeGreaterThan(0.676);

    const outcome = evaluateClinicalRules(patient, answers, ALL_54_RULES, REF_DATE);
    const codes = triggeredCodes(outcome);
    expect(codes).toContain("FIB4");
    expect(codes).toContain("APRI");
    expect(codes).toContain("NAFLD_NFS");
    expect(codes).toContain("AASLD_HCC");
  });

  it("Profile 6: AFib + Cardiometabolic + Sleep Apnea profile triggers CHA2DS2-VASc, HAS-BLED, AHA PREVENT, MESA CAC, STOP-BANG", () => {
    const outcome = evaluateClinicalRules(
      { dob: "1954-04-10", sex_at_birth: "Male" },
      {
        height_cm: 175,
        weight_kg: 112,
        has_atrial_fibrillation: true,
        has_hypertension: true,
        systolic_bp_mmhg: 164,
        has_diabetes: true,
        has_prior_stroke_or_tia: true,
        has_prior_major_bleeding: true,
        uses_nsaid_or_antiplatelet: true,
        coronary_calcium_agatston_score: 240,
        lab_total_cholesterol_mg_dl: 250,
        lab_hdl_mg_dl: 36,
        lab_egfr_ml_min: 52,
        snoring_loud: true,
        daytime_fatigue_tired: true,
        observed_apnea: true,
        neck_circumference_over_40cm: true,
      },
      ALL_54_RULES,
      REF_DATE,
    );

    const codes = triggeredCodes(outcome);
    expect(codes).toContain("CHA2DS2_VASC");
    expect(codes).toContain("HAS_BLED");
    expect(codes).toContain("AHA_PREVENT");
    expect(codes).toContain("MESA_CAC");
    expect(codes).toContain("STOP_BANG");
  });

  it("All 54 clinical rules are reachable and trigger cleanly across synthetic profiles", () => {
    const syntheticProfiles: Array<{
      patient: { dob: string; sex_at_birth: "Female" | "Male" };
      answers: Record<string, unknown>;
    }> = [
      // Comprehensive high-risk Female profile
      {
        patient: { dob: "1960-01-01", sex_at_birth: "Female" },
        answers: {
          height_cm: 162,
          weight_kg: 52,
          ethnicity_ancestry: "ashkenazi_jewish",
          smoking_status: "current",
          pack_years: 35,
          asbestos_exposure_years: 10,
          copd_history: true,
          alcohol_drinks_per_week: 12,
          has_thunderclap_headache: true,
          has_acute_tearing_chest_back_pain: true,
          has_high_risk_aortic_condition: true,
          has_transient_neuro_symptoms: true,
          tia_unilateral_weakness: true,
          tia_duration_minutes: 65,
          systolic_bp_mmhg: 168,
          has_diabetes: true,
          has_acute_leg_swelling_or_dyspnea: true,
          has_clinical_signs_dvt: true,
          has_prior_dvt_or_pe: true,
          heart_rate_bpm: 110,
          has_personal_breast_cancer: false,
          has_atypical_hyperplasia_or_lcis: true,
          known_brca_or_lynch_family_mutation: true,
          first_degree_breast_cancer_count: 2,
          first_degree_ovarian_cancer_count: 1,
          youngest_family_breast_cancer_age: 42,
          breast_biopsy_count: 2,
          age_at_menarche: 11,
          age_at_first_live_birth: 0,
          breast_density_birads: "D",
          has_personal_colorectal_cancer: true,
          personal_crc_age: 44,
          has_personal_endometrial_cancer: true,
          first_degree_crc_count: 2,
          family_cancer_generations_affected: 2,
          youngest_family_crc_age: 45,
          tumor_msi_high_or_ihc_loss: true,
          colon_polyp_lifetime_count: 15,
          has_personal_gastric_cancer: true,
          first_degree_gastric_cancer_count: 2,
          has_personal_pancreatic_cancer: true,
          first_degree_pancreatic_cancer_count: 2,
          has_personal_melanoma_or_mesothelioma: true,
          has_personal_renal_cancer_or_leiomyoma: true,
          has_endocrine_tumors_pituitary_parathyroid_medullary_thyroid: true,
          has_macrocephaly_or_mucocutaneous_lesions: true,
          has_neurofibromas_cafe_au_lait_or_tuberous_sclerosis: true,
          is_planning_pregnancy: true,
          pfdi20_total_score: 95,
          has_oligo_anovulation: true,
          has_hyperandrogenism_signs: true,
          ultrasound_polycystic_ovaries: true,
          is_postmenopausal: true,
          has_adnexal_mass: true,
          lab_ca125_u_ml: 180,
          lab_he4_pmol_l: 220,
          has_atrial_fibrillation: true,
          has_hypertension: true,
          has_prior_stroke_or_tia: true,
          has_prior_major_bleeding: true,
          has_hcm_diagnosis_or_family_scd: true,
          has_unexplained_syncope: true,
          has_exertional_calf_pain_relieved_by_rest: true,
          has_family_history_aaa: true,
          coronary_calcium_agatston_score: 320,
          has_headaches: true,
          hit6_total_score: 64,
          cognitive_moca_score: 21,
          has_family_huntingtons_or_ataxia: true,
          snoring_loud: true,
          daytime_fatigue_tired: true,
          observed_apnea: true,
          has_prior_fragility_fracture: true,
          dexa_femoral_neck_t_score: -2.8,
          fall_count_past_12_months: 3,
          koos_hoos_symptom_score: 45,
          isth_bat_bleeding_score: 8,
          lab_ast_u_l: 105,
          lab_alt_u_l: 48,
          lab_platelets_10e9_l: 105,
          lab_albumin_g_dl: 3.1,
          has_chronic_hbv_or_cirrhosis: true,
        },
      },
      // Comprehensive high-risk Male urology + NAFLD NFS (higher BMI) profile
      {
        patient: { dob: "1958-01-01", sex_at_birth: "Male" },
        answers: {
          height_cm: 175,
          weight_kg: 110,
          has_diabetes: true,
          has_prostate_cancer_family_history: true,
          ipss_symptom_score: 18,
          shim_erectile_score: 12,
          dre_abnormal: true,
          lab_psa_ng_ml: 5.2,
          lab_ast_u_l: 95,
          lab_alt_u_l: 50,
          lab_platelets_10e9_l: 110,
          lab_albumin_g_dl: 3.0,
        },
      },
    ];

    const allTriggered = new Set<string>();
    for (const profile of syntheticProfiles) {
      const res = evaluateClinicalRules(
        profile.patient,
        profile.answers,
        ALL_54_RULES,
        REF_DATE,
      );
      for (const p of res.triggered_pathways) {
        allTriggered.add(p.rule_code);
      }
    }

    const untriggered = ALL_54_RULES.map((r) => r.rule_code).filter(
      (code) => !allTriggered.has(code),
    );
    expect(untriggered).toEqual([]);
    expect(allTriggered.size).toBe(54);
  });
});
