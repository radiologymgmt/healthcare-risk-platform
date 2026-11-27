"use client";

import React from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  HeartPulse,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Stethoscope,
  Users,
} from "lucide-react";

function SectionCard({
  id,
  icon: Icon,
  badge,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-5 break-inside-avoid-page"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#e4f4f7] text-[#127080] flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#127080]">
              {badge}
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0b2545] tracking-tight">{title}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

function StepList({ steps }: { steps: Array<{ title: string; detail: string; tip?: string }> }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, idx) => (
        <li
          key={step.title}
          className="rounded-xl border border-border bg-secondary/35 p-4 flex items-start gap-3.5"
        >
          <span className="h-7 w-7 rounded-full bg-[#0b2545] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
            {idx + 1}
          </span>
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-bold text-[#0b2545]">{step.title}</p>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{step.detail}</p>
            {step.tip && (
              <p className="text-xs text-[#127080] font-medium pt-0.5">
                Tip: {step.tip}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ClinicalWalkthroughAndManual() {
  return (
    <div className="space-y-6">
      <SectionCard
        id="clinical-walkthrough"
        icon={Stethoscope}
        badge="Clinical Operations Walkthrough"
        title="End-to-End Clinical Workflow (69 Evidence-Based Models)"
        subtitle="How patient intake, EHR/lab ingestion, automated risk scoring, and clinician triage connect across RadManagement LLC."
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            {
              stage: "Stage 1 · Capture",
              title: "Patient & EHR Inputs",
              body: "Patients complete Web Intake or Mobile Magic-Link review while HL7/FHIR/C-CDA lab & note feeds merge into one unified session.",
            },
            {
              stage: "Stage 2 · Evaluate",
              title: "69-Model Rules Engine",
              body: "Every submission runs 69 JsonLogic clinical pathways (47 patient/gateway + 22 EHR/lab/radiology) across 15 specialties.",
            },
            {
              stage: "Stage 3 · Triage",
              title: "HIGH / STANDARD Queue",
              body: "Acute Red Flags and High-Risk findings route to HIGH priority; Moderate/Routine findings route to STANDARD priority.",
            },
            {
              stage: "Stage 4 · Order & Track",
              title: "Clinician Sign-Off & Visits",
              body: "Clinicians verify answers, approve CPT/ICD-10 imaging orders, export branded PDFs, and manage appointments in Visits Calendar.",
            },
          ].map((card) => (
            <div key={card.stage} className="rounded-xl border border-border bg-white p-4 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#127080]">
                {card.stage}
              </p>
              <p className="text-sm font-bold text-[#0b2545]">{card.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 space-y-1.5">
          <p className="text-xs sm:text-sm font-bold text-rose-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-700 shrink-0" />
            Acute Red-Flag Escalation Protocol (911 Patient Interrupt + HIGH Priority Workqueue)
          </p>
          <p className="text-xs text-rose-900 leading-relaxed">
            If a patient answers <strong>Yes</strong> to any emergent red flag (thunderclap headache,
            headache with fever/stiff neck or focal deficit, acute tearing chest/back pain, sudden TIA
            weakness/speech loss, acute DVT/PE leg swelling/hemoptysis, or{" "}
            <strong>Cauda Equina spine red flags</strong>), the Patient Portal immediately displays a
            blocking <strong>Call 911 Now / Visit Nearest ER</strong> modal. Any submitted case
            triggering an <code>ACUTE_RED_FLAG</code> rule (SNNOOP10, ADD-RS, ABCD2, Wells/Geneva PE,
            or Spine Cauda Equina) is flagged <strong>HIGH</strong> priority at the top of the Provider
            Workqueue for immediate clinical outreach.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-white p-4 space-y-2">
            <h3 className="text-sm font-bold text-[#0b2545]">Workqueue Workflow Status Lifecycle</h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>
                <strong className="text-[#0b2545]">1. Contact Pending:</strong> Newly triaged case
                awaiting coordinator/clinician chart review or patient outreach.
              </li>
              <li>
                <strong className="text-[#0b2545]">2. Appointment Scheduled:</strong> Patient has
                booked a preventive consult or imaging slot (visible in Visits Calendar).
              </li>
              <li>
                <strong className="text-[#0b2545]">3. Exams Ordered:</strong> Clinician has approved
                and dispatched CPT/ICD-10 imaging or genetic orders via FHIR/HL7.
              </li>
              <li>
                <strong className="text-[#0b2545]">4. Patient Completed:</strong> Imaging or consult
                completed and clinical loop closed.
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-white p-4 space-y-2">
            <h3 className="text-sm font-bold text-[#0b2545]">Data Provenance & Clinical Accountability</h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>
                <strong className="text-[#0b2545]">PATIENT_ENTERED:</strong> Directly entered by the
                patient during web intake.
              </li>
              <li>
                <strong className="text-[#0b2545]">AI_PARSED / PATIENT_CONFIRMED_AI:</strong>{" "}
                Extracted from clinical visit notes by Vertex AI Gemini with verbatim source excerpt
                and confidence score; confirmed or edited by the patient.
              </li>
              <li>
                <strong className="text-[#0b2545]">EHR_LAB_IMPORT:</strong> Structured lab/radiology
                values (PSA, AST/ALT, HbA1c, Lung-RADS, CAC, BI-RADS) ingested via HL7/FHIR.
              </li>
              <li>
                <strong className="text-[#0b2545]">CLINICIAN_CORRECTED:</strong> Updated inline by a
                provider; preserves the original value, correction reason, clinician ID, and timestamp.
              </li>
            </ul>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        id="clinician-manual"
        icon={ClipboardCheck}
        badge="Clinician How-To Manual"
        title="Provider Workqueue, Assessment Runner, PDFs & Visits Calendar"
        subtitle="Step-by-step operating instructions for radiologists, referring physicians, advanced practice providers, and care coordinators at provider.demo.risk.radmgmt.org."
      >
        <StepList
          steps={[
            {
              title: "Open & Filter the Clinical Workqueue",
              detail:
                "Navigate to the Provider Portal. Use the KPI cards and filter chips to sort by Priority (HIGH vs. STANDARD) or Workflow Status (Contact Pending, Appointment Scheduled, Exams Ordered, Patient Completed). Click any patient row to open the Clinical Review Drawer on the right.",
              tip: "In demo mode, click '+ Seed Synthetic Cases' in the top right to generate realistic multi-status cases instantly.",
            },
            {
              title: "Review & Edit Patient Responses Inline (Audit-Preserved)",
              detail:
                "In the right-hand drawer under 'Patient Responses & AI Excerpts', inspect every patient-entered, EHR-imported, and AI-parsed answer (including height in feet/inches, weight in lbs, confidence scores, and source note excerpts). Click the 'Edit' button beside any response to correct an inaccurate entry, enter an optional clinical reason, and click 'Save & Re-Evaluate'.",
              tip: "Original values are never overwritten — the database preserves original_answer_value, tags the item CLINICIAN_CORRECTED, writes a HIPAA audit log entry, and automatically re-runs all 69 rules.",
            },
            {
              title: "Run Any of the 69 Individual Risk Models (Assessment Runner)",
              detail:
                "Click 'Run Individual Assessment' inside the patient drawer to launch the Assessment Runner modal. Search across all 69 models (e.g., Tyrer-Cuzick, USPSTF Lung, USPSTF CRC, ACR TI-RADS, Fukuoka IPMN, Dutch Lipid FH, Spine ODI, AD8, PHQ-9/GAD-7). Inspect which inputs are already populated vs. missing, enter temporary 'what-if' overrides, click 'Preview Dry-Run', or click 'Save & Commit to Care Plan' to persist findings and update the workqueue.",
            },
            {
              title: "Approve, Order & Dispatch Imaging Pathways (FHIR / HL7)",
              detail:
                "Under 'Triggered Risk Pathways & Orders', review each model's acuity badge, calculated clinical score, recommended imaging modality, CPT codes, ICD-10-CM diagnosis codes, and pre-built prior-authorization rationale. Click 'Approve & Dispatch Order' to transmit an outbound FHIR ServiceRequest / HL7 ORM order (or 'Decline' with rationale).",
            },
            {
              title: "Generate One-Click Branded Clinical PDFs",
              detail:
                "Use the 'Download Clinical PDFs' toolbar in the drawer to export three RadManagement LLC branded PDF packets directly from the live database: (1) Full Clinical Packet (all answers, provenance, scores, and CPT/ICD-10 orders), (2) Patient-Friendly Summary (plain-English roadmap), and (3) Prior-Authorization Justification Packet (guideline citations and medical necessity rationale for payers).",
            },
            {
              title: "Manage Patient Visits & Calendar Rescheduling",
              detail:
                "Switch to the 'Visits Calendar' tab at the top of the Provider Portal to view scheduled consults and imaging visits (LDCT, Breast MRI, DEXA, CAC, Consult). Click 'Confirm', 'Reschedule' (pick a new date/time and save), or 'Cancel' on any visit card — changes sync live with PostgreSQL and audit logs.",
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}

export function PatientHowToManual() {
  return (
    <div className="space-y-6">
      <SectionCard
        id="patient-web-manual"
        icon={HeartPulse}
        badge="Patient How-To Manual · Web Portal"
        title="Completing Your Preventive Health Assessment Online"
        subtitle="Plain-English walkthrough for patients using intake.demo.risk.radmgmt.org on desktop, tablet, or smartphone."
      >
        <StepList
          steps={[
            {
              title: "Step 1 — Tell Us About Yourself & Choose Your Health Focus",
              detail:
                "Enter your name, date of birth, sex assigned at birth, and ZIP code. Your age and sex automatically skip questions that do not apply to you. Next, pick 'Complete Core Preventive Check (Recommended)' or select specific areas like Cancer & Family Genetics, Lung & Breathing, Heart & Vascular, Women's Health, Men's Health, or Bone & Sleep.",
              tip: "You can switch between Full Page and Mobile View at the top of the portal anytime.",
            },
            {
              title: "Optional Additional Screenings (Your Choice — Zero Question Bloat)",
              detail:
                "Right below the core areas, you will see 'Optional Additional Screenings'. These are 0% required by default so your core checkup stays fast (3–5 minutes). If you would like a deeper review, click any optional topic — Colorectal/Thyroid/Pancreatic Imaging, Back & Spine Health, Diabetes & Kidney Wellness, or Mood & Anxiety Wellness — or click 'Include All Optional Screenings'.",
            },
            {
              title: "Review & Sign the Patient Release & 911 Safety Notice",
              detail:
                "Read the highlighted emergency warning (if you have sudden severe symptoms, call 911 or visit an ER immediately). Check all three acknowledgments confirming HIPAA data sharing with RadManagement LLC and its care partners, AI-assisted preparation with licensed clinician review, and the 911 emergency notice. Type your full name and click 'Agree & Continue'.",
            },
            {
              title: "Step 2 — Answer Smart, Tailored Health Questions",
              detail:
                "Enter your height (feet and inches) and weight (pounds), then answer simple Yes/No gateway questions. Follow-up questions only appear if you answer Yes (or No for overdue colon screening). Tap the '?' icon beside any question for a plain-English explanation of why it matters. If an emergency symptom is checked Yes, an immediate Call 911 alert appears for your safety.",
            },
            {
              title: "Step 3 — Instant Insurance Acceptance & Coverage Check",
              detail:
                "Select your insurance plan and enter your Member ID. The portal checks two things at once: (1) whether RadManagement LLC accepts your plan in-network or out-of-network, and (2) real-time electronic eligibility (Stedi X12 270/271) showing estimated preventive copay and deductible status. If your plan is not accepted, clear self-pay and referral options are shown immediately.",
            },
            {
              title: "Step 4 — View Your Personalized Roadmap & Book a Visit",
              detail:
                "Click 'Generate My Screening Roadmap' to see recommended preventive checks tailored to your answers. Pick a convenient date and time slot to book a guided review with a RadManagement clinician — no clinical guesswork required.",
            },
          ]}
        />
      </SectionCard>

      <SectionCard
        id="patient-mobile-manual"
        icon={Smartphone}
        badge="Patient How-To Manual · Mobile Magic-Link PWA"
        title="Reviewing Pre-Filled Clinical Notes on Your Phone"
        subtitle="How patients securely unlock and confirm AI-extracted medical history via mobile.demo.risk.radmgmt.org."
      >
        <StepList
          steps={[
            {
              title: "Open Your Secure One-Time Magic Link",
              detail:
                "When your doctor's office sends a secure text or email link after receiving your recent clinic note or lab report, tap it on your smartphone. Links are single-use, time-limited, and never store health data in your phone's browser storage.",
            },
            {
              title: "Verify Identity (Date of Birth + ZIP Code) & Accept Release",
              detail:
                "Enter your Date of Birth and 5-digit ZIP code, review the Patient Release & 911 Safety Notice, and tap 'Verify & Unlock'. After verification, an encrypted HttpOnly session cookie protects your review.",
            },
            {
              title: "Review Each AI-Extracted Health Card",
              detail:
                "Each pre-filled card shows the extracted answer, the AI confidence indicator, and the exact quoted snippet from your visit note. Tap 'Confirm' if it is accurate, or tap 'Edit' to correct values (including feet/inches height or lbs weight). If you edit a value, the card marks it 'Edited by you' and lets you revert with 'Use Original AI' if needed.",
            },
            {
              title: "Submit to Your Care Team",
              detail:
                "Once all cards are reviewed, tap 'Submit Verified Health Summary'. Your confirmed answers merge with your EHR labs, run all 69 clinical rules, and notify your clinician immediately if any preventive screening or follow-up is recommended.",
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}

export function AdminHowToManual() {
  return (
    <div className="space-y-6">
      <SectionCard
        id="admin-manual"
        icon={SlidersHorizontal}
        badge="Administrator How-To Manual"
        title="Operating the Admin Configuration, Governance & Restore Portal"
        subtitle="Complete operational handbook for Clinical Informatics leads, Radiology Operations Admins, and Compliance Officers at admin.demo.risk.radmgmt.org."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              route: "/rules",
              title: "Clinical Rules & CPT/ICD-10 Editor (69 Models)",
              points: [
                "Filter all 69 rules by specialty (15 specialties), rule type, or active status.",
                "Edit JsonLogic expressions, acuity level, CPT/ICD-10 codes, and prior-auth templates directly in the browser — zero code deploy required.",
                "Always run the built-in 'Synthetic Dry-Run Simulator' before saving to verify whether your edited rule triggers as expected.",
                "Every save bumps the rules version snapshot and logs an immutable UPDATE_RULE audit event.",
              ],
            },
            {
              route: "/questions",
              title: "Question Registry & Knockout Gates (159 Questions)",
              points: [
                "Search or filter questions across all 17 domains (12 core + 5 opt-in supplemental).",
                "Toggle is_knockout_gate, edit plain-English labels & tooltips, or adjust display_conditions (min_age, max_age, sex_at_birth, depends_on).",
                "Add new patient or EHR lab questions without database migrations — changes propagate instantly to Patient Web Intake and Mobile PWA.",
              ],
            },
            {
              route: "/analytics",
              title: "Executive Analytics & Branded PDF Engine",
              points: [
                "Track funnel conversion from Intake Started → Submitted → Pathways Triggered → Visits Booked → Exams Ordered.",
                "Review High vs. Standard priority mix and triggered pathway breakdown by specialty.",
                "Export RadManagement-branded Executive Summary PDFs, Clinical Audit Reports, or individual Patient Risk Summaries.",
              ],
            },
            {
              route: "/governance · Tab 1",
              title: "Users & RBAC Directory",
              points: [
                "Create, edit, or deactivate staff accounts across ADMIN, PROVIDER, COORDINATOR, and AUDITOR roles.",
                "Enforce NPI tracking for clinicians and least-privilege role separation.",
                "In production, user email addresses map directly to Google IAP / SSO verified identities.",
              ],
            },
            {
              route: "/governance · Tab 2",
              title: "2-Layer Accepted Payers Registry",
              points: [
                "Configure every commercial, Medicare, and Medicaid payer as IN_NETWORK, OUT_OF_NETWORK_ACCEPTED, or NOT_ACCEPTED.",
                "Set Stedi trading partner IDs, PCP referral flags, self-pay availability, and patient-facing guidance copy.",
                "Changes update Step 3 of Patient Intake immediately without redeploying code.",
              ],
            },
            {
              route: "/governance · Tabs 3 & 4",
              title: "Portal Light-Code Studio & Restore Points",
              points: [
                "Edit Patient Release copy, organization branding/NPI, scheduling slots, Gemini extraction prompts, derived-metric JsonLogic definitions, and PDF headers directly in PostgreSQL.",
                "Before making major configuration edits, click 'Create Restore Point' in Tab 4.",
                "Preview live diffs between any snapshot and live config, or execute an atomic one-click rollback (which automatically creates an AUTO_PRE_RESTORE safety backup first).",
              ],
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-border bg-white p-4 space-y-2.5 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <span className="inline-block font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-[#e4f4f7] text-[#127080]">
                  {item.route}
                </span>
                <h3 className="text-sm font-bold text-[#0b2545]">{item.title}</h3>
                <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
                  {item.points.map((pt) => (
                    <li key={pt} className="leading-relaxed">
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-teal-200 bg-[#e4f4f7]/60 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="h-5 w-5 text-[#127080] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[#0b2545]">
                Best-Practice Change Management Rule for Admins
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Before modifying clinical thresholds, consent wording, or accepted payers in production:
                (1) Create a named Restore Point in <code>/governance</code>, (2) validate rule logic in{" "}
                <code>/rules</code> Dry-Run Simulator, (3) save changes, and (4) verify live behavior
                using a synthetic test patient.
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        id="rbac-matrix"
        icon={Users}
        badge="Access Governance"
        title="Role-Based Access Control (RBAC) Matrix"
        subtitle="Least-privilege permissions enforced across API middleware, Next.js BFF proxies, and Google IAP."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-[#0b2545]">
                <th className="py-2.5 px-3 font-bold">Capability / Portal</th>
                <th className="py-2.5 px-3 font-bold">PATIENT</th>
                <th className="py-2.5 px-3 font-bold">COORDINATOR</th>
                <th className="py-2.5 px-3 font-bold">PROVIDER</th>
                <th className="py-2.5 px-3 font-bold">AUDITOR</th>
                <th className="py-2.5 px-3 font-bold">ADMIN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-muted-foreground">
              {[
                ["Patient Web Intake & Magic-Link Review", "Own Session Only", "No", "No", "No", "Test / Demo Only"],
                ["Provider Workqueue & Visits Calendar", "No (403)", "View & Schedule", "Full Clinical", "Read-Only", "Full"],
                ["Inline Answer Editing & Assessment Runner", "No (403)", "No", "Yes (Logged)", "No", "Yes (Logged)"],
                ["Approve / Dispatch Imaging Orders (FHIR/HL7)", "No (403)", "No", "Yes (Logged)", "No", "Yes (Logged)"],
                ["Provider & Executive PDF Generation", "Patient Summary", "Visit Summary", "All Clinical PDFs", "Audit PDFs", "All PDFs"],
                ["Clinical Rules, Questions & Governance Studio", "No (403)", "No (403)", "No (403)", "Read-Only", "Full + Restore"],
              ].map((row) => (
                <tr key={row[0]} className="hover:bg-secondary/20">
                  <td className="py-2.5 px-3 font-semibold text-[#0b2545]">{row[0]}</td>
                  {row.slice(1).map((cell, i) => (
                    <td key={i} className="py-2.5 px-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
