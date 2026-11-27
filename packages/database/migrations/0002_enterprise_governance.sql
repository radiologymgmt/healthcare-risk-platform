-- ============================================================================
-- Migration 0002: Enterprise Governance, Clinician Corrections, Consent,
-- Accepted Payers, RBAC Users, Front-End Admin Settings & Restore Points
-- ============================================================================

-- 1. Clinician correction audit columns on assessment_responses
ALTER TABLE assessment_responses
  ADD COLUMN IF NOT EXISTS original_answer_value JSONB,
  ADD COLUMN IF NOT EXISTS corrected_by VARCHAR(120),
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;

-- 2. Signed Patient Release, AI Processing Disclosure & 911 Emergency Consent
CREATE TABLE IF NOT EXISTS patient_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  session_id UUID REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  consent_version VARCHAR(32) NOT NULL DEFAULT 'v1.0',
  consent_hash VARCHAR(128) NOT NULL,
  acknowledged_data_sharing BOOLEAN NOT NULL DEFAULT TRUE,
  acknowledged_ai_clinician_review BOOLEAN NOT NULL DEFAULT TRUE,
  acknowledged_emergency_911 BOOLEAN NOT NULL DEFAULT TRUE,
  typed_signature VARCHAR(200),
  ip_address INET,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patient_consents_patient ON patient_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_session ON patient_consents(session_id);

-- 3. Admin Portal User & RBAC Directory
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(200) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('ADMIN', 'PROVIDER', 'COORDINATOR', 'AUDITOR')),
  npi_number VARCHAR(20),
  specialty VARCHAR(120),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sso_subject VARCHAR(255),
  created_by VARCHAR(120) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);

-- 4. Organization Accepted Payers & Coverage Rules (Layer 1 for Stedi X12 270/271)
CREATE TABLE IF NOT EXISTS accepted_payers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_code VARCHAR(64) NOT NULL UNIQUE,
  stedi_trading_partner_id VARCHAR(64) NOT NULL,
  payer_name VARCHAR(200) NOT NULL,
  acceptance_status VARCHAR(32) NOT NULL DEFAULT 'IN_NETWORK'
    CHECK (acceptance_status IN ('IN_NETWORK', 'OUT_OF_NETWORK_ACCEPTED', 'NOT_ACCEPTED')),
  accepted_plan_types TEXT[] NOT NULL DEFAULT ARRAY['PPO', 'EPO', 'POS', 'Medicare'],
  excluded_plan_keywords TEXT[] NOT NULL DEFAULT '{}',
  requires_pcp_referral BOOLEAN NOT NULL DEFAULT FALSE,
  prior_auth_modalities TEXT[] NOT NULL DEFAULT ARRAY['MRI', 'CT', 'PET'],
  self_pay_available BOOLEAN NOT NULL DEFAULT TRUE,
  patient_guidance_note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accepted_payers_active ON accepted_payers(is_active, sort_order);

-- 5. Front-End Admin Platform Settings (Consent, Branding, Scheduling, AI Prompts, Formulas, PDF)
CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(120) PRIMARY KEY,
  category VARCHAR(64) NOT NULL,
  label VARCHAR(200) NOT NULL,
  description TEXT,
  value_json JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by VARCHAR(120) NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_settings_category ON platform_settings(category);

-- 6. In-App Database Configuration Restore Points
CREATE TABLE IF NOT EXISTS config_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(160) NOT NULL,
  notes TEXT,
  trigger_type VARCHAR(32) NOT NULL DEFAULT 'MANUAL'
    CHECK (trigger_type IN ('MANUAL', 'AUTO_PRE_RESTORE', 'AUTO_SEED')),
  created_by VARCHAR(120) NOT NULL DEFAULT 'system',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_config_snapshots_created_at ON config_snapshots(created_at DESC);
