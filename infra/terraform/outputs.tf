output "artifact_registry_url" {
  description = "Docker repository base URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

output "cloud_sql_private_ip" {
  description = "Private IP address of Cloud SQL PostgreSQL 16 instance"
  value       = google_sql_database_instance.postgres.private_ip_address
}

output "clinical_drops_bucket" {
  description = "Private CMEK-encrypted GCS bucket for Eventarc folder drops"
  value       = google_storage_bucket.clinical_drops.name
}

output "fhir_r4_store_id" {
  description = "Google Cloud Healthcare API FHIR R4 Store ID"
  value       = google_healthcare_fhir_store.fhir_r4.id
}

output "hl7_v2_store_id" {
  description = "Google Cloud Healthcare API HL7 v2 Store ID"
  value       = google_healthcare_hl7_v2_store.hl7_v2.id
}

output "rules_engine_internal_uri" {
  description = "Internal VPC Cloud Run URI for rules-engine-api"
  value       = google_cloud_run_v2_service.rules_engine_api.uri
}

output "frontend_service_uris" {
  description = "Cloud Run URIs for the 4 frontend portals (fronted by Cloud Armor / IAP)"
  value       = { for k, v in google_cloud_run_v2_service.frontends : k => v.uri }
}

output "db_setup_job_name" {
  description = "Cloud Run Job name to run PostgreSQL 16 migrations and 54-rule seed inside the VPC"
  value       = google_cloud_run_v2_job.db_setup.name
}

output "global_lb_ipv4" {
  description = "Static Global IPv4 address for your 4 subdomain DNS A records"
  value       = var.demo_domain != "" ? google_compute_global_address.lb_ip[0].address : null
}

output "demo_dns_records" {
  description = "DNS A records to configure at your registrar for the 4 demo portals"
  value = var.demo_domain != "" ? {
    patient_web        = "A  intake.${var.demo_domain}   -> ${google_compute_global_address.lb_ip[0].address}"
    patient_mobile_pwa = "A  mobile.${var.demo_domain}   -> ${google_compute_global_address.lb_ip[0].address}"
    provider_dashboard = "A  provider.${var.demo_domain} -> ${google_compute_global_address.lb_ip[0].address}"
    admin_portal       = "A  admin.${var.demo_domain}    -> ${google_compute_global_address.lb_ip[0].address}"
  } : {}
}
