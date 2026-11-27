# =============================================================================
# Artifact Registry, Least-Privilege Service Accounts, 7 Cloud Run v2 Services,
# Serverless NEGs, Cloud Armor WAF Backends, and Google IAP Protected Backends
# =============================================================================

resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = var.ar_repo_name
  format        = "DOCKER"
  description   = "HIPAA platform container images for all 7 Cloud Run services"
  depends_on    = [google_project_service.enabled]
}

locals {
  ar_base = "${var.region}-docker.pkg.dev/${var.project_id}/${var.ar_repo_name}"
}

# Dedicated Service Accounts
resource "google_service_account" "rules_engine" {
  account_id   = "${local.prefix}-rules-api"
  display_name = "Rules Engine API Service Account"
}

resource "google_service_account" "clinical_parser" {
  account_id   = "${local.prefix}-parser"
  display_name = "Clinical Parser Worker (Vertex AI + Document AI) Service Account"
}

resource "google_service_account" "interop_worker" {
  account_id   = "${local.prefix}-interop"
  display_name = "Interop Ingestion Worker (FHIR/HL7/Eventarc) Service Account"
}

resource "google_service_account" "web_frontends" {
  account_id   = "${local.prefix}-frontends"
  display_name = "Next.js Portals Service Account"
}

# Least-Privilege IAM Bindings
resource "google_project_iam_member" "parser_vertex_ai" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.clinical_parser.email}"
}

resource "google_project_iam_member" "parser_document_ai" {
  project = var.project_id
  role    = "roles/documentai.apiUser"
  member  = "serviceAccount:${google_service_account.clinical_parser.email}"
}

resource "google_storage_bucket_iam_member" "parser_bucket_reader" {
  bucket = google_storage_bucket.clinical_drops.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.clinical_parser.email}"
}

resource "google_project_iam_member" "interop_healthcare_fhir" {
  project = var.project_id
  role    = "roles/healthcare.fhirResourceEditor"
  member  = "serviceAccount:${google_service_account.interop_worker.email}"
}

resource "google_project_iam_member" "interop_healthcare_hl7" {
  project = var.project_id
  role    = "roles/healthcare.hl7V2Ingest"
  member  = "serviceAccount:${google_service_account.interop_worker.email}"
}

resource "google_project_iam_member" "interop_eventarc_receiver" {
  project = var.project_id
  role    = "roles/eventarc.eventReceiver"
  member  = "serviceAccount:${google_service_account.interop_worker.email}"
}

resource "google_secret_manager_secret_iam_member" "db_url_access" {
  for_each = {
    rules_engine    = google_service_account.rules_engine.email
    clinical_parser = google_service_account.clinical_parser.email
    interop_worker  = google_service_account.interop_worker.email
  }
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value}"
}

resource "google_secret_manager_secret_iam_member" "rules_magic_secret" {
  secret_id = google_secret_manager_secret.magic_link_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.rules_engine.email}"
}

resource "google_secret_manager_secret_iam_member" "rules_stedi_secret" {
  secret_id = google_secret_manager_secret.stedi_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.rules_engine.email}"
}

# =============================================================================
# 3 INTERNAL BACKEND CLOUD RUN SERVICES (INGRESS_TRAFFIC_INTERNAL_ONLY)
# =============================================================================

resource "google_cloud_run_v2_service" "clinical_parser" {
  name     = "${local.prefix}-clinical-parser-worker"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.clinical_parser.email
    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }
    vpc_access {
      connector = google_vpc_access_connector.serverless.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    containers {
      image = "${local.ar_base}/clinical-parser-worker:${var.image_tag}"
      resources {
        limits = { cpu = "2", memory = "2Gi" }
      }
      env {
        name  = "VERTEX_AI_PROJECT"
        value = var.project_id
      }
      env {
        name  = "VERTEX_AI_LOCATION"
        value = var.region
      }
      env {
        name  = "VERTEX_AI_MODEL"
        value = "gemini-2.5-flash"
      }
      env {
        name  = "USE_VERTEX_AI"
        value = var.use_vertex_ai ? "true" : "false"
      }
      env {
        name  = "PARSER_MODE"
        value = var.use_vertex_ai ? "vertex" : "deterministic"
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service" "interop_worker" {
  name     = "${local.prefix}-interop-ingestion-worker"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.interop_worker.email
    scaling {
      min_instance_count = local.api_min_instances
      max_instance_count = 10
    }
    vpc_access {
      connector = google_vpc_access_connector.serverless.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    containers {
      image = "${local.ar_base}/interop-ingestion-worker:${var.image_tag}"
      resources {
        limits = { cpu = "1", memory = "1Gi" }
      }
      env {
        name  = "CLINICAL_PARSER_URL"
        value = google_cloud_run_v2_service.clinical_parser.uri
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service" "rules_engine_api" {
  name     = "${local.prefix}-rules-engine-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.rules_engine.email
    scaling {
      min_instance_count = local.api_min_instances
      max_instance_count = 20
    }
    vpc_access {
      connector = google_vpc_access_connector.serverless.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    containers {
      image = "${local.ar_base}/rules-engine-api:${var.image_tag}"
      resources {
        limits = { cpu = "2", memory = "2Gi" } # Includes headless Chromium PDF engine
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "DEMO_MODE"
        value = var.demo_mode ? "true" : "false"
      }
      env {
        name  = "ADMIN_EMAIL_ALLOWLIST"
        value = var.admin_email_allowlist
      }
      env {
        name  = "INTEROP_WORKER_URL"
        value = google_cloud_run_v2_service.interop_worker.uri
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "MAGIC_LINK_SESSION_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.magic_link_secret.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "STEDI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.stedi_api_key.secret_id
            version = "latest"
          }
        }
      }
    }
  }
}

# Service-to-service Cloud Run IAM Invoker permissions
resource "google_cloud_run_v2_service_iam_member" "interop_invokes_parser" {
  location = var.region
  name     = google_cloud_run_v2_service.clinical_parser.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.interop_worker.email}"
}

resource "google_cloud_run_v2_service_iam_member" "rules_invokes_interop" {
  location = var.region
  name     = google_cloud_run_v2_service.interop_worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.rules_engine.email}"
}

resource "google_cloud_run_v2_service_iam_member" "eventarc_invokes_interop" {
  location = var.region
  name     = google_cloud_run_v2_service.interop_worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.interop_worker.email}"
}

