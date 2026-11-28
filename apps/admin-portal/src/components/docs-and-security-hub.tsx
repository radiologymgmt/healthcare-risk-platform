"use client";

import React, { useState } from "react";
import {
  BookOpen,
  HeartPulse,
  Layers,
  Printer,
  Rocket,
  Scale,
  ShieldAlert,
  SlidersHorizontal,
  Stethoscope,
} from "lucide-react";
import {
  AdminHowToManual,
  ClinicalWalkthroughAndManual,
  PatientHowToManual,
} from "@/components/docs/clinical-patient-admin-guides";
import { ContractsAndLegalTab } from "@/components/docs/contracts-legal-tab";
import { ItArchitectureWalkthrough } from "@/components/docs/it-architecture-guide";
import {
  DemoSecurityAssessment,
  ProductionDeploymentPlanAndSecurityReview,
} from "@/components/docs/security-and-prod-plan";

type DocTab =
  | "clinical"
  | "patient"
  | "admin"
  | "it-architecture"
  | "demo-security"
  | "prod-deployment"
  | "contracts";

const TABS: Array<{
  id: DocTab;
  label: string;
  shortLabel: string;
  audience: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "clinical",
    label: "Clinical Walkthrough & Clinician Manual",
    shortLabel: "Clinician Manual",
    audience: "Physicians, Radiologists & Coordinators",
    icon: Stethoscope,
  },
  {
    id: "patient",
    label: "Patient How-To Manual",
    shortLabel: "Patient Manual",
    audience: "Patients (Web Portal & Mobile PWA)",
    icon: HeartPulse,
  },
  {
    id: "admin",
    label: "Administrator How-To Manual",
    shortLabel: "Admin Manual",
    audience: "Clinical Informatics & Ops Admins",
    icon: SlidersHorizontal,
  },
  {
    id: "it-architecture",
    label: "IT & Engineering Walkthrough",
    shortLabel: "IT Walkthrough",
    audience: "Cloud Engineers, DevOps & EHR Interop",
    icon: Layers,
  },
  {
    id: "demo-security",
    label: "Demo Security Review & Assessment",
    shortLabel: "Demo Security",
    audience: "InfoSec, Compliance & Risk Officers",
    icon: ShieldAlert,
  },
  {
    id: "prod-deployment",
    label: "Production Plan & Security Review",
    shortLabel: "Production Plan",
    audience: "CISO, Cloud Architects & Go-Live Board",
    icon: Rocket,
  },
  {
    id: "contracts",
    label: "Pre-Demo & Pre-Prod Contracts (NY)",
    shortLabel: "Contracts (NY)",
    audience: "Legal Counsel, NDA, BAA & MSA Drafts",
    icon: Scale,
  },
];

export function DocsAndSecurityHub() {
  const [activeTab, setActiveTab] = useState<DocTab>("clinical");
  const [binderMode, setBinderMode] = useState(false);

  return (
    <div className="space-y-5">
      {/* Executive Header */}
      <div className="rounded-2xl border border-border bg-gradient-to-r from-[#0b2545] to-[#133b66] text-white p-5 sm:p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal-200">
            <BookOpen className="h-3.5 w-3.5" />
            RadManagement LLC · Enterprise Operations, Legal &amp; Security Binder
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Walkthrough Guides, How-To Manuals, Contracts &amp; HIPAA Security Reviews
          </h1>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
            Role-based operating manuals for clinicians, patients, and administrators, IT
            architecture runbooks, New York Pre-Demo &amp; Pre-Production legal contract drafts,
            live security assessment of <code>hrp-synthetic-demo-01</code>, and exact HIPAA
            production blueprint for <code>hrp-prod-01</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            id="docs-binder-toggle"
            type="button"
            onClick={() => setBinderMode((prev) => !prev)}
            className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
              binderMode
                ? "bg-teal-400 text-[#0b2545] border-teal-300"
                : "bg-white/10 text-white border-white/25 hover:bg-white/20"
            }`}
          >
            {binderMode ? "Showing Complete 7-Part Binder" : "View All 7 Sections (Binder Mode)"}
          </button>
          <button
            id="docs-print-btn"
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-white text-[#0b2545] text-xs font-bold hover:bg-slate-100 cursor-pointer shadow-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* 7-Tab Navigation Bar */}
      {!binderMode && (
        <div
          role="tablist"
          aria-label="Documentation, Contracts and Security sections"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5 print:hidden"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`docs-tab-${tab.id}`}
                role="tab"
                aria-selected={selected}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`text-left rounded-xl border p-3 transition-all cursor-pointer space-y-1 ${
                  selected
                    ? "border-[#127080] bg-[#e4f4f7] ring-1 ring-[#127080] shadow-xs"
                    : "border-border bg-card hover:border-[#127080]/50 hover:bg-secondary/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      selected ? "text-[#127080]" : "text-muted-foreground"
                    }`}
                  />
                  <span className="text-xs font-bold text-[#0b2545] leading-snug">
                    {tab.shortLabel}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">{tab.audience}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Active Guide or Full Binder Content */}
      <div className="space-y-8">
        {(binderMode || activeTab === "clinical") && <ClinicalWalkthroughAndManual />}
        {(binderMode || activeTab === "patient") && <PatientHowToManual />}
        {(binderMode || activeTab === "admin") && <AdminHowToManual />}
        {(binderMode || activeTab === "it-architecture") && <ItArchitectureWalkthrough />}
        {(binderMode || activeTab === "demo-security") && <DemoSecurityAssessment />}
        {(binderMode || activeTab === "prod-deployment") && (
          <ProductionDeploymentPlanAndSecurityReview />
        )}
        {(binderMode || activeTab === "contracts") && <ContractsAndLegalTab />}
      </div>
    </div>
  );
}
