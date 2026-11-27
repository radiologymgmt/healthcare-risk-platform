export interface SeedUser {
  email: string;
  full_name: string;
  role: "ADMIN" | "PROVIDER" | "COORDINATOR" | "AUDITOR";
  npi_number: string | null;
  specialty: string | null;
}

export interface SeedAcceptedPayer {
  payer_code: string;
  stedi_trading_partner_id: string;
  payer_name: string;
  acceptance_status: "IN_NETWORK" | "OUT_OF_NETWORK_ACCEPTED" | "NOT_ACCEPTED";
  accepted_plan_types: string[];
  excluded_plan_keywords: string[];
  requires_pcp_referral: boolean;
  prior_auth_modalities: string[];
  self_pay_available: boolean;
  patient_guidance_note: string;
  sort_order: number;
}

export interface SeedPlatformSetting {
  setting_key: string;
  category: "consent" | "branding" | "scheduling" | "ai_prompts" | "derived_metrics" | "pdf_templates";
  label: string;
  description: string;
  value_json: Record<string, unknown>;
}

export const SEED_USERS: readonly SeedUser[] = [
  {
    email: "admin@radmgmt.org",
    full_name: "Clinical Platform Administrator",
    role: "ADMIN",
    npi_number: null,
    specialty: "Radiology Operations",
  },
  {
    email: "elena.morales.md@radmgmt.org",
    full_name: "Dr. Elena Morales, MD",
    role: "PROVIDER",
    npi_number: "1234567890",
    specialty: "Diagnostic & Preventive Radiology",
  },
  {
    email: "sarah.kim.rn@radmgmt.org",
    full_name: "Sarah Kim, RN — Imaging Coordinator",
    role: "COORDINATOR",
    npi_number: null,
    specialty: "Patient Scheduling & Prior Auth",
  },
  {
    email: "hipaa.auditor@radmgmt.org",
    full_name: "HIPAA Compliance Auditor",
    role: "AUDITOR",
    npi_number: null,
    specialty: "Compliance & Security",
  },
];