resource "google_cloud_run_v2_service_iam_member" "frontends_invoke_rules_api" {
  location = var.region
  name     = google_cloud_run_v2_service.rules_engine_api.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.web_frontends.email}"
}

# =============================================================================
# 4 FRONTEND CLOUD RUN PORTALS (INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER)
# =============================================================================

locals {
  frontend_services = {
    patient-web        = { image = "patient-web", iap = false }
    patient-mobile-pwa = { image = "patient-mobile-pwa", iap = false }
    provider-dashboard = { image = "provider-dashboard", iap = true }
    admin-portal       = { image = "admin-portal", iap = true }
  }
}

resource "google_cloud_run_v2_service" "frontends" {
  for_each = local.frontend_services
  name     = "${local.prefix}-${each.key}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.web_frontends.email
    scaling {
      min_instance_count = local.api_min_instances
      max_instance_count = 15
    }
    vpc_access {
      connector = google_vpc_access_connector.serverless.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    containers {
      image = "${local.ar_base}/${each.value.image}:${var.image_tag}"
      resources {
        limits = { cpu = "1", memory = "1Gi" }
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "DEMO_MODE"
        value = var.demo_mode ? "true" : "false"
      }
      env {
        name  = "DEMO_ACCESS_CODE"
        value = var.demo_access_code
      }
      env {
        name  = "RULES_ENGINE_API_URL"
        value = google_cloud_run_v2_service.rules_engine_api.uri
      }
      env {
        name  = "ADMIN_EMAIL_ALLOWLIST"
        value = var.admin_email_allowlist
      }
      env {
        name  = "DEMO_PATIENT_WEB_URL"
        value = var.demo_domain != "" ? "https://intake.${var.demo_domain}" : "http://localhost:3003"
      }
      env {
        name  = "DEMO_MOBILE_PWA_URL"
        value = var.demo_domain != "" ? "https://mobile.${var.demo_domain}" : "http://localhost:3004"
      }
      env {
        name  = "DEMO_PROVIDER_URL"
        value = var.demo_domain != "" ? "https://provider.${var.demo_domain}" : "http://localhost:3005"
      }
      env {
        name  = "DEMO_ADMIN_URL"
        value = var.demo_domain != "" ? "https://admin.${var.demo_domain}/rules" : "/rules"
      }
    }
  }
}

# Allow HTTPS Load Balancer traffic into frontend Cloud Run services (still locked to INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER)
resource "google_cloud_run_v2_service_iam_member" "frontend_lb_invoker" {
  for_each = {
    for k, v in local.frontend_services : k => v
    if !v.iap || var.demo_mode
  }
  location = var.region
  name     = google_cloud_run_v2_service.frontends[each.key].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Cloud Run Job inside the Serverless VPC to run PostgreSQL 16 migrations + 54-rule seed against Private-IP Cloud SQL
resource "google_cloud_run_v2_job" "db_setup" {
  name     = "${local.prefix}-db-setup"
  location = var.region

  template {
    template {
      service_account = google_service_account.rules_engine.email
      vpc_access {
        connector = google_vpc_access_connector.serverless.id
        egress    = "PRIVATE_RANGES_ONLY"
      }
      containers {
        image   = "${local.ar_base}/rules-engine-api:${var.image_tag}"
        command = ["sh", "-c"]
        args    = ["node packages/database/dist/migrate.js && node packages/database/dist/seed.js"]
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
}

# Serverless NEGs & Load Balancer Backends (Cloud Armor WAF for Patient; Google IAP for Provider/Admin)
resource "google_compute_region_network_endpoint_group" "frontend_neg" {
  for_each              = local.frontend_services
  name                  = "${local.prefix}-${each.key}-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.frontends[each.key].name
  }
}

resource "google_compute_backend_service" "frontend_backend" {
  for_each        = local.frontend_services
  name            = "${local.prefix}-${each.key}-backend"
  protocol        = "HTTP"
  security_policy = (!each.value.iap || var.demo_mode) ? google_compute_security_policy.patient_waf.id : null

  backend {
    group = google_compute_region_network_endpoint_group.frontend_neg[each.key].id
  }

  dynamic "iap" {
    for_each = each.value.iap && !var.demo_mode && var.iap_oauth_client_id != "" ? [1] : []
    content {
      enabled              = true
      oauth2_client_id     = var.iap_oauth_client_id
      oauth2_client_secret = var.iap_oauth_client_secret
    }
  }
}

resource "google_iap_web_backend_service_iam_member" "admin_iap" {
  for_each            = toset(var.admin_iap_members)
  project             = var.project_id
  web_backend_service = google_compute_backend_service.frontend_backend["admin-portal"].name
  role                = "roles/iap.httpsResourceAccessor"
  member              = each.value
}

resource "google_iap_web_backend_service_iam_member" "provider_iap" {
  for_each            = toset(var.provider_iap_members)
  project             = var.project_id
  web_backend_service = google_compute_backend_service.frontend_backend["provider-dashboard"].name
  role                = "roles/iap.httpsResourceAccessor"
  member              = each.value
}
