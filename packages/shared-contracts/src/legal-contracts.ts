/**
 * Canonical Legal Draft Contracts for RadManagement LLC
 * Jurisdiction: State of New York (Venue: New York County, NY)
 *
 * NOTICE: All contract texts below are structured legal drafts prepared for review
 * and finalization by RadManagement LLC's healthcare and corporate counsel.
 */

export const HARDCODED_SUPER_ADMIN_EMAIL = "radiologymgmt@gmail.com" as const;
export const DEMO_AGREEMENT_VERSION = "NY-v1.0" as const;
export const CONTRACT_GOVERNING_STATE = "New York" as const;

export interface LegalContractDocument {
  id: string;
  tier: "PRE_DEMO" | "PRE_PRODUCTION";
  code: string;
  title: string;
  subtitle: string;
  governingLaw: string;
  reviewStatus: string;
  summaryPoints: string[];
  sections: Array<{
    heading: string;
    body: string;
  }>;
}

export const PRE_DEMO_CONTRACTS: readonly LegalContractDocument[] = [
  {
    id: "pre-demo-mnda",
    tier: "PRE_DEMO",
    code: "PRE_DEMO_MNDA",
    title: "Mutual Non-Disclosure Agreement (MNDA)",
    subtitle: "Pre-Demo Confidentiality & Intellectual Property Protection · Draft for Counsel Review",
    governingLaw: "State of New York",
    reviewStatus: "DRAFT — FOR LEGAL COUNSEL REVIEW",
    summaryPoints: [
      "Protects RadManagement LLC's 69-model clinical rules library, AI prompts, software architecture, UI workflows, and business plans.",
      "Protects Evaluator's confidential workflow, strategic, and commercial feedback shared during evaluation.",
      "Prohibits reverse-engineering, copying, scraping, or building competing clinical triage products from the Demo.",
      "3-year confidentiality term (5 years / perpetual for trade secrets), governed by State of New York law.",
    ],
    sections: [
      {
        heading: "1. Parties & Purpose",
        body: "This Mutual Non-Disclosure Agreement ('Agreement') is entered into as of the Electronic Signature Date below between RadManagement LLC ('Company'), a New York healthcare technology and radiology operations organization, and the individual and organization identified in the electronic signature block ('Evaluator'). The parties wish to explore a potential commercial, clinical, or investment relationship involving Company's Enterprise Healthcare Risk Assessment Platform (the 'Purpose').",
      },
      {
        heading: "2. Definition of Confidential Information",
        body: "'Confidential Information' includes all non-public technical, clinical, operational, financial, or business information disclosed orally, visually, or electronically in connection with the Purpose, including without limitation: (a) Company's software portals, 69-model JsonLogic clinical rules engine, knockout question registries, derived clinical calculators, AI extraction prompts, UI/UX designs, architecture blueprints, security assessments, and pricing; and (b) Evaluator's non-public operational workflows, volume estimates, and strategic feedback.",
      },
      {
        heading: "3. Confidentiality Obligations & Restrictions",
        body: "Each receiving party shall: (a) hold the disclosing party's Confidential Information in strict confidence using at least the same degree of care it uses for its own confidential information (and never less than reasonable care); (b) use Confidential Information solely for the Purpose; and (c) restrict access to employees, officers, and legal/technical advisors with a strict need-to-know who are bound by written confidentiality obligations at least as protective as this Agreement. Evaluator shall NOT copy, record, scrape, benchmark publicly, decompile, reverse-engineer, or derive competing clinical decision-support rules or software from Company's platform.",
      },
      {
        heading: "4. Exclusions & Compelled Disclosure",
        body: "Confidential Information excludes information that: (a) is or becomes publicly available through no breach of this Agreement; (b) was lawfully known to the receiving party prior to disclosure; (c) is independently developed without reference to Confidential Information; or (d) is lawfully received from a third party without restriction. If disclosure is required by law or court order, the receiving party shall provide prompt prior written notice (where legally permitted) to enable protective relief.",
      },
      {
        heading: "5. No License, Ownership & Term",
        body: "All Confidential Information remains the exclusive property of the disclosing party; no patent, copyright, trade secret, or commercial license is granted hereunder. Confidentiality obligations survive for three (3) years from the Effective Date, and with respect to trade secrets (including source code, rule logic, and clinical workflows), for so long as such information remains a trade secret under New York and federal law (DTSA).",
      },
      {
        heading: "6. Governing Law & Venue (State of New York)",
        body: "This Agreement is governed by and construed in accordance with the laws of the State of New York, without regard to conflict-of-law principles. Any dispute arising hereunder shall be brought exclusively in the state or federal courts located in New York County, New York, and each party consents to personal jurisdiction therein. Breach may cause irreparable harm entitling the disclosing party to seek immediate equitable and injunctive relief.",
      },
    ],
  },
  {
    id: "pre-demo-sandbox",
    tier: "PRE_DEMO",
    code: "SYNTHETIC_SANDBOX_AGREEMENT",
    title: "Synthetic Demo Evaluation & Non-PHI Sandbox Access Agreement",
    subtitle: "Mandatory Evaluation Terms, Zero-PHI Prohibition & Non-Clinical Disclaimer · Draft for Counsel Review",
    governingLaw: "State of New York",
    reviewStatus: "DRAFT — FOR LEGAL COUNSEL REVIEW",
    summaryPoints: [
      "Grants a limited, revocable, non-commercial license solely to evaluate RadManagement LLC's synthetic demo environment.",
      "STRICT PROHIBITION: Evaluator MUST NOT enter real Protected Health Information (PHI), real patient names, DOBs, MRNs, or live clinical notes.",
      "Non-Clinical / AS-IS Disclaimer: Outputs, risk scores, AI summaries, and sample PDFs are illustrative only and NOT medical advice.",
      "Logged & Audited Access: All demo logins, signed agreements, and activity are logged for security and compliance under New York law.",
    ],
    sections: [
      {
        heading: "1. Limited Evaluation License",
        body: "Subject to Evaluator's strict compliance with this Agreement and the accompanying Mutual NDA, RadManagement LLC grants Evaluator a limited, non-exclusive, non-transferable, revocable license to access and view the RadManagement LLC demonstration environment (demo.risk.radmgmt.org) solely for internal evaluation of the product's capabilities.",
      },
      {
        heading: "2. STRICT PROHIBITION ON PROTECTED HEALTH INFORMATION (PHI)",
        body: "EVALUATOR EXPRESSLY ACKNOWLEDGES AND AGREES THAT THE DEMO ENVIRONMENT IS A SYNTHETIC SANDBOX NOT COVERED BY A HIPAA BUSINESS ASSOCIATE AGREEMENT (BAA). EVALUATOR SHALL NOT ENTER, UPLOAD, PASTE, OR TRANSMIT ANY REAL PROTECTED HEALTH INFORMATION (PHI) AS DEFINED UNDER HIPAA (45 CFR § 160.103), ANY PERSONALLY IDENTIFIABLE PATIENT DATA UNDER THE NEW YORK SHIELD ACT (N.Y. GEN. BUS. LAW § 899-aa / § 899-bb), OR ANY LIVE CLINICAL RECORDS. Evaluator shall use solely fictitious/synthetic test profiles. Evaluator indemnifies and holds harmless RadManagement LLC from any unauthorized PHI entered by Evaluator in violation of this Section.",
      },
      {
        heading: "3. Non-Clinical, Non-Diagnostic & AI Transparency Disclaimer",
        body: "The demonstration environment, including all 69 risk models, clinical thresholds, AI-generated note extractions, CPT/ICD-10 code suggestions, payer eligibility simulations, and downloadable PDFs, is provided strictly for informational and software evaluation purposes. IT DOES NOT PROVIDE MEDICAL ADVICE, DIAGNOSIS, OR TREATMENT, AND MUST NEVER BE USED FOR ACTUAL PATIENT CARE OR EMERGENCY TRIAGE. In production clinical deployments, all AI-organized summaries and screening pathways require independent review and order sign-off by licensed clinicians.",
      },
      {
        heading: "4. Security, Authorized Credentials & Audit Logging",
        body: "Evaluator's login credentials (email and password issued by RadManagement LLC) are personal and non-transferable. Evaluator shall not share credentials, attempt to bypass security controls, run automated vulnerability scans or penetration tests without prior written consent, or disrupt service availability. Evaluator consents to electronic logging of authentication events, IP addresses, timestamps, and electronic signature records.",
      },
      {
        heading: "5. Warranty Disclaimer, Limitation of Liability & New York Governing Law",
        body: "THE DEMO ENVIRONMENT IS PROVIDED 'AS-IS' AND 'AS-AVAILABLE' WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. TO THE MAXIMUM EXTENT PERMITTED BY NEW YORK LAW, RADMANAGEMENT LLC SHALL HAVE ZERO LIABILITY FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM EVALUATION ACCESS. This Agreement is governed by the laws of the State of New York, with exclusive venue in New York County, New York.",
      },
    ],
  },
];

