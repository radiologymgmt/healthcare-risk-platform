# =============================================================================
# Cloud SQL PostgreSQL 16 (Private IP + CMEK), Secret Manager, Private GCS,
# Cloud Healthcare API (FHIR R4 + HL7 v2), and Eventarc Folder-Drop Trigger
# =============================================================================

resource "google_sql_database_instance" "postgres" {
  name                = "${local.prefix}-pg16"
  region              = var.region
  database_version    = "POSTGRES_16"
  encryption_key_name = google_kms_crypto_key.cmek.id
  deletion_protection = local.is_prod

  depends_on = [
    google_service_networking_connection.private_vpc_connection,
    google_kms_crypto_key_iam_member.cloudsql_cmek,
  ]

  settings {
    edition           = "ENTERPRISE"
    tier              = var.db_tier
    availability_type = local.is_prod ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true
    disk_type         = "PD_SSD"

    ip_configuration {
      ipv4_enabled                                  = false # Private IP ONLY (HIPAA)
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
      ssl_mode                                      = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 30
      }
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
  }
}

resource "google_sql_database" "app_db" {
  name     = "healthcare_risk"
  instance = google_sql_database_instance.postgres.name
}

# Secret Manager containers (populate secret versions out-of-band; never hardcode in Terraform)
resource "google_secret_manager_secret" "database_url" {
  secret_id = "${local.prefix}-database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret" "magic_link_secret" {
  secret_id = "${local.prefix}-magic-link-session-secret"
  replication {
    auto {}
  }
  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret" "stedi_api_key" {
  secret_id = "${local.prefix}-stedi-api-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.enabled]
}

# Private Cloud Storage Bucket for Clinical Folder Drops (CMEK + Public Access Prevention)
resource "google_storage_bucket" "clinical_drops" {
  name                        = "${var.project_id}-${local.prefix}-clinical-drops"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = !local.is_prod

  encryption {
    default_kms_key_name = google_kms_crypto_key.cmek.id
  }

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 2555 # 7-year HIPAA clinical document retention
    }
    action {
      type = "SetStorageClass"
      storage_class = "ARCHIVE"
    }
  }

  depends_on = [google_kms_crypto_key_iam_member.gcs_cmek]
}

# Google Cloud Healthcare API: Dataset + FHIR R4 Store + HL7 v2 Store (Component 6)
resource "google_healthcare_dataset" "clinical" {
  name       = "${local.prefix}-healthcare-dataset"
  location   = var.region
  depends_on = [google_project_service.enabled]
}

resource "google_healthcare_fhir_store" "fhir_r4" {
  name                        = "${local.prefix}-fhir-r4-store"
  dataset                     = google_healthcare_dataset.clinical.id
  version                     = "R4"
  enable_update_create        = true
  disable_referential_integrity = false
}

resource "google_healthcare_hl7_v2_store" "hl7_v2" {
  name    = "${local.prefix}-hl7-v2-store"
  dataset = google_healthcare_dataset.clinical.id
}

# Eventarc Trigger: GCS Folder Drop -> Interop Ingestion Worker Cloud Run
resource "google_eventarc_trigger" "gcs_clinical_drop" {
  name            = "${local.prefix}-gcs-folder-drop"
  location        = var.region
  service_account = google_service_account.interop_worker.email

  matching_criteria {
    attribute = "type"
    value     = "google.cloud.storage.object.v1.finalized"
  }

  matching_criteria {
    attribute = "bucket"
    value     = google_storage_bucket.clinical_drops.name
  }

  destination {
    cloud_run_service {
      service = google_cloud_run_v2_service.interop_worker.name
      path    = "/api/v1/interop/gcs-event"
      region  = var.region
    }
  }

  depends_on = [
    google_project_service.enabled,
    google_cloud_run_v2_service.interop_worker,
  ]
}
