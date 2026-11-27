locals {
  prefix            = "hrp-${var.environment}"
  is_prod           = var.environment == "prod"
  api_min_instances = local.is_prod ? 1 : 0

  required_apis = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com",
    "compute.googleapis.com",
    "healthcare.googleapis.com",
    "aiplatform.googleapis.com",
    "documentai.googleapis.com",
    "eventarc.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudkms.googleapis.com",
    "iap.googleapis.com",
    "cloudbuild.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
  ]
}

resource "google_project_service" "enabled" {
  for_each           = toset(local.required_apis)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

data "google_project" "current" {
  project_id = var.project_id
}
