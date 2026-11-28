-- ============================================================================
-- Migration 0003: Demo Access Control, Password Auth, Hardcoded Super-Admin,
-- VIEWER Product-Viewing Role & Signed Pre-Demo Agreements Ledger (NY Law)
-- ============================================================================

-- 1. Extend users table for password auth, VIEWER demo-viewing role, organization,
--    hardcoded super-admin protection, and agreement exemption flag.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('ADMIN', 'PROVIDER', 'COORDINATOR', 'AUDITOR', 'VIEWER'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS organization VARCHAR(200),
  ADD COLUMN IF NOT EXISTS is_hardcoded_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_demo_agreement BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Ensure radiologymgmt@gmail.com is permanently protected as hardcoded Super-Admin
INSERT INTO users (
  email, full_name, role, specialty, organization,
  is_active, is_hardcoded_admin, requires_demo_agreement, created_by
)
VALUES (
  'radiologymgmt@gmail.com',
  'RadManagement Super-Admin',
  'ADMIN',
  'Platform Owner & Clinical Administration',
  'RadManagement LLC',
  TRUE,
  TRUE,
  FALSE,
  'system-hardcoded'
)
ON CONFLICT (email) DO UPDATE SET
  role = 'ADMIN',
  is_active = TRUE,
  is_hardcoded_admin = TRUE,
  requires_demo_agreement = FALSE,
  updated_at = NOW();

-- 2. Immutable ledger of electronically signed Pre-Demo Agreements (MNDA + Sandbox)
CREATE TABLE IF NOT EXISTS demo_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  organization VARCHAR(200),
  signed_date DATE NOT NULL,
  agreement_version VARCHAR(32) NOT NULL DEFAULT 'NY-v1.0',
  agreements_accepted TEXT[] NOT NULL DEFAULT ARRAY[
    'PRE_DEMO_MNDA',
    'SYNTHETIC_SANDBOX_AGREEMENT',
    'PRE_PROD_DISCLOSURE'
  ],
  agreement_hash VARCHAR(128) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_agreements_email ON demo_agreements(LOWER(email), signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_agreements_user ON demo_agreements(user_id);
