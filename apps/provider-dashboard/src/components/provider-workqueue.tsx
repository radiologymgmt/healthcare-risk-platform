"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  XCircle,
} from "lucide-react";

interface TriggeredPathwayItem {
  id: string;
  rule_code: string;
  display_name: string;
  specialty: string;
  prior_auth_rationale_template: string | null;
  calculated_score: number | null;
  acuity_level: "ACUTE_RED_FLAG" | "HIGH_RISK" | "MODERATE_RISK" | "ROUTINE";
  recommended_intervention: string;
  cpt_codes: string[];
  icd10_codes: string[];
  clinician_disposition: "PENDING" | "APPROVED" | "ORDERED" | "DECLINED";
}

interface ProvenanceResponseItem {
  id: string;
  question_key: string;
  domain: string;
  label_plain_english: string;
  answer_value: unknown;
  provenance: string;
  confidence_score: number | null;
  source_document_id: string | null;
  source_excerpt: string | null;
}

interface ClinicalDocItem {
  id: string;
  source_type: string;
  document_category: string;
  gcs_uri: string;
  extracted_text: string | null;
  parsed_status: string;
  document_date: string | null;
}

interface WorkqueueItem {
  id: string;
  patient_id: string;
  session_id: string;
  assigned_provider_id: string | null;
  priority: "STAT" | "HIGH" | "STANDARD";
  status: string;
  session_channel: string;
  rules_version_snapshot: number;
  created_at: string;
  patient: {
    id: string;
    mrn: string | null;
    first_name: string;
    last_name: string;
    dob: string;
    sex_at_birth: string | null;
    insurance_status: {
      eligible?: boolean;
      coverage_status?: string;
      plan_name?: string;
    };
  };
  triggered_pathways: TriggeredPathwayItem[];
  responses: ProvenanceResponseItem[];
  documents: ClinicalDocItem[];
}

interface DispatchedOrder {
  order_id: string;
  rule_code: string;
  format: string;
  dispatched_via: string;
  payload: unknown;
}

