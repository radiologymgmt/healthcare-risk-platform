# Master Build Specification: Enterprise Healthcare Risk Assessment Platform

> **Usage Instructions for Google Antigravity & Claude Code:**  
> Save this file as `SPEC.md` (or `CLAUDE.md` / `.antigravity/rules.md`) in the root of your repository. Always instruct your AI agent to read this file before generating code, and execute **one Phase at a time** to preserve accuracy and context limits.

---

## 1. Platform Overview & Non-Negotiable Guardrails

We are building a modular, HIPAA-compliant, 8-component clinical risk assessment platform deployed on **Google Cloud Platform (GCP)**.

### Core Architecture Principles
1. **Configuration Over Code:** All questionnaire items, plain-English tooltips, knockout logic, clinical risk rules (54+ assessments), and CPT/ICD-10 billing codes live in PostgreSQL (`questions` and `clinical_rules` tables) and are managed via the Admin Portal. Frontends act as dynamic renderers.
2. **Unified Data Model:** Patient answers and EHR-parsed clinical facts write to a shared, normalized Question ID registry so a single answer feeds multiple clinical calculators.
3. **HIPAA-by-Design (Strict Coding Rules):**
   * **Synthetic Data Only** during local development and testing. Never seed real PHI.
   * **Zero Browser PHI Persistence:** Never store PHI in `localStorage`, `sessionStorage`, or unencrypted cookies.
   * **Zero PHI in Logs:** Application loggers must redact `dob`, `first_name`, `last_name`, `mrn`, `email`, `phone`, and free-text clinical notes.
   * **Immutable Audit Trail:** Every `READ`, `CREATE`, `UPDATE`, `EXPORT`, or `DELETE` touching patient data must write an entry to `audit_logs`.
   * **Provenance Tracking:** Every AI-parsed answer must store a `confidence_score` and `source_document_id` + `source_excerpt` for clinician verification.

---

## 2. Monorepo Structure (8 Components)

Organize the repository as a Turborepo / workspace monorepo so Antigravity and Claude Code can work on one service at a time while sharing TypeScript types and schemas.

```text
healthcare-risk-platform/
├── SPEC.md                          # This master specification
├── infra/                           # GCP Terraform & Cloud Build configs
│   ├── terraform/                   # Cloud Run, Cloud SQL, VPC, Armor, Healthcare API
│   └── cloudbuild.yaml
├── packages/
│   ├── database/                    # PostgreSQL DDL migrations (Prisma or Drizzle) [Comp 7]
│   └── shared-contracts/            # Shared Zod/TypeScript types & 54-tool registry [Comp 1]
├── services/
│   ├── rules-engine-api/            # FastAPI (Python) or Node/Express API [Comp 1 & 7]
│   ├── clinical-parser-worker/      # Python + Vertex AI (Gemini) + Document AI [Comp 2]
│   └── interop-ingestion-worker/    # HL7 v2 / FHIR R4 / GCS Folder Watcher [Comp 6]
└── apps/
    ├── patient-web/                 # Next.js (Intake, Stedi Insurance, Scheduling) [Comp 3]
    ├── patient-mobile-pwa/          # Next.js PWA (Tokenized Magic-Link Review) [Comp 4]
    ├── provider-dashboard/          # Next.js (Workqueue, Split-Screen Doc Viewer) [Comp 5]
    └── admin-portal/                # Next.js (No-Code Rule Editor, Analytics, PDF) [Comp 8]
```

---

## 3. Component 7: Unified PostgreSQL Database Schema (DDL)

