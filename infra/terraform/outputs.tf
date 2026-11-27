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