export const SEED_ACCEPTED_PAYERS: readonly SeedAcceptedPayer[] = [
  {
    payer_code: "BSCA_94036",
    stedi_trading_partner_id: "94036",
    payer_name: "Blue Shield / BlueCross Commercial",
    acceptance_status: "IN_NETWORK",
    accepted_plan_types: ["PPO", "EPO", "POS", "HDHP"],
    excluded_plan_keywords: ["Narrow HMO", "Restricted Exchange"],
    requires_pcp_referral: false,
    prior_auth_modalities: ["MRI", "CT", "PET"],
    self_pay_available: true,
    patient_guidance_note:
      "In-network with RadManagement LLC for preventive screening and diagnostic imaging. Preventive mammography, LDCT, and DEXA are typically covered at $0 copay.",
    sort_order: 10,
  },
  {
    payer_code: "AETNA_60054",
    stedi_trading_partner_id: "60054",
    payer_name: "Aetna Commercial & Medicare Advantage",
    acceptance_status: "IN_NETWORK",
    accepted_plan_types: ["PPO", "POS", "Open Access", "Medicare Advantage"],
    excluded_plan_keywords: ["Aetna Better Health Medicaid"],
    requires_pcp_referral: false,
    prior_auth_modalities: ["MRI", "CT", "PET"],
    self_pay_available: true,
    patient_guidance_note:
      "In-network with RadManagement LLC. Our care team coordinates prior authorization automatically for advanced MRI/CT exams.",
    sort_order: 20,
  },
  {
    payer_code: "UHC_87726",
    stedi_trading_partner_id: "87726",
    payer_name: "UnitedHealthcare",
    acceptance_status: "IN_NETWORK",
    accepted_plan_types: ["Choice Plus", "PPO", "Options PPO", "Medicare Advantage"],
    excluded_plan_keywords: ["Navigate HMO", "Charter HMO"],
    requires_pcp_referral: false,
    prior_auth_modalities: ["MRI", "CT", "PET", "Ultrasound"],
    self_pay_available: true,
    patient_guidance_note:
      "In-network for most UnitedHealthcare Choice Plus and PPO plans. Navigate/Charter HMO plans may require a PCP referral.",
    sort_order: 30,
  },
  {
    payer_code: "CIGNA_62308",
    stedi_trading_partner_id: "62308",
    payer_name: "Cigna Healthcare",
    acceptance_status: "IN_NETWORK",
    accepted_plan_types: ["Open Access Plus", "PPO", "LocalPlus"],
    excluded_plan_keywords: ["Connect Narrow"],
    requires_pcp_referral: false,
    prior_auth_modalities: ["MRI", "CT", "PET"],
    self_pay_available: true,
    patient_guidance_note:
      "In-network with RadManagement LLC. Preventive screenings follow USPSTF benefit rules.",
    sort_order: 40,
  },
  {
    payer_code: "MEDICARE_00882",
    stedi_trading_partner_id: "00882",
    payer_name: "Medicare Part B (Traditional)",
    acceptance_status: "IN_NETWORK",
    accepted_plan_types: ["Medicare Part B", "Supplemental Medigap"],
    excluded_plan_keywords: [],
    requires_pcp_referral: false,
    prior_auth_modalities: [],
    self_pay_available: true,
    patient_guidance_note:
      "RadManagement LLC participates in Traditional Medicare Part B. Covered preventive screenings (LDCT, DEXA, AAA Ultrasound, Mammography) carry $0 patient coinsurance when criteria are met.",
    sort_order: 50,
  },
  {
    payer_code: "ANTHEM_HMO_00450",
    stedi_trading_partner_id: "00450",
    payer_name: "Anthem Regional Narrow HMO",
    acceptance_status: "OUT_OF_NETWORK_ACCEPTED",
    accepted_plan_types: ["HMO"],
    excluded_plan_keywords: [],
    requires_pcp_referral: true,
    prior_auth_modalities: ["MRI", "CT", "PET", "Ultrasound"],
    self_pay_available: true,
    patient_guidance_note:
      "Currently out-of-network for this narrow HMO plan. Transparent cash self-pay pricing is available, or our team can coordinate an out-of-network referral.",
    sort_order: 60,
  },
  {
    payer_code: "KAISER_CLOSED_91051",
    stedi_trading_partner_id: "91051",
    payer_name: "Kaiser Permanente (Closed HMO)",
    acceptance_status: "NOT_ACCEPTED",
    accepted_plan_types: [],
    excluded_plan_keywords: ["Kaiser HMO"],
    requires_pcp_referral: true,
    prior_auth_modalities: ["MRI", "CT", "PET"],
    self_pay_available: true,
    patient_guidance_note:
      "Kaiser Permanente closed-network HMO plans are not currently contracted with RadManagement LLC. You are welcome to complete this assessment and schedule with our transparent self-pay option.",
    sort_order: 70,
  },
];