Target: **Google Cloud SQL for PostgreSQL 16** (Private IP only, CMEK encryption enabled).

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PATIENTS (Core Identity)
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mrn VARCHAR(100) UNIQUE,
    fhir_patient_id VARCHAR(128) UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    dob DATE NOT NULL,
    sex_at_birth VARCHAR(20) CHECK (sex_at_birth IN ('Female', 'Male', 'Intersex', 'Unknown')),
    email VARCHAR(255),
    phone VARCHAR(30),
    zip_code VARCHAR(15),
    insurance_payer_id VARCHAR(100),
    insurance_member_id VARCHAR(100),
    insurance_status JSONB DEFAULT '{}'::jsonb, -- Stores Stedi X12 271 response summary
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CLINICAL DOCUMENTS (Ingested via Comp 6: HL7, FHIR, or Folder Drop)
CREATE TABLE clinical_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    source_type VARCHAR(50) NOT NULL, -- 'HL7_ORU', 'FHIR_DOC', 'FOLDER_PDF', 'CCDA'
    document_category VARCHAR(50) NOT NULL, -- 'LAB', 'RADIOLOGY', 'VISIT_NOTE', 'ICD10_HISTORY'
    gcs_uri TEXT NOT NULL, -- Private Cloud Storage bucket URI
    extracted_text TEXT,
    parsed_status VARCHAR(30) DEFAULT 'PENDING', -- 'PENDING', 'PARSED', 'FAILED'
    document_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SHARED QUESTIONS DATASET (Managed via Comp 8 Admin Portal)
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_key VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'smoking_status', 'has_thunderclap_headache'
    domain VARCHAR(50) NOT NULL, -- 'Demographics', 'Oncology', 'Urology', 'OBGYN', 'Neurology', 'Hematology', 'Cardio', 'Acute'
    label_plain_english TEXT NOT NULL,
    helper_tooltip TEXT,
    input_type VARCHAR(30) NOT NULL, -- 'boolean', 'number', 'select', 'date', 'pedigree_array', 'lab_numeric'
    options_json JSONB DEFAULT '[]'::jsonb,
    data_source VARCHAR(30) DEFAULT 'HYBRID', -- 'PATIENT', 'EHR_LAB', 'HYBRID'
    is_knockout_gate BOOLEAN DEFAULT FALSE,
    display_conditions JSONB DEFAULT '{}'::jsonb, -- e.g., {"sex_at_birth": "Female", "min_age": 40, "depends_on": {"has_headaches": true}}
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    version INT DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CLINICAL RULES ENGINE (54+ Assessments, Managed via Comp 8 Admin Portal)
CREATE TABLE clinical_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'TYRER_CUZICK', 'PREMM5', 'IPSS', 'FIB4', 'SNNOOP10'
    display_name VARCHAR(150) NOT NULL,
    specialty VARCHAR(50) NOT NULL, -- 'Oncology', 'Urology', 'OBGYN', 'Neurology', 'Hematology', 'Cardiology', 'Pulmonology', 'MSK', 'Hepatology'
    rule_type VARCHAR(30) NOT NULL, -- 'PATIENT_REPORTED', 'EHR_LAB_DEPENDENT', 'HYBRID'
    acuity_level VARCHAR(20) NOT NULL CHECK (acuity_level IN ('ACUTE_RED_FLAG', 'HIGH_RISK', 'MODERATE_RISK', 'ROUTINE')),
    logic_expression JSONB NOT NULL, -- JsonLogic expression evaluated against patient response map
    recommended_intervention TEXT NOT NULL,
    cpt_codes TEXT[] NOT NULL, -- e.g., ARRAY['77049']
    icd10_codes TEXT[] NOT NULL, -- e.g., ARRAY['Z15.01']
    prior_auth_rationale_template TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    version INT DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ASSESSMENT SESSIONS (Tracks Web & Mobile Submissions)
CREATE TABLE assessment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    channel VARCHAR(30) NOT NULL, -- 'WEB_PORTAL', 'MOBILE_MAGIC_LINK', 'AUTO_EHR_EVAL'
    selected_modules TEXT[] DEFAULT ARRAY['all'],
    status VARCHAR(30) DEFAULT 'IN_PROGRESS', -- 'PREPOPULATED', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED'
    rules_version_snapshot INT NOT NULL DEFAULT 1,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 6. ASSESSMENT RESPONSES (Unified Answers: Patient + AI-Parsed + EHR Labs)
