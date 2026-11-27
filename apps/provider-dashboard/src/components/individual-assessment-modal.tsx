"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Play,
  Save,
  Search,
  Sparkles,
  X,
} from "lucide-react";

interface AssessmentInputItem {
  question_key: string;
  label: string;
  input_type: string;
  options_json: Array<{ value: string | number | boolean; label: string }>;
  data_source: string;
  current_value: unknown;
  original_value: unknown;
  provenance: string;
  source_excerpt: string | null;
}

interface AssessmentModelItem {
  rule_code: string;
  display_name: string;
  specialty: string;
  rule_type: string;
  acuity_level: string;
  recommended_intervention: string;
  cpt_codes: string[];
  icd10_codes: string[];
  currently_triggered: boolean;
  current_score: number | null;
  current_disposition: string | null;
  populated_count: number;
  total_inputs: number;
  inputs: AssessmentInputItem[];
}

interface RunResult {
  rule_code: string;
  display_name: string;
  specialty: string;
  triggered: boolean;
  committed: boolean;
  calculated_score: number | null;
  acuity_level: string;
  recommended_intervention: string;
  cpt_codes: string[];
  icd10_codes: string[];
  rationale: string;
}

function formatInputValue(questionKey: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "Not provided";
  if (questionKey === "height_cm" && typeof val === "number" && val > 0) {
    const totalIn = Math.round(val / 2.54);
    return `${Math.floor(totalIn / 12)}' ${totalIn % 12}"`;
  }
  if (questionKey === "weight_kg" && typeof val === "number" && val > 0) {
    return `${Math.round(val / 0.45359237)} lbs`;
  }
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

export function IndividualAssessmentModal({
  workqueueId,
  patientName,
  onClose,
  onCommitted,
}: {
  workqueueId: string;
  patientName: string;
  onClose: () => void;
  onCommitted: () => Promise<void>;
}) {
  const [models, setModels] = useState<AssessmentModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState<string>("");
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  const [reason, setReason] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/provider/${workqueueId}/assessments`, { cache: "no-store" });
        const data = (await res.json()) as { assessments?: AssessmentModelItem[]; error?: string };
        if (!res.ok || !data.assessments) {
          throw new Error(data.error ?? "Failed to load clinical assessment models");
        }
        if (active) {
          setModels(data.assessments);
          if (data.assessments.length > 0) {
            setSelectedCode(data.assessments[0]!.rule_code);
          }
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load models");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [workqueueId]);

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.display_name.toLowerCase().includes(q) ||
        m.rule_code.toLowerCase().includes(q) ||
        m.specialty.toLowerCase().includes(q),
    );
  }, [models, search]);

  const activeModel = useMemo(
    () => models.find((m) => m.rule_code === selectedCode) ?? filteredModels[0] ?? null,
    [models, filteredModels, selectedCode],
  );

  function selectModel(code: string) {
    setSelectedCode(code);
    setOverrides({});
    setResult(null);
    setError(null);
  }

  async function runModel(commit: boolean) {
    if (!activeModel) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/provider/${workqueueId}/assessments/${activeModel.rule_code}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          overrides,
          commit,
          correction_reason: reason.trim() || undefined,
        }),
      });
      const data = (await res.json()) as RunResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Assessment evaluation failed");
      setResult(data);
      if (commit) {
        await onCommitted();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to evaluate assessment");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assessment-runner-title"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
    >
      <div className="w-full max-w-5xl max-h-[90vh] rounded-2xl border border-[var(--border)] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3 bg-[var(--navy)] text-white">
          <div className="flex items-center gap-2.5">
            <Activity className="h-5 w-5 text-[#64d8ea]" />
            <div>
              <h2 id="assessment-runner-title" className="text-base font-bold leading-tight">
                Run Individual Clinical Assessment — {patientName}
              </h2>
              <p className="text-xs text-slate-300">
                Inspect auto-populated patient/AI/EHR inputs for any model, add missing values, and
                preview or commit findings.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close assessment runner"
            onClick={onClose}
            className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Left: Model Picker */}
          <aside className="md:col-span-4 border-b md:border-b-0 md:border-r border-[var(--border)] flex flex-col overflow-hidden bg-slate-50/70">
            <div className="p-3 border-b border-[var(--border)]">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search 54 clinical models..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)] max-h-48 md:max-h-none">
              {loading ? (
                <p className="p-4 text-xs text-slate-500">Loading clinical models...</p>
              ) : (
                filteredModels.map((m) => (
                  <button
                    key={m.rule_code}
                    type="button"
                    onClick={() => selectModel(m.rule_code)}
                    className={`w-full text-left px-3.5 py-2.5 text-xs transition-colors cursor-pointer space-y-1 ${
                      activeModel?.rule_code === m.rule_code
                        ? "bg-[var(--teal-soft)] border-l-3 border-l-[var(--teal)]"
                        : "hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--navy)] leading-snug">
                        {m.display_name}
                      </span>
                      {m.currently_triggered && (
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                          Triggered
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{m.specialty}</span>
                      <span className="font-mono">
                        {m.populated_count}/{m.total_inputs} populated
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* Right: Populated Inputs & Evaluation Runner */}
          <div className="md:col-span-8 p-5 overflow-y-auto space-y-4">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-700" />
                <span>{error}</span>
              </div>
            )}

            {activeModel && (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-[var(--border)]">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[var(--navy)]">
                        {activeModel.display_name}
                      </h3>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {activeModel.rule_code}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {activeModel.specialty} &middot; {activeModel.recommended_intervention}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {activeModel.cpt_codes.map((c) => (
                      <span
                        key={c}
                        className="font-mono text-[10px] px-2 py-0.5 rounded bg-[var(--teal-soft)] text-[var(--navy)] font-semibold"
                      >
                        CPT {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Populated & Editable Inputs Table */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--navy)]">
                      Populated Patient &amp; EHR Inputs ({activeModel.inputs.length})
                    </h4>
                    <span className="text-[11px] text-[var(--muted)]">
                      Edit or fill missing values below to re-calculate
                    </span>
                  </div>

                  {activeModel.inputs.length === 0 ? (
                    <p className="text-xs text-slate-500 rounded-xl border border-[var(--border)] p-4">
                      This rule evaluates patient age and sex demographics directly.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeModel.inputs.map((inp) => {
                        const effectiveVal =
                          overrides[inp.question_key] !== undefined
                            ? overrides[inp.question_key]
                            : inp.current_value;

                        return (
                          <div
                            key={inp.question_key}
                            className="rounded-xl border border-[var(--border)] p-3 text-xs space-y-2 bg-slate-50/50"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-[var(--navy)]">{inp.label}</span>
                              <span
                                className={`font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                  inp.provenance === "MISSING"
                                    ? "bg-amber-100 text-amber-900"
                                    : inp.provenance === "CLINICIAN_CORRECTED"
                                      ? "bg-sky-100 text-sky-900"
                                      : "bg-teal-100 text-teal-900"
                                }`}
                              >
                                {inp.provenance === "MISSING" ? "MISSING INPUT" : inp.provenance}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <span className="text-[11px] text-slate-600">
                                Current:{" "}
                                <strong className="text-[var(--navy)]">
                                  {formatInputValue(inp.question_key, effectiveVal)}
                                </strong>
                              </span>

                              {/* Inline Override Controls */}
                              {inp.input_type === "boolean" ? (
                                <div className="flex items-center gap-1.5">
                                  {[true, false].map((b) => (
                                    <button
                                      key={String(b)}
                                      type="button"
                                      onClick={() =>
                                        setOverrides((prev) => ({ ...prev, [inp.question_key]: b }))
                                      }
                                      className={`h-8 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                                        effectiveVal === b
                                          ? "bg-[var(--navy)] text-white border-[var(--navy)]"
                                          : "bg-white text-slate-700 border-slate-300"
                                      }`}
                                    >
                                      {b ? "Yes" : "No"}
                                    </button>
                                  ))}
                                </div>
                              ) : inp.input_type === "select" && inp.options_json.length > 0 ? (
                                <select
                                  value={effectiveVal === null || effectiveVal === undefined ? "" : String(effectiveVal)}
                                  onChange={(e) =>
                                    setOverrides((prev) => ({
                                      ...prev,
                                      [inp.question_key]: e.target.value,
                                    }))
                                  }
                                  className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                                >
                                  <option value="">Select...</option>
                                  {inp.options_json.map((o) => (
                                    <option key={String(o.value)} value={String(o.value)}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              ) : inp.question_key === "weight_kg" ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    placeholder="Weight (lbs)"
                                    defaultValue={
                                      typeof effectiveVal === "number" && effectiveVal > 0
                                        ? Math.round(effectiveVal / 0.45359237)
                                        : ""
                                    }
                                    onChange={(e) => {
                                      const lbs = Number(e.target.value);
                                      if (!Number.isNaN(lbs) && lbs > 0) {
                                        setOverrides((prev) => ({
                                          ...prev,
                                          weight_kg: Math.round(lbs * 0.45359237 * 10) / 10,
                                        }));
                                      }
                                    }}
                                    className="w-28 h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                                  />
                                  <span className="text-[11px] text-slate-500">lbs</span>
                                </div>
                              ) : (
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="Enter value"
                                  value={
                                    effectiveVal === null || effectiveVal === undefined
                                      ? ""
                                      : String(effectiveVal)
                                  }
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setOverrides((prev) => ({
                                      ...prev,
                                      [inp.question_key]: raw === "" ? undefined : Number(raw),
                                    }));
                                  }}
                                  className="w-32 h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                                />
                              )}
                            </div>

                            {inp.source_excerpt && (
                              <p className="text-[11px] italic text-amber-900 bg-amber-50 border-l-2 border-amber-400 px-2 py-1 rounded">
                                &ldquo;{inp.source_excerpt}&rdquo;
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Clinical Note + Action Bar */}
                <div className="pt-2 space-y-3 border-t border-[var(--border)]">
                  <input
                    type="text"
                    placeholder="Optional clinical note / reason for any overridden values..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs"
                  />
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => void runModel(false)}
                      className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-[var(--teal)] text-[var(--teal-dark)] bg-white hover:bg-[var(--teal-soft)] text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {running ? "Evaluating..." : "Preview Score (Dry-Run)"}
                    </button>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => void runModel(true)}
                      className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-[var(--navy)] text-white hover:bg-[var(--navy-dark)] text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save Answers &amp; Commit to Care Plan
                    </button>
                  </div>
                </div>

                {/* Live Evaluation Result Card */}
                {result && (
                  <div
                    className={`rounded-xl border p-4 space-y-2 text-xs ${
                      result.triggered
                        ? "border-amber-300 bg-amber-50 text-amber-950"
                        : "border-teal-200 bg-teal-50/70 text-teal-950"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold flex items-center gap-1.5 text-sm">
                        {result.triggered ? (
                          <Sparkles className="h-4 w-4 text-amber-700" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-teal-700" />
                        )}
                        {result.triggered
                          ? `THRESHOLD MET — Recommended Pathway Triggered`
                          : `Below Screening Threshold (Not Triggered)`}
                      </span>
                      {result.calculated_score !== null && (
                        <span className="font-mono font-bold px-2.5 py-0.5 rounded bg-white border border-black/10">
                          Calculated Score: {result.calculated_score}
                        </span>
                      )}
                    </div>
                    <p className="leading-relaxed">
                      <strong>Intervention:</strong> {result.recommended_intervention}
                    </p>
                    <p className="text-[11px] opacity-85">{result.rationale}</p>
                    {result.committed && (
                      <p className="font-semibold text-teal-900 pt-1">
                        ✓ Saved to patient chart &amp; recorded in HIPAA audit log.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