export const SEED_PLATFORM_SETTINGS: readonly SeedPlatformSetting[] = [
  {
    setting_key: "patient_release_consent",
    category: "consent",
    label: "Patient Release, AI Disclosure & 911 Emergency Warning",
    description:
      "Displayed before patients begin their risk assessment or mobile record review. Updating the version prompts fresh consent capture.",
    value_json: {
      consent_version: "v1.0",
      title: "Patient Release, AI Processing Disclosure & Safety Notice",
      organization_name: "RadManagement LLC",
      data_sharing_statement:
        "I authorize RadManagement LLC and its participating healthcare partners, referring physicians, and radiology care coordinators to receive, securely store, and review the health information I submit (along with linked clinical records) for preventive risk assessment and imaging coordination in accordance with HIPAA.",
      ai_clinician_statement:
        "I understand that my assessment responses and clinical documents may be initially processed by HIPAA-compliant automated AI tools to organize clinical risk factors, and that all screening recommendations and imaging orders are reviewed and approved by licensed clinicians.",
      emergency_911_headline: "Not for Medical Emergencies — Call 911 for Acute Symptoms",
      emergency_911_body:
        "This assessment is for preventive and non-emergency care coordination only. If you are experiencing a sudden severe headache, tearing chest or back pain, shortness of breath, sudden weakness or trouble speaking, or any other acute or emergent symptoms, STOP immediately and call 911, go to the nearest Emergency Room, or speak directly with your doctor right away.",
      require_typed_signature: true,
    },
  },
  {
    setting_key: "portal_branding",
    category: "branding",
    label: "Patient Portal Messaging & Organization Metadata",
    description:
      "Controls organization display name, organization NPI for insurance network checks, and patient-facing hero copy.",
    value_json: {
      organization_name: "RadManagement LLC",
      organization_npi: "1982736450",
      organization_tax_id_last4: "4821",
      hero_eyebrow: "PREVENTIVE CARE FOR YOU & THE PEOPLE YOU LOVE",
      hero_headline: "Stay Ahead of Your Health — For Every Milestone Ahead",
      hero_subheadline:
        "In about 5 minutes, answer simple, plain-English questions about your personal and family health history. Our evidence-based guidelines match you with the exact preventive imaging screenings that matter most for your stage of life.",
      support_phone: "(800) 555-0199",
    },
  },
  {
    setting_key: "scheduling_config",
    category: "scheduling",
    label: "Clinic Scheduling Hours & Visit Types",
    description: "Controls available booking days, appointment duration, and visit type catalog.",
    value_json: {
      slot_duration_minutes: 30,
      days_ahead: 5,
      default_hours: [9, 11, 14, 16],
      visit_types: [
        "PREVENTIVE_IMAGING_CONSULT",
        "HIGH_RISK_BREAST_MRI_CONSULT",
        "LOW_DOSE_LUNG_CT_SCREENING",
        "CORONARY_CALCIUM_CT",
        "DEXA_BONE_DENSITY_SCAN",
        "GENETIC_COUNSELING_TELEHEALTH",
      ],
    },
  },
  {
    setting_key: "ai_extraction_prompt",
    category: "ai_prompts",
    label: "Gemini Clinical Document Extraction Instructions",
    description:
      "Light-code prompt guidance applied during HIPAA-compliant Vertex AI Gemini extraction of clinical notes, radiology reports, and lab results.",
    value_json: {
      model_name: "gemini-3-flash-preview",
      minimum_confidence_threshold: 0.72,
      system_instructions:
        "Extract only explicit clinical facts grounded in verbatim text from the source document. Never fabricate or extrapolate absent lab values, smoking pack-years, or family history ages. Return exact source quotes for every extracted field.",
      custom_field_hints: {
        pack_years: "Calculate packs/day * years smoked only when explicitly stated.",
        breast_density_birads: "Map BI-RADS density categories strictly to A, B, C, or D.",
      },
    },
  },
  {
    setting_key: "derived_metric_overrides",
    category: "derived_metrics",
    label: "Sandboxed Custom Derived Metric Formulas (JsonLogic)",
    description:
      "Declarative JsonLogic arithmetic formulas evaluated safely without eval() alongside built-in clinical calculators.",
    value_json: {
      enabled: true,
      custom_metrics: [],
    },
  },
  {
    setting_key: "pdf_template_config",
    category: "pdf_templates",
    label: "Branded Clinical PDF Letterhead & Disclaimers",
    description:
      "Customize footer disclaimers, contact block, and clinical sign-off wording rendered in Headless Chromium PDFs.",
    value_json: {
      letterhead_subtitle: "Clinical Imaging & Preventive Radiology Solutions",
      footer_disclaimer:
        "CONFIDENTIAL PROTECTED HEALTH INFORMATION (PHI) — Generated by RadManagement LLC. Clinical recommendations require licensed provider review prior to order execution.",
      emergency_footer_note:
        "If the patient reports acute or emergent symptoms, instruct immediate Emergency Department evaluation or 911 activation.",
    },
  },
];
