"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  HeartPulse,
  HelpCircle,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { QuestionDto, SexAtBirth } from "@healthcare/shared-contracts";
import { computeAgeFromDob, getVisibleQuestions } from "@/lib/branching";

const MODULE_OPTIONS = [
  { id: "all", label: "Comprehensive Preventive Screen (All Pathways)" },
  { id: "oncology", label: "Oncology & Hereditary Genetics" },
  { id: "pulmonology", label: "Lung & Pulmonary Health" },
  { id: "cardio", label: "Cardiovascular Risk" },
  { id: "urology", label: "Urology & Men's Health" },
  { id: "obgyn", label: "OBGYN & Women's Health" },
  { id: "neurology", label: "Neurology & Headache" },
  { id: "sleep", label: "Sleep & Bone Health" },
];

const PAYER_OPTIONS = [
  { id: "60054", name: "Aetna Commercial" },
  { id: "87726", name: "UnitedHealthcare" },
  { id: "00060", name: "Blue Cross Blue Shield" },
  { id: "CMS", name: "Medicare Part B" },
];

interface PedigreeRow {
  relation: string;
  degree: number;
  cancer_type: string;
  age_at_diagnosis: number;
}

interface InsuranceSummary {
  provider: string;
  eligible: boolean;
  coverage_status: string;
  payer_name: string;
  plan_name: string;
  preventive_screening_copay_usd: number;
  deductible_remaining_usd: number;
  x12_transaction_id: string;
}

interface ConsultSlot {
  slot_id: string;
  scheduled_start: string;
  scheduled_end: string;
  provider_display: string;
  modality: string;
}

interface EvaluationResult {
  session_id: string;
  triggered_count: number;
  highest_acuity: string | null;
  workqueue_priority: string | null;
  workqueue_item_id: string | null;
  triggered_pathways: Array<{
    rule_code: string;
    display_name?: string;
    acuity_level: string;
    recommended_intervention: string;
  }>;
}

