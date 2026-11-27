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
    recommended_intervention: "STAT Emergency Department Transfer & CTA Chest/Abdomen/Pelvis with Contrast (Rule Out Aortic Dissection)",
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
    recommended_intervention: "STAT Urgent Stroke/ED Evaluation, Brain MRI/MRA & Carotid Duplex Ultrasound",
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
    recommended_intervention: "STAT Urgent Neuroimaging (CT Head Non-Contrast / MRI Brain) & Acute Neurology Triage",
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
    recommended_intervention: "STAT Urgent Lower Extremity Venous Duplex Ultrasound / CT Pulmonary Angiography & D-Dimer",
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
    recommended_intervention: "STAT CT Pulmonary Angiography (CTPA) & Immediate Anticoagulation Assessment",
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
];