export function ProviderWorkqueue({
  providerId,
  providerRole,
  isDemoMode = false,
}: {
  providerId: string;
  providerRole: string;
  isDemoMode?: boolean;
}) {
  const [items, setItems] = useState<WorkqueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [orderFormat, setOrderFormat] = useState<"FHIR_SERVICE_REQUEST" | "HL7_ORM">(
    "FHIR_SERVICE_REQUEST",
  );
  const [loading, setLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDispatched, setLastDispatched] = useState<DispatchedOrder[]>([]);
  const [highlightedDocId, setHighlightedDocId] = useState<string | null>(null);

  const loadWorkqueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = priorityFilter ? `?priority=${priorityFilter}` : "";
      const res = await fetch(`/api/provider${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load workqueue (${res.status})`);
      const data = (await res.json()) as { items?: WorkqueueItem[] };
      const list = data.items ?? [];
      setItems(list);
      setSelectedId((prev) =>
        prev && list.some((i) => i.id === prev) ? prev : (list[0]?.id ?? null),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workqueue");
    } finally {
      setLoading(false);
    }
  }, [priorityFilter]);

  useEffect(() => {
    void loadWorkqueue();
  }, [loadWorkqueue]);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  async function seedSyntheticCases() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/provider/demo-seed", { method: "POST" });
      if (!res.ok) throw new Error("Unable to seed synthetic triage cases");
      await loadWorkqueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
      setLoading(false);
    }
  }

  async function submitOrderAction(
    workqueueId: string,
    disposition: "ORDERED" | "DECLINED",
    pathwayIds?: string[],
  ) {
    setBusyOrder(true);
    setError(null);
    try {
      const res = await fetch(`/api/provider/${workqueueId}/order`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          disposition,
          order_format: orderFormat,
          ...(pathwayIds ? { pathway_ids: pathwayIds } : {}),
        }),
      });
      const data = (await res.json()) as {
        dispatched_orders?: DispatchedOrder[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Order approval failed");
      setLastDispatched(data.dispatched_orders ?? []);
      await loadWorkqueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order action failed");
    } finally {
      setBusyOrder(false);
    }
  }

  const statCount = items.filter((i) => i.priority === "STAT" && i.status !== "COMPLETED").length;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      {isDemoMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center text-xs font-medium text-amber-950 flex items-center justify-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
          <span>SYNTHETIC DEMO ENVIRONMENT &mdash; DO NOT ENTER REAL PHI</span>
        </div>
      )}
      {/* Top Clinical Bar */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-[1680px] px-5 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-[var(--teal)] text-white flex items-center justify-center">
              <Stethoscope className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight leading-none">
                Provider Clinical Triage &amp; Order Workbench
              </h1>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">
                STAT-First Priority Workqueue &middot; Split-Screen Provenance Verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {statCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                <AlertOctagon className="h-3.5 w-3.5" />
                {statCount} STAT Acute Case{statCount === 1 ? "" : "s"}
              </span>
            )}
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-mono text-slate-700">
              {providerId} ({providerRole})
            </span>
            <button
              type="button"
              onClick={() => void loadWorkqueue()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-300 bg-white text-xs font-medium hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1680px] flex-1 px-5 py-5 space-y-4">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-700" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT RAIL: Priority-Sorted Workqueue (STAT first) */}
          <aside className="lg:col-span-3 rounded-lg border border-[var(--border)] bg-white overflow-hidden shadow-xs">
            <div className="p-3 border-b border-[var(--border)] bg-slate-50/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Triage Queue ({items.length})
                </span>
                {isDemoMode && (
                  <button
                    id="seed-workqueue-btn"
                    type="button"
                    onClick={() => void seedSyntheticCases()}
                    className="text-[11px] font-medium text-teal-800 hover:underline cursor-pointer"
                  >
                    + Seed Synthetic Cases
                  </button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-1">
                {["", "STAT", "HIGH", "STANDARD"].map((p) => (
                  <button
                    key={p || "ALL"}
                    type="button"
                    onClick={() => setPriorityFilter(p)}
                    className={`h-7 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                      priorityFilter === p
                        ? "bg-[var(--teal)] text-white"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {p || "All"}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-200 max-h-[calc(100vh-195px)] overflow-y-auto">
              {loading && (
                <p className="p-6 text-center text-xs text-slate-500">Loading workqueue...</p>
              )}
              {!loading && items.length === 0 && (
                <div className="p-6 text-center space-y-2">
                  <p className="text-xs text-slate-500">No workqueue items pending.</p>
                </div>
              )}
              {items.map((item) => {
                const isSelected = item.id === selectedId;
                const pendingCount = item.triggered_pathways.filter(
                  (p) => p.clinician_disposition === "PENDING",
                ).length;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setLastDispatched([]);
                      setHighlightedDocId(null);
                    }}
                    className={`w-full text-left px-3.5 py-3 transition-colors hover:bg-slate-50 cursor-pointer ${
                      isSelected ? "bg-teal-50/70 border-l-2 border-l-[var(--teal)]" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          item.priority === "STAT"
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : item.priority === "HIGH"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {item.priority}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{item.status}</span>
                    </div>

                    <p className="text-xs font-semibold text-slate-900 mt-1.5">
                      {item.patient.last_name}, {item.patient.first_name}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                      MRN {item.patient.mrn ?? "N/A"} &middot; DOB {item.patient.dob}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-600 mt-1.5">
                      <span>{item.triggered_pathways.length} pathway(s)</span>
                      <span className="font-medium text-teal-800">
                        {pendingCount > 0 ? `${pendingCount} pending order` : "Reviewed"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* RIGHT WORKSPACE: Split-Screen Pathways + Clinical Document Excerpts */}
          <section className="lg:col-span-9 space-y-4">
            {!selected ? (
              <div className="rounded-lg border border-[var(--border)] bg-white p-12 text-center text-sm text-slate-500">
                Select a patient case from the STAT-prioritized workqueue to review triggered
                CPT/ICD-10 pathways and underlying clinical document excerpts.
              </div>
            ) : (
              <>
                {/* Patient Clinical Banner + Bulk Order Bar */}
                <div className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-base font-semibold text-slate-900">
                        {selected.patient.first_name} {selected.patient.last_name}
                      </h2>
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          selected.priority === "STAT"
                            ? "bg-rose-100 text-rose-800"
                            : selected.priority === "HIGH"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {selected.priority}
                      </span>
                      {selected.patient.insurance_status?.eligible && (
                        <span className="inline-flex items-center gap-1 text-xs text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Stedi Active: {selected.patient.insurance_status.plan_name ?? "Verified"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-slate-500">
                      MRN: {selected.patient.mrn ?? "N/A"} &middot; DOB: {selected.patient.dob}{" "}
                      &middot; Sex: {selected.patient.sex_at_birth ?? "Unknown"} &middot; Rules
                      Snapshot: v{selected.rules_version_snapshot}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <select
                      aria-label="Outbound order format"
                      value={orderFormat}
                      onChange={(e) =>
                        setOrderFormat(e.target.value as "FHIR_SERVICE_REQUEST" | "HL7_ORM")
                      }
                      className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-mono"
                    >
                      <option value="FHIR_SERVICE_REQUEST">FHIR R4 ServiceRequest</option>
                      <option value="HL7_ORM">HL7 v2 ORM^O01</option>
                    </select>

                    <button
                      id="approve-all-orders-btn"
                      type="button"
                      disabled={
                        busyOrder ||
                        !selected.triggered_pathways.some(
                          (p) => p.clinician_disposition === "PENDING",
                        )
                      }
                      onClick={() => void submitOrderAction(selected.id, "ORDERED")}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-[var(--teal)] text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {busyOrder ? "Dispatching..." : "Approve & Dispatch All Pending"}
                    </button>
                  </div>
                </div>

                {/* Outbound Order Dispatch Confirmation */}
                {lastDispatched.length > 0 && (
                  <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-4 space-y-2">
                    <p className="text-xs font-semibold text-teal-950 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-teal-700" />
                      Dispatched {lastDispatched.length} Outbound Order(s) ({orderFormat})
                    </p>
                    <pre className="text-[11px] font-mono bg-white border border-teal-200 rounded p-2.5 overflow-x-auto max-h-40">
                      {typeof lastDispatched[0]!.payload === "string"
                        ? lastDispatched[0]!.payload
                        : JSON.stringify(lastDispatched[0]!.payload, null, 2)}
                    </pre>
                  </div>
                )}

                {/* SPLIT-SCREEN: Triggered Pathways (Left) vs Parsed Document Excerpts (Right) */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                  {/* Split Pane 1: Triggered CPT/ICD-10 Pathways */}
                  <div className="rounded-lg border border-[var(--border)] bg-white shadow-xs overflow-hidden">
                    <div className="px-4 py-3 border-b border-[var(--border)] bg-slate-50/70 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        <ClipboardCheck className="h-4 w-4 text-[var(--teal)]" />
                        Triggered CPT / ICD-10 Pathways ({selected.triggered_pathways.length})
                      </span>
                    </div>

                    <div className="divide-y divide-slate-200">
                      {selected.triggered_pathways.map((p) => (
                        <div key={p.id} className="p-4 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-slate-900">
                                  {p.rule_code}
                                </span>
                                <span
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                    p.acuity_level === "ACUTE_RED_FLAG"
                                      ? "bg-rose-100 text-rose-800"
                                      : p.acuity_level === "HIGH_RISK"
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-sky-100 text-sky-800"
                                  }`}
                                >
                                  {p.acuity_level}
                                </span>
                                {p.calculated_score !== null && (
                                  <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                                    Score: {p.calculated_score}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-medium text-slate-900 mt-1">
                                {p.display_name}
                              </p>
                            </div>

                            <span
                              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded shrink-0 ${
                                p.clinician_disposition === "ORDERED"
                                  ? "bg-teal-100 text-teal-900"
                                  : p.clinician_disposition === "DECLINED"
                                    ? "bg-slate-200 text-slate-700"
                                    : "bg-amber-50 text-amber-900 border border-amber-200"
                              }`}
                            >
                              {p.clinician_disposition}
                            </span>
                          </div>

                          <p className="text-xs text-slate-700">{p.recommended_intervention}</p>

                          <div className="flex flex-wrap gap-1.5">
                            {p.cpt_codes.map((cpt) => (
                              <span
                                key={cpt}
                                className="font-mono text-[11px] bg-teal-50 text-teal-900 border border-teal-200 px-2 py-0.5 rounded"
                              >
                                CPT {cpt}
                              </span>
                            ))}
                            {p.icd10_codes.map((icd) => (
                              <span
                                key={icd}
                                className="font-mono text-[11px] bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded"
                              >
                                ICD-10 {icd}
                              </span>
                            ))}
                          </div>

                          {p.prior_auth_rationale_template && (
                            <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 border border-slate-200/70 rounded p-2">
                              {p.prior_auth_rationale_template}
                            </p>
                          )}

                          {p.clinician_disposition === "PENDING" && (
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                disabled={busyOrder}
                                onClick={() => void submitOrderAction(selected.id, "ORDERED", [p.id])}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[var(--teal)] text-white text-xs font-medium hover:bg-teal-800 cursor-pointer"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                One-Click Approve Order
                              </button>
                              <button
                                type="button"
                                disabled={busyOrder}
                                onClick={() => void submitOrderAction(selected.id, "DECLINED", [p.id])}
                                className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 cursor-pointer"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Decline
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Split Pane 2: Underlying Parsed Clinical Document Excerpts & Source Text */}
                  <div className="rounded-lg border border-[var(--border)] bg-white shadow-xs overflow-hidden">
                    <div className="px-4 py-3 border-b border-[var(--border)] bg-slate-50/70">
                      <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        <FileSearch className="h-4 w-4 text-[var(--teal)]" />
                        Parsed Clinical Evidence &amp; Source Documents
                      </span>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Verified Provenance Excerpts */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Extracted &amp; Confirmed Clinical Facts ({selected.responses.length})
                        </p>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {selected.responses.map((r) => (
                            <div
                              key={r.id}
                              onClick={() =>
                                setHighlightedDocId(r.source_document_id ?? null)
                              }
                              className="rounded-md border border-slate-200 p-2.5 text-xs space-y-1 hover:border-teal-300 cursor-pointer"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-semibold text-slate-900">
                                  {r.question_key}: {JSON.stringify(r.answer_value)}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                  {r.provenance === "AI_PARSED" && (
                                    <Sparkles className="h-2.5 w-2.5 text-teal-700" />
                                  )}
                                  {r.provenance}
                                  {r.confidence_score !== null &&
                                    ` · ${Math.round(r.confidence_score * 100)}%`}
                                </span>
                              </div>
                              {r.source_excerpt && (
                                <p className="text-[11px] text-teal-950 bg-teal-50/70 border-l-2 border-l-teal-600 pl-2 py-1">
                                  &ldquo;{r.source_excerpt}&rdquo;
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Underlying Clinical Documents */}
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Source Clinical Documents ({selected.documents.length})
                        </p>
                        {selected.documents.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            No external EHR documents attached (patient-reported session).
                          </p>
                        ) : (
                          selected.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className={`rounded-md border p-3 text-xs space-y-1.5 ${
                                highlightedDocId === doc.id
                                  ? "border-teal-500 bg-teal-50/30"
                                  : "border-slate-200 bg-slate-50/50"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-semibold text-slate-800">
                                  {doc.source_type} &middot; {doc.document_category}
                                </span>
                                <span className="text-[10px] font-mono text-teal-800">
                                  {doc.parsed_status}
                                </span>
                              </div>
                              <p className="text-[10px] font-mono text-slate-500 truncate">
                                {doc.gcs_uri}
                              </p>
                              {doc.extracted_text && (
                                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800 bg-white border border-slate-200 rounded p-2.5 max-h-48 overflow-y-auto">
                                  {doc.extracted_text}
                                </pre>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
