"use client";

import React from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Lock,
  Rocket,
  Server,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

function SeverityBadge({ level }: { level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "VERIFIED" }) {
  const styles: Record<typeof level, string> = {
    CRITICAL: "bg-rose-100 text-rose-900 border-rose-300",
    HIGH: "bg-amber-100 text-amber-950 border-amber-300",
    MEDIUM: "bg-sky-100 text-sky-900 border-sky-300",
    LOW: "bg-slate-100 text-slate-700 border-slate-300",
    VERIFIED: "bg-emerald-100 text-emerald-900 border-emerald-300",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[level]}`}
    >
      {level}
    </span>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0b192c] text-slate-100 overflow-hidden">
      <div className="px-3.5 py-2 bg-[#132944] border-b border-slate-700/80 text-[11px] font-mono font-semibold text-teal-300">
        {title}
      </div>
      <pre className="p-3.5 text-[11px] sm:text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

export function DemoSecurityAssessment() {
  const verifiedControls = [
    {
      domain: "Private VPC & Ingress Lockdown",
      evidence:
        "All 3 backend services (rules-engine-api, clinical-parser-worker, interop-ingestion-worker) enforce INGRESS_TRAFFIC_INTERNAL_ONLY; all 4 frontends enforce INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER.",
    },
    {
      domain: "Private-IP Cloud SQL + Cloud KMS CMEK",
      evidence:
        "hrp-dev-pg16 runs PostgreSQL 16 with ipv4Enabled=false, privateNetwork=hrp-dev-vpc, sslMode=ENCRYPTED_ONLY, log_connections=on, 30-day backups + 7-day PITR, and Cloud KMS CMEK (hrp-dev-phi-cmek, 90-day rotation).",
    },
    {
      domain: "GCS Clinical Drops Hardening",
      evidence:
        "Uniform bucket-level access, public_access_prevention=enforced, CMEK encryption, object versioning, and 7-year HIPAA archive lifecycle rule.",
    },
    {
      domain: "Edge Cloud Armor WAF",
      evidence:
        "hrp-dev-patient-waf attached to Load Balancer backends with US-only geo-restriction, 120 req/min per-IP rate limiting (429), and OWASP CRS v3.3 (SQLi, XSS, LFI, RCE, protocol attack blocking).",
    },
    {
      domain: "HIPAA-by-Design App Controls",
      evidence:
        "Zero localStorage/sessionStorage/unencrypted cookie PHI across all 4 portals; recursive redactPhi() structured logging; append-only audit_logs; parameterized SQL; SHA-256 hashed single-use magic links; fail-fast secret validation when DEMO_MODE=false.",
    },
    {
      domain: "Dedicated Least-Privilege Service Accounts",
      evidence:
        "Separate runtime service accounts per tier (hrp-dev-frontends, hrp-dev-rules-api, hrp-dev-parser, hrp-dev-interop) with explicit service-to-service roles/run.invoker bindings.",
    },
  ];

  const findings: Array<{
    id: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    title: string;
    evidence: string;
    impact: string;
    prodRemediation: string;
  }> = [
    {
      id: "DEMO-01",
      severity: "CRITICAL",
      title: "DEMO_MODE=true Disables Google IAP & Enables Demo RBAC Switcher",
      evidence:
        "infra/terraform/demo.tfvars sets demo_mode=true, demo_access_code=\"\", and omits iap_oauth_client_id; cloud_run.tf grants allUsers LB invoker to provider-dashboard and admin-portal when demo_mode=true.",
      impact:
        "Anyone in the US with the demo URL can access Provider Workqueue and Admin Portal and switch RBAC roles without SSO/MFA. Strictly acceptable for synthetic demo only.",
      prodRemediation:
        "Set demo_mode=false in prod.tfvars, enable Google IAP with OAuth2/Entra ID/Okta SSO + phishing-resistant MFA, populate admin_iap_members & provider_iap_members, and remove allUsers invoker from staff portals.",
    },
    {
      id: "DEMO-02",
      severity: "CRITICAL",
      title: "No Executed Google Cloud or Stedi BAA on Demo Project",
      evidence:
        "hrp-synthetic-demo-01 is provisioned as an isolated synthetic sandbox without an executed HIPAA Business Associate Agreement (BAA).",
      impact:
        "Entering real Patient Health Information (PHI) into demo.risk.radmgmt.org would constitute an unauthorized HIPAA disclosure.",
      prodRemediation:
        "Deploy Production into a dedicated BAA-covered GCP Organization & Project (hrp-prod-01) with signed Google Cloud BAA, Stedi BAA, IdP BAA, and SMS/Email BAA.",
    },
    {
      id: "DEMO-03",
      severity: "HIGH",
      title: "Single-Zone Cloud SQL (ZONAL) & Deletion Protection Disabled",
      evidence:
        "Live inspect of hrp-dev-pg16 confirms tier=db-g1-small, availabilityType=ZONAL, deletionProtectionEnabled=false, and GCS force_destroy=true (environment=\"dev\").",
      impact:
        "Zonal outage causes database downtime; accidental terraform destroy could delete database/storage.",
      prodRemediation:
        "Set environment=\"prod\" and db_tier=\"db-custom-2-7680\" (or higher) — automatically enables REGIONAL HA failover, deletion_protection=true, and GCS force_destroy=false.",
    },
    {
      id: "DEMO-04",
      severity: "HIGH",
      title: "No Custom TLS 1.2+ RESTRICTED SSL Policy on HTTPS Proxy",
      evidence:
        "gcloud compute target-https-proxies describe hrp-dev-https-proxy reports no custom sslPolicy attached (falls back to GCP COMPATIBLE default allowing TLS 1.0/1.1).",
      impact:
        "Older TLS ciphers fail modern HIPAA/NIST SP 800-52 Rev 2 transport cryptography audits.",
      prodRemediation:
        "Attach a google_compute_ssl_policy with min_tls_version=\"TLS_1_2\" and profile=\"RESTRICTED\" to target_https_proxy in load_balancer.tf.",
    },
    {
      id: "DEMO-05",
      severity: "HIGH",
      title: "Static Deployer Service Account JSON Key & Local Terraform State",
      evidence:
        "Demo deployment uses a downloaded deployer JSON key and local infra/terraform/terraform.tfstate file.",
      impact:
        "Long-lived static keys increase credential-theft blast radius; local tfstate lacks concurrency locking and CMEK remote auditability.",
      prodRemediation:
        "Enforce Org Policy constraints/iam.disableServiceAccountKeyCreation, switch CI/CD to keyless Workload Identity Federation (GitHub OIDC), and store Terraform state in a CMEK-encrypted versioned GCS backend.",
    },
    {
      id: "DEMO-06",
      severity: "MEDIUM",
      title: "Cloud Armor WAF Detached from Provider/Admin Backends When IAP Enables",
      evidence:
        "infra/terraform/cloud_run.tf:421 sets security_policy = (!each.value.iap || var.demo_mode) ? patient_waf.id : null.",
      impact:
        "In production (demo_mode=false), Provider and Admin backends would rely solely on IAP without OWASP WAF/rate-limiting defense-in-depth.",
      prodRemediation:
        "Update cloud_run.tf:421 so security_policy = google_compute_security_policy.patient_waf.id is attached unconditionally to ALL 4 backends alongside IAP.",
    },
    {
      id: "DEMO-07",
      severity: "MEDIUM",
      title: "Mutable Container Image Tags (:latest) & Missing Binary Authorization",
      evidence:
        "Cloud Run services deploy image_tag=\"latest\" without immutable SHA-256 digest pinning or Artifact Analysis vulnerability gates.",
      impact:
        "Reduces supply-chain traceability and permits unverified images if CI/CD credentials are compromised.",
      prodRemediation:
        "Pin Cloud Run deployments to immutable @sha256 digests, enable Artifact Registry Vulnerability Scanning, and enforce Binary Authorization attestations on prod.",
    },
    {
      id: "DEMO-08",
      severity: "MEDIUM",
      title: "No VPC Service Controls (VPC-SC) Perimeter & Auto-Replicated Secrets",
      evidence:
        "database_storage.tf uses replication { auto {} } for Secret Manager secrets; no VPC-SC perimeter restricts Cloud SQL/GCS/Vertex AI/Healthcare API exfiltration.",
      impact:
        "Secrets may replicate outside approved US regions; compromised IAM credentials could read GCS/Healthcare API outside the project perimeter.",
      prodRemediation:
        "Switch secrets to user_managed US-only CMEK replication (us-central1 + us-east1) and wrap hrp-prod-01 in a VPC Service Controls perimeter.",
    },
    {
      id: "DEMO-09",
      severity: "LOW",
      title: "Strict HTTP Security Headers & 6-Year Locked HIPAA Audit Log Sink",
      evidence:
        "Next.js portals do not yet inject global HSTS/CSP/X-Frame-Options headers; Cloud Logging default retention is 30 days.",
      impact:
        "HIPAA §164.316(b)(2) requires 6-year audit log retention; HSTS/CSP hardens against clickjacking and XSS.",
      prodRemediation:
        "Add HSTS, CSP, X-Frame-Options: DENY, and Referrer-Policy: no-referrer in next.config.ts headers() and configure a locked 2,190-day (6-year) CMEK Cloud Logging Bucket sink.",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Executive Scorecard */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Live Security Assessment · hrp-synthetic-demo-01
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-[#0b2545] tracking-tight">
                Demo Environment Security Review & Risk Assessment
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Evidence-based audit of live GCP project <code>hrp-synthetic-demo-01</code> (
                <code>us-central1</code>), Terraform IaC, and application code. Verdict:{" "}
                <strong className="text-emerald-800">APPROVED FOR SYNTHETIC DEMO</strong> ·{" "}
                <strong className="text-rose-700">NOT APPROVED FOR REAL PHI</strong>.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Verified Strong Controls", count: "6", tone: "bg-emerald-50 border-emerald-200 text-emerald-900" },
            { label: "Critical (Demo-Only)", count: "2", tone: "bg-rose-50 border-rose-200 text-rose-900" },
            { label: "High Findings", count: "3", tone: "bg-amber-50 border-amber-200 text-amber-950" },
            { label: "Medium Findings", count: "3", tone: "bg-sky-50 border-sky-200 text-sky-900" },
            { label: "Low Findings", count: "1", tone: "bg-slate-50 border-slate-200 text-slate-800" },
          ].map((kpi) => (
            <div key={kpi.label} className={`rounded-xl border p-3.5 ${kpi.tone}`}>
              <p className="text-2xl font-extrabold">{kpi.count}</p>
              <p className="text-[11px] font-semibold mt-0.5">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Verified Active Controls */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#0b2545] flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            Security Controls Verified Active Today in Demo Infrastructure
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {verifiedControls.map((ctrl) => (
              <div key={ctrl.domain} className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-[#0b2545]">{ctrl.domain}</p>
                  <SeverityBadge level="VERIFIED" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{ctrl.evidence}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Detailed Findings Table */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-start gap-3 border-b border-border pb-3">
          <div className="h-9 w-9 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
            <AlertOctagon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#0b2545]">
              Demo Environment Findings Register (DEMO-01 through DEMO-09)
            </h3>
            <p className="text-xs text-muted-foreground">
              Every finding below is mapped directly to an actionable remediation in the Production
              Deployment Plan.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {findings.map((f) => (
            <div key={f.id} className="rounded-xl border border-border bg-white p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#0b2545]">{f.id}</span>
                  <SeverityBadge level={f.severity} />
                  <h4 className="text-sm font-bold text-[#0b2545]">{f.title}</h4>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
                <div className="rounded-lg bg-secondary/40 p-2.5">
                  <p className="font-bold text-[#0b2545] mb-1">Observed Evidence</p>
                  <p className="text-muted-foreground leading-relaxed">{f.evidence}</p>
                </div>
                <div className="rounded-lg bg-amber-50/60 p-2.5">
                  <p className="font-bold text-amber-950 mb-1">Risk / Impact</p>
                  <p className="text-amber-900/90 leading-relaxed">{f.impact}</p>
                </div>
                <div className="rounded-lg bg-emerald-50/60 p-2.5">
                  <p className="font-bold text-emerald-950 mb-1">Production Remediation</p>
                  <p className="text-emerald-900/90 leading-relaxed">{f.prodRemediation}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ProductionDeploymentPlanAndSecurityReview() {
  return (
    <div className="space-y-6">
      {/* 1. Exact 6-Phase Production Deployment Plan */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-start gap-3 border-b border-border pb-4">
          <div className="h-10 w-10 rounded-xl bg-[#0b2545] text-white flex items-center justify-center shrink-0">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#127080]">
              Production Blueprint · RadManagement LLC
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0b2545] tracking-tight">
              Exact HIPAA-Compliant Production Deployment Plan (hrp-prod-01)
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Zero-trust, BAA-covered GCP architecture isolating real ePHI in a brand-new production
              project completely separated from the synthetic demo project.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              phase: "Phase 0 · Legal & Governance",
              items: [
                "Execute Google Cloud HIPAA BAA covering Cloud Run, Cloud SQL, GCS, KMS, Secret Manager, Healthcare API, Cloud Armor, IAP, Logging, and Vertex AI.",
                "Execute BAAs with Stedi (X12 270/271), Identity Provider (Google Workspace / Entra ID / Okta), and transactional SMS/Email provider for Magic Links.",
                "Complete formal HIPAA Security Risk Analysis (SRA) and designate Security & Privacy Officers.",
              ],
            },
            {
              phase: "Phase 1 · Isolated GCP Project & Org Policies",
              items: [
                "Provision dedicated project hrp-prod-01 in a production GCP Folder.",
                "Enforce Org Policies: iam.disableServiceAccountKeyCreation, gcp.resourceLocations (in:us-locations), compute.requireShieldedVm, sql.restrictPublicIp.",
                "Create CMEK-encrypted versioned GCS bucket (hrp-prod-01-tfstate) with uniform bucket-level access for remote Terraform state.",
              ],
            },
            {
              phase: "Phase 2 · Pre-Deploy Terraform Hardening",
              items: [
                "Attach google_compute_ssl_policy (TLS 1.2+, RESTRICTED) to target_https_proxy in load_balancer.tf (closes DEMO-04).",
                "Attach Cloud Armor WAF to ALL 4 backends even when IAP is enabled in cloud_run.tf:421 (closes DEMO-06).",
                "Switch Secret Manager secrets to US-only user_managed CMEK replication (closes DEMO-08).",
                "Add strict HSTS, CSP, X-Frame-Options: DENY, Referrer-Policy headers in all 4 next.config.ts files (closes DEMO-09).",
              ],
            },
            {
              phase: "Phase 3 · Keyless CI/CD & Immutable Supply Chain",
              items: [
                "Configure GitHub Actions / Cloud Build using Workload Identity Federation (zero static JSON keys; closes DEMO-05).",
                "Enable Artifact Registry Vulnerability Scanning and block deploys with Critical/High CVEs.",
                "Pin Cloud Run services to immutable @sha256 container image digests (closes DEMO-07).",
              ],
            },
            {
              phase: "Phase 4 · Provision Production Stack & Secrets",
              items: [
                "Populate Secret Manager out-of-band: hrp-prod-database-url, hrp-prod-magic-link-session-secret (64-byte CSPRNG), hrp-prod-stedi-api-key (live key).",
                "Run terraform apply -var-file=prod.tfvars (REGIONAL HA PG16, deletion_protection=true, DEMO_MODE=false, IAP enabled, min_instances=1).",
                "Configure DNS A records for intake/mobile/provider/admin.risk.radmgmt.org -> Prod Global LB IP; verify Google-Managed SSL ACTIVE.",
              ],
            },
            {
              phase: "Phase 5 · EHR Integrations, SIEM & Go-Live Drill",
              items: [
                "Connect Epic/Cerner/Athena feeds to Cloud Healthcare API FHIR R4 & HL7 v2 stores and validate Vertex AI VPC-SC zero-retention endpoint.",
                "Create 6-year (2,190-day) locked CMEK Cloud Logging Bucket sink + Security Command Center Premium + PagerDuty uptime alerts.",
                "Execute hrp-prod-db-setup job, create initial Prod Restore Point in /governance, run PITR restore drill, and complete third-party pen-test before opening patient traffic.",
              ],
            },
          ].map((p) => (
            <div key={p.phase} className="rounded-xl border border-border bg-white p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[#127080]">{p.phase}</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
                {p.items.map((item) => (
                  <li key={item} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Exact Production Configuration & Deployment Commands */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
          <CodeBlock
            title="Exact Production Terraform Variables (infra/terraform/prod.tfvars)"
            code={`project_id              = "hrp-prod-01"
region                  = "us-central1"
environment             = "prod"            # Forces REGIONAL HA PG16 + deletion_protection
ar_repo_name            = "healthcare-risk-platform"
image_tag               = "v1.0.0"          # Immutable release tag / @sha256 digest
db_tier                 = "db-custom-4-15360"
demo_mode               = false             # MANDATORY: disables all demo/dev auth bypasses
demo_access_code        = ""
demo_domain             = "risk.radmgmt.org"
use_vertex_ai           = true
allowed_geo_countries   = ["US"]
iap_oauth_client_id     = "<FROM_SECRET_MANAGER_OR_TF_VAR>"
iap_oauth_client_secret = "<FROM_SECRET_MANAGER_OR_TF_VAR>"
admin_email_allowlist   = "clinical-admin@radmgmt.org,it-sec@radmgmt.org"
admin_iap_members       = ["group:hrp-admins@radmgmt.org"]
provider_iap_members    = ["group:hrp-clinicians@radmgmt.org"]`}
          />
          <CodeBlock
            title="Exact Production Deployment Command Sequence"
            code={`# 1. Authenticate keyless via Workload Identity / Corporate SSO
gcloud config set project hrp-prod-01

# 2. Initialize remote CMEK Terraform state & apply Phase 1-4 infrastructure
cd infra/terraform
terraform init -backend-config="bucket=hrp-prod-01-tfstate"
terraform plan  -var-file=prod.tfvars -out=prod.tfplan
terraform apply prod.tfplan

# 3. Populate production secrets out-of-band (never in git or tfvars)
openssl rand -hex 32 | gcloud secrets versions add \\
  hrp-prod-magic-link-session-secret --data-file=-

# 4. Run private-VPC database migrations & 69-rule seed
gcloud run jobs execute hrp-prod-db-setup --region=us-central1 --wait

# 5. Lock 6-year HIPAA Cloud Logging bucket & verify SSL + IAP
gcloud logging buckets create hipaa-6yr-audit --location=us-central1 \\
  --retention-days=2190 --locked`}
          />
        </div>
      </section>

      {/* 2. Production Security Review & HIPAA Safeguards Matrix */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-start gap-3 border-b border-border pb-4">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Production Security Review & Compliance Sign-Off
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0b2545] tracking-tight">
              HIPAA Security Rule Mapping & Closure of All 9 Demo Findings
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Independent architectural security review of the target <code>hrp-prod-01</code>{" "}
              production deployment against 45 CFR Part 164 (HIPAA Security Rule) and NIST SP 800-53.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-[#0b2545]">
                <th className="py-2.5 px-3 font-bold">HIPAA Safeguard / Control Area</th>
                <th className="py-2.5 px-3 font-bold">Production Implementation (hrp-prod-01)</th>
                <th className="py-2.5 px-3 font-bold">Closes Demo Finding</th>
                <th className="py-2.5 px-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-muted-foreground">
              {[
                [
                  "§164.312(a)(1) Access Control & §164.312(d) Person Authentication",
                  "DEMO_MODE=false; Google IAP + Corporate SSO/MFA on Provider & Admin portals; per-user RBAC directory + Admin email allowlist; single-use SHA-256 magic links + DOB/ZIP + 64-byte HttpOnly session cookies for patients.",
                  "DEMO-01",
                  "CLOSED IN PROD",
                ],
                [
                  "§164.308(b)(1) Business Associate Contracts",
                  "Dedicated BAA-covered hrp-prod-01 project; executed BAAs with Google Cloud, Stedi, SSO IdP, and transactional messaging vendor; Org Policy US-only data residency.",
                  "DEMO-02",
                  "GO-LIVE GATE",
                ],
                [
                  "§164.308(a)(7) Contingency Plan & Availability",
                  "Cloud SQL PG16 REGIONAL HA failover, automated 30-day backups + 7-day PITR, deletion_protection=true, GCS versioning + 7-year archive retention, min_instances>=1.",
                  "DEMO-03",
                  "CLOSED IN PROD",
                ],
                [
                  "§164.312(e)(1) Transmission Security",
                  "Global HTTPS LB with custom TLS 1.2+ RESTRICTED SSL policy, HTTP->HTTPS 301 redirect, HSTS preload headers, Cloud SQL ssl_mode=ENCRYPTED_ONLY over Private Services Access.",
                  "DEMO-04, DEMO-09",
                  "CLOSED IN PROD",
                ],
                [
                  "§164.312(a)(2)(iv) Encryption at Rest & Key Management",
                  "Cloud KMS CMEK (90-day rotation, prevent_destroy=true) across Cloud SQL, GCS clinical drops, Secret Manager (US-only user_managed), and 6-year Cloud Logging bucket.",
                  "DEMO-08",
                  "CLOSED IN PROD",
                ],
                [
                  "§164.308(a)(1) Perimeter Defense & Exfiltration Prevention",
                  "Cloud Armor WAF (OWASP CRS v3.3 + US geo-fence + 120 req/min throttle) enforced on ALL 4 backends + VPC Service Controls perimeter + internal-only backend Cloud Run services.",
                  "DEMO-06, DEMO-08",
                  "CLOSED IN PROD",
                ],
                [
                  "§164.308(a)(3) Supply Chain & Keyless CI/CD Governance",
                  "Workload Identity Federation keyless CI/CD (iam.disableServiceAccountKeyCreation), Artifact Analysis vulnerability gates, Binary Authorization, @sha256 immutable image digests, CMEK remote tfstate.",
                  "DEMO-05, DEMO-07",
                  "CLOSED IN PROD",
                ],
                [
                  "§164.312(b) Audit Controls & §164.316(b)(2) 6-Year Retention",
                  "Zero browser-storage PHI, redactPhi() zero-PHI logs, append-only PostgreSQL audit_logs for all views/edits/orders/exports, Cloud Audit Logs exported to locked 2,190-day Log Bucket + SCC Premium.",
                  "DEMO-09",
                  "CLOSED IN PROD",
                ],
              ].map((row) => (
                <tr key={row[0]} className="hover:bg-secondary/20">
                  <td className="py-2.5 px-3 font-semibold text-[#0b2545]">{row[0]}</td>
                  <td className="py-2.5 px-3 leading-relaxed">{row[1]}</td>
                  <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">{row[2]}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                      {row[3]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Final Pre-Go-Live Sign-Off Checklist */}
        <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-2.5">
          <h3 className="text-sm font-bold text-[#0b2545] flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-[#127080]" />
            Mandatory Pre-Go-Live Security Sign-Off Gate (Before First Real Patient)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
            {[
              "All BAAs (Google Cloud, Stedi, SSO IdP, Messaging) countersigned and filed.",
              "Demo deployer JSON key revoked & deleted; prod uses keyless Workload Identity Federation only.",
              "Verify DEMO_MODE=false across all 7 Cloud Run services (confirm /demo redirects or disables dev switchers).",
              "Verify unauthenticated requests to provider.risk.radmgmt.org & admin.risk.radmgmt.org return Google IAP 302 login.",
              "Verify TLS 1.0/1.1 handshake rejection via SSL Labs / nmap against risk.radmgmt.org.",
              "Verify Cloud SQL public IP is disabled and direct .run.app URLs return 404/403.",
              "Complete independent third-party OWASP Web/API Penetration Test with zero unresolved Critical/High findings.",
              "Complete one live Cloud SQL PITR restore drill & one Admin Portal Restore Point rollback drill.",
            ].map((check) => (
              <div key={check} className="flex items-start gap-2 rounded-lg bg-white border border-border p-2.5">
                <span className="h-4 w-4 rounded border border-slate-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{check}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
