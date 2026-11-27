#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# One-Command Google Cloud Shell Deployment Script — Synthetic Demo Site (Path A)
# Run inside https://shell.cloud.google.com from the repository root:
#
#   PROJECT_ID="hrp-synthetic-demo-01" \
#   BILLING_ACCOUNT_ID="XXXXXX-XXXXXX-XXXXXX" \
#   DEMO_DOMAIN="demo.yourdomain.com" \
#   DEMO_ACCESS_CODE="your-demo-passcode" \
#   ./infra/scripts/deploy-gcp-demo.sh
#
# WARNING: This provisions a SYNTHETIC-ONLY demo environment (DEMO_MODE=true).
# Never enter real PHI or point this script at a production BAA project.
# =============================================================================

: "${PROJECT_ID:?Set PROJECT_ID (e.g., hrp-synthetic-demo-01)}"
: "${BILLING_ACCOUNT_ID:?Set BILLING_ACCOUNT_ID (run 'gcloud billing accounts list')}"
: "${DEMO_DOMAIN:?Set DEMO_DOMAIN (e.g., demo.yourdomain.com)}"

REGION="${REGION:-us-central1}"
AR_REPO="${AR_REPO:-healthcare-risk-platform}"
DB_TIER="${DB_TIER:-db-g1-small}"
USE_VERTEX_AI="${USE_VERTEX_AI:-false}"
DEMO_ACCESS_CODE="${DEMO_ACCESS_CODE:-$(openssl rand -hex 6)}"

echo "==> 1. Creating or selecting non-PHI GCP demo project: ${PROJECT_ID}"
if ! gcloud projects describe "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud projects create "${PROJECT_ID}" --name="Healthcare Risk Platform Demo"
fi
gcloud config set project "${PROJECT_ID}"
gcloud billing projects link "${PROJECT_ID}" --billing-account="${BILLING_ACCOUNT_ID}"

echo "==> 2. Enabling Cloud Build & Artifact Registry APIs"
gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com sqladmin.googleapis.com run.googleapis.com compute.googleapis.com

if ! gcloud artifacts repositories describe "${AR_REPO}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${AR_REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Healthcare Risk Platform demo container images"
fi

echo "==> 3. Building & pushing all 7 container images via Cloud Build"
gcloud builds submit \
  --config=infra/cloudbuild-images.yaml \
  --substitutions="_REGION=${REGION},_AR_REPO=${AR_REPO}" \
  .

echo "==> 4. Generating infra/terraform/demo.tfvars and applying Terraform"
cat <<EOF > infra/terraform/demo.tfvars
project_id            = "${PROJECT_ID}"
region                = "${REGION}"
environment           = "dev"
ar_repo_name          = "${AR_REPO}"
image_tag             = "latest"
db_tier               = "${DB_TIER}"
demo_mode             = true
demo_access_code      = "${DEMO_ACCESS_CODE}"
demo_domain           = "${DEMO_DOMAIN}"
use_vertex_ai         = ${USE_VERTEX_AI}
allowed_geo_countries = ["US"]
EOF

pushd infra/terraform >/dev/null
terraform init -upgrade
terraform apply -auto-approve -var-file=demo.tfvars

SQL_PRIVATE_IP="$(terraform output -raw cloud_sql_private_ip)"
LB_IP="$(terraform output -raw global_lb_ipv4)"
DB_SETUP_JOB="$(terraform output -raw db_setup_job_name)"
popd >/dev/null

echo "==> 5. Creating PostgreSQL app user and populating Secret Manager (zero hardcoded secrets)"
DB_USER="hrp_demo"
DB_PASS="$(openssl rand -hex 20)"
MAGIC_SECRET="$(openssl rand -hex 32)"

gcloud sql users create "${DB_USER}" \
  --instance="hrp-dev-pg16" \
  --password="${DB_PASS}" 2>/dev/null \
  || gcloud sql users set-password "${DB_USER}" --instance="hrp-dev-pg16" --password="${DB_PASS}"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${SQL_PRIVATE_IP}:5432/healthcare_risk?sslmode=require"

printf '%s' "${DATABASE_URL}" | gcloud secrets versions add hrp-dev-database-url --data-file=-
printf '%s' "${MAGIC_SECRET}" | gcloud secrets versions add hrp-dev-magic-link-session-secret --data-file=-
# Empty Stedi key activates the built-in synthetic X12 270/271 eligibility mock
printf '%s' "" | gcloud secrets versions add hrp-dev-stedi-api-key --data-file=-

echo "==> 6. Running PostgreSQL 16 migrations + 54-rule seed inside the VPC via Cloud Run Job"
gcloud run jobs execute "${DB_SETUP_JOB}" --region="${REGION}" --wait

echo ""
echo "============================================================================="
echo "  SYNTHETIC DEMO DEPLOYMENT COMPLETE"
echo "============================================================================="
echo "Add these 4 DNS A records at your registrar (SSL cert provisions automatically once DNS resolves):"
echo "  A   intake.${DEMO_DOMAIN}    -> ${LB_IP}"
echo "  A   mobile.${DEMO_DOMAIN}    -> ${LB_IP}"
echo "  A   provider.${DEMO_DOMAIN}  -> ${LB_IP}"
echo "  A   admin.${DEMO_DOMAIN}     -> ${LB_IP}"
echo ""
echo "Demo Launcher Hub: https://admin.${DEMO_DOMAIN}/demo"
echo "Demo Passcode:     ${DEMO_ACCESS_CODE}"
echo "============================================================================="
