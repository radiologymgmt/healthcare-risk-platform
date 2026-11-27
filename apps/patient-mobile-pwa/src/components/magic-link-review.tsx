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
  const [editDraft, setEditDraft] = useState<string>("");
  const [editFeet, setEditFeet] = useState<string>("5");
  const [editInches, setEditInches] = useState<string>("6");
  const [completion, setCompletion] = useState<CompletionSummary | null>(null);

  function openEditor(item: PrepopulatedItem, currentValue: unknown) {
    if (editingKey === item.question_key) {
      setEditingKey(null);
      return;
    }
    setEditingKey(item.question_key);
    if (item.question_key === "height_cm") {
      const cm = typeof currentValue === "number" && currentValue > 0 ? currentValue : 167.6;
      const totalIn = Math.round(cm / 2.54);
      setEditFeet(String(Math.floor(totalIn / 12)));
      setEditInches(String(totalIn % 12));
    } else if (item.question_key === "weight_kg") {
      const kg = typeof currentValue === "number" && currentValue > 0 ? currentValue : 72.6;
      setEditDraft(String(Math.round(kg / 0.45359237)));
    } else {
      setEditDraft(currentValue === null || currentValue === undefined ? "" : String(currentValue));
    }
  }

  function saveEditor(item: PrepopulatedItem) {
    let nextVal: unknown = editDraft;
    if (item.question_key === "height_cm") {
      const ft = Number(editFeet) || 0;
      const inch = Number(editInches) || 0;
      nextVal = Math.round((ft * 12 + inch) * 2.54 * 10) / 10;
    } else if (item.question_key === "weight_kg") {
      const lbs = Number(editDraft);
      if (Number.isNaN(lbs) || lbs <= 0) return;
      nextVal = Math.round(lbs * 0.45359237 * 10) / 10;
    } else if (item.input_type === "number") {
      if (editDraft.trim() === "") return;
      const num = Number(editDraft);
      if (Number.isNaN(num)) return;
      nextVal = num;
    }

    const sameAsOriginal = JSON.stringify(nextVal) === JSON.stringify(item.answer_value);
    setDecisions((prev) => ({
      ...prev,
      [item.question_key]: {
        value: nextVal,
        status: sameAsOriginal ? "CONFIRMED" : "EDITED",
      },
    }));
    setEditingKey(null);
  }

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
    if (item.question_key === "height_cm" && typeof value === "number" && value > 0) {
      const totalIn = Math.round(value / 2.54);
      return `${Math.floor(totalIn / 12)}' ${totalIn % 12}"`;
    }
    if (item.question_key === "weight_kg" && typeof value === "number" && value > 0) {
      return `${Math.round(value / 0.45359237)} lbs`;
    }
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
        const finalValue = d ? d.value : item.answer_value;
        const matchesOriginalAi = JSON.stringify(finalValue) === JSON.stringify(item.answer_value);
        return {
          question_key: item.question_key,
          answer_value: finalValue,
          confirmed_as_parsed: matchesOriginalAi && d?.status !== "EDITED",
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
      <header className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
        <img
          src="/brand/radmanagement-logo-light.png"
          alt="RadManagement LLC"
          className="h-8 w-auto object-contain"
        />
        {stage === "REVIEW" ? (
          <span className="text-xs font-mono font-semibold bg-[var(--teal-soft)] text-[var(--navy)] px-2.5 py-1 rounded-full shrink-0">
            {reviewedCount}/{items.length} reviewed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--teal-dark)]">
            <Lock className="h-3 w-3" /> Private Link
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
              const isEdited = decision.status === "EDITED";
              const confPct =
                item.confidence_score !== null ? Math.round(item.confidence_score * 100) : null;

              return (
                <div
                  key={item.question_key}
                  className={`rounded-2xl border bg-white p-4 shadow-xs space-y-3 transition-colors ${
                    decision.status === "CONFIRMED"
                      ? "border-teal-300 bg-teal-50/20"
                      : isEdited
                        ? "border-sky-300 bg-sky-50/20"
                        : "border-[var(--border)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-800 bg-[var(--teal-soft)] px-2 py-0.5 rounded">
                      {item.domain}
                    </span>
                    {isEdited ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full">
                        Edited by you
                      </span>
                    ) : confPct !== null ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-mono">
                        <Sparkles className="h-3 w-3 text-teal-700" />
                        {confPct}% AI match
                      </span>
                    ) : null}
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
                    <div
                      className={`rounded-xl border px-3.5 py-2.5 space-y-1 ${
                        isEdited
                          ? "bg-sky-50/70 border-sky-200"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-600">
                          {isEdited
                            ? "Your updated answer"
                            : decision.status === "CONFIRMED"
                              ? "Confirmed from record"
                              : "Pre-filled from record"}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          {formatDisplayValue(item, decision.value)}
                        </span>
                      </div>
                      {isEdited && (
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 pt-0.5 border-t border-sky-200/70">
                          <span>Original AI pre-fill:</span>
                          <span className="line-through">
                            {formatDisplayValue(item, item.answer_value)}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2.5">
                      {item.input_type === "boolean" && (
                        <div className="grid grid-cols-2 gap-2">
                          {[true, false].map((b) => (
                            <button
                              key={String(b)}
                              type="button"
                              onClick={() => {
                                const same = JSON.stringify(b) === JSON.stringify(item.answer_value);
                                setDecisions((prev) => ({
                                  ...prev,
                                  [item.question_key]: {
                                    value: b,
                                    status: same ? "CONFIRMED" : "EDITED",
                                  },
                                }));
                                setEditingKey(null);
                              }}
                              className="h-11 rounded-lg border border-slate-300 bg-white text-sm font-medium cursor-pointer hover:border-[var(--teal)]"
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
                                const same =
                                  JSON.stringify(opt.value) === JSON.stringify(item.answer_value);
                                setDecisions((prev) => ({
                                  ...prev,
                                  [item.question_key]: {
                                    value: opt.value,
                                    status: same ? "CONFIRMED" : "EDITED",
                                  },
                                }));
                                setEditingKey(null);
                              }}
                              className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm cursor-pointer hover:border-[var(--teal)]"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {item.question_key === "height_cm" && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-[11px] font-medium text-slate-600 space-y-1">
                              <span>Feet</span>
                              <select
                                aria-label="Height feet"
                                value={editFeet}
                                onChange={(e) => setEditFeet(e.target.value)}
                                className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3 text-base"
                              >
                                {[3, 4, 5, 6, 7].map((ft) => (
                                  <option key={ft} value={ft}>
                                    {ft} ft
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-[11px] font-medium text-slate-600 space-y-1">
                              <span>Inches</span>
                              <select
                                aria-label="Height inches"
                                value={editInches}
                                onChange={(e) => setEditInches(e.target.value)}
                                className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3 text-base"
                              >
                                {Array.from({ length: 12 }, (_, idx) => (
                                  <option key={idx} value={idx}>
                                    {idx} in
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <button
                            type="button"
                            onClick={() => saveEditor(item)}
                            className="w-full h-11 rounded-lg bg-[var(--navy)] text-white text-xs font-semibold cursor-pointer"
                          >
                            Save Height ({editFeet}&apos; {editInches}&quot;)
                          </button>
                        </div>
                      )}

                      {item.question_key === "weight_kg" && (
                        <div className="flex gap-2 items-end">
                          <label className="flex-1 text-[11px] font-medium text-slate-600 space-y-1">
                            <span>Weight (US pounds, lbs)</span>
                            <div className="relative">
                              <input
                                type="number"
                                inputMode="decimal"
                                min={40}
                                max={800}
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3 pr-10 text-base"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                                lbs
                              </span>
                            </div>
                          </label>
                          <button
                            type="button"
                            onClick={() => saveEditor(item)}
                            className="px-4 h-11 rounded-lg bg-[var(--navy)] text-white text-xs font-semibold cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      )}

                      {item.input_type !== "boolean" &&
                        item.input_type !== "select" &&
                        item.question_key !== "height_cm" &&
                        item.question_key !== "weight_kg" && (
                          <div className="flex gap-2">
                            <input
                              type={item.input_type === "number" ? "number" : "text"}
                              inputMode={item.input_type === "number" ? "decimal" : "text"}
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              className="flex-1 h-11 rounded-lg border border-slate-300 bg-white px-3 text-base"
                            />
                            <button
                              type="button"
                              onClick={() => saveEditor(item)}
                              className="px-4 h-11 rounded-lg bg-[var(--navy)] text-white text-xs font-semibold cursor-pointer"
                            >
                              Save
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
                    {isEdited ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDecisions((prev) => ({
                            ...prev,
                            [item.question_key]: {
                              value: item.answer_value,
                              status: "CONFIRMED",
                            },
                          }));
                          setEditingKey(null);
                        }}
                        className="h-11 rounded-xl border border-sky-300 bg-sky-50 text-sky-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-sky-100 cursor-pointer"
                        title="Restore the original value extracted from your medical record"
                      >
                        <Check className="h-4 w-4" />
                        Use Original AI
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDecisions((prev) => ({
                            ...prev,
                            [item.question_key]: {
                              value: item.answer_value,
                              status: "CONFIRMED",
                            },
                          }));
                          setEditingKey(null);
                        }}
                        className={`h-11 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                          decision.status === "CONFIRMED"
                            ? "bg-[var(--teal)] text-white"
                            : "border border-[var(--teal)] text-[var(--teal-dark)] bg-white hover:bg-[var(--teal-soft)]"
                        }`}
                      >
                        <Check className="h-4 w-4" />
                        {decision.status === "CONFIRMED" ? "Confirmed" : "Confirm"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditor(item, decision.value)}
                      className={`h-11 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                        isEdited
                          ? "border-sky-400 bg-sky-600 text-white hover:bg-sky-700"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      {isEditing ? "Cancel Edit" : isEdited ? "Edited · Change" : "Edit Answer"}
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
