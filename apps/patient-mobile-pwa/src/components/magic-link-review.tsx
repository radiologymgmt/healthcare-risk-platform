"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Edit3,
  FileText,
  HelpCircle,
  Lock,
  Sparkles,
} from "lucide-react";

interface PrepopulatedItem {
  question_key: string;
  answer_value: unknown;
  provenance: string;
  confidence_score: number | null;
  source_excerpt: string | null;
  domain: string;
  label_plain_english: string;
  helper_tooltip: string | null;
  input_type: string;
  options_json: Array<{ value: string | number | boolean; label: string }>;
}

interface CardDecision {
  value: unknown;
  status: "PENDING" | "CONFIRMED" | "EDITED";
}

interface CompletionSummary {
  triggered_count: number;
  highest_acuity: string | null;
  triggered_pathways: Array<{
    rule_code: string;
    display_name?: string;
    acuity_level: string;
    recommended_intervention: string;
  }>;
}

export function MagicLinkReview({ token }: { token: string }) {
  // All transient state lives strictly in React memory; auth token lives in HttpOnly cookie only
  const [stage, setStage] = useState<"VERIFY" | "REVIEW" | "DONE">("VERIFY");
  const [dob, setDob] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<PrepopulatedItem[]>([]);
  const [decisions, setDecisions] = useState<Record<string, CardDecision>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [completion, setCompletion] = useState<CompletionSummary | null>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const verifyRes = await fetch("/api/magic-link/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, dob, zip_code: zipCode.trim() }),
      });
      const verifyData = (await verifyRes.json()) as { verified?: boolean; error?: string };
      if (!verifyRes.ok || !verifyData.verified) {
        throw new Error(verifyData.error ?? "Identity verification failed");
      }

      const sessRes = await fetch("/api/magic-link/session", { cache: "no-store" });
      const sessData = (await sessRes.json()) as { items?: PrepopulatedItem[]; error?: string };
      if (!sessRes.ok || !sessData.items) {
        throw new Error(sessData.error ?? "Unable to load pre-populated health record items");
      }

      const initDecisions: Record<string, CardDecision> = {};
      for (const item of sessData.items) {
        initDecisions[item.question_key] = { value: item.answer_value, status: "PENDING" };
      }
      setItems(sessData.items);
      setDecisions(initDecisions);
      setStage("REVIEW");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  function formatDisplayValue(item: PrepopulatedItem, value: unknown): string {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (item.input_type === "select" && Array.isArray(item.options_json)) {
      const match = item.options_json.find((o) => o.value === value);
      if (match) return match.label;
    }
    return String(value ?? "");
  }

  const reviewedCount = items.filter((i) => decisions[i.question_key]?.status !== "PENDING").length;
  const allReviewed = items.length > 0 && reviewedCount === items.length;

  async function handleSubmitConfirmations() {
    setError(null);
    setBusy(true);
    try {
      const confirmations = items.map((item) => {
        const d = decisions[item.question_key];
        return {
          question_key: item.question_key,
          answer_value: d ? d.value : item.answer_value,
          confirmed_as_parsed: d?.status !== "EDITED",
        };
      });

      const res = await fetch("/api/magic-link/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmations }),
      });
      const data = (await res.json()) as CompletionSummary & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setCompletion(data);
      setItems([]); // Immediately wipe transient PHI from React memory
      setDecisions({});
      setStage("DONE");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen mx-auto max-w-md px-4 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-[var(--teal)] text-white flex items-center justify-center">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Clinical Risk Review</p>
            <p className="text-[11px] text-[var(--muted)] mt-0.5">
              Single-Use Protected Link
            </p>
          </div>
        </div>
        {stage === "REVIEW" && (
          <span className="text-xs font-mono font-medium bg-[var(--teal-soft)] text-teal-900 px-2.5 py-1 rounded-full">
            {reviewedCount}/{items.length} reviewed
          </span>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900 flex items-start gap-2"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-700" />
          <span>{error}</span>
        </div>
      )}

      {/* STAGE 1: DOB + ZIP Verification Gate */}
      {stage === "VERIFY" && (
        <form
          onSubmit={(e) => void handleVerify(e)}
          className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-xs space-y-4"
        >
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">Verify Your Identity</h1>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              We pre-filled parts of your health risk assessment from your clinical notes to save
              you time. Enter your date of birth and ZIP code to unlock your review cards.
            </p>
          </div>

          <label className="block space-y-1 text-xs font-medium">
            <span>Date of Birth</span>
            <input
              id="magic-dob-input"
              type="date"
              required
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full h-12 rounded-xl border border-slate-300 px-3.5 text-base"
            />
          </label>

          <label className="block space-y-1 text-xs font-medium">
            <span>5-Digit ZIP Code</span>
            <input
              id="magic-zip-input"
              type="text"
              inputMode="numeric"
              required
              maxLength={10}
              placeholder="e.g., 94107"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              className="w-full h-12 rounded-xl border border-slate-300 px-3.5 text-base font-mono"
            />
          </label>

          <button
            id="verify-magic-link-btn"
            type="submit"
            disabled={busy}
            className="w-full h-12 rounded-xl bg-[var(--teal)] text-white text-sm font-semibold hover:bg-[var(--teal-dark)] disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Verifying..." : "Unlock My Health Review"}
          </button>

          <p className="text-[11px] text-center text-[var(--muted)]">
            Protected by HIPAA-compliant short-lived HttpOnly session &middot; Nothing is stored on
            your device.
          </p>
        </form>
      )}

      {/* STAGE 2: AI Pre-Populated Review & Confirm Card Flow */}
      {stage === "REVIEW" && (
        <div className="space-y-4 pb-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Review &amp; Confirm</h1>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Tap <strong>Confirm</strong> if the information from your medical record is accurate,
              or <strong>Edit</strong> to update it.
            </p>
          </div>

          <div className="space-y-3.5">
            {items.map((item) => {
              const decision = decisions[item.question_key] ?? {
                value: item.answer_value,
                status: "PENDING",
              };
              const isEditing = editingKey === item.question_key;
              const confPct =
                item.confidence_score !== null ? Math.round(item.confidence_score * 100) : null;

              return (
                <div
                  key={item.question_key}
                  className={`rounded-2xl border bg-white p-4 shadow-xs space-y-3 transition-colors ${
                    decision.status === "CONFIRMED"
                      ? "border-teal-300 bg-teal-50/20"
                      : decision.status === "EDITED"
                        ? "border-sky-300 bg-sky-50/20"
                        : "border-[var(--border)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-800 bg-[var(--teal-soft)] px-2 py-0.5 rounded">
                      {item.domain}
                    </span>
                    {confPct !== null && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-mono">
                        <Sparkles className="h-3 w-3 text-teal-700" />
                        {confPct}% AI match
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-medium text-slate-900 leading-snug">
                    {item.label_plain_english}
                  </p>

                  {item.helper_tooltip && (
                    <p className="text-xs text-[var(--muted)] flex items-start gap-1.5">
                      <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-teal-700" />
                      <span>{item.helper_tooltip}</span>
                    </p>
                  )}

                  {!isEditing ? (
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Pre-filled answer</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {formatDisplayValue(item, decision.value)}
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
                      {item.input_type === "boolean" && (
                        <div className="grid grid-cols-2 gap-2">
                          {[true, false].map((b) => (
                            <button
                              key={String(b)}
                              type="button"
                              onClick={() => {
                                setDecisions((prev) => ({
                                  ...prev,
                                  [item.question_key]: { value: b, status: "EDITED" },
                                }));
                                setEditingKey(null);
                              }}
                              className="h-10 rounded-lg border border-slate-300 bg-white text-sm font-medium cursor-pointer"
                            >
                              {b ? "Yes" : "No"}
                            </button>
                          ))}
                        </div>
                      )}

                      {item.input_type === "select" && (
                        <div className="flex flex-col gap-1.5">
                          {(item.options_json ?? []).map((opt) => (
                            <button
                              key={String(opt.value)}
                              type="button"
                              onClick={() => {
                                setDecisions((prev) => ({
                                  ...prev,
                                  [item.question_key]: { value: opt.value, status: "EDITED" },
                                }));
                                setEditingKey(null);
                              }}
                              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm cursor-pointer"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {item.input_type !== "boolean" && item.input_type !== "select" && (
                        <div className="flex gap-2">
                          <input
                            type={item.input_type === "number" ? "number" : "text"}
                            defaultValue={String(decision.value ?? "")}
                            onBlur={(e) => {
                              const raw = e.target.value;
                              const nextVal =
                                item.input_type === "number" && raw !== "" ? Number(raw) : raw;
                              setDecisions((prev) => ({
                                ...prev,
                                [item.question_key]: { value: nextVal, status: "EDITED" },
                              }));
                            }}
                            className="flex-1 h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setEditingKey(null)}
                            className="px-3 h-10 rounded-lg bg-[var(--teal)] text-white text-xs font-medium cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {item.source_excerpt && (
                    <div className="rounded-lg bg-slate-50/90 border border-slate-200/70 px-3 py-2 text-[11px] text-slate-600 flex items-start gap-1.5">
                      <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                      <span>&ldquo;{item.source_excerpt}&rdquo;</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDecisions((prev) => ({
                          ...prev,
                          [item.question_key]: { value: decision.value, status: "CONFIRMED" },
                        }));
                        setEditingKey(null);
                      }}
                      className={`h-11 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        decision.status === "CONFIRMED"
                          ? "bg-[var(--teal)] text-white"
                          : "border border-[var(--teal)] text-[var(--teal)] bg-white hover:bg-[var(--teal-soft)]"
                      }`}
                    >
                      <Check className="h-4 w-4" />
                      {decision.status === "CONFIRMED" ? "Confirmed" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingKey(isEditing ? null : item.question_key)
                      }
                      className="h-11 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-slate-50 cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      {isEditing ? "Close Edit" : "Edit Answer"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            id="submit-confirmations-btn"
            type="button"
            disabled={busy || !allReviewed}
            onClick={() => void handleSubmitConfirmations()}
            className="w-full h-12 rounded-xl bg-[var(--teal)] text-white text-sm font-semibold hover:bg-[var(--teal-dark)] disabled:opacity-50 cursor-pointer"
          >
            {busy
              ? "Submitting Confirmed Assessment..."
              : allReviewed
                ? "Confirm & Complete Assessment"
                : `Review Remaining ${items.length - reviewedCount} Card(s)`}
          </button>
        </div>
      )}

      {/* STAGE 3: Completion Summary */}
      {stage === "DONE" && completion && (
        <div className="rounded-2xl border border-teal-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 text-teal-800">
            <CheckCircle2 className="h-6 w-6" />
            <h1 className="text-lg font-semibold">Assessment Confirmed</h1>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Thank you. Your confirmed answers have been securely sent to your care team and this
            single-use link has been closed.
          </p>
          {completion.triggered_pathways.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-slate-700">
                Identified Preventive Pathways ({completion.triggered_count}):
              </p>
              <ul className="space-y-2">
                {completion.triggered_pathways.map((p) => (
                  <li
                    key={p.rule_code}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-0.5"
                  >
                    <p className="font-semibold text-slate-900">
                      {p.display_name ?? p.rule_code}
                    </p>
                    <p className="text-slate-600">{p.recommended_intervention}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
