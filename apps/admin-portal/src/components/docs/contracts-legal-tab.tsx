"use client";

import React from "react";
import { AlertTriangle, FileText, Scale, ShieldCheck } from "lucide-react";
import {
  CONTRACT_GOVERNING_STATE,
  DEMO_AGREEMENT_VERSION,
  PRE_DEMO_CONTRACTS,
  PRE_PRODUCTION_CONTRACTS,
  type LegalContractDocument,
} from "@healthcare/shared-contracts";

function ContractCard({ contract }: { contract: LegalContractDocument }) {
  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs break-inside-avoid-page">
      <div className="px-5 py-4 bg-[#f4f8fa] border-b border-border flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#0b2545] text-white">
              {contract.code}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300">
              {contract.reviewStatus}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#e4f4f7] text-[#127080]">
              {contract.governingLaw}
            </span>
          </div>
          <h3 className="text-base font-bold text-[#0b2545]">{contract.title}</h3>
          <p className="text-xs text-muted-foreground">{contract.subtitle}</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="rounded-xl border border-border bg-secondary/35 p-3.5 space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#127080]">
            Key Provisions Summary
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
            {contract.summaryPoints.map((pt) => (
              <li key={pt}>{pt}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
          {contract.sections.map((sec) => (
            <div key={sec.heading} className="space-y-1">
              <p className="font-bold text-[#0b2545]">{sec.heading}</p>
              <p>{sec.body}</p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export function ContractsAndLegalTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-amber-950">
          <p className="font-bold text-sm">
            Draft Legal Contracts for Counsel Review · State of {CONTRACT_GOVERNING_STATE} (Version{" "}
            {DEMO_AGREEMENT_VERSION})
          </p>
          <p className="leading-relaxed">
            All Pre-Demo and Pre-Production agreements below are governed by the{" "}
            <strong>State of {CONTRACT_GOVERNING_STATE}</strong> (New York County venue) and prepared
            as structured drafts for review and finalization by RadManagement LLC&apos;s healthcare
            counsel. Pre-Demo agreements are presented automatically at the Demo Hub Gate prior to
            product access for every non-admin evaluator (hardcoded owner{" "}
            <code>radiologymgmt@gmail.com</code> is exempt). Click{" "}
            <strong>Print / Save PDF</strong> above to export this entire legal packet for counsel.
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2.5 border-b border-border pb-2.5">
          <ShieldCheck className="h-5 w-5 text-[#127080]" />
          <div>
            <h2 className="text-lg font-bold text-[#0b2545]">
              Part 1 · Pre-Demo Contracts (Required Before Accessing Demo Hub)
            </h2>
            <p className="text-xs text-muted-foreground">
              Electronically signed (Full Name, Email, Date, UTC Timestamp, IP &amp; SHA-256 Hash)
              at <code>/demo-gate</code> and audited in <code>/governance → Users &amp; Agreements</code>.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          {PRE_DEMO_CONTRACTS.map((c) => (
            <ContractCard key={c.id} contract={c} />
          ))}
        </div>
      </section>

      <section className="space-y-4 pt-2">
        <div className="flex items-center gap-2.5 border-b border-border pb-2.5">
          <Scale className="h-5 w-5 text-[#0b2545]" />
          <div>
            <h2 className="text-lg font-bold text-[#0b2545]">
              Part 2 · Pre-Production Contracts &amp; Licensing Schedules (Required Before Real ePHI)
            </h2>
            <p className="text-xs text-muted-foreground">
              Must be finalized by counsel and countersigned prior to deploying real patient data in
              BAA-covered <code>hrp-prod-01</code>.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          {PRE_PRODUCTION_CONTRACTS.map((c) => (
            <ContractCard key={c.id} contract={c} />
          ))}
        </div>
      </section>
    </div>
  );
}
