# =============================================================================
# Private VPC, Serverless VPC Connector, Cloud KMS CMEK, and Cloud Armor WAF
# =============================================================================

resource "google_compute_network" "vpc" {
  name                    = "${local.prefix}-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.enabled]
}

resource "google_compute_subnetwork" "private_subnet" {
  name                     = "${local.prefix}-private-subnet"
  ip_cidr_range            = "10.20.0.0/20"
  region                   = var.region
  network                  = google_compute_network.vpc.id
  private_ip_google_access = true
}

# Private Services Access peering range for Cloud SQL (Private IP Only)
resource "google_compute_global_address" "private_service_range" {
  name          = "${local.prefix}-sql-private-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_range.name]
  depends_on              = [google_project_service.enabled]
}

# Serverless VPC Access Connector for Cloud Run -> Cloud SQL & Internal VPC APIs
resource "google_vpc_access_connector" "serverless" {
  name          = "${local.prefix}-vpc-conn"
  region        = var.region
  network       = google_compute_network.vpc.name
  ip_cidr_range = "10.28.0.0/28"
  min_instances = 2
  max_instances = 5
  depends_on    = [google_project_service.enabled]
}

# Cloud KMS KeyRing & CMEK Key for Cloud SQL & Private GCS Clinical Storage (90-day rotation)
resource "google_kms_key_ring" "hipaa" {
  name       = "${local.prefix}-hipaa-keyring"
  location   = var.region
  depends_on = [google_project_service.enabled]
}

resource "google_kms_crypto_key" "cmek" {
  name            = "${local.prefix}-phi-cmek"
  key_ring        = google_kms_key_ring.hipaa.id
  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_kms_crypto_key_iam_member" "cloudsql_cmek" {
  crypto_key_id = google_kms_crypto_key.cmek.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloud-sql.iam.gserviceaccount.com"
}

resource "google_kms_crypto_key_iam_member" "gcs_cmek" {
  crypto_key_id = google_kms_crypto_key.cmek.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${data.google_project.current.number}@gs-project-accounts.iam.gserviceaccount.com"
}

# =============================================================================
# Google Cloud Armor WAF (OWASP Top 10 + US Geo-Restriction + Rate Limiting)
# Protects Public Patient Web (Comp 3) & Patient Mobile PWA (Comp 4)
# =============================================================================

resource "google_compute_security_policy" "patient_waf" {
  name        = "${local.prefix}-patient-waf"
  description = "HIPAA perimeter WAF: OWASP Top 10 CRS, US geo-restriction, and rate limiting"
  depends_on  = [google_project_service.enabled]

  # Geo-restriction: allow only approved countries (default US)
  rule {
    action   = "deny(403)"
    priority = 900
    match {
      expr {
        expression = "!(origin.region_code in [${join(", ", [for c in var.allowed_geo_countries : "'${c}'"])}])"
      }
    }
    description = "Restrict public patient portals to approved geographic regions (US)"
  }

  # Rate limit against credential/magic-link brute-force attempts
  rule {
    action   = "throttle"
    priority = 950
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 120
        interval_sec = 60
      }
    }
    description = "Per-IP rate limiting (120 req/min)"
  }

  # OWASP ModSecurity CRS rules
  rule {
    action   = "deny(403)"
    priority = 1000
    match {
      expr { expression = "evaluatePreconfiguredExpr('sqli-v33-stable')" }
    }
    description = "Block SQL injection (OWASP)"
  }

  rule {
    action   = "deny(403)"
    priority = 1001
    match {
      expr { expression = "evaluatePreconfiguredExpr('xss-v33-stable')" }
    }
    description = "Block XSS attacks (OWASP)"
  }

  rule {
    action   = "deny(403)"
    priority = 1002
    match {
      expr { expression = "evaluatePreconfiguredExpr('lfi-v33-stable')" }
    }
    description = "Block Local File Inclusion (OWASP)"
  }

  rule {
    action   = "deny(403)"
    priority = 1003
    match {
      expr { expression = "evaluatePreconfiguredExpr('rce-v33-stable')" }
    }
    description = "Block Remote Code Execution (OWASP)"
  }

  rule {
    action   = "deny(403)"
    priority = 1004
    match {
      expr { expression = "evaluatePreconfiguredExpr('protocolattack-v33-stable')" }
    }
    description = "Block HTTP protocol attacks (OWASP)"
  }

  rule {
    action   = "allow"
    priority = 2147483647
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default allow after WAF & geo-restriction checks"
  }
}
