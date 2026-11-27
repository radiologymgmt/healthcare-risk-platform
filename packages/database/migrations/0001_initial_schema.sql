-- Migration: 0001_initial_schema.sql
-- Component 7: Unified PostgreSQL 16 Database Schema (SPEC.md Section 3)

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