CREATE TABLE assessment_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    question_key VARCHAR(100) NOT NULL REFERENCES questions(question_key),
    answer_value JSONB NOT NULL, -- Supports booleans, numbers, strings, family pedigree arrays
    provenance VARCHAR(30) NOT NULL, -- 'PATIENT_ENTERED', 'AI_PARSED', 'PATIENT_CONFIRMED_AI', 'EHR_LAB_IMPORT'
    confidence_score NUMERIC(4,3), -- 0.000 to 1.000 for AI-parsed fields
    source_document_id UUID REFERENCES clinical_documents(id),
    source_excerpt TEXT, -- Exact sentence from visit note/lab for provider verification
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (session_id, question_key)
);

-- 7. TRIGGERED PATHWAYS (Outputs of Component 1 Rules Engine)
CREATE TABLE triggered_pathways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    rule_code VARCHAR(50) NOT NULL REFERENCES clinical_rules(rule_code),
    calculated_score NUMERIC(10,3),
    acuity_level VARCHAR(20) NOT NULL,
    recommended_intervention TEXT NOT NULL,
    cpt_codes TEXT[] NOT NULL,
    icd10_codes TEXT[] NOT NULL,
    clinician_disposition VARCHAR(30) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'ORDERED', 'DECLINED'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. PROVIDER WORKQUEUE (Component 5)
CREATE TABLE workqueue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    assigned_provider_id VARCHAR(128),
    priority VARCHAR(20) NOT NULL, -- 'STAT', 'HIGH', 'STANDARD'
    status VARCHAR(40) DEFAULT 'NEW', -- 'NEW', 'IN_REVIEW', 'PENDING_PRIOR_AUTH', 'SCHEDULED', 'COMPLETED'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. APPOINTMENTS (Components 3 & 5)
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    workqueue_item_id UUID REFERENCES workqueue_items(id),
    ehr_appointment_id VARCHAR(128),
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    visit_type VARCHAR(50) DEFAULT 'RISK_REVIEW_CONSULT',
    status VARCHAR(30) DEFAULT 'BOOKED', -- 'BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. TOKENIZED MAGIC LINKS (Component 4 Mobile Access)
CREATE TABLE magic_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) UNIQUE NOT NULL, -- SHA-256 hash of single-use cryptographic token
    expires_at TIMESTAMPTZ NOT NULL, -- Default: NOW() + INTERVAL '72 hours'
    verified_at TIMESTAMPTZ, -- Timestamp when patient passed DOB + ZIP/OTP check
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. IMMUTABLE HIPAA AUDIT LOGS
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id VARCHAR(128) NOT NULL, -- User ID, Provider ID, or 'SYSTEM_PARSER'
    actor_role VARCHAR(30) NOT NULL, -- 'PATIENT', 'PROVIDER', 'ADMIN', 'SYSTEM'
    action VARCHAR(50) NOT NULL, -- 'VIEW_PHI', 'UPDATE_RESPONSE', 'APPROVE_ORDER', 'EXPORT_PDF'
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(128),
    ip_address INET,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_responses_session ON assessment_responses(session_id);