export function PatientIntakeFlow() {
  // All transient state stays strictly in React memory (zero persistent browser storage)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1: Patient Profile & Modules
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("1960-05-14");
  const [sexAtBirth, setSexAtBirth] = useState<SexAtBirth>("Male");
  const [zipCode, setZipCode] = useState("94107");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>(["pulmonology", "cardio"]);

  // Server session IDs
  const [patientId, setPatientId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Step 2: Dynamic Questionnaire
  const [allQuestions, setAllQuestions] = useState<QuestionDto[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [openTooltips, setOpenTooltips] = useState<Record<string, boolean>>({});
  const [pedigreeDraft, setPedigreeDraft] = useState<PedigreeRow>({
    relation: "mother",
    degree: 1,
    cancer_type: "Breast Cancer",
    age_at_diagnosis: 48,
  });

  // Step 3: Stedi Insurance Eligibility
  const [payerId, setPayerId] = useState(PAYER_OPTIONS[0]!.id);
  const [memberId, setMemberId] = useState("SYN-PPO-44219");
  const [insuranceStatus, setInsuranceStatus] = useState<InsuranceSummary | null>(null);

  // Step 4: Evaluation & Visit Scheduling
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [slots, setSlots] = useState<ConsultSlot[]>([]);
  const [bookedSlot, setBookedSlot] = useState<ConsultSlot | null>(null);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  const computedAge = useMemo(() => computeAgeFromDob(dob), [dob]);
  const visibleQuestions = useMemo(
    () => getVisibleQuestions(allQuestions, answers, { sex_at_birth: sexAtBirth, age: computedAge }),
    [allQuestions, answers, sexAtBirth, computedAge],
  );

  function fillSyntheticDemo() {
    setFirstName("Alex");
    setLastName("Synthetic");
    setDob("1960-05-14");
    setSexAtBirth("Male");
    setZipCode("94107");
    setEmail("alex.synthetic@example.test");
    setPhone("555-0192");
    setSelectedModules(["pulmonology", "cardio"]);
  }

  function toggleModule(modId: string) {
    if (modId === "all") {
      setSelectedModules(["all"]);
      return;
    }
    setSelectedModules((prev) => {
      const withoutAll = prev.filter((m) => m !== "all");
      return withoutAll.includes(modId)
        ? withoutAll.filter((m) => m !== modId)
        : [...withoutAll, modId];
    });
  }

  async function handleStartIntake(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const modules = selectedModules.length > 0 ? selectedModules : ["all"];
      const sessRes = await fetch("/api/patient/patients/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          dob,
          sex_at_birth: sexAtBirth,
          zip_code: zipCode.trim(),
          email: email.trim(),
          phone: phone.trim(),
          selected_modules: modules,
        }),
      });
      const sessData = (await sessRes.json()) as {
        patient_id?: string;
        session_id?: string;
        error?: string;
      };
      if (!sessRes.ok || !sessData.patient_id || !sessData.session_id) {
        throw new Error(sessData.error ?? "Unable to initialize intake session");
      }

      const qs = new URLSearchParams({
        modules: modules.join(","),
        sex_at_birth: sexAtBirth,
      });
      if (computedAge !== undefined) qs.set("age", String(computedAge));

      const cfgRes = await fetch(`/api/patient/questionnaire/config?${qs.toString()}`, {
        cache: "no-store",
      });
      const cfgData = (await cfgRes.json()) as { questions?: QuestionDto[]; error?: string };
      if (!cfgRes.ok || !cfgData.questions) {
        throw new Error(cfgData.error ?? "Unable to load dynamic questionnaire");
      }

      setPatientId(sessData.patient_id);
      setSessionId(sessData.session_id);
      setAllQuestions(cfgData.questions);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start intake");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyInsurance() {
    if (!patientId) return;
    setError(null);
    setBusy(true);
    try {
      const payer = PAYER_OPTIONS.find((p) => p.id === payerId);
      const res = await fetch("/api/patient/insurance/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          payer_id: payerId,
          payer_name: payer?.name ?? payerId,
          member_id: memberId.trim(),
        }),
      });
      const data = (await res.json()) as { insurance_status?: InsuranceSummary; error?: string };
      if (!res.ok || !data.insurance_status) {
        throw new Error(data.error ?? "Insurance eligibility check failed");
      }
      setInsuranceStatus(data.insurance_status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Insurance verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleEvaluateAndLoadSlots() {
    if (!sessionId || !patientId) return;
    setError(null);
    setBusy(true);
    try {
      const submittedResponses = Object.entries(answers)
        .filter(([, val]) => val !== undefined && val !== "")
        .map(([question_key, answer_value]) => ({
          question_key,
          answer_value,
          provenance: "PATIENT_ENTERED",
        }));

      const [evalRes, slotsRes] = await Promise.all([
        fetch(`/api/patient/sessions/${sessionId}/evaluate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actor_id: `PATIENT:${patientId}`,
            actor_role: "PATIENT",
            responses: submittedResponses,
          }),
        }),
        fetch("/api/patient/appointments/slots", { cache: "no-store" }),
      ]);

      const evalData = (await evalRes.json()) as EvaluationResult & { error?: string };
      if (!evalRes.ok) throw new Error(evalData.error ?? "Assessment evaluation failed");

      const slotsData = (await slotsRes.json()) as { slots?: ConsultSlot[] };
      setEvaluation(evalData);
      setSlots(slotsData.slots ?? []);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleBookSlot(slot: ConsultSlot) {
    if (!patientId) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/patient/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          workqueue_item_id: evaluation?.workqueue_item_id ?? null,
          scheduled_start: slot.scheduled_start,
          scheduled_end: slot.scheduled_end,
          visit_type: "RISK_REVIEW_CONSULT",
        }),
      });
      const data = (await res.json()) as { appointment?: { id: string }; error?: string };
      if (!res.ok || !data.appointment) throw new Error(data.error ?? "Unable to book slot");
      setBookedSlot(slot);
      setAppointmentId(data.appointment.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  const stepsMeta = [
    { num: 1, title: "Your Profile" },
    { num: 2, title: "Health Questions" },
    { num: 3, title: "Insurance Check" },
    { num: 4, title: "Results & Visit" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border)] bg-white/95 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto max-w-4xl px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-[var(--teal)] text-white flex items-center justify-center">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-semibold tracking-tight block leading-none">
                Preventive Risk Assessment
              </span>
              <span className="text-xs text-[var(--muted)]">
                HIPAA-Protected &middot; Zero Browser Storage
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-teal-800 bg-[var(--teal-soft)] px-2.5 py-1 rounded-full">
            <Shield className="h-3.5 w-3.5" />
            <span>Encrypted Session</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8 space-y-6">
        {/* Progress Stepper */}
        <nav aria-label="Intake progress" className="grid grid-cols-4 gap-2">
          {stepsMeta.map((s) => (
            <div
              key={s.num}
              className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                step === s.num
                  ? "border-[var(--teal)] bg-[var(--teal-soft)] text-teal-950 font-semibold"
                  : step > s.num
                    ? "border-teal-200 bg-white text-teal-800"
                    : "border-[var(--border)] bg-white/60 text-[var(--muted)]"
              }`}
            >
              <span className="font-mono mr-1.5">{s.num}.</span>
              {s.title}
            </div>
          ))}
        </nav>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-700" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Profile & Module Selector */}
        {step === 1 && (
          <form
            onSubmit={(e) => void handleStartIntake(e)}
            className="rounded-xl border border-[var(--border)] bg-white p-6 shadow-xs space-y-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Start Your Preventive Health Assessment
                </h1>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Answer plain-English questions tailored to your age, sex, and chosen clinical
                  focus areas.
                </p>
              </div>
              <button
                id="fill-synthetic-profile-btn"
                type="button"
                onClick={fillSyntheticDemo}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-slate-50 cursor-pointer"
              >
                Fill Synthetic Test Profile
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1 text-xs font-medium">
                <span>First Name *</span>
                <input
                  id="intake-first-name"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                <span>Last Name *</span>
                <input
                  id="intake-last-name"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                <span>Date of Birth *</span>
                <input
                  id="intake-dob"
                  type="date"
                  required
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                <span>Sex Assigned at Birth *</span>
                <select
                  id="intake-sex"
                  value={sexAtBirth}
                  onChange={(e) => setSexAtBirth(e.target.value as SexAtBirth)}
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Intersex">Intersex</option>
                  <option value="Unknown">Prefer not to say</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium">
                <span>ZIP Code *</span>
                <input
                  id="intake-zip"
                  required
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                <span>Email (Optional)</span>
                <input
                  id="intake-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm"
                />
              </label>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Select Screening Modules
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MODULE_OPTIONS.map((mod) => {
                  const active = selectedModules.includes(mod.id);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggleModule(mod.id)}
                      className={`text-left rounded-lg border px-3.5 py-2.5 text-sm transition-colors cursor-pointer ${
                        active
                          ? "border-[var(--teal)] bg-[var(--teal-soft)] text-teal-950 font-medium"
                          : "border-[var(--border)] hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      {mod.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                id="start-questionnaire-btn"
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--teal)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--teal-dark)] disabled:opacity-50 cursor-pointer"
              >
                {busy ? "Loading Personalized Questions..." : "Continue to Health Questions"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Dynamic Questionnaire Renderer with Knockout Branching & Tooltips */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Personalized Health Questions</h1>
                <p className="text-sm text-[var(--muted)] mt-0.5">
                  Showing {visibleQuestions.length} relevant questions dynamically tailored via
                  knockout branching.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-slate-900 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            </div>

            <div className="space-y-4">
              {visibleQuestions.map((q) => {
                const currentVal = answers[q.question_key];
                const tooltipOpen = Boolean(openTooltips[q.question_key]);
                return (
                  <div
                    key={q.id}
                    className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-teal-800 bg-[var(--teal-soft)] px-2 py-0.5 rounded">
                            {q.domain}
                          </span>
                          {q.is_knockout_gate && (
                            <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              Key Screening Question
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-900 leading-snug">
                          {q.label_plain_english}
                        </p>
                      </div>

                      {q.helper_tooltip && (
                        <button
                          type="button"
                          onClick={() =>
                            setOpenTooltips((prev) => ({
                              ...prev,
                              [q.question_key]: !prev[q.question_key],
                            }))
                          }
                          className="inline-flex items-center gap-1 shrink-0 text-xs text-teal-800 hover:underline cursor-pointer"
                        >
                          <HelpCircle className="h-4 w-4" />
                          <span className="hidden sm:inline">Why we ask</span>
                        </button>
                      )}
                    </div>

                    {tooltipOpen && q.helper_tooltip && (
                      <div className="rounded-lg bg-teal-50/70 border border-teal-200/70 px-3.5 py-2.5 text-xs text-teal-950">
                        {q.helper_tooltip}
                      </div>
                    )}

                    {/* Dynamic Input Control by input_type */}
                    {q.input_type === "boolean" && (
                      <div className="flex gap-2.5">
                        {[
                          { label: "Yes", val: true },
                          { label: "No", val: false },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() =>
                              setAnswers((prev) => ({ ...prev, [q.question_key]: opt.val }))
                            }
                            className={`h-10 px-6 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                              currentVal === opt.val
                                ? "border-[var(--teal)] bg-[var(--teal)] text-white"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {(q.input_type === "number" || q.input_type === "lab_numeric") && (
                      <input
                        type="number"
                        step="any"
                        placeholder="Enter number"
                        value={currentVal === undefined ? "" : String(currentVal)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setAnswers((prev) => ({
                            ...prev,
                            [q.question_key]: raw === "" ? undefined : Number(raw),
                          }));
                        }}
                        className="w-full max-w-xs h-10 rounded-lg border border-slate-300 px-3 text-sm"
                      />
                    )}

                    {q.input_type === "select" && (
                      <div className="flex flex-wrap gap-2">
                        {(q.options_json ?? []).map((opt) => (
                          <button
                            key={String(opt.value)}
                            type="button"
                            onClick={() =>
                              setAnswers((prev) => ({ ...prev, [q.question_key]: opt.value }))
                            }
                            className={`px-4 py-2 rounded-lg border text-sm transition-colors cursor-pointer ${
                              currentVal === opt.value
                                ? "border-[var(--teal)] bg-[var(--teal)] text-white font-medium"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {q.input_type === "date" && (
                      <input
                        type="date"
                        value={typeof currentVal === "string" ? currentVal : ""}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [q.question_key]: e.target.value }))
                        }
                        className="w-full max-w-xs h-10 rounded-lg border border-slate-300 px-3 text-sm"
                      />
                    )}

                    {q.input_type === "pedigree_array" && (
                      <div className="space-y-3 rounded-lg bg-slate-50 border border-slate-200 p-3.5">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <select
                            aria-label="Relative relationship"
                            value={pedigreeDraft.relation}
                            onChange={(e) =>
                              setPedigreeDraft({ ...pedigreeDraft, relation: e.target.value })
                            }
                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs"
                          >
                            <option value="mother">Mother (1st deg)</option>
                            <option value="father">Father (1st deg)</option>
                            <option value="sister">Sister (1st deg)</option>
                            <option value="brother">Brother (1st deg)</option>
                          </select>
                          <input
                            aria-label="Cancer type"
                            placeholder="Cancer type"
                            value={pedigreeDraft.cancer_type}
                            onChange={(e) =>
                              setPedigreeDraft({ ...pedigreeDraft, cancer_type: e.target.value })
                            }
                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs"
                          />
                          <input
                            aria-label="Age at diagnosis"
                            type="number"
                            placeholder="Age at dx"
                            value={pedigreeDraft.age_at_diagnosis}
                            onChange={(e) =>
                              setPedigreeDraft({
                                ...pedigreeDraft,
                                age_at_diagnosis: Number(e.target.value),
                              })
                            }
                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const list = Array.isArray(currentVal)
                                ? (currentVal as PedigreeRow[])
                                : [];
                              setAnswers((prev) => ({
                                ...prev,
                                [q.question_key]: [...list, { ...pedigreeDraft }],
                              }));
                            }}
                            className="inline-flex items-center justify-center gap-1 h-9 rounded-md bg-[var(--teal)] text-white text-xs font-medium cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Relative
                          </button>
                        </div>

                        {Array.isArray(currentVal) && currentVal.length > 0 && (
                          <ul className="space-y-1.5">
                            {(currentVal as PedigreeRow[]).map((rel, idx) => (
                              <li
                                key={idx}
                                className="flex items-center justify-between bg-white border border-slate-200 rounded-md px-3 py-1.5 text-xs"
                              >
                                <span>
                                  <strong className="capitalize">{rel.relation}</strong> &mdash;{" "}
                                  {rel.cancer_type} (diagnosed age {rel.age_at_diagnosis})
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAnswers((prev) => ({
                                      ...prev,
                                      [q.question_key]: (currentVal as PedigreeRow[]).filter(
                                        (_, i) => i !== idx,
                                      ),
                                    }))
                                  }
                                  className="text-slate-400 hover:text-rose-700 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                id="continue-insurance-btn"
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--teal)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--teal-dark)] cursor-pointer"
              >
                Continue to Insurance Verification
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Real-Time Stedi X12 270/271 Insurance Eligibility */}
        {step === 3 && (
          <div className="rounded-xl border border-[var(--border)] bg-white p-6 shadow-xs space-y-5">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Real-Time Insurance Eligibility (Stedi X12 270/271)
              </h1>
              <p className="text-sm text-[var(--muted)] mt-1">
                Verify preventive screening coverage and benefits before scheduling your clinician
                risk review.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1 text-xs font-medium">
                <span>Insurance Payer</span>
                <select
                  id="insurance-payer-select"
                  value={payerId}
                  onChange={(e) => setPayerId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white"
                >
                  {PAYER_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-medium">
                <span>Member ID</span>
                <input
                  id="insurance-member-id"
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm font-mono"
                />
              </label>
            </div>

            <button
              id="verify-stedi-btn"
              type="button"
              disabled={busy || !memberId.trim()}
              onClick={() => void handleVerifyInsurance()}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--teal)] text-[var(--teal)] px-4 py-2 text-sm font-medium hover:bg-[var(--teal-soft)] cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              {busy ? "Checking X12 270/271 Eligibility..." : "Verify Coverage with Stedi"}
            </button>

            {insuranceStatus && (
              <div
                className={`rounded-lg border p-4 space-y-1.5 text-sm ${
                  insuranceStatus.eligible
                    ? "border-teal-200 bg-teal-50/70 text-teal-950"
                    : "border-rose-200 bg-rose-50 text-rose-950"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Coverage {insuranceStatus.coverage_status}: {insuranceStatus.plan_name}
                  </span>
                  <span className="font-mono text-xs">{insuranceStatus.x12_transaction_id}</span>
                </div>
                <p className="text-xs">
                  Preventive Screening Copay:{" "}
                  <strong>${insuranceStatus.preventive_screening_copay_usd}</strong> &middot;
                  Remaining Deductible:{" "}
                  <strong>${insuranceStatus.deductible_remaining_usd}</strong>
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-slate-900 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Questions
              </button>
              <button
                id="submit-evaluate-btn"
                type="button"
                disabled={busy}
                onClick={() => void handleEvaluateAndLoadSlots()}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--teal)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--teal-dark)] disabled:opacity-50 cursor-pointer"
              >
                {busy ? "Evaluating 54 Clinical Pathways..." : "Submit & View Next Steps"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Results Summary & Visit Scheduling */}
        {step === 4 && evaluation && (
          <div className="space-y-5">
            {evaluation.highest_acuity === "ACUTE_RED_FLAG" && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-5 text-rose-950 space-y-1">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-700" />
                  Urgent Clinical Symptoms Detected (STAT Triage)
                </p>
                <p className="text-xs leading-relaxed">
                  Your answers flagged an acute symptom that requires prompt medical attention. If
                  you are experiencing severe symptoms right now, call 911 or go to the nearest
                  emergency department. Our care team has prioritized your record as STAT.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-[var(--border)] bg-white p-6 shadow-xs space-y-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Your Preventive Screening Summary
                </h1>
                <p className="text-sm text-[var(--muted)] mt-1">
                  {evaluation.triggered_count === 0
                    ? "No elevated preventive risk pathways were triggered today. Continue routine annual wellness visits."
                    : `${evaluation.triggered_count} personalized preventive pathway${
                        evaluation.triggered_count === 1 ? "" : "s"
                      } identified for clinician review.`}
                </p>
              </div>

              {evaluation.triggered_pathways.length > 0 && (
                <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {evaluation.triggered_pathways.map((p) => (
                    <li key={p.rule_code} className="p-3.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {p.display_name ?? p.rule_code}
                        </span>
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                            p.acuity_level === "ACUTE_RED_FLAG"
                              ? "bg-rose-100 text-rose-800"
                              : p.acuity_level === "HIGH_RISK"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-sky-100 text-sky-800"
                          }`}
                        >
                          {p.acuity_level.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{p.recommended_intervention}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Visit Scheduling */}
            <div className="rounded-xl border border-[var(--border)] bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-[var(--teal)]" />
                <h2 className="text-base font-semibold">Schedule Your Risk Review Consultation</h2>
              </div>

              {bookedSlot && appointmentId ? (
                <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-teal-700" />
                    Appointment Confirmed
                  </p>
                  <p className="text-xs">
                    {new Date(bookedSlot.scheduled_start).toLocaleString()} &middot;{" "}
                    {bookedSlot.provider_display} ({bookedSlot.modality})
                  </p>
                  <p className="text-[11px] font-mono text-teal-800">Ref: {appointmentId}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {slots.map((slot) => (
                    <button
                      key={slot.slot_id}
                      type="button"
                      disabled={busy}
                      onClick={() => void handleBookSlot(slot)}
                      className="text-left rounded-lg border border-[var(--border)] p-3.5 hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]/50 transition-colors cursor-pointer space-y-1"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {new Date(slot.scheduled_start).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-xs text-slate-600">{slot.provider_display}</p>
                      <p className="text-[11px] text-teal-800 font-medium">{slot.modality}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
