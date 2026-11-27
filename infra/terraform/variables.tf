variable "project_id" {
  description = "BAA-covered Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "Primary GCP region for Cloud Run, Cloud SQL, Vertex AI, and Healthcare API"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Deployment environment (dev | staging | prod)"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "ar_repo_name" {
  description = "Artifact Registry Docker repository name"
  type        = string
  default     = "healthcare-risk-platform"
}

variable "image_tag" {
  description = "Container image tag deployed to Cloud Run services"
  type        = string
  default     = "latest"
}

variable "db_tier" {
  description = "Cloud SQL PostgreSQL 16 machine tier"
  type        = string
  default     = "db-custom-2-7680"
}

variable "admin_email_allowlist" {
  description = "Comma-separated GCP IAP email addresses granted ADMIN RBAC role"
  type        = string
  default     = ""
}

variable "admin_iap_members" {
  description = "IAM members permitted through Google IAP to Admin Portal (e.g., group:clinical-admins@org.org)"
  type        = list(string)
  default     = []
}

variable "provider_iap_members" {
  description = "IAM members permitted through Google IAP to Provider Dashboard (e.g., group:clinicians@org.org)"
  type        = list(string)
  default     = []
}

variable "allowed_geo_countries" {
  description = "ISO 3166-1 alpha-2 country codes allowed through Cloud Armor WAF for Patient Portals"
  type        = list(string)
  default     = ["US"]
}

variable "iap_oauth_client_id" {
  description = "OAuth2 Client ID for Google Identity-Aware Proxy (IAP) on Provider & Admin backends"
  type        = string
  default     = ""
}

variable "iap_oauth_client_secret" {
  description = "OAuth2 Client Secret for Google Identity-Aware Proxy (IAP)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "demo_mode" {
  description = "Enable synthetic-only DEMO_MODE=true across portals and APIs (NEVER enable in a PHI/BAA project)"
  type        = bool
  default     = false
}

variable "demo_access_code" {
  description = "Optional shared passcode enforced via HttpOnly cookie when demo_mode = true"
  type        = string
  sensitive   = true
  default     = ""
}

variable "demo_domain" {
  description = "Base domain for 4 subdomains (intake/mobile/provider/admin.<demo_domain>), e.g. demo.yourdomain.com"
  type        = string
  default     = ""
}

variable "use_vertex_ai" {
  description = "Use live Vertex AI Gemini in clinical-parser-worker (set false for zero-cost deterministic synthetic demos)"
  type        = bool
  default     = true
}
