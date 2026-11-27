import type { AcuityLevel, RuleSpecialty, RuleType } from "./enums.js";

export interface ClinicalToolDefinition {
  rule_code: string;
  display_name: string;
  specialty: RuleSpecialty;
  rule_type: RuleType;
  acuity_level: AcuityLevel;
  category: "PATIENT_REPORTED_GATEWAY" | "EHR_LAB_DERIVED";
  score_derived_key?: string;
}

/**
 * Canonical 69-Assessment Registry (54 Core + 15 Supplemental Screeners):
 * - 47 Patient-Reported / Gateway-Triggered Tools
 * - 22 EHR / Lab / Radiology-Note Derived Tools
 */
export const CLINICAL_TOOL_REGISTRY: readonly ClinicalToolDefinition[] = [
  // =========================================================================
  // 47 PATIENT-REPORTED / GATEWAY-TRIGGERED TOOLS (35 Core + 12 Supplemental)
  // =========================================================================

  // Oncology & Genetics (14)
  { rule_code: "TYRER_CUZICK", display_name: "Tyrer-Cuzick (IBIS) Breast Cancer Risk", specialty: "Oncology", rule_type: "HYBRID", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "tyrer_cuzick_lifetime_risk" },
  { rule_code: "BOADICEA_CANRISK", display_name: "BOADICEA / CanRisk Breast & Ovarian Risk", specialty: "Oncology", rule_type: "HYBRID", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "canrisk_lifetime_risk" },
  { rule_code: "GAIL_BCRAT", display_name: "Gail Model (BCRAT) 5-Year Breast Cancer Risk", specialty: "Oncology", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "gail_5yr_risk" },
  { rule_code: "PREMM5", display_name: "PREMM5 Lynch Syndrome Risk Model", specialty: "Oncology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "premm5_score" },
  { rule_code: "FAP_MAP_CRITERIA", display_name: "FAP / MAP Hereditary Polyposis Criteria", specialty: "Oncology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "HDGC_CRITERIA", display_name: "Hereditary Diffuse Gastric Cancer (HDGC) Criteria", specialty: "Oncology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "PANCPRO_CAPS", display_name: "PancPRO / CAPS Pancreatic Cancer Screening", specialty: "Oncology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "BAP1_TPDS", display_name: "BAP1 Tumor Predisposition Syndrome Criteria", specialty: "Oncology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "VHL_HLRCC", display_name: "VHL / HLRCC Hereditary Renal Cancer Criteria", specialty: "Oncology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "MEN1_MEN2", display_name: "MEN1 / MEN2 Multiple Endocrine Neoplasia Criteria", specialty: "Oncology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "COWDEN_PTEN", display_name: "Cowden Syndrome (PTEN) Cleveland Clinic Criteria", specialty: "Oncology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "NF1_NF2_TSC", display_name: "NF1 / NF2 / TSC Neurocutaneous Syndrome Criteria", specialty: "Oncology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "USPSTF_LUNG", display_name: "USPSTF Lung Cancer Screening", specialty: "Pulmonology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "PLCOM2012", display_name: "PLCOm2012 6-Year Lung Cancer Risk Model", specialty: "Pulmonology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "plcom2012_6yr_risk" },

  // Urology & OBGYN (7)
  { rule_code: "PCPT_2_PROXY", display_name: "PCPT 2.0 Prostate Cancer Risk (Patient Proxy)", specialty: "Urology", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "ERSPC", display_name: "ERSPC Prostate Cancer Risk Calculator", specialty: "Urology", rule_type: "HYBRID", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "IPSS", display_name: "International Prostate Symptom Score (IPSS)", specialty: "Urology", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "ipss_score" },
  { rule_code: "SHIM_IIEF5", display_name: "SHIM / IIEF-5 Erectile Dysfunction Screen", specialty: "Urology", rule_type: "PATIENT_REPORTED", acuity_level: "ROUTINE", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "shim_score" },
  { rule_code: "PFDI_20", display_name: "PFDI-20 Pelvic Floor Distress Inventory", specialty: "OBGYN", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "pfdi20_score" },
  { rule_code: "ROTTERDAM_PCOS", display_name: "Rotterdam PCOS Diagnostic Criteria", specialty: "OBGYN", rule_type: "HYBRID", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "rotterdam_criteria_count" },
  { rule_code: "ACOG_ACMG_CARRIER", display_name: "ACOG / ACMG Expanded Carrier Screening", specialty: "OBGYN", rule_type: "PATIENT_REPORTED", acuity_level: "ROUTINE", category: "PATIENT_REPORTED_GATEWAY" },

  // Cardiovascular (6)
  { rule_code: "AHA_PREVENT", display_name: "AHA PREVENT 10-Year ASCVD Risk", specialty: "Cardiology", rule_type: "HYBRID", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "aha_prevent_10yr_risk" },
  { rule_code: "CHA2DS2_VASC", display_name: "CHA2DS2-VASc Atrial Fibrillation Stroke Risk", specialty: "Cardiology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "cha2ds2_vasc_score" },
  { rule_code: "HCM_RISK_SCD", display_name: "HCM Risk-SCD Sudden Cardiac Death Screen", specialty: "Cardiology", rule_type: "HYBRID", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "ADD_RS", display_name: "ADD-RS Acute Aortic Dissection Detection", specialty: "Cardiology", rule_type: "PATIENT_REPORTED", acuity_level: "ACUTE_RED_FLAG", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "add_rs_score" },
  { rule_code: "SVS_AAA", display_name: "SVS Abdominal Aortic Aneurysm Screening", specialty: "Cardiology", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "EDINBURGH_PAD", display_name: "Edinburgh Claudication / PAD Questionnaire", specialty: "Cardiology", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY" },

  // Neurology, Sleep, Bone & Hematology (8)
  { rule_code: "ABCD2_STROKE", display_name: "ABCD2 Acute TIA Stroke Risk Score", specialty: "Neurology", rule_type: "PATIENT_REPORTED", acuity_level: "ACUTE_RED_FLAG", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "abcd2_score" },
  { rule_code: "SNNOOP10", display_name: "SNNOOP10 Secondary Headache Red Flags", specialty: "Neurology", rule_type: "PATIENT_REPORTED", acuity_level: "ACUTE_RED_FLAG", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "HIT_6", display_name: "HIT-6 Headache Impact Test", specialty: "Neurology", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "hit6_score" },
  { rule_code: "STOP_BANG", display_name: "STOP-BANG Obstructive Sleep Apnea Screen", specialty: "Sleep", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "stop_bang_score" },
  { rule_code: "FRAX", display_name: "FRAX 10-Year Osteoporotic Fracture Risk", specialty: "Bone", rule_type: "HYBRID", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "frax_major_risk" },
  { rule_code: "OSTA", display_name: "OSTA Osteoporosis Self-Assessment Tool", specialty: "Bone", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "osta_score" },
  { rule_code: "ISTH_BAT", display_name: "ISTH-BAT Bleeding Assessment Tool", specialty: "Hematology", rule_type: "PATIENT_REPORTED", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "isth_bat_score" },
  { rule_code: "WELLS_DVT_PE", display_name: "Wells DVT / Pulmonary Embolism Criteria", specialty: "Hematology", rule_type: "PATIENT_REPORTED", acuity_level: "ACUTE_RED_FLAG", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "wells_dvt_pe_score" },

  // Supplemental Patient-Reported / Gateway-Triggered Screeners (12)
  { rule_code: "USPSTF_CRC_SCREENING", display_name: "USPSTF / ACG Colorectal Cancer Screening Eligibility", specialty: "Gastroenterology", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "DENSE_BREAST_RADIATION_MRI", display_name: "Dense Breast & Chest-Radiation Supplemental Screening (ACR/NCCN)", specialty: "Oncology", rule_type: "HYBRID", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "DUTCH_LIPID_FH", display_name: "Dutch Lipid Clinic Network (FH) & Lp(a) Cardiovascular Screener", specialty: "Cardiology", rule_type: "HYBRID", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "dutch_lipid_fh_score" },
  { rule_code: "SVS_CAROTID_STENOSIS", display_name: "SVS Carotid Artery Stenosis Risk Screener", specialty: "Cardiology", rule_type: "HYBRID", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY" },
  { rule_code: "SPINE_ODI_CAUDA_EQUINA", display_name: "Oswestry Spine Disability (ODI) & Cauda Equina Red-Flag Screener", specialty: "MSK", rule_type: "PATIENT_REPORTED", acuity_level: "ACUTE_RED_FLAG", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "odi_score" },
  { rule_code: "AD8_DEMENTIA_SCREEN", display_name: "AD8 Patient / Informant Cognitive Screener", specialty: "Neurology", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "ad8_score" },
  { rule_code: "COPD_CAT_MMRC", display_name: "COPD Assessment Test (CAT) / mMRC Dyspnea Scale", specialty: "Pulmonology", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "cat_score" },
  { rule_code: "FRAMINGHAM_HF_KCCQ", display_name: "Heart Failure Risk & KCCQ-12 Symptom Screener", specialty: "Cardiology", rule_type: "HYBRID", acuity_level: "HIGH_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "hf_risk_score" },
  { rule_code: "SARC_F_SARCOPENIA", display_name: "SARC-F Sarcopenia & Body Composition Screener", specialty: "Bone", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "sarc_f_score" },
  { rule_code: "ADA_DIABETES_KDIGO_CKD", display_name: "ADA Type 2 Diabetes Risk Test & KDIGO CKD Screener", specialty: "Metabolic & Renal", rule_type: "HYBRID", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "ada_diabetes_risk_score" },
  { rule_code: "AUDIT_C_ALCOHOL", display_name: "AUDIT-C Validated Alcohol Risk & Liver Screener", specialty: "Gastroenterology", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "audit_c_score" },
  { rule_code: "PHQ9_GAD7_BEHAVIORAL", display_name: "PHQ-9 Depression & GAD-7 Anxiety Preventive Screener", specialty: "Behavioral Health", rule_type: "PATIENT_REPORTED", acuity_level: "MODERATE_RISK", category: "PATIENT_REPORTED_GATEWAY", score_derived_key: "behavioral_max_score" },

  // =========================================================================
  // 22 EHR / LAB / CLINICAL-NOTE DERIVED TOOLS (19 Core + 3 Supplemental)
  // =========================================================================
  { rule_code: "BRCAPRO", display_name: "BRCAPRO Hereditary BRCA1/2 Carrier Probability", specialty: "Oncology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "CLAUS_MODEL", display_name: "Claus Model Familial Breast Cancer Risk", specialty: "Oncology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "MMRPRO", display_name: "MMRpro Mismatch Repair Gene Risk Model", specialty: "Oncology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "AMSTERDAM_II", display_name: "Amsterdam II Lynch Syndrome Criteria", specialty: "Oncology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "REVISED_BETHESDA", display_name: "Revised Bethesda Guidelines (MSI / IHC Testing)", specialty: "Oncology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "BACH_MODEL", display_name: "Bach Lung Cancer Risk Model (Asbestos/Smoking)", specialty: "Pulmonology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "ROMA_CA125_HE4", display_name: "ROMA Ovarian Malignancy Risk Algorithm (CA-125/HE4)", specialty: "OBGYN", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED", score_derived_key: "roma_score" },
  { rule_code: "MESA_CAC", display_name: "MESA 10-Year CHD Risk Score (Coronary Calcium)", specialty: "Cardiology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED", score_derived_key: "mesa_cac_score" },
  { rule_code: "HAS_BLED", display_name: "HAS-BLED Anticoagulation Major Bleeding Risk", specialty: "Cardiology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED", score_derived_key: "has_bled_score" },
  { rule_code: "AMYLOID_MOCA_CDR", display_name: "Amyloid PET / MoCA / CDR Cognitive Decline Screen", specialty: "Neurology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "HUNTINGTONS_ATAXIA", display_name: "Huntington's Disease / Hereditary Ataxia Risk", specialty: "Neurology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "GARVAN_FRACTURE", display_name: "Garvan Institute Fracture Risk Calculator", specialty: "Bone", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "MODERATE_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "KOOS_HOOS", display_name: "KOOS / HOOS Knee & Hip Osteoarthritis Index", specialty: "MSK", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "MODERATE_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "GENEVA_PE", display_name: "Revised Geneva Pulmonary Embolism Score", specialty: "Hematology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "ACUTE_RED_FLAG", category: "EHR_LAB_DERIVED", score_derived_key: "geneva_pe_score" },
  { rule_code: "FIB4", display_name: "FIB-4 Hepatic Fibrosis Index (AST/ALT/Platelets)", specialty: "Hepatology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED", score_derived_key: "fib4_score" },
  { rule_code: "NAFLD_NFS", display_name: "NAFLD Fibrosis Score (NFS)", specialty: "Hepatology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED", score_derived_key: "nfs_score" },
  { rule_code: "APRI", display_name: "APRI AST-to-Platelet Ratio Index", specialty: "Hepatology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED", score_derived_key: "apri_score" },
  { rule_code: "AASLD_HCC", display_name: "AASLD Hepatocellular Carcinoma Surveillance", specialty: "Hepatology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "PCPT_2_FULL_PSA", display_name: "Full PSA-Adjusted PCPT 2.0 Prostate Cancer Risk", specialty: "Urology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
  // Supplemental EHR / Radiology-Finding Derived Tools (3)
  { rule_code: "ACR_TIRADS_THYROID", display_name: "ACR TI-RADS Thyroid Nodule Follow-Up Stratifier", specialty: "Endocrinology", rule_type: "HYBRID", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "FUKUOKA_IPMN_PANCREAS", display_name: "Fukuoka / Kyoto Pancreatic Cyst (IPMN) Surveillance", specialty: "Gastroenterology", rule_type: "HYBRID", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
  { rule_code: "LUNG_RADS_FOLLOWUP", display_name: "Lung-RADS Pulmonary Nodule Follow-Up Tracker", specialty: "Pulmonology", rule_type: "EHR_LAB_DEPENDENT", acuity_level: "HIGH_RISK", category: "EHR_LAB_DERIVED" },
] as const;

export const CLINICAL_TOOL_MAP = new Map<string, ClinicalToolDefinition>(
  CLINICAL_TOOL_REGISTRY.map((tool) => [tool.rule_code, tool]),
);
