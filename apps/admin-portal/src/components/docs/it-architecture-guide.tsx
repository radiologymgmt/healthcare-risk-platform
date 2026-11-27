"use client";

import React from "react";
import {
  Cloud,
  Cpu,
  Database,
  GitBranch,
  Layers,
  Network,
  Terminal,
  Wrench,
} from "lucide-react";

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

export function ItArchitectureWalkthrough() {
  return (
    <div className="space-y-6">
      {/* 1. Architecture Overview */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-start gap-3 border-b border-border pb-4">
          <div className="h-10 w-10 rounded-xl bg-[#e4f4f7] text-[#127080] flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#127080]">
              IT & Engineering Walkthrough
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0b2545] tracking-tight">
              System Architecture, Monorepo Topology & GCP Service Map
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              TypeScript + Python monorepo running 7 Cloud Run services, 1 Cloud Run DB Job, Private-IP
              Cloud SQL PostgreSQL 16, Vertex AI Gemini 3 Flash, and Google Cloud Healthcare API.
            </p>
          </div>
        </div>

        {/* Service Topology Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-[#0b2545]">
                <th className="py-2.5 px-3 font-bold">Component</th>
                <th className="py-2.5 px-3 font-bold">Repo Path & Runtime</th>
                <th className="py-2.5 px-3 font-bold">GCP Service / Ingress</th>
                <th className="py-2.5 px-3 font-bold">Responsibility</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-muted-foreground">
              {[
                [
                  "Patient Web Portal",
                  "apps/patient-web (Next.js 15)",
                  "hrp-*-patient-web · LB Only + Cloud Armor WAF",
                  "4-step intake, Core + 4 Opt-In Supplemental screening packs, Patient Release, real-time 911 alert, Stedi X12 eligibility, booking.",
                ],
                [
                  "Patient Mobile PWA",
                  "apps/patient-mobile-pwa (Next.js 15)",
                  "hrp-*-patient-mobile-pwa · LB Only + Cloud Armor WAF",
                  "Single-use Magic-Link DOB+ZIP verification (HttpOnly cookie), AI extraction review cards, provenance guard.",
                ],
                [
                  "Provider Dashboard",
                  "apps/provider-dashboard (Next.js 15)",
                  "hrp-*-provider-dashboard · LB Only + IAP (Prod)",
                  "HIGH/STANDARD workqueue, inline answer correction, 69-model Assessment Runner, FHIR/HL7 orders, PDFs, Visits Calendar.",
                ],
                [
                  "Admin Portal",
                  "apps/admin-portal (Next.js 15)",
                  "hrp-*-admin-portal · LB Only + IAP (Prod)",
                  "69-rule JsonLogic editor, 159-question registry, analytics & PDFs, Governance Studio (Users, Payers, Settings, Restore Points), Docs.",
                ],
                [
                  "Rules Engine API",
                  "services/rules-engine-api (Node 22 / Express)",
                  "hrp-*-rules-engine-api · Internal VPC Only",
                  "Unified 69-rule JsonLogic evaluator, derived metric calculators, Stedi 2-layer payer engine, Chromium PDF engine, RBAC & HIPAA audit logging.",
                ],
                [
                  "Clinical Parser Worker",
                  "services/clinical-parser-worker (Python 3.12 / FastAPI)",
                  "hrp-*-clinical-parser-worker · Internal VPC Only",
                  "Vertex AI Gemini 3 Flash structured clinical extraction returning JSON responses with confidence scores and verbatim source excerpts.",
                ],
                [
                  "Interop Ingestion Worker",
                  "services/interop-ingestion-worker (Node 22 / Express)",
                  "hrp-*-interop-ingestion-worker · Internal VPC Only",
                  "Ingests HL7 v2 ORU, FHIR R4 Bundle, C-CDA XML, and GCS Eventarc PDF folder drops; dispatches outbound FHIR ServiceRequest / HL7 ORM orders.",
                ],
                [
                  "DB Setup Job",
                  "packages/database (PG16 SQL + Seed)",
                  "hrp-*-db-setup · Cloud Run Job (Private VPC)",
                  "Idempotently applies SQL migrations (0001 + 0002) and seeds 159 questions, 69 clinical rules, RBAC users, accepted payers, settings, and baseline snapshot.",
                ],
              ].map((row) => (
                <tr key={row[0]} className="hover:bg-secondary/20">
                  <td className="py-2.5 px-3 font-semibold text-[#0b2545] whitespace-nowrap">
                    {row[0]}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px]">{row[1]}</td>
                  <td className="py-2.5 px-3 font-mono text-[11px]">{row[2]}</td>
                  <td className="py-2.5 px-3 leading-relaxed">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Unified Data Model & Request Flow */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-start gap-3 border-b border-border pb-3">
          <div className="h-9 w-9 rounded-xl bg-[#e4f4f7] text-[#127080] flex items-center justify-center shrink-0">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#0b2545]">
              Unified PostgreSQL 16 Data Model & Security Boundaries
            </h3>
            <p className="text-xs text-muted-foreground">
              All patient-facing UIs communicate exclusively through server-side Next.js BFF proxies
              (<code>/api/patient/*</code>, <code>/api/provider/*</code>, <code>/api/admin/*</code>) to
              the internal-only Rules Engine API using Cloud Run IAM OIDC ID tokens.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-white p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[#127080] flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5" /> Core Clinical Tables
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 font-mono">
              <li>• patients (demographics, MRN)</li>
              <li>• clinical_documents (HL7/FHIR/PDF)</li>
              <li>• questions (159 rows, JSONB rules)</li>
              <li>• clinical_rules (69 JsonLogic rules)</li>
              <li>• assessment_sessions (WEB / MOBILE / EHR)</li>
              <li>• assessment_responses (+ provenance &amp; original_answer_value)</li>
              <li>• triggered_pathways (scores, CPT/ICD-10)</li>
              <li>• workqueue_items &amp; appointments</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-white p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[#127080] flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5" /> Enterprise Governance Tables (0002)
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 font-mono">
              <li>• patient_consents (release version, 3 flags, signature, IP, UTC timestamp)</li>
              <li>• users (RBAC directory, NPI, status)</li>
              <li>• accepted_payers (2-layer acceptance + Stedi trading partner IDs)</li>
              <li>• platform_settings (DB-backed JSONB config &amp; prompts)</li>
              <li>• config_snapshots (atomic restore points &amp; rollback diffs)</li>
              <li>• magic_links (SHA-256 token hashes)</li>
              <li>• audit_logs (append-only HIPAA trail)</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-white p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[#127080] flex items-center gap-1.5">
              <Cloud className="h-3.5 w-3.5" /> Network & Encryption Path
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
              <li>
                <strong>Browser → Global HTTPS LB</strong> (<code>34.111.15.222</code>) with Managed
                SSL + Cloud Armor WAF + IAP (Prod).
              </li>
              <li>
                <strong>Frontend Cloud Run → Serverless VPC Connector</strong> (
                <code>10.28.0.0/28</code>) → Internal <code>rules-engine-api</code> with GCP OIDC
                Bearer token.
              </li>
              <li>
                <strong>API → Cloud SQL PG16</strong> over Private Services Access (
                <code>ipv4_enabled=false</code>, <code>ssl_mode=ENCRYPTED_ONLY</code>, Cloud KMS CMEK).
              </li>
              <li>
                <strong>Outbound APIs (Stedi, Vertex AI)</strong> traverse Cloud Router + Cloud NAT
                from VPC <code>ALL_TRAFFIC</code> egress.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 3. Developer, Build & Troubleshooting Runbook */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-start gap-3 border-b border-border pb-3">
          <div className="h-9 w-9 rounded-xl bg-[#e4f4f7] text-[#127080] flex items-center justify-center shrink-0">
            <Terminal className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#0b2545]">
              IT Operations Runbook: Local Verification, Cloud Build CI/CD & Database Seeding
            </h3>
            <p className="text-xs text-muted-foreground">
              Exact repeatable commands for validating code, building Artifact Registry images, running
              migrations, and diagnosing live incidents.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CodeBlock
            title="1. Local Typecheck, Build & Full 41-Test Verification"
            code={`# Ensure PostgreSQL 16 is running locally
pnpm --filter @healthcare/shared-contracts build
pnpm --filter @healthcare/database build
pnpm -r typecheck && pnpm -r build && pnpm -r test`}
          />
          <CodeBlock
            title="2. Build Images & Run DB Migration/Seed Job on GCP"
            code={`# Build & push container images to Artifact Registry
gcloud builds submit --config=infra/cloudbuild-images.yaml .

# Update and run Cloud Run DB migration + 69-rule seed job
gcloud run jobs update hrp-dev-db-setup --region=us-central1 \\
  --image=us-central1-docker.pkg.dev/$PROJECT/healthcare-risk-platform/rules-engine-api:latest
gcloud run jobs execute hrp-dev-db-setup --region=us-central1 --wait`}
          />
        </div>

        <div className="rounded-xl border border-border bg-secondary/35 p-4 space-y-2">
          <p className="text-xs font-bold text-[#0b2545] flex items-center gap-1.5">
            <Wrench className="h-4 w-4 text-[#127080]" /> Common IT Troubleshooting Checks
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
            <li>
              • <strong>404 on Admin API calls:</strong> Verify Next.js BFF proxy route exports the
              HTTP verb (<code>GET</code>/<code>POST</code>/<code>PUT</code>/<code>PATCH</code>/
              <code>DELETE</code>) and <code>RULES_ENGINE_API_URL</code> is reachable inside VPC.
            </li>
            <li>
              • <strong>Cloud Run 403 between frontend and API:</strong> Confirm frontend SA holds{" "}
              <code>roles/run.invoker</code> on <code>rules-engine-api</code> and sends a valid GCP
              metadata OIDC token.
            </li>
            <li>
              • <strong>Stale rules/questions after deploy:</strong> Execute the{" "}
              <code>*-db-setup</code> Cloud Run Job (migrations &amp; idempotent upserts run inside
              the private VPC).
            </li>
            <li>
              • <strong>Bad clinical config pushed by admin:</strong> Open{" "}
              <code>/governance → Restore Points</code> and execute an atomic rollback (zero SSH or
              SQL access needed).
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