CREATE INDEX idx_pathways_patient ON triggered_pathways(patient_id);
CREATE INDEX idx_workqueue_status_priority ON workqueue_items(status, priority);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
```

---

## 4. Component 1: Rules Engine Contract & 54-Tool Inventory

Use **JsonLogic** (`json-logic-js` or Python `json-logic`) inside `clinical_rules.logic_expression` so non-developers in the Admin Portal (Component 8) can edit thresholds without redeploying code.

### Example Rule Record (JSON Seed Format)
```json
{
  "rule_code": "USPSTF_LUNG",
  "display_name": "USPSTF Lung Cancer Screening",
  "specialty": "Pulmonology",
  "rule_type": "PATIENT_REPORTED",
  "acuity_level": "HIGH_RISK",
  "logic_expression": {
    "and": [
      { ">=": [{ "var": "derived.age" }, 50] },
      { "<=": [{ "var": "derived.age" }, 80] },
      { ">=": [{ "var": "answers.pack_years" }, 20] },
      { "in": [{ "var": "answers.smoking_status" }, ["current", "former"]] }
    ]
  },
  "recommended_intervention": "Low-Dose CT Thorax (LDCT)",
  "cpt_codes": ["71271"],
  "icd10_codes": ["Z87.891"]
}
```

### Complete 54-Assessment Registry to Seed
* **35 Patient-Reported / Gateway-Triggered Tools:**
  * *Oncology & Genetics (14):* Tyrer-Cuzick (IBIS), BOADICEA/CanRisk, Gail Model (BCRAT), PREMM5, FAP/MAP Criteria, HDGC Criteria, PancPRO/CAPS, BAP1-TPDS, VHL/HLRCC, MEN1/MEN2, Cowden (PTEN), NF1/NF2/TSC, USPSTF Lung, PLCOm2012.
  * *Urology & OBGYN (7):* PCPT 2.0 (proxy), ERSPC, IPSS, SHIM/IIEF-5, PFDI-20, Rotterdam (PCOS), ACOG/ACMG Expanded Carrier.
  * *Cardiovascular (6):* AHA PREVENT (ASCVD), CHA2DS2-VASc, HCM Risk-SCD, ADD-RS (Aortic Dissection), SVS AAA Screening, Edinburgh PAD.
  * *Neurology, Sleep, Bone & Hematology (8):* ABCD2 Stroke, SNNOOP10 Headache Red Flags, HIT-6, STOP-BANG, FRAX, OSTA, ISTH-BAT Bleeding, Wells DVT/PE.
* **19 EHR / Lab / Clinical-Note Derived Tools (Auto-populated by Component 2 & 6):**
  * BRCAPRO, Claus Model, MMRpro, Amsterdam II, Revised Bethesda, Bach Model, ROMA (CA-125/HE4), MESA Risk Score (CAC), HAS-BLED, Amyloid/MoCA/CDR, Huntington's/Ataxia, Garvan Fracture, KOOS/HOOS, Geneva PE Score, FIB-4 Index (AST/ALT/Platelets), NAFLD Fibrosis Score (NFS), APRI Score, AASLD HCC Screening, Full PSA-adjusted PCPT 2.0.

---

## 5. Core API Contracts (Between Components)

All internal APIs run on **Google Cloud Run** behind private VPC networking; public patient endpoints sit behind **Global HTTPS Load Balancer + Cloud Armor**.

| Endpoint | Component | Purpose |
| :--- | :--- | :--- |
| `GET /api/v1/questionnaire/config` | Comp 1 → Comp 3/4 | Returns active `questions`, knockout rules, and plain-English tooltips filtered by selected modules. |
| `POST /api/v1/sessions/:id/evaluate` | Comp 1 | Merges patient answers + EHR labs, runs all 54 JsonLogic rules, writes `triggered_pathways` & `workqueue_items`. |
| `POST /api/v1/parser/ingest-document` | Comp 6 → Comp 2 | Triggered by Eventarc when HL7/FHIR/PDF lands in GCS. Calls Vertex AI Gemini (structured JSON output) to extract answers with `source_excerpt` & `confidence_score`. |
| `POST /api/v1/insurance/verify` | Comp 3 | Proxies real-time X12 270/271 eligibility check to Stedi API and caches status in `patients.insurance_status`. |
| `POST /api/v1/magic-link/verify` | Comp 4 | Validates `token_hash` + `dob` + `zip_code` (or SMS OTP) before issuing a short-lived HTTP-only session cookie to view pre-populated answers. |
| `GET /api/v1/workqueue` | Comp 5 | Returns prioritized queue (`STAT` acute triage first) with linked pathways and document URIs. |
| `POST /api/v1/workqueue/:id/order` | Comp 5 → Comp 6 | Approves CPT/ICD-10 orders and dispatches outbound FHIR `ServiceRequest` or HL7 ORM message. |
| `CRUD /api/v1/admin/rules` | Comp 8 | Creates/updates rules and questions, bumping `version` snapshots without touching code. |
| `POST /api/v1/admin/pdf/:type` | Comp 8 | Generates branded PDFs (`patient_summary`, `prior_auth_packet`, `executive_overview`). |

---

## 6. GCP HIPAA Deployment Architecture

* **Project Setup:** Single GCP Project covered under signed Google Cloud BAA.
* **Compute:** 7 containerized Cloud Run services (scale-to-zero for dev; `min_instance_count=1` for prod APIs).
* **Database:** Cloud SQL PostgreSQL 16 (Private IP only, automated encrypted backups, Serverless VPC Access Connector).
* **AI Parsing:** Vertex AI (`gemini-2.5-pro` / `gemini-2.5-flash` with Zero Data Retention enabled) + Document AI (for scanned PDFs/faxes).
* **Interoperability:** Google Cloud Healthcare API (FHIR R4 Store + HL7 v2 Store) + Cloud Storage (private bucket with Eventarc triggers for folder drops).
* **Security Perimeter:**
  * *Patient Web & Mobile (Comp 3 & 4):* Global HTTPS Load Balancer + **Google Cloud Armor WAF** (OWASP Top 10 rules, US geo-restriction) + Cloud Run Ingress set to `internal-and-cloud-load-balancing`.
  * *Provider & Admin Portals (Comp 5 & 8):* Protected by **Google Identity-Aware Proxy (IAP)** with mandatory SSO + MFA.

---

## 7. Phased Starter Prompts (Copy-Paste into Antigravity or Claude Code)

Run these sequentially. Verify tests pass after each phase before starting the next.

### Phase 1 Prompt — Foundation, Database & 54-Tool Rules Engine
> "Read `SPEC.md`. Initialize the monorepo structure. Inside `packages/database`, create the PostgreSQL migration files matching Section 3 and a seed script that populates the shared `questions` dataset and all 54 `clinical_rules` using JsonLogic. Inside `services/rules-engine-api`, build the `/api/v1/questionnaire/config` and `/api/v1/sessions/:id/evaluate` endpoints with full unit tests using synthetic patient profiles."

### Phase 2 Prompt — Admin Portal Core (No-Code Configuration)
> "Read `SPEC.md`. Build `apps/admin-portal` (Next.js + Tailwind + shadcn/ui) connected to `services/rules-engine-api`. Implement the Question Editor, the JsonLogic Clinical Rule & CPT/ICD-10 Editor with version snapshotting, and RBAC middleware. Do not build analytics or PDF export yet."

### Phase 3 Prompt — Interoperability & Vertex AI Clinical Parser
> "Read `SPEC.md`. Build `services/interop-ingestion-worker` (handling GCS folder drops, HL7 v2 ORU/ADT messages, and FHIR R4 ingestion) and `services/clinical-parser-worker` (Python + Vertex AI Gemini structured JSON output). Given a synthetic visit note or lab PDF, extract answers mapped to our `question_key` registry with `confidence_score` and `source_excerpt` saved to `assessment_responses`."

### Phase 4 Prompt — Patient Web Portal & Mobile Magic-Link PWA
> "Read `SPEC.md`. Build `apps/patient-web` (dynamic questionnaire renderer with plain-English tooltips, knockout branching, Stedi X12 270/271 mock/API integration, and visit scheduling) and `apps/patient-mobile-pwa` (tokenized magic-link entry requiring DOB + ZIP verification, displaying AI pre-populated answers in a 'Review & Confirm' card flow). Enforce zero `localStorage` PHI."

### Phase 5 Prompt — Provider Workqueue, Executive Analytics & PDF Engine
> "Read `SPEC.md`. Build `apps/provider-dashboard` with a priority-sorted workqueue (`STAT` acute red flags first), a split-screen view showing triggered CPT/ICD-10 pathways alongside the underlying parsed clinical document excerpts, and one-click order approval. Then extend `apps/admin-portal` with executive analytics charts and a headless PDF generator for Patient Summaries and Prior-Auth Packets."