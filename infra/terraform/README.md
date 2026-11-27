# GCP HIPAA Infrastructure (`infra/terraform/`)

Provisions the complete Section 6 GCP HIPAA architecture inside a single Google Cloud BAA-covered project:

- **Networking & Perimeter:** Private VPC, Private Services Access, Serverless VPC Access Connector, Cloud KMS CMEK (90-day key rotation), and **Google Cloud Armor WAF** (OWASP Top 10 CRS + US geo-restriction + per-IP rate limiting) for public patient portals.
- **Database & Interop:** **Cloud SQL PostgreSQL 16** (Private IP only, CMEK, SSL enforced, PITR backups), Secret Manager secrets, private CMEK **GCS clinical drop bucket** wired via **Eventarc** to `interop-ingestion-worker`, and **Cloud Healthcare API** (FHIR R4 + HL7 v2 stores).
- **Compute & Identity:** Artifact Registry, least-privilege IAM service accounts, all **7 Cloud Run v2 services** (`INGRESS_TRAFFIC_INTERNAL_ONLY` for backend APIs; `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` for frontends), and **Google Identity-Aware Proxy (IAP)** for Provider Dashboard and Admin Portal.

## Deployment Sequence

1. Copy `terraform.tfvars.example` to `terraform.tfvars` and set your BAA-covered `project_id`, IAP OAuth client credentials, and allowlists.
2. Provision foundational infrastructure:
   ```bash
   cd infra/terraform
   terraform init
   terraform plan -out=tfplan
   terraform apply tfplan
   ```
3. Populate Secret Manager versions (`database-url`, `magic-link-session-secret`, `stedi-api-key`) via `gcloud secrets versions add`.
4. Build and push all 7 images via Cloud Build:
   ```bash
   gcloud builds submit --config=infra/cloudbuild.yaml .
   ```
5. Run PostgreSQL migrations & 54-rule seed (`pnpm db:setup`) inside the VPC (e.g., via Cloud Run Job).
