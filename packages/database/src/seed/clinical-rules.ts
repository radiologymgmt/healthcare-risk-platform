import type { AcuityLevel, RuleSpecialty, RuleType } from "@healthcare/shared-contracts";

export interface SeedClinicalRule {
  rule_code: string;
  display_name: string;
  specialty: RuleSpecialty;
  rule_type: RuleType;
  acuity_level: AcuityLevel;
  logic_expression: Record<string, unknown>;
  recommended_intervention: string;
  cpt_codes: string[];
  icd10_codes: string[];
  prior_auth_rationale_template: string;
}

/**
 * All 54 Clinical Rules from SPEC.md Section 4 encoded as JsonLogic expressions.
 * - 35 Patient-Reported / Gateway-Triggered Tools
 * - 19 EHR / Lab / Clinical-Note Derived Tools
 */
export const SEED_CLINICAL_RULES: readonly SeedClinicalRule[] = [
  // =========================================================================
  // PART A: 35 PATIENT-REPORTED / GATEWAY-TRIGGERED TOOLS
  // =========================================================================

  // --- Oncology & Genetics (14) ---
  {
    rule_code: "TYRER_CUZICK",
    display_name: "Tyrer-Cuzick (IBIS) Breast Cancer Risk",
    specialty: "Oncology",
    rule_type: "HYBRID",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
        {
          or: [
            { ">=": [{ var: "derived.tyrer_cuzick_lifetime_risk" }, 20] },
            { "==": [{ var: "answers.has_atypical_hyperplasia_or_lcis" }, true] },
            { "==": [{ var: "answers.known_brca_or_lynch_family_mutation" }, true] },
          ],
        },
      ],
    },
    recommended_intervention: "Annual High-Risk Breast MRI with & without contrast + Mammogram + Genetic Counseling",
    cpt_codes: ["77049", "96040"],
    icd10_codes: ["Z15.01", "Z80.3"],
    prior_auth_rationale_template:
      "Patient meets NCCN/ACS high-risk breast cancer threshold (Tyrer-Cuzick lifetime risk >= 20% or high-risk lesion); supplemental breast MRI (CPT 77049) is medically necessary.",
  },
  {
    rule_code: "BOADICEA_CANRISK",
    display_name: "BOADICEA / CanRisk Breast & Ovarian Risk",
    specialty: "Oncology",
    rule_type: "HYBRID",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
        {
          or: [
            { ">=": [{ var: "derived.canrisk_lifetime_risk" }, 20] },
            {
              and: [
                { ">=": [{ var: "answers.first_degree_breast_cancer_count" }, 1] },
                { ">=": [{ var: "answers.first_degree_ovarian_cancer_count" }, 1] },
              ],
            },
            {
              and: [
                { "==": [{ var: "answers.ethnicity_ancestry" }, "ashkenazi_jewish"] },
                {
                  or: [
                    { "==": [{ var: "answers.has_personal_breast_cancer" }, true] },
                    { ">=": [{ var: "answers.first_degree_breast_cancer_count" }, 1] },
                    { ">=": [{ var: "answers.first_degree_ovarian_cancer_count" }, 1] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    recommended_intervention: "Hereditary Breast/Ovarian Multi-Gene Panel (BRCA1/2, PALB2, CHEK2, ATM) + High-Risk Breast Clinic",
    cpt_codes: ["81432", "96040"],
    icd10_codes: ["Z15.01", "Z80.41"],
    prior_auth_rationale_template:
      "BOADICEA/CanRisk pedigree and ancestry profile exceeds NCCN hereditary breast/ovarian testing criteria; multi-gene panel (CPT 81432) recommended.",
  },
  {
    rule_code: "GAIL_BCRAT",
    display_name: "Gail Model (BCRAT) 5-Year Breast Cancer Risk",
    specialty: "Oncology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
        { ">=": [{ var: "derived.age" }, 35] },
        { "==": [{ var: "answers.has_personal_breast_cancer" }, false] },
        { ">=": [{ var: "derived.gail_5yr_risk" }, 1.67] },
      ],
    },
    recommended_intervention: "Breast Oncology Chemoprevention Consultation & Risk-Reduction Counseling",
    cpt_codes: ["99244"],
    icd10_codes: ["Z80.3", "N60.99"],
    prior_auth_rationale_template:
      "Gail (BCRAT) 5-year invasive breast cancer risk >= 1.67% qualifies patient for USPSTF/ASCO risk-reducing medication evaluation.",
  },
  {
    rule_code: "PREMM5",
    display_name: "PREMM5 Lynch Syndrome Risk Model",
    specialty: "Oncology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        { ">=": [{ var: "derived.premm5_score" }, 2.5] },
        {
          and: [
            { "==": [{ var: "answers.has_personal_colorectal_cancer" }, true] },
            { "<": [{ var: "answers.personal_crc_age" }, 50] },
          ],
        },
        {
          and: [
            { "==": [{ var: "answers.has_personal_endometrial_cancer" }, true] },
            { ">=": [{ var: "answers.first_degree_crc_count" }, 1] },
          ],
        },
      ],
    },
    recommended_intervention: "Lynch Syndrome Germline Genetic Testing (MLH1/MSH2/MSH6/PMS2/EPCAM) + High-Risk GI Referral",
    cpt_codes: ["81435", "96040"],
    icd10_codes: ["Z15.09", "Z80.0"],
    prior_auth_rationale_template:
      "PREMM5 predicted probability >= 2.5% meets NCCN criteria for Lynch syndrome hereditary colorectal cancer panel (CPT 81435).",
  },
  {
    rule_code: "FAP_MAP_CRITERIA",
    display_name: "FAP / MAP Hereditary Polyposis Criteria",
    specialty: "Oncology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      ">=": [{ var: "answers.colon_polyp_lifetime_count" }, 10],
    },
    recommended_intervention: "APC & MUTYH Polyposis Genetic Panel + Annual Surveillance Colonoscopy",
    cpt_codes: ["81435", "45378"],
    icd10_codes: ["D12.6", "Z83.71"],
    prior_auth_rationale_template:
      "Patient has >= 10 cumulative lifetime colorectal adenomas, meeting NCCN criteria for FAP/MAP genetic evaluation (CPT 81435).",
  },
  {
    rule_code: "HDGC_CRITERIA",
    display_name: "Hereditary Diffuse Gastric Cancer (HDGC) Criteria",
    specialty: "Oncology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        {
          and: [
            { "==": [{ var: "answers.has_personal_gastric_cancer" }, true] },
            { "<": [{ var: "derived.age" }, 50] },
          ],
        },
        { ">=": [{ var: "answers.first_degree_gastric_cancer_count" }, 2] },
        {
          and: [
            { "==": [{ var: "answers.has_personal_gastric_cancer" }, true] },
            { ">=": [{ var: "answers.first_degree_gastric_cancer_count" }, 1] },
          ],
        },
      ],
    },
    recommended_intervention: "CDH1 / CTNNA1 Germline Testing + Upper Endoscopy (EGD) Cambridge Protocol",
    cpt_codes: ["81406", "43239"],
    icd10_codes: ["Z80.0", "Z15.09"],
    prior_auth_rationale_template:
      "Personal/familial diffuse gastric cancer history satisfies IGCLC HDGC criteria for CDH1 germline testing and upper GI surveillance.",
  },
  {
    rule_code: "PANCPRO_CAPS",
    display_name: "PancPRO / CAPS Pancreatic Cancer Screening",
    specialty: "Oncology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        { "==": [{ var: "answers.has_personal_pancreatic_cancer" }, true] },
        {
          and: [
            { ">=": [{ var: "derived.age" }, 50] },
            { ">=": [{ var: "answers.first_degree_pancreatic_cancer_count" }, 2] },
          ],
        },
        {
          and: [
            { "==": [{ var: "answers.known_brca_or_lynch_family_mutation" }, true] },
            { ">=": [{ var: "answers.first_degree_pancreatic_cancer_count" }, 1] },
          ],
        },
      ],
    },
    recommended_intervention: "Annual Pancreatic Surveillance (MRI/MRCP or Endoscopic Ultrasound) + Genetics Consult",
    cpt_codes: ["74183", "43259"],
    icd10_codes: ["Z80.0", "Z15.09"],
    prior_auth_rationale_template:
      "Patient satisfies CAPS consortium familial pancreatic cancer criteria for annual MRI/MRCP or EUS surveillance.",
  },
  {
    rule_code: "BAP1_TPDS",
    display_name: "BAP1 Tumor Predisposition Syndrome Criteria",
    specialty: "Oncology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.has_personal_melanoma_or_mesothelioma" }, true] },
        {
          or: [
            { "==": [{ var: "answers.has_personal_renal_cancer_or_leiomyoma" }, true] },
            { ">": [{ var: "answers.asbestos_exposure_years" }, 0] },
            { "<": [{ var: "derived.age" }, 55] },
          ],
        },
      ],
    },
    recommended_intervention: "BAP1 Germline Sequencing + Ophthalmology & Dermatology Surveillance",
    cpt_codes: ["81479", "96040"],
    icd10_codes: ["Z85.820", "Z15.09"],
    prior_auth_rationale_template:
      "Clinical clustering of melanoma/mesothelioma/renal tumors warrants BAP1 tumor predisposition syndrome germline evaluation.",
  },
  {
    rule_code: "VHL_HLRCC",
    display_name: "VHL / HLRCC Hereditary Renal Cancer Criteria",
    specialty: "Oncology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      "==": [{ var: "answers.has_personal_renal_cancer_or_leiomyoma" }, true],
    },
    recommended_intervention: "Hereditary Renal Cancer Panel (VHL, FH, MET, FLCN) + Abdominal MRI",
    cpt_codes: ["81437", "74183"],
    icd10_codes: ["Z80.51", "Z15.09"],
    prior_auth_rationale_template:
      "Early-onset renal malignancy or VHL/HLRCC stigmata meet NCCN hereditary kidney cancer genetic testing criteria.",
  },
  {
    rule_code: "MEN1_MEN2",
    display_name: "MEN1 / MEN2 Multiple Endocrine Neoplasia Criteria",
    specialty: "Oncology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      "==": [{ var: "answers.has_endocrine_tumors_pituitary_parathyroid_medullary_thyroid" }, true],
    },
    recommended_intervention: "MEN1 / RET Germline Panel + Endocrine Oncology Evaluation (Calcitonin, PTH, Metanephrines)",
    cpt_codes: ["81405", "81406", "82308"],
    icd10_codes: ["E31.20", "Z83.49"],
    prior_auth_rationale_template:
      "Endocrine tumor presentation meets Endocrine Society criteria for MEN1/RET genetic sequencing and biochemical screening.",
  },
  {
    rule_code: "COWDEN_PTEN",
    display_name: "Cowden Syndrome (PTEN) Cleveland Clinic Criteria",
    specialty: "Oncology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      "==": [{ var: "answers.has_macrocephaly_or_mucocutaneous_lesions" }, true],
    },
    recommended_intervention: "PTEN Germline Sequencing + Thyroid Ultrasound & High-Risk Cancer Surveillance",
    cpt_codes: ["81321", "76536"],
    icd10_codes: ["Q85.89", "Z15.09"],
    prior_auth_rationale_template:
      "Macrocephaly/mucocutaneous hamartoma criteria meet NCCN Cowden/PTEN syndrome testing guidelines (CPT 81321).",
  },
  {
    rule_code: "NF1_NF2_TSC",
    display_name: "NF1 / NF2 / TSC Neurocutaneous Syndrome Criteria",
    specialty: "Oncology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      "==": [{ var: "answers.has_neurofibromas_cafe_au_lait_or_tuberous_sclerosis" }, true],
    },
    recommended_intervention: "NF1 / NF2 / TSC1 / TSC2 Neurocutaneous Genetic Panel + Brain MRI",
    cpt_codes: ["81408", "70553"],
    icd10_codes: ["Q85.00", "Q85.1"],
    prior_auth_rationale_template:
      "Clinical neurocutaneous findings warrant NF1/NF2/TSC molecular confirmation and baseline neuroimaging.",
  },
  {
    rule_code: "USPSTF_LUNG",
    display_name: "USPSTF Lung Cancer Screening",
    specialty: "Pulmonology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { ">=": [{ var: "derived.age" }, 50] },
        { "<=": [{ var: "derived.age" }, 80] },
        { ">=": [{ var: "answers.pack_years" }, 20] },
        { in: [{ var: "answers.smoking_status" }, ["current", "former"]] },
        {
          or: [
            { "==": [{ var: "answers.smoking_status" }, "current"] },
            { "<=": [{ var: "answers.years_since_quit_smoking" }, 15] },
          ],
        },
      ],
    },
    recommended_intervention: "Low-Dose CT Thorax (LDCT)",
    cpt_codes: ["71271"],
    icd10_codes: ["Z87.891"],
    prior_auth_rationale_template:
      "Patient aged 50–80 with >= 20 pack-year smoking history (current or quit <= 15 yrs) meets USPSTF Grade B criteria for annual LDCT (CPT 71271).",
  },
  {
    rule_code: "PLCOM2012",
    display_name: "PLCOm2012 6-Year Lung Cancer Risk Model",
    specialty: "Pulmonology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { in: [{ var: "answers.smoking_status" }, ["current", "former"]] },
        { ">=": [{ var: "derived.plcom2012_6yr_risk" }, 1.51] },
      ],
    },
    recommended_intervention: "Low-Dose CT Thorax (LDCT) & Tobacco Cessation Counseling",
    cpt_codes: ["71271", "99406"],
    icd10_codes: ["Z87.891", "F17.210"],
    prior_auth_rationale_template:
      "PLCOm2012 6-year lung cancer risk >= 1.51% exceeds validated screening benefit threshold for LDCT.",
  },

  // --- Urology & OBGYN (7) ---
  {
    rule_code: "PCPT_2_PROXY",
    display_name: "PCPT 2.0 Prostate Cancer Risk (Patient Proxy)",
    specialty: "Urology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Male"] },
        { ">=": [{ var: "derived.age" }, 45] },
        {
          or: [
            { "==": [{ var: "answers.has_prostate_cancer_family_history" }, true] },
            { "==": [{ var: "answers.ethnicity_ancestry" }, "african_american"] },
            { ">=": [{ var: "derived.age" }, 55] },
          ],
        },
      ],
    },
    recommended_intervention: "Shared Decision-Making & Baseline Serum PSA Screening",
    cpt_codes: ["84153", "99214"],
    icd10_codes: ["Z12.5", "Z80.42"],
    prior_auth_rationale_template:
      "Age, ancestry, or family history meets AUA/NCCN criteria for baseline PSA screening (CPT 84153).",
  },
  {
    rule_code: "ERSPC",
    display_name: "ERSPC Prostate Cancer Risk Calculator",
    specialty: "Urology",
    rule_type: "HYBRID",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Male"] },
        { ">=": [{ var: "derived.age" }, 50] },
        {
          or: [
            { ">=": [{ var: "answers.lab_psa_ng_ml" }, 3.0] },
            { "==": [{ var: "answers.dre_abnormal" }, true] },
          ],
        },
      ],
    },
    recommended_intervention: "Multiparametric Prostate MRI & Urology Consultation",
    cpt_codes: ["72197", "99244"],
    icd10_codes: ["R97.20", "N40.0"],
    prior_auth_rationale_template:
      "Elevated PSA (>= 3.0 ng/mL) or abnormal DRE meets ERSPC risk stratification criteria for multiparametric prostate MRI (CPT 72197).",
  },
  {
    rule_code: "IPSS",
    display_name: "International Prostate Symptom Score (IPSS)",
    specialty: "Urology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Male"] },
        { ">=": [{ var: "derived.ipss_score" }, 8] },
      ],
    },
    recommended_intervention: "Urology LUTS / BPH Evaluation, Urinalysis & Post-Void Residual Ultrasound",
    cpt_codes: ["51798", "81001"],
    icd10_codes: ["N40.1", "R35.0"],
    prior_auth_rationale_template:
      "Moderate-to-severe IPSS score (>= 8) indicates clinically significant lower urinary tract symptoms warranting urologic evaluation.",
  },
  {
    rule_code: "SHIM_IIEF5",
    display_name: "SHIM / IIEF-5 Erectile Dysfunction Screen",
    specialty: "Urology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "ROUTINE",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Male"] },
        { ">": [{ var: "derived.shim_score" }, 0] },
        { "<=": [{ var: "derived.shim_score" }, 21] },
      ],
    },
    recommended_intervention: "Men's Health & Cardiovascular/Endocrine Workup (Morning Total Testosterone, HbA1c, Lipids)",
    cpt_codes: ["84403", "83036"],
    icd10_codes: ["N52.9"],
    prior_auth_rationale_template:
      "SHIM/IIEF-5 score <= 21 indicates erectile dysfunction; AUA guidelines recommend endocrine and cardiovascular risk evaluation.",
  },
  {
    rule_code: "PFDI_20",
    display_name: "PFDI-20 Pelvic Floor Distress Inventory",
    specialty: "OBGYN",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
        { ">=": [{ var: "derived.pfdi20_score" }, 60] },
      ],
    },
    recommended_intervention: "Urogynecology Consultation & Pelvic Floor Physical Therapy Referral",
    cpt_codes: ["99244", "97110"],
    icd10_codes: ["N81.9", "N39.3"],
    prior_auth_rationale_template:
      "PFDI-20 summary score >= 60 demonstrates moderate-to-severe pelvic floor distress requiring urogynecologic management.",
  },
  {
    rule_code: "ROTTERDAM_PCOS",
    display_name: "Rotterdam PCOS Diagnostic Criteria",
    specialty: "OBGYN",
    rule_type: "HYBRID",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
        { ">=": [{ var: "derived.rotterdam_criteria_count" }, 2] },
      ],
    },
    recommended_intervention: "OBGYN / Endocrine PCOS Workup (Pelvic Ultrasound, Free Testosterone, 2-hr OGTT, Lipids)",
    cpt_codes: ["76830", "84402", "82951"],
    icd10_codes: ["E28.2"],
    prior_auth_rationale_template:
      "Patient meets >= 2 of 3 Rotterdam criteria for Polycystic Ovary Syndrome; endocrine and pelvic ultrasound workup indicated.",
  },
  {
    rule_code: "ACOG_ACMG_CARRIER",
    display_name: "ACOG / ACMG Expanded Carrier Screening",
    specialty: "OBGYN",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "ROUTINE",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
        { "==": [{ var: "answers.is_planning_pregnancy" }, true] },
      ],
    },
    recommended_intervention: "ACOG / ACMG Expanded Reproductive Carrier Screening Panel (CF, SMA, Fragile X, Hemoglobinopathies)",
    cpt_codes: ["81443"],
    icd10_codes: ["Z31.430", "Z36.0"],
    prior_auth_rationale_template:
      "Preconception/prenatal patient qualifies for ACOG/ACMG Tier 3 expanded carrier screening (CPT 81443).",
  },

  // --- Cardiovascular (6) ---
  {
    rule_code: "AHA_PREVENT",
    display_name: "AHA PREVENT 10-Year ASCVD Risk",
    specialty: "Cardiology",
    rule_type: "HYBRID",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { ">=": [{ var: "derived.age" }, 30] },
        { "<=": [{ var: "derived.age" }, 79] },
        { ">=": [{ var: "derived.aha_prevent_10yr_risk" }, 7.5] },
      ],
    },
    recommended_intervention: "Preventive Cardiology Consult, Statin Optimization & Coronary Calcium Score Consideration",
    cpt_codes: ["99244", "75571"],
    icd10_codes: ["E78.5", "I10", "Z13.6"],
    prior_auth_rationale_template:
      "AHA PREVENT 10-year ASCVD risk >= 7.5% warrants preventive cardiology risk reduction and lipid/CAC evaluation.",
  },
  {
    rule_code: "CHA2DS2_VASC",
    display_name: "CHA2DS2-VASc Atrial Fibrillation Stroke Risk",
    specialty: "Cardiology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.has_atrial_fibrillation" }, true] },
        {
          or: [
            {
              and: [
                { "==": [{ var: "patient.sex_at_birth" }, "Male"] },
                { ">=": [{ var: "derived.cha2ds2_vasc_score" }, 2] },
              ],
            },
            {
              and: [
                { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
                { ">=": [{ var: "derived.cha2ds2_vasc_score" }, 3] },
              ],
            },
          ],
        },
      ],
    },
    recommended_intervention: "Cardiology Anticoagulation Evaluation (DOAC Initiation/Review) & 12-Lead ECG",
    cpt_codes: ["93000", "99214"],
    icd10_codes: ["I48.91"],
    prior_auth_rationale_template:
      "Atrial fibrillation with elevated CHA2DS2-VASc (>= 2 male / >= 3 female) carries Class I AHA/ACC recommendation for oral anticoagulation.",
  },
  {
    rule_code: "HCM_RISK_SCD",
    display_name: "HCM Risk-SCD Sudden Cardiac Death Screen",
    specialty: "Cardiology",
    rule_type: "HYBRID",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.has_hcm_diagnosis_or_family_scd" }, true] },
        {
          or: [
            { "==": [{ var: "answers.has_unexplained_syncope" }, true] },
            { "<": [{ var: "derived.age" }, 65] },
          ],
        },
      ],
    },
    recommended_intervention: "Transthoracic Echocardiogram, Cardiac MRI, 48-hr Holter & Electrophysiology Referral",
    cpt_codes: ["93306", "75561", "93224"],
    icd10_codes: ["I42.2", "Z82.41"],
    prior_auth_rationale_template:
      "HCM diagnosis or family sudden cardiac death history warrants echocardiographic, CMR, and ambulatory rhythm risk stratification.",
  },
  {
    rule_code: "ADD_RS",
    display_name: "ADD-RS Acute Aortic Dissection Detection",
    specialty: "Cardiology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "ACUTE_RED_FLAG",
    logic_expression: {
      ">=": [{ var: "derived.add_rs_score" }, 2],
    },
    recommended_intervention: "HIGH PRIORITY — Urgent Emergency Department Transfer & CTA Chest/Abdomen/Pelvis with Contrast (Rule Out Aortic Dissection)",
    cpt_codes: ["71275", "74174"],
    icd10_codes: ["I71.00", "R07.9"],
    prior_auth_rationale_template:
      "ACUTE RED FLAG: ADD-RS >= 2 indicates high clinical probability of acute aortic dissection; emergent CTA is life-saving.",
  },
  {
    rule_code: "SVS_AAA",
    display_name: "SVS Abdominal Aortic Aneurysm Screening",
    specialty: "Cardiology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      or: [
        {
          and: [
            { "==": [{ var: "patient.sex_at_birth" }, "Male"] },
            { ">=": [{ var: "derived.age" }, 65] },
            { "<=": [{ var: "derived.age" }, 75] },
            { in: [{ var: "answers.smoking_status" }, ["current", "former"]] },
          ],
        },
        {
          and: [
            { ">=": [{ var: "derived.age" }, 65] },
            { "==": [{ var: "answers.has_family_history_aaa" }, true] },
          ],
        },
      ],
    },
    recommended_intervention: "One-Time Abdominal Aortic Aneurysm (AAA) Duplex Screening Ultrasound",
    cpt_codes: ["76706"],
    icd10_codes: ["Z13.6", "Z87.891"],
    prior_auth_rationale_template:
      "Patient meets USPSTF/SVS guidelines for one-time AAA screening ultrasound (CPT 76706).",
  },
  {
    rule_code: "EDINBURGH_PAD",
    display_name: "Edinburgh Claudication / PAD Questionnaire",
    specialty: "Cardiology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      "==": [{ var: "answers.has_exertional_calf_pain_relieved_by_rest" }, true],
    },
    recommended_intervention: "Ankle-Brachial Index (ABI) Arterial Doppler Study & Vascular Medicine Review",
    cpt_codes: ["93922"],
    icd10_codes: ["I73.9", "R29.898"],
    prior_auth_rationale_template:
      "Positive Edinburgh claudication screen indicates symptomatic peripheral artery disease; resting/exercise ABI (CPT 93922) indicated.",
  },

  // --- Neurology, Sleep, Bone & Hematology (8) ---
  {
    rule_code: "ABCD2_STROKE",
    display_name: "ABCD2 Acute TIA Stroke Risk Score",
    specialty: "Neurology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "ACUTE_RED_FLAG",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.has_transient_neuro_symptoms" }, true] },
        { ">=": [{ var: "derived.abcd2_score" }, 4] },
      ],
    },
    recommended_intervention: "HIGH PRIORITY — Urgent Stroke/ED Evaluation, Brain MRI/MRA & Carotid Duplex Ultrasound",
    cpt_codes: ["70551", "70544", "93880"],
    icd10_codes: ["G45.9"],
    prior_auth_rationale_template:
      "ACUTE RED FLAG: ABCD2 score >= 4 carries high 48-hour ischemic stroke risk requiring immediate neurovascular imaging and neurology evaluation.",
  },
  {
    rule_code: "SNNOOP10",
    display_name: "SNNOOP10 Secondary Headache Red Flags",
    specialty: "Neurology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "ACUTE_RED_FLAG",
    logic_expression: {
      or: [
        { "==": [{ var: "answers.has_thunderclap_headache" }, true] },
        { "==": [{ var: "answers.has_headache_with_fever_or_stiff_neck" }, true] },
        { "==": [{ var: "answers.has_headache_neurologic_deficit" }, true] },
        {
          and: [
            { ">=": [{ var: "derived.age" }, 50] },
            { "==": [{ var: "answers.has_headache_new_onset_over_50" }, true] },
          ],
        },
      ],
    },
    recommended_intervention: "HIGH PRIORITY — Urgent Neuroimaging (CT Head Non-Contrast / MRI Brain) & Acute Neurology Triage",
    cpt_codes: ["70450", "70553"],
    icd10_codes: ["R51.9", "G44.53"],
    prior_auth_rationale_template:
      "ACUTE RED FLAG: Positive SNNOOP10 headache red flag requires urgent neuroimaging to exclude hemorrhage, infection, mass, or arteritis.",
  },
  {
    rule_code: "HIT_6",
    display_name: "HIT-6 Headache Impact Test",
    specialty: "Neurology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.has_headaches" }, true] },
        { ">=": [{ var: "derived.hit6_score" }, 56] },
      ],
    },
    recommended_intervention: "Neurology Headache Specialist Referral & Preventive Migraine Therapy Evaluation",
    cpt_codes: ["99244"],
    icd10_codes: ["G43.909"],
    prior_auth_rationale_template:
      "HIT-6 score >= 56 reflects substantial-to-severe functional disability supporting preventive migraine therapy and neurology consultation.",
  },
  {
    rule_code: "STOP_BANG",
    display_name: "STOP-BANG Obstructive Sleep Apnea Screen",
    specialty: "Sleep",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      ">=": [{ var: "derived.stop_bang_score" }, 3],
    },
    recommended_intervention: "Home Sleep Apnea Test (HSAT) or Attended Polysomnography",
    cpt_codes: ["95806", "95810"],
    icd10_codes: ["G47.33", "R06.83"],
    prior_auth_rationale_template:
      "STOP-BANG score >= 3 identifies intermediate-to-high risk for moderate-to-severe obstructive sleep apnea; HSAT (CPT 95806) indicated.",
  },
  {
    rule_code: "FRAX",
    display_name: "FRAX 10-Year Osteoporotic Fracture Risk",
    specialty: "Bone",
    rule_type: "HYBRID",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { ">=": [{ var: "derived.age" }, 40] },
        {
          or: [
            { ">=": [{ var: "derived.frax_major_risk" }, 20] },
            { "==": [{ var: "answers.has_prior_fragility_fracture" }, true] },
            { "<=": [{ var: "answers.dexa_femoral_neck_t_score" }, -2.5] },
          ],
        },
      ],
    },
    recommended_intervention: "DEXA Bone Mineral Density Scan & Bone Health / Osteoporosis Therapy Evaluation",
    cpt_codes: ["77080"],
    icd10_codes: ["M81.0", "Z13.820"],
    prior_auth_rationale_template:
      "Elevated FRAX 10-year major osteoporotic fracture risk (>= 20%) or fragility fracture history warrants DEXA (CPT 77080) and pharmacotherapy review.",
  },
  {
    rule_code: "OSTA",
    display_name: "OSTA Osteoporosis Self-Assessment Tool",
    specialty: "Bone",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
        { ">=": [{ var: "derived.age" }, 45] },
        { "<": [{ var: "derived.osta_score" }, -1] },
      ],
    },
    recommended_intervention: "Screening DEXA Bone Density Scan (Axial Skeleton)",
    cpt_codes: ["77080"],
    icd10_codes: ["Z13.820"],
    prior_auth_rationale_template:
      "OSTA index < -1 identifies intermediate-to-high risk of osteoporosis, supporting screening DEXA bone densitometry (CPT 77080).",
  },
  {
    rule_code: "ISTH_BAT",
    display_name: "ISTH-BAT Bleeding Assessment Tool",
    specialty: "Hematology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        {
          and: [
            { "==": [{ var: "patient.sex_at_birth" }, "Male"] },
            { ">=": [{ var: "derived.isth_bat_score" }, 4] },
          ],
        },
        {
          and: [
            { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
            { ">=": [{ var: "derived.isth_bat_score" }, 6] },
          ],
        },
      ],
    },
    recommended_intervention: "Hematology Referral & Coagulation / Von Willebrand Disease Panel (PT, aPTT, vWF:Ag, vWF:RCo, Factor VIII)",
    cpt_codes: ["85240", "85245", "85246", "85610"],
    icd10_codes: ["D68.00", "R58"],
    prior_auth_rationale_template:
      "Abnormal ISTH-BAT bleeding score (>= 4 male / >= 6 female) warrants hemostasis laboratory panel and hematology consultation.",
  },
  {
    rule_code: "WELLS_DVT_PE",
    display_name: "Wells DVT / Pulmonary Embolism Criteria",
    specialty: "Hematology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "ACUTE_RED_FLAG",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.has_acute_leg_swelling_or_dyspnea" }, true] },
        { ">=": [{ var: "derived.wells_dvt_pe_score" }, 2] },
      ],
    },
    recommended_intervention: "HIGH PRIORITY — Urgent Lower Extremity Venous Duplex Ultrasound / CT Pulmonary Angiography & D-Dimer",
    cpt_codes: ["93971", "71275", "85379"],
    icd10_codes: ["I82.409", "I26.99"],
    prior_auth_rationale_template:
      "ACUTE RED FLAG: Wells score >= 2 with acute limb/respiratory symptoms indicates DVT/PE likely; urgent vascular/CTPA imaging required.",
  },

  // =========================================================================
  // PART B: 19 EHR / LAB / CLINICAL-NOTE DERIVED TOOLS
  // =========================================================================
  {
    rule_code: "BRCAPRO",
    display_name: "BRCAPRO Hereditary BRCA1/2 Carrier Probability",
    specialty: "Oncology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        { "==": [{ var: "answers.has_personal_ovarian_cancer" }, true] },
        {
          and: [
            { "==": [{ var: "answers.has_personal_breast_cancer" }, true] },
            { "<=": [{ var: "answers.personal_breast_cancer_age" }, 50] },
          ],
        },
        {
          and: [
            { ">=": [{ var: "answers.first_degree_breast_cancer_count" }, 2] },
            { "<=": [{ var: "answers.youngest_family_breast_cancer_age" }, 50] },
          ],
        },
      ],
    },
    recommended_intervention: "BRCA1 / BRCA2 Comprehensive Sequencing & Rearrangement Analysis + Genetic Counseling",
    cpt_codes: ["81162", "96040"],
    icd10_codes: ["Z15.01", "Z80.3"],
    prior_auth_rationale_template:
      "EHR-parsed personal/family breast & ovarian cancer pedigree meets BRCAPRO >= 10% carrier probability threshold (CPT 81162).",
  },
  {
    rule_code: "CLAUS_MODEL",
    display_name: "Claus Model Familial Breast Cancer Risk",
    specialty: "Oncology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
        { ">=": [{ var: "answers.first_degree_breast_cancer_count" }, 2] },
        { "<=": [{ var: "answers.youngest_family_breast_cancer_age" }, 55] },
      ],
    },
    recommended_intervention: "Annual Supplemental Screening Breast MRI with Contrast",
    cpt_codes: ["77049"],
    icd10_codes: ["Z80.3"],
    prior_auth_rationale_template:
      "Claus familial breast cancer model estimates >= 20% lifetime risk based on EHR pedigree; annual breast MRI (CPT 77049) indicated.",
  },
  {
    rule_code: "MMRPRO",
    display_name: "MMRpro Mismatch Repair Gene Risk Model",
    specialty: "Oncology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        { "==": [{ var: "answers.tumor_msi_high_or_ihc_loss" }, true] },
        {
          and: [
            { ">=": [{ var: "answers.first_degree_crc_count" }, 2] },
            { "<": [{ var: "answers.youngest_family_crc_age" }, 55] },
          ],
        },
      ],
    },
    recommended_intervention: "Mismatch Repair (MMR) Germline Genetic Testing & High-Risk GI Surveillance",
    cpt_codes: ["81435", "45378"],
    icd10_codes: ["Z15.09", "Z80.0"],
    prior_auth_rationale_template:
      "Tumor MSI/IHC abnormality or multi-case familial CRC exceeds MMRpro >= 5% mutation probability threshold.",
  },
  {
    rule_code: "AMSTERDAM_II",
    display_name: "Amsterdam II Lynch Syndrome Criteria",
    specialty: "Oncology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { ">=": [{ var: "answers.first_degree_crc_count" }, 2] },
        { ">=": [{ var: "answers.family_cancer_generations_affected" }, 2] },
        { "<": [{ var: "answers.youngest_family_crc_age" }, 50] },
      ],
    },
    recommended_intervention: "Lynch Syndrome Germline Panel + Colonoscopy Every 1–2 Years",
    cpt_codes: ["81435", "45378"],
    icd10_codes: ["Z15.09", "Z80.0"],
    prior_auth_rationale_template:
      "Pedigree satisfies Amsterdam II clinical criteria (3-2-1 rule across >= 2 generations with diagnosis < age 50).",
  },
  {
    rule_code: "REVISED_BETHESDA",
    display_name: "Revised Bethesda Guidelines (MSI / IHC Testing)",
    specialty: "Oncology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        { "==": [{ var: "answers.tumor_msi_high_or_ihc_loss" }, true] },
        {
          and: [
            { "==": [{ var: "answers.has_personal_colorectal_cancer" }, true] },
            { "<": [{ var: "answers.personal_crc_age" }, 50] },
          ],
        },
        {
          and: [
            { "==": [{ var: "answers.has_personal_colorectal_cancer" }, true] },
            { ">=": [{ var: "answers.first_degree_crc_count" }, 1] },
          ],
        },
      ],
    },
    recommended_intervention: "Tumor Microsatellite Instability (MSI) & MMR Immunohistochemistry Reflex Testing",
    cpt_codes: ["81301", "88342"],
    icd10_codes: ["C18.9", "Z85.038"],
    prior_auth_rationale_template:
      "Patient meets Revised Bethesda Guidelines for tumor MSI/IHC reflex testing to identify Lynch syndrome.",
  },
  {
    rule_code: "BACH_MODEL",
    display_name: "Bach Lung Cancer Risk Model (Asbestos/Smoking)",
    specialty: "Pulmonology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { ">=": [{ var: "derived.age" }, 50] },
        { "<=": [{ var: "derived.age" }, 75] },
        { in: [{ var: "answers.smoking_status" }, ["current", "former"]] },
        {
          or: [
            { ">=": [{ var: "answers.asbestos_exposure_years" }, 5] },
            { ">=": [{ var: "answers.pack_years" }, 30] },
          ],
        },
      ],
    },
    recommended_intervention: "Annual Low-Dose CT Thorax (LDCT) & Pulmonology Occupational Risk Review",
    cpt_codes: ["71271", "99244"],
    icd10_codes: ["Z77.090", "Z87.891"],
    prior_auth_rationale_template:
      "Combined smoking and occupational asbestos exposure profile exceeds Bach 10-year lung cancer risk threshold for LDCT.",
  },
  {
    rule_code: "ROMA_CA125_HE4",
    display_name: "ROMA Ovarian Malignancy Risk Algorithm (CA-125/HE4)",
    specialty: "OBGYN",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
        { "==": [{ var: "answers.has_adnexal_mass" }, true] },
        {
          or: [
            {
              and: [
                { "==": [{ var: "answers.is_postmenopausal" }, true] },
                { ">=": [{ var: "derived.roma_score" }, 29.9] },
              ],
            },
            {
              and: [
                { "==": [{ var: "answers.is_postmenopausal" }, false] },
                { ">=": [{ var: "derived.roma_score" }, 11.4] },
              ],
            },
          ],
        },
      ],
    },
    recommended_intervention: "Urgent Gynecologic Oncology Referral & Contrast Pelvic/Abdominal CT",
    cpt_codes: ["74177", "99244"],
    icd10_codes: ["N83.8", "R97.1"],
    prior_auth_rationale_template:
      "ROMA algorithm score exceeds FDA high-risk epithelial ovarian malignancy threshold (>= 11.4% premenopausal / >= 29.9% postmenopausal).",
  },
  {
    rule_code: "MESA_CAC",
    display_name: "MESA 10-Year CHD Risk Score (Coronary Calcium)",
    specialty: "Cardiology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        { ">=": [{ var: "answers.coronary_calcium_agatston_score" }, 100] },
        { ">=": [{ var: "derived.mesa_cac_score" }, 7.5] },
      ],
    },
    recommended_intervention: "High-Intensity Statin Initiation & Preventive Cardiology Follow-Up",
    cpt_codes: ["99214", "80061"],
    icd10_codes: ["I25.10", "E78.5"],
    prior_auth_rationale_template:
      "Coronary artery calcium score >= 100 Agatston units (or MESA 10-yr CHD >= 7.5%) meets ACC/AHA criteria for statin therapy and cardiology management.",
  },
  {
    rule_code: "HAS_BLED",
    display_name: "HAS-BLED Anticoagulation Major Bleeding Risk",
    specialty: "Cardiology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.has_atrial_fibrillation" }, true] },
        { ">=": [{ var: "derived.has_bled_score" }, 3] },
      ],
    },
    recommended_intervention: "Anticoagulation Safety Review, Modifiable Bleeding Risk Mitigation & Left Atrial Appendage Assessment",
    cpt_codes: ["99214"],
    icd10_codes: ["I48.91", "Z79.01"],
    prior_auth_rationale_template:
      "HAS-BLED score >= 3 identifies elevated major bleeding risk requiring closer monitoring and modifiable risk factor intervention.",
  },
  {
    rule_code: "AMYLOID_MOCA_CDR",
    display_name: "Amyloid PET / MoCA / CDR Cognitive Decline Screen",
    specialty: "Neurology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        {
          and: [
            { ">": [{ var: "answers.cognitive_moca_score" }, 0] },
            { "<": [{ var: "answers.cognitive_moca_score" }, 26] },
          ],
        },
        { ">=": [{ var: "answers.cognitive_cdr_score" }, 0.5] },
      ],
    },
    recommended_intervention: "Memory Neurology Consult, Brain MRI, Reversible Dementia Labs (B12/TSH) & Amyloid Biomarker Workup",
    cpt_codes: ["70551", "78811", "82607", "84443"],
    icd10_codes: ["G31.84", "R41.3"],
    prior_auth_rationale_template:
      "Documented MoCA < 26 or CDR >= 0.5 confirms objective cognitive impairment warranting neuroimaging and Alzheimer's biomarker evaluation.",
  },
  {
    rule_code: "HUNTINGTONS_ATAXIA",
    display_name: "Huntington's Disease / Hereditary Ataxia Risk",
    specialty: "Neurology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        { "==": [{ var: "answers.has_family_huntingtons_or_ataxia" }, true] },
        { "==": [{ var: "answers.has_chorea_or_progressive_ataxia" }, true] },
      ],
    },
    recommended_intervention: "Movement Disorder Neurology & Neurogenetics Counseling (HTT / Spinocerebellar Ataxia Repeat Expansion)",
    cpt_codes: ["81271", "96040"],
    icd10_codes: ["G10", "G11.9", "Z82.0"],
    prior_auth_rationale_template:
      "Hereditary movement disorder family history or exam findings warrant pre-test neurogenetics counseling and targeted repeat-expansion testing.",
  },
  {
    rule_code: "GARVAN_FRACTURE",
    display_name: "Garvan Institute Fracture Risk Calculator",
    specialty: "Bone",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { ">=": [{ var: "derived.age" }, 50] },
        {
          or: [
            { "<=": [{ var: "answers.dexa_femoral_neck_t_score" }, -2.0] },
            { ">=": [{ var: "answers.fall_count_past_12_months" }, 2] },
          ],
        },
      ],
    },
    recommended_intervention: "Osteoporosis Specialist Review, Fall-Prevention Physical Therapy & Vitamin D/Calcium Lab Panel",
    cpt_codes: ["77080", "82306", "97110"],
    icd10_codes: ["M85.80", "R29.6"],
    prior_auth_rationale_template:
      "Low femoral neck BMD (T-score <= -2.0) or recurrent falls (>= 2/yr) elevates Garvan 5/10-year fracture probability.",
  },
  {
    rule_code: "KOOS_HOOS",
    display_name: "KOOS / HOOS Knee & Hip Osteoarthritis Index",
    specialty: "MSK",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { ">": [{ var: "answers.koos_hoos_symptom_score" }, 0] },
        { "<=": [{ var: "answers.koos_hoos_symptom_score" }, 60] },
      ],
    },
    recommended_intervention: "Orthopedic Joint Evaluation, Weight-Bearing Radiographs & Structured Physical Therapy",
    cpt_codes: ["73562", "97161"],
    icd10_codes: ["M17.9", "M16.9"],
    prior_auth_rationale_template:
      "KOOS/HOOS score <= 60 documents clinically significant osteoarthritis disability warranting orthopedic and rehabilitation care.",
  },
  {
    rule_code: "GENEVA_PE",
    display_name: "Revised Geneva Pulmonary Embolism Score",
    specialty: "Hematology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "ACUTE_RED_FLAG",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.has_acute_leg_swelling_or_dyspnea" }, true] },
        { ">=": [{ var: "derived.geneva_pe_score" }, 6] },
      ],
    },
    recommended_intervention: "HIGH PRIORITY — Urgent CT Pulmonary Angiography (CTPA) & Immediate Anticoagulation Assessment",
    cpt_codes: ["71275", "85379"],
    icd10_codes: ["I26.99", "R06.02"],
    prior_auth_rationale_template:
      "ACUTE RED FLAG: Revised Geneva PE score >= 6 (intermediate/high probability) requires emergent CTPA evaluation.",
  },
  {
    rule_code: "FIB4",
    display_name: "FIB-4 Hepatic Fibrosis Index (AST/ALT/Platelets)",
    specialty: "Hepatology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      ">=": [{ var: "derived.fib4_score" }, 2.67],
    },
    recommended_intervention: "Vibration-Controlled Transient Elastography (FibroScan) & Hepatology Referral",
    cpt_codes: ["91200", "99244"],
    icd10_codes: ["K76.0", "K74.00"],
    prior_auth_rationale_template:
      "Calculated FIB-4 >= 2.67 indicates high probability of advanced hepatic fibrosis (F3–F4); elastography (CPT 91200) and hepatology referral indicated.",
  },
  {
    rule_code: "NAFLD_NFS",
    display_name: "NAFLD Fibrosis Score (NFS)",
    specialty: "Hepatology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      ">": [{ var: "derived.nfs_score" }, 0.676],
    },
    recommended_intervention: "Liver Elastography (FibroScan / MRE) & Hepatology Metabolic Liver Consult",
    cpt_codes: ["91200", "76391"],
    icd10_codes: ["K76.0", "K75.81"],
    prior_auth_rationale_template:
      "NAFLD Fibrosis Score > 0.676 indicates high risk of advanced fibrosis (F3–F4) requiring liver elastography and specialist management.",
  },
  {
    rule_code: "APRI",
    display_name: "APRI AST-to-Platelet Ratio Index",
    specialty: "Hepatology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      ">=": [{ var: "derived.apri_score" }, 1.0],
    },
    recommended_intervention: "Hepatology Fibrosis Staging (Elastography) & Chronic Viral Hepatitis Panel",
    cpt_codes: ["91200", "80074"],
    icd10_codes: ["K74.00", "R74.01"],
    prior_auth_rationale_template:
      "APRI >= 1.0 suggests significant hepatic fibrosis/cirrhosis risk; non-invasive elastography and etiology workup medically necessary.",
  },
  {
    rule_code: "AASLD_HCC",
    display_name: "AASLD Hepatocellular Carcinoma Surveillance",
    specialty: "Hepatology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        { "==": [{ var: "answers.has_chronic_hbv_or_cirrhosis" }, true] },
        { ">=": [{ var: "derived.fib4_score" }, 3.25] },
      ],
    },
    recommended_intervention: "Semi-Annual Right Upper Quadrant Liver Ultrasound + Serum Alpha-Fetoprotein (AFP)",
    cpt_codes: ["76705", "82105"],
    icd10_codes: ["K74.60", "B18.1"],
    prior_auth_rationale_template:
      "Cirrhosis or chronic HBV meets AASLD Class I guidelines for every-6-month HCC surveillance ultrasound (CPT 76705) and AFP (CPT 82105).",
  },
  {
    rule_code: "PCPT_2_FULL_PSA",
    display_name: "Full PSA-Adjusted PCPT 2.0 Prostate Cancer Risk",
    specialty: "Urology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Male"] },
        { ">=": [{ var: "derived.age" }, 50] },
        {
          or: [
            { ">=": [{ var: "answers.lab_psa_ng_ml" }, 4.0] },
            {
              and: [
                { ">=": [{ var: "answers.lab_psa_ng_ml" }, 2.5] },
                {
                  or: [
                    { "==": [{ var: "answers.has_prostate_cancer_family_history" }, true] },
                    { "==": [{ var: "answers.dre_abnormal" }, true] },
                    { "==": [{ var: "answers.ethnicity_ancestry" }, "african_american"] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    recommended_intervention: "Multiparametric Prostate MRI & Urology Biopsy Risk Discussion (4Kscore / PHI)",
    cpt_codes: ["72197", "81539"],
    icd10_codes: ["R97.20", "Z80.42"],
    prior_auth_rationale_template:
      "PSA-adjusted PCPT 2.0 elevated high-grade prostate cancer risk supports multiparametric prostate MRI (CPT 72197) prior to biopsy.",
  },

  // =========================================================================
  // 15 SUPPLEMENTAL CLINICAL RULES (Batch F — Expanding 54 -> 69 Models)
  // =========================================================================
  {
    rule_code: "USPSTF_CRC_SCREENING",
    display_name: "USPSTF / ACG Colorectal Cancer Screening Eligibility",
    specialty: "Gastroenterology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { ">=": [{ var: "derived.age" }, 45] },
        { "<=": [{ var: "derived.age" }, 75] },
        { "==": [{ var: "answers.crc_screening_up_to_date" }, false] },
      ],
    },
    recommended_intervention:
      "Preventive Colorectal Cancer Screening — CT Colonography (Virtual Colonoscopy) or Optical Colonoscopy",
    cpt_codes: ["74263", "45378"],
    icd10_codes: ["Z12.11", "Z80.0"],
    prior_auth_rationale_template:
      "Patient aged 45–75 is due for USPSTF Grade A/B colorectal cancer screening; screening CT colonography (CPT 74263) or colonoscopy (CPT 45378) is medically indicated.",
  },
  {
    rule_code: "DENSE_BREAST_RADIATION_MRI",
    display_name: "Dense Breast & Chest-Radiation Supplemental Screening (ACR/NCCN)",
    specialty: "Oncology",
    rule_type: "HYBRID",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
        { ">=": [{ var: "derived.age" }, 25] },
        {
          or: [
            { "==": [{ var: "answers.has_prior_chest_radiation_young" }, true] },
            {
              and: [
                { ">=": [{ var: "derived.age" }, 40] },
                { in: [{ var: "answers.breast_density_birads" }, ["C", "D"]] },
              ],
            },
          ],
        },
      ],
    },
    recommended_intervention:
      "Supplemental Bilateral Breast MRI (Abbreviated or Full Protocol) / Whole-Breast Screening Ultrasound",
    cpt_codes: ["77049", "76641"],
    icd10_codes: ["R92.30", "Z92.3"],
    prior_auth_rationale_template:
      "Prior therapeutic chest radiation (ages 10–30) or heterogeneously/extremely dense breast parenchyma (BI-RADS C/D) meets ACR/NCCN criteria for supplemental breast MRI (CPT 77049) or screening ultrasound (CPT 76641).",
  },
  {
    rule_code: "ACR_TIRADS_THYROID",
    display_name: "ACR TI-RADS Thyroid Nodule Follow-Up Stratifier",
    specialty: "Endocrinology",
    rule_type: "HYBRID",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.has_known_thyroid_nodule" }, true] },
        {
          or: [
            { "==": [{ var: "answers.thyroid_nodule_tirads_level" }, "unknown"] },
            {
              and: [
                { "==": [{ var: "answers.thyroid_nodule_tirads_level" }, "TR3"] },
                { ">=": [{ var: "answers.thyroid_nodule_size_cm" }, 1.5] },
              ],
            },
            {
              and: [
                { "==": [{ var: "answers.thyroid_nodule_tirads_level" }, "TR4"] },
                { ">=": [{ var: "answers.thyroid_nodule_size_cm" }, 1.0] },
              ],
            },
            {
              and: [
                { "==": [{ var: "answers.thyroid_nodule_tirads_level" }, "TR5"] },
                { ">=": [{ var: "answers.thyroid_nodule_size_cm" }, 0.5] },
              ],
            },
          ],
        },
      ],
    },
    recommended_intervention:
      "Dedicated Neck / Thyroid Ultrasound with ACR TI-RADS Scoring & FNA Biopsy Evaluation if Threshold Met",
    cpt_codes: ["76536", "10005"],
    icd10_codes: ["E04.1", "E04.2"],
    prior_auth_rationale_template:
      "Known thyroid nodule meets ACR TI-RADS size/risk criteria (TR3 >= 1.5 cm, TR4 >= 1.0 cm, TR5 >= 0.5 cm, or uncategorized) warranting dedicated thyroid ultrasound (CPT 76536) and FNA consideration.",
  },
  {
    rule_code: "FUKUOKA_IPMN_PANCREAS",
    display_name: "Fukuoka / Kyoto Pancreatic Cyst (IPMN) Surveillance",
    specialty: "Gastroenterology",
    rule_type: "HYBRID",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.has_known_pancreatic_cyst" }, true] },
        {
          or: [
            { ">=": [{ var: "answers.pancreatic_cyst_size_cm" }, 1.0] },
            { "==": [{ var: "answers.pancreatic_cyst_worrisome_features" }, true] },
          ],
        },
      ],
    },
    recommended_intervention:
      "Contrast-Enhanced Abdominal MRI with MRCP Surveillance & Gastroenterology / Pancreaticobiliary Review",
    cpt_codes: ["74183", "74181"],
    icd10_codes: ["K86.2", "D13.6"],
    prior_auth_rationale_template:
      "Pancreatic cyst >= 1.0 cm or with Fukuoka/Kyoto worrisome features meets international consensus guidelines for MRI Abdomen with MRCP (CPT 74183).",
  },
  {
    rule_code: "DUTCH_LIPID_FH",
    display_name: "Dutch Lipid Clinic Network (FH) & Lp(a) Cardiovascular Screener",
    specialty: "Cardiology",
    rule_type: "HYBRID",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        { ">=": [{ var: "derived.dutch_lipid_fh_score" }, 6] },
        { ">=": [{ var: "answers.lab_ldl_mg_dl" }, 190] },
        { ">=": [{ var: "answers.lab_lpa_nmol_l" }, 125] },
      ],
    },
    recommended_intervention:
      "Coronary Artery Calcium (CAC) or Coronary CT Angiography (CCTA), Lipidology Referral & FH Genetic Evaluation",
    cpt_codes: ["75574", "75571"],
    icd10_codes: ["E78.01", "E78.41"],
    prior_auth_rationale_template:
      "Probable/definite Familial Hypercholesterolemia (Dutch Lipid score >= 6 or LDL >= 190 mg/dL) or elevated Lp(a) >= 125 nmol/L supports subclinical atherosclerosis imaging (CPT 75571 / 75574) and preventive cardiology.",
  },
  {
    rule_code: "SVS_CAROTID_STENOSIS",
    display_name: "SVS Carotid Artery Stenosis Risk Screener",
    specialty: "Cardiology",
    rule_type: "HYBRID",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      and: [
        { ">=": [{ var: "derived.age" }, 50] },
        {
          or: [
            { "==": [{ var: "answers.has_carotid_bruit_or_prior_carotid_stenosis" }, true] },
            {
              and: [
                { "==": [{ var: "answers.has_prior_stroke_or_tia" }, true] },
                { "==": [{ var: "answers.has_vascular_disease" }, true] },
              ],
            },
          ],
        },
      ],
    },
    recommended_intervention:
      "Bilateral Carotid Duplex Ultrasound & Vascular Risk Stratification",
    cpt_codes: ["93880"],
    icd10_codes: ["I65.29", "R09.89"],
    prior_auth_rationale_template:
      "Presence of carotid bruit, known carotid stenosis, or prior stroke/TIA with atherosclerotic vascular disease meets SVS guidelines for bilateral carotid duplex ultrasound (CPT 93880).",
  },
  {
    rule_code: "SPINE_ODI_CAUDA_EQUINA",
    display_name: "Oswestry Spine Disability (ODI) & Cauda Equina Red-Flag Screener",
    specialty: "MSK",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "ACUTE_RED_FLAG",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.has_back_or_neck_pain" }, true] },
        {
          or: [
            { "==": [{ var: "answers.has_cauda_equina_red_flags" }, true] },
            { ">=": [{ var: "derived.odi_score" }, 40] },
          ],
        },
      ],
    },
    recommended_intervention:
      "HIGH PRIORITY — Urgent Lumbar / Cervical Spine MRI (Immediate Emergency Evaluation if Cauda Equina Symptoms Present)",
    cpt_codes: ["72148", "72141"],
    icd10_codes: ["G83.4", "M54.50"],
    prior_auth_rationale_template:
      "Spine Cauda Equina red-flag symptoms (bowel/bladder dysfunction, saddle anesthesia, progressive leg weakness) or severe Oswestry Disability Index (ODI >= 40%) meets ACR Appropriateness Criteria for spine MRI (CPT 72148 / 72141).",
  },
  {
    rule_code: "AD8_DEMENTIA_SCREEN",
    display_name: "AD8 Patient / Informant Cognitive Screener",
    specialty: "Neurology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { ">=": [{ var: "derived.age" }, 55] },
        { "==": [{ var: "answers.has_memory_or_thinking_changes" }, true] },
        { ">=": [{ var: "derived.ad8_score" }, 2] },
      ],
    },
    recommended_intervention:
      "Structural Brain MRI (Without Contrast), Reversible Dementia Labs & Formal Cognitive Evaluation (MoCA)",
    cpt_codes: ["70551", "96132"],
    icd10_codes: ["R41.3", "G31.84"],
    prior_auth_rationale_template:
      "Positive AD8 cognitive screen (score >= 2) in adults >= 55 warrants structural Brain MRI without contrast (CPT 70551) to exclude structural/vascular etiologies and formal cognitive workup.",
  },
  {
    rule_code: "LUNG_RADS_FOLLOWUP",
    display_name: "Lung-RADS Pulmonary Nodule Follow-Up Tracker",
    specialty: "Pulmonology",
    rule_type: "EHR_LAB_DEPENDENT",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        { in: [{ var: "answers.lung_rads_category" }, ["3", "4A", "4B", "4X"]] },
        { ">=": [{ var: "answers.prior_ldct_nodule_size_mm" }, 6] },
      ],
    },
    recommended_intervention:
      "ACR Lung-RADS Protocol Follow-Up Chest CT (3–6 Month LDCT / Diagnostic Chest CT) or PET-CT for 4A/4B/4X",
    cpt_codes: ["71271", "71250", "78815"],
    icd10_codes: ["R91.1", "R91.8"],
    prior_auth_rationale_template:
      "ACR Lung-RADS Category 3/4A/4B/4X or pulmonary nodule >= 6 mm requires guideline-concordant interval follow-up chest CT (CPT 71271 / 71250) or PET-CT (CPT 78815).",
  },
  {
    rule_code: "COPD_CAT_MMRC",
    display_name: "COPD Assessment Test (CAT) / mMRC Dyspnea Scale",
    specialty: "Pulmonology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.copd_history" }, true] },
        {
          or: [
            { ">=": [{ var: "derived.cat_score" }, 10] },
            { ">=": [{ var: "derived.mmrc_grade" }, 2] },
          ],
        },
      ],
    },
    recommended_intervention:
      "High-Resolution Chest CT (Emphysema/Bronchiectasis Assessment), Spirometry (PFTs) & Pulmonology Optimization",
    cpt_codes: ["71250", "94010"],
    icd10_codes: ["J44.9", "R06.02"],
    prior_auth_rationale_template:
      "Symptomatic COPD meeting GOLD Group B/E criteria (CAT >= 10 or mMRC >= 2) supports chest CT characterization (CPT 71250) and spirometry (CPT 94010).",
  },
  {
    rule_code: "FRAMINGHAM_HF_KCCQ",
    display_name: "Heart Failure Risk & KCCQ-12 Symptom Screener",
    specialty: "Cardiology",
    rule_type: "HYBRID",
    acuity_level: "HIGH_RISK",
    logic_expression: {
      or: [
        { ">=": [{ var: "answers.lab_nt_probnp_pg_ml" }, 125] },
        {
          and: [
            { "==": [{ var: "answers.has_hf_symptoms_shortness_breath_swelling" }, true] },
            {
              or: [
                { "<=": [{ var: "derived.kccq12_score" }, 75] },
                { ">=": [{ var: "derived.hf_risk_score" }, 2] },
              ],
            },
          ],
        },
      ],
    },
    recommended_intervention:
      "Transthoracic Echocardiogram (TTE), NT-proBNP Confirmation & Cardiology Evaluation (Cardiac MRI if Indicated)",
    cpt_codes: ["93306", "75561"],
    icd10_codes: ["I50.9", "R06.02"],
    prior_auth_rationale_template:
      "Elevated NT-proBNP (>= 125 pg/mL) or heart failure symptoms with reduced KCCQ-12 (<= 75) meets ACC/AHA guidelines for transthoracic echocardiography (CPT 93306).",
  },
  {
    rule_code: "SARC_F_SARCOPENIA",
    display_name: "SARC-F Sarcopenia & Body Composition Screener",
    specialty: "Bone",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { ">=": [{ var: "derived.age" }, 60] },
        { "==": [{ var: "answers.has_muscle_weakness_or_mobility_difficulty" }, true] },
        { ">=": [{ var: "derived.sarc_f_score" }, 4] },
      ],
    },
    recommended_intervention:
      "Dual-Energy X-Ray Absorptiometry (DEXA) Bone Density + Whole-Body Lean Mass Composition & Physical Therapy",
    cpt_codes: ["77080", "77089"],
    icd10_codes: ["M62.84", "R26.89"],
    prior_auth_rationale_template:
      "Positive SARC-F screen (score >= 4 in adults >= 60) indicates high risk for sarcopenia and osteosarcopenia, supporting DEXA bone & body composition evaluation (CPT 77080 / 77089).",
  },
  {
    rule_code: "ADA_DIABETES_KDIGO_CKD",
    display_name: "ADA Type 2 Diabetes Risk Test & KDIGO CKD Screener",
    specialty: "Metabolic & Renal",
    rule_type: "HYBRID",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      or: [
        { ">=": [{ var: "derived.ada_diabetes_risk_score" }, 5] },
        { ">=": [{ var: "answers.lab_hba1c_percent" }, 5.7] },
        { ">=": [{ var: "answers.lab_uacr_mg_g" }, 30] },
        {
          and: [
            { ">": [{ var: "answers.lab_egfr_ml_min" }, 0] },
            { "<": [{ var: "answers.lab_egfr_ml_min" }, 60] },
          ],
        },
      ],
    },
    recommended_intervention:
      "Hemoglobin A1c & Urine uACR Metabolic Panel + Renal Ultrasound / Liver FibroScan if CKD or Metabolic Dysfunction Present",
    cpt_codes: ["76770", "83036"],
    icd10_codes: ["E11.9", "N18.9", "R73.03"],
    prior_auth_rationale_template:
      "Elevated ADA Type 2 Diabetes Risk Test (>= 5), HbA1c >= 5.7%, uACR >= 30 mg/g, or eGFR < 60 meets ADA/KDIGO criteria for metabolic-renal workup and renal ultrasound (CPT 76770) when indicated.",
  },
  {
    rule_code: "AUDIT_C_ALCOHOL",
    display_name: "AUDIT-C Validated Alcohol Risk & Liver Screener",
    specialty: "Gastroenterology",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      or: [
        {
          and: [
            { "==": [{ var: "patient.sex_at_birth" }, "Male"] },
            { ">=": [{ var: "derived.audit_c_score" }, 4] },
          ],
        },
        {
          and: [
            { "!=": [{ var: "patient.sex_at_birth" }, "Male"] },
            { ">=": [{ var: "derived.audit_c_score" }, 3] },
          ],
        },
      ],
    },
    recommended_intervention:
      "USPSTF Brief Alcohol Wellness Counseling, Hepatic Function Panel & Non-Invasive Liver Elastography (FibroScan)",
    cpt_codes: ["91200", "G0442"],
    icd10_codes: ["F10.10", "K76.0"],
    prior_auth_rationale_template:
      "Positive AUDIT-C screen (>= 4 men, >= 3 women) meets USPSTF Grade B criteria for brief behavioral counseling (G0442) and non-invasive hepatic fibrosis screening (CPT 91200).",
  },
  {
    rule_code: "PHQ9_GAD7_BEHAVIORAL",
    display_name: "PHQ-9 Depression & GAD-7 Anxiety Preventive Screener",
    specialty: "Behavioral Health",
    rule_type: "PATIENT_REPORTED",
    acuity_level: "MODERATE_RISK",
    logic_expression: {
      and: [
        { "==": [{ var: "answers.has_mood_or_anxiety_concerns" }, true] },
        {
          or: [
            { ">=": [{ var: "derived.phq9_score" }, 10] },
            { ">=": [{ var: "derived.gad7_score" }, 10] },
          ],
        },
      ],
    },
    recommended_intervention:
      "Primary Care / Behavioral Health Follow-Up & Standardized Emotional-Behavioral Assessment",
    cpt_codes: ["96127", "99214"],
    icd10_codes: ["Z13.31", "Z13.32"],
    prior_auth_rationale_template:
      "Moderate-to-severe PHQ-9 (>= 10) or GAD-7 (>= 10) meets USPSTF Grade B preventive behavioral screening guidelines for structured clinician follow-up (CPT 96127).",
  },
];