export const PRE_PRODUCTION_CONTRACTS: readonly LegalContractDocument[] = [
  {
    id: "pre-prod-baa",
    tier: "PRE_PRODUCTION",
    code: "PRE_PROD_HIPAA_BAA",
    title: "HIPAA Business Associate Agreement (BAA) — Production Draft",
    subtitle: "45 CFR Parts 160 & 164 (Privacy, Security & Breach Notification Rules) · New York Healthcare Law",
    governingLaw: "Federal HIPAA / HITECH & State of New York",
    reviewStatus: "DRAFT — FOR LEGAL COUNSEL REVIEW PRIOR TO REAL ePHI",
    summaryPoints: [
      "Required before any live pilot or production deployment processing real ePHI in isolated project hrp-prod-01.",
      "Mirrors upstream BAA protections with Google Cloud, Stedi (X12 270/271), SSO Identity Provider, and transactional messaging.",
      "Commits to Administrative, Physical, and Technical Safeguards (CMEK, TLS 1.2+ RESTRICTED, IAP MFA, 6-year locked audit logs).",
      "Establishes breach notification protocol (72-hour discovery notice target; max statutory 60-day HIPAA deadline) & NY SHIELD alignment.",
    ],
    sections: [
      {
        heading: "1. Definitions & Regulatory Authority",
        body: "This Business Associate Agreement ('BAA') is entered into between [COVERED ENTITY / HEALTH SYSTEM NAME] ('Covered Entity') and RadManagement LLC ('Business Associate') effective upon execution of the Production Master Services Agreement ('MSA'). Capitalized terms not defined herein have the meanings set forth in HIPAA (45 CFR Parts 160 and 164), the HITECH Act, and applicable New York Public Health Law (N.Y. PHL § 18) and NY SHIELD Act provisions.",
      },
      {
        heading: "2. Permitted Uses & Disclosures of ePHI",
        body: "Business Associate may use or disclose Protected Health Information ('PHI') solely to perform preventive risk assessment, clinical workflow coordination, electronic payer eligibility verification, imaging order facilitation, and related SaaS services specified in the MSA, or as Required by Law. Business Associate shall apply the HIPAA Minimum Necessary standard and shall NOT sell PHI or use PHI for marketing or unauthorized AI model training.",
      },
      {
        heading: "3. Security Safeguards & Subcontractor Flow-Down",
        body: "Business Associate shall implement and maintain Administrative, Physical, and Technical Safeguards conforming to 45 CFR §§ 164.308, 164.310, and 164.312 — including Customer-Managed Encryption Keys (Cloud KMS CMEK), TLS 1.2+ transport encryption, Private-IP database isolation, Google Identity-Aware Proxy (IAP) with MFA, zero browser-storage PHI, and 6-year immutable audit logging. Business Associate shall ensure every subcontractor that creates, receives, maintains, or transmits PHI (including Google Cloud, Stedi, SSO IdP, and HIPAA messaging vendors) executes a written BAA with equivalent safeguards.",
      },
      {
        heading: "4. Breach & Security Incident Reporting",
        body: "Business Associate shall report to Covered Entity any Security Incident resulting in unauthorized access to ePHI or any Breach of Unsecured PHI without unreasonable delay and no later than seventy-two (72) hours following discovery (and in all cases well within the statutory 60-day period under 45 CFR § 164.410), providing affected individual counts, data elements involved, root cause, and mitigation steps.",
      },
      {
        heading: "5. Individual Rights, Accounting & Audit Cooperation",
        body: "Business Associate shall support Covered Entity's obligations to provide individuals access to PHI (45 CFR § 164.524), incorporate amendments (§ 164.526), and furnish an accounting of disclosures (§ 164.528) via RadManagement's immutable audit_logs and clinician correction trail. Business Associate shall make internal practices, books, and records relating to PHI available to the Secretary of HHS for compliance determination.",
      },
      {
        heading: "6. Term, Termination & Return/Destruction of PHI",
        body: "Upon termination of the MSA, Business Associate shall return or securely destroy all PHI (including Cloud SQL backups and GCS clinical drops upon lifecycle expiration) and retain no copies, or if return/destruction is infeasible, extend BAA protections indefinitely. Governed by federal HIPAA law and, to the extent not preempted, the laws of the State of New York (New York County venue).",
      },
    ],
  },
  {
    id: "pre-prod-msa",
    tier: "PRE_PRODUCTION",
    code: "PRE_PROD_MSA_PILOT",
    title: "Master Services & Clinical Pilot Agreement (MSA) — Production Draft",
    subtitle: "Commercial SaaS Terms, Clinical Decision Support Disclaimer, SLA & Insurance · State of New York",
    governingLaw: "State of New York",
    reviewStatus: "DRAFT — FOR LEGAL COUNSEL REVIEW",
    summaryPoints: [
      "Defines SaaS subscription / pilot scope, Order Forms, 99.9% production uptime SLA, and implementation milestones.",
      "Explicit Clinical Decision Support (CDS) & Licensed Clinician Responsibility Clause (software/AI assists; clinicians decide and order).",
      "Confirms Customer owns 100% of Customer Patient Data; RadManagement LLC owns 100% of Platform IP & software enhancements.",
      "Includes Cyber Liability / Tech E&O insurance schedule, mutual indemnification, and New York governing law.",
    ],
    sections: [
      {
        heading: "1. Scope of Platform Services & Order Forms",
        body: "RadManagement LLC ('Provider') will provide [CUSTOMER NAME] ('Customer') cloud-hosted access to the Enterprise Healthcare Risk Assessment Platform (Patient Web Intake, Mobile Magic-Link PWA, Provider Clinical Workqueue, Admin Governance Portal, Rules Engine API, and EHR/Stedi Interoperability Connectors) in a dedicated HIPAA-hardened Google Cloud environment (hrp-prod-01) pursuant to mutually executed Order Forms.",
      },
      {
        heading: "2. Clinical Decision Support (CDS) & Medical Judgment Disclaimer",
        body: "Customer acknowledges that the Platform is a clinical workflow, risk-stratification, and administrative coordination tool designed to assist — never replace — independent professional medical judgment. Automated AI document extraction (Vertex AI Gemini under BAA) and JsonLogic risk-model evaluations are preparatory decision-support aids only. Customer's licensed physicians and advanced practice providers retain sole legal and clinical responsibility for verifying patient data, interpreting findings, diagnosing conditions, managing emergencies, and approving or declining all imaging, lab, and genetic orders.",
      },
      {
        heading: "3. Data Ownership, Security & Service Level Availability",
        body: "Customer retains sole ownership of all Customer Patient Data and ePHI. Provider retains all right, title, and interest in and to the Platform, source code, default rule libraries, and de-identified/aggregated operational telemetry (strictly de-identified per HIPAA Safe Harbor 45 CFR § 164.514(b)). Provider targets 99.9% monthly production uptime backed by Multi-Zone REGIONAL HA Cloud SQL PostgreSQL 16 and automated 7-day PITR recovery.",
      },
      {
        heading: "4. Fees, Insurance, Indemnification & Liability Cap",
        body: "Fees, implementation charges, and per-eligibility/per-assessment tiers are specified in each Order Form. Provider shall maintain Commercial General Liability, Technology Errors & Omissions (E&O), and Cyber / Network Security Liability insurance (target limits: $2,000,000–$5,000,000 per occurrence/aggregate, subject to final commercial negotiation). Standard mutual IP/breach indemnification and negotiated super-cap for HIPAA/confidentiality breaches apply. Governed by the laws of the State of New York (New York County venue).",
      },
    ],
  },
  {
    id: "pre-prod-ip-schedule",
    tier: "PRE_PRODUCTION",
    code: "PRE_PROD_IP_LICENSING",
    title: "Schedule C: Clinical Scoring Instruments, AMA CPT® & Vendor BAA Checklist",
    subtitle: "Mandatory Third-Party Licenses & Subcontractor BAAs Required Prior to Commercial Production",
    governingLaw: "Federal / State of New York",
    reviewStatus: "PROCUREMENT & LEGAL VERIFICATION CHECKLIST",
    summaryPoints: [
      "AMA CPT® Commercial Distribution License required before commercializing CPT codes/descriptions to paying health systems.",
      "Verify commercial software licenses (or keep clearly disclosed open clinical proxies) for FRAX®, Tyrer-Cuzick/IBIS, CanRisk, HIT-6™, KCCQ-12, MoCA®, and AD8®.",
      "Execute upstream BAAs: Google Cloud HIPAA BAA, Stedi HIPAA BAA, SSO IdP BAA, and HIPAA SMS/Email provider BAA.",
      "Execute EHR Interop / App Marketplace agreements (Epic, Oracle Health/Cerner, Athenahealth) prior to live HL7/FHIR production feeds.",
    ],
    sections: [
      {
        heading: "1. Upstream Subcontractor BAAs (Must Be Countersigned Before Live ePHI)",
        body: "1) Google Cloud Platform HIPAA BAA (covering Cloud Run, Cloud SQL, GCS, Cloud KMS, Secret Manager, Cloud Healthcare API, Cloud Armor, IAP, Cloud Logging, and Vertex AI). 2) Stedi Production API Agreement & HIPAA BAA (for live X12 270/271 eligibility transactions). 3) Corporate SSO / Identity Provider BAA (Google Workspace / Microsoft Entra ID / Okta). 4) HIPAA-Compliant Transactional SMS & Email BAA (e.g., Twilio HIPAA / Paubox) for delivering Patient Magic Links without PHI in message text.",
      },
      {
        heading: "2. Medical Coding & Clinical Instrument Commercial Licenses",
        body: "1) American Medical Association (AMA) CPT® Commercial Software License for distribution of CPT procedure codes and descriptions. 2) Proprietary Risk Model Licenses: evaluate commercial software licensing requirements prior to production go-live for FRAX® (University of Sheffield / Bone Health Foundation), Tyrer-Cuzick / IBIS (QMUL), CanRisk / BOADICEA (University of Cambridge), HIT-6™ (Optum/QualityMetric), KCCQ-12 (CV Outcomes), MoCA® (MoCA Cognition), and AD8® (Washington University). Public-domain / open clinical guidelines (ICD-10-CM, USPSTF, NCCN criteria, ACR TI-RADS, Lung-RADS, Fukuoka/Kyoto, SVS, ADA Risk Test, AUDIT-C, PHQ-9, GAD-7, CHA2DS2-VASc, HAS-BLED, Wells/Geneva, STOP-BANG, FIB-4, APRI, NFS) require accurate attribution and ongoing guideline currency review.",
      },
      {
        heading: "3. New York & Multi-State Healthcare Compliance Disclosures",
        body: "Prior to patient launch in New York and other operating states, counsel should finalize: (a) HIPAA Notice of Privacy Practices (NPP) & NY PHL § 18 patient access alignment; (b) Patient Release, AI-Assisted Processing Disclosure & 911 Emergency Notice (configurable live in Admin Portal /governance → Platform Settings, including state-specific AI healthcare disclosure compliance such as CA AB 3030 / CO AI Act where deployed); and (c) TCPA express written consent language for SMS Magic Links and appointment reminders.",
      },
    ],
  },
];

export const ALL_LEGAL_CONTRACTS: readonly LegalContractDocument[] = [
  ...PRE_DEMO_CONTRACTS,
  ...PRE_PRODUCTION_CONTRACTS,
];
