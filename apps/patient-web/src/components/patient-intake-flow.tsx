"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Heart,
  HelpCircle,
  Info,
  Monitor,
  Plus,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import type { QuestionDto, SexAtBirth } from "@healthcare/shared-contracts";
import { computeAgeFromDob, getVisibleQuestions } from "@/lib/branching";

const MODULE_OPTIONS = [
  {
    id: "all",
    label: "Complete Preventive Health Check (Recommended)",
    description:
      "Reviews all major preventive imaging pathways tailored to your age and sex — ideal if you want a full roadmap for your next doctor visit.",
  },
  {
    id: "oncology",
    label: "Cancer & Family Genetics",
    description:
      "Evaluates breast, colon, and inherited risk factors using your family history to identify whether early MRI, mammography, or genetic counseling can help.",
  },
  {
    id: "pulmonology",
    label: "Lung & Breathing Health",
    description:
      "Checks whether a quick, painless Low-Dose CT (LDCT) lung screening is recommended based on your age and past or current smoking history.",
  },
  {
    id: "cardio",
    label: "Heart & Vascular Wellness",
    description:
      "Estimates heart health and checks whether preventive cardiac imaging such as a Coronary Calcium CT scan could uncover silent risk early.",
  },
  {
    id: "obgyn",
    label: "Women's Health & Breast Density",
    description:
      "Focuses on breast density, reproductive history, and women's preventive screenings to guide personalized imaging intervals.",
  },
  {
    id: "urology",
    label: "Men's Preventive Health",
    description:
      "Reviews prostate and urologic risk factors to help you and your physician decide when PSA testing or MRI screening makes sense.",
  },
  {
    id: "neurology",
    label: "Headache & Neurological Safety",
    description:
      "Screens headache and neurological warning signs so our clinical team can prioritize timely evaluation when needed.",
  },
  {
    id: "sleep",
    label: "Sleep Quality & Bone Strength",
    description:
      "Evaluates sleep apnea indicators and bone density (DEXA) fracture risk to protect long-term energy, mobility, and independence.",
  },
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

function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet, inches };
}

function feetInchesToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * 2.54 * 10) / 10;
}

function lbsToKg(lbs: number): number {
  return Math.round(lbs * 0.45359237 * 10) / 10;
}

function kgToLbs(kg: number): number {
  return Math.round(kg / 0.45359237);
}

export function PatientIntakeFlow() {
  // All transient state stays strictly in React memory (zero persistent browser storage)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [viewMode, setViewMode] = useState<"full" | "mobile">("full");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1: Patient Profile & Modules
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("1968-05-14");
  const [sexAtBirth, setSexAtBirth] = useState<SexAtBirth>("Female");
  const [zipCode, setZipCode] = useState("94107");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>(["oncology", "cardio"]);

  // Server session IDs
  const [patientId, setPatientId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Step 2: Dynamic Questionnaire + US Standard Height/Weight Inputs
  const [allQuestions, setAllQuestions] = useState<QuestionDto[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [heightFeet, setHeightFeet] = useState<string>("");
  const [heightInches, setHeightInches] = useState<string>("");
  const [weightLbsInput, setWeightLbsInput] = useState<string>("");
  const [collapsedTips, setCollapsedTips] = useState<Record<string, boolean>>({});
  const [activeDomainFilter, setActiveDomainFilter] = useState<string>("ALL");
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

  const domainsSummary = useMemo(() => {
    const map = new Map<string, { total: number; answered: number }>();
    for (const q of visibleQuestions) {
      const entry = map.get(q.domain) ?? { total: 0, answered: 0 };
      entry.total += 1;
      const v = answers[q.question_key];
      if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
        entry.answered += 1;
      }
      map.set(q.domain, entry);
    }
    return Array.from(map.entries()).map(([domain, stats]) => ({ domain, ...stats }));
  }, [visibleQuestions, answers]);

  const totalAnswered = useMemo(
    () => domainsSummary.reduce((acc, d) => acc + d.answered, 0),
    [domainsSummary],
  );

  const displayedQuestions = useMemo(() => {
    if (activeDomainFilter === "ALL") return visibleQuestions;
    return visibleQuestions.filter((q) => q.domain === activeDomainFilter);
  }, [visibleQuestions, activeDomainFilter]);

  const liveBmi = useMemo(() => {
    const hCm = typeof answers.height_cm === "number" ? answers.height_cm : null;
    const wKg = typeof answers.weight_kg === "number" ? answers.weight_kg : null;
    if (!hCm || !wKg || hCm <= 0 || wKg <= 0) return null;
    return Math.round((wKg / Math.pow(hCm / 100, 2)) * 10) / 10;
  }, [answers.height_cm, answers.weight_kg]);

  const isMobilePreview = viewMode === "mobile";

  function fillSyntheticDemo() {
    setFirstName("Claire");
    setLastName("Bennett");
    setDob("1968-05-14");
    setSexAtBirth("Female");
    setZipCode("94107");
    setEmail("claire.synthetic@example.org");
    setPhone("(555) 201-5519");
    setSelectedModules(["oncology", "pulmonology", "cardio"]);
  }

  function updateHeightUs(nextFeet: string, nextInches: string) {
    setHeightFeet(nextFeet);
    setHeightInches(nextInches);
    const ft = nextFeet === "" ? 0 : Number(nextFeet);
    const inch = nextInches === "" ? 0 : Number(nextInches);
    if (nextFeet === "" && nextInches === "") {
      setAnswers((prev) => ({ ...prev, height_cm: undefined }));
      return;
    }
    const cm = feetInchesToCm(ft, inch);
    setAnswers((prev) => ({ ...prev, height_cm: cm }));
  }

  function updateWeightUs(nextLbs: string) {
    setWeightLbsInput(nextLbs);
    if (nextLbs === "") {
      setAnswers((prev) => ({ ...prev, weight_kg: undefined }));
      return;
    }
    const lbs = Number(nextLbs);
    if (!Number.isNaN(lbs) && lbs > 0) {
      setAnswers((prev) => ({ ...prev, weight_kg: lbsToKg(lbs) }));
    }
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
      setActiveDomainFilter("ALL");
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      window.scrollTo({ top: 0, behavior: "smooth" });
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
    { num: 1, title: "Welcome & Focus Areas" },
    { num: 2, title: "Your Health Story" },
    { num: 3, title: "Coverage Check" },
    { num: 4, title: "Care Plan & Visit" },
  ];

  const activeStepMeta = stepsMeta.find((s) => s.num === step)!;

  return (
    <div
      className={`min-h-screen w-full flex flex-col bg-[var(--bg)] ${
        isMobilePreview ? "items-center bg-slate-200/70 py-0 md:py-6" : ""
      }`}
    >
      {/* Mobile-preview outer frame when user clicks Mobile View toggle on desktop */}
      <div
        className={
          isMobilePreview
            ? "w-full max-w-[430px] min-h-screen md:min-h-[840px] flex flex-col bg-[var(--bg)] md:rounded-[28px] md:shadow-2xl md:border md:border-slate-300 overflow-hidden"
            : "w-full min-h-screen flex flex-col"
        }
      >
        {/* Full-Width Branded RadManagement Header */}
        <header className="w-full border-b border-[var(--border)] bg-white/95 backdrop-blur-sm sticky top-0 z-30 shadow-xs">
          <div
            className={`w-full ${
              isMobilePreview ? "px-4 h-14" : "px-4 sm:px-8 lg:px-12 h-16"
            } flex items-center justify-between gap-3`}
          >
            <img
              src="/brand/radmanagement-logo-light.png"
              alt="RadManagement LLC — Clinical Imaging & Radiology Solutions"
              className={`${isMobilePreview ? "h-8" : "h-9 sm:h-10"} w-auto object-contain`}
            />

            <div className="flex items-center gap-2.5">
              {/* Desktop / Mobile View Switcher (visible on md+ desktop screens for instant mobile review) */}
              <div
                className="hidden md:inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5"
                role="group"
                aria-label="Layout view mode"
              >
                <button
                  type="button"
                  onClick={() => setViewMode("full")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    !isMobilePreview
                      ? "bg-[var(--navy)] text-white"
                      : "text-[var(--muted)] hover:text-[var(--navy)]"
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Full Page
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("mobile")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    isMobilePreview
                      ? "bg-[var(--navy)] text-white"
                      : "text-[var(--muted)] hover:text-[var(--navy)]"
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Mobile View
                </button>
              </div>

              {!isMobilePreview && (
                <div className="hidden lg:flex items-center gap-1.5 text-xs text-[var(--navy)] bg-[var(--teal-soft)] border border-[var(--teal)]/20 px-3 py-1.5 rounded-full font-medium">
                  <Shield className="h-3.5 w-3.5 text-[var(--teal)]" />
                  <span>Private &amp; HIPAA-Protected</span>
                </div>
              )}
            </div>
          </div>

          {/* Full-Width Progress Bar Strip */}
          <div className="w-full border-t border-[var(--border)]/70 bg-white">
            {/* Compact Mobile Progress Bar */}
            <div className={`${isMobilePreview ? "block" : "sm:hidden"} px-4 py-2.5 space-y-1.5`}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[var(--navy)]">
                  Step {step} of 4 &middot; {activeStepMeta.title}
                </span>
                <span className="font-semibold text-[var(--teal-dark)]">
                  {Math.round((step / 4) * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--teal)] transition-all duration-300"
                  style={{ width: `${(step / 4) * 100}%` }}
                />
              </div>
            </div>

            {/* Full-Page Desktop Breadcrumb Stepper */}
            {!isMobilePreview && (
              <nav
                aria-label="Assessment progress"
                className="hidden sm:grid grid-cols-4 gap-3 w-full px-6 lg:px-12 py-2.5"
              >
                {stepsMeta.map((s) => (
                  <div
                    key={s.num}
                    className={`rounded-xl border px-3.5 py-2 text-xs transition-all flex items-center gap-2.5 ${
                      step === s.num
                        ? "border-[var(--teal)] bg-[var(--navy)] text-white font-semibold shadow-xs"
                        : step > s.num
                          ? "border-[var(--teal)]/40 bg-[var(--teal-soft)] text-[var(--navy)] font-medium"
                          : "border-[var(--border)] bg-[var(--bg)]/60 text-[var(--muted)]"
                    }`}
                  >
                    <span
                      className={`h-5 w-5 rounded-full inline-flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        step >= s.num ? "bg-[var(--teal)] text-white" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {step > s.num ? "✓" : s.num}
                    </span>
                    <span className="truncate">{s.title}</span>
                  </div>
                ))}
              </nav>
            )}
          </div>
        </header>

        <main className="w-full flex-1 flex flex-col">
          {error && (
            <div
              role="alert"
              className={`${
                isMobilePreview ? "mx-4 mt-4" : "mx-4 sm:mx-8 lg:mx-12 mt-5"
              } rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 flex items-center gap-2`}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-700" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Full-Bleed Family Hero + Full-Width Why Complete + Full-Width Profile & Modules */}
          {step === 1 && (
            <div className="w-full flex flex-col">
              {/* Edge-to-Edge Full-Page Family Hero */}
              <section className="w-full bg-[var(--navy)] text-white border-b border-[var(--border)]">
                <div
                  className={
                    isMobilePreview
                      ? "flex flex-col-reverse"
                      : "grid grid-cols-1 lg:grid-cols-12 min-h-[380px] xl:min-h-[430px]"
                  }
                >
                  <div
                    className={`${
                      isMobilePreview
                        ? "p-5 space-y-3.5"
                        : "lg:col-span-6 px-5 sm:px-8 lg:px-12 py-9 lg:py-12 flex flex-col justify-center space-y-5"
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#64d8ea]">
                      Preventive Care for You &amp; the People You Love
                    </p>
                    <h1
                      className={`${
                        isMobilePreview ? "text-2xl" : "text-2xl sm:text-4xl xl:text-[42px]"
                      } font-bold tracking-tight leading-[1.15]`}
                    >
                      Stay Ahead of Your Health &mdash; For Every Milestone Ahead
                    </h1>
                    <p className="text-sm sm:text-base text-slate-200 leading-relaxed max-w-2xl">
                      In about 5 minutes, answer simple, plain-English questions about your
                      personal and family health history. Our evidence-based guidelines match you
                      with the exact preventive imaging screenings that matter most for your stage
                      of life.
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <a
                        href="#intake-profile-section"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--teal)] hover:bg-[var(--teal-dark)] text-white text-sm font-semibold px-5 py-3 min-h-[44px] transition-colors shadow-sm"
                      >
                        Start My 5-Minute Assessment
                        <ArrowDown className="h-4 w-4" />
                      </a>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-xs text-slate-200">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-[#64d8ea]" /> Takes ~5 minutes
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-[#64d8ea]" /> Zero data saved in
                        browser
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Heart className="h-4 w-4 text-[#64d8ea]" /> Reviewed by a specialist
                      </span>
                    </div>
                  </div>

                  <div
                    className={`${
                      isMobilePreview ? "h-52 w-full" : "lg:col-span-6 relative min-h-[260px]"
                    } relative`}
                  >
                    <img
                      src="/images/family-hero.jpg"
                      alt="Multigenerational family smiling together outdoors"
                      className="h-full w-full object-cover"
                    />
                    {!isMobilePreview && (
                      <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-[var(--navy)] via-[var(--navy)]/20 to-transparent w-28" />
                    )}
                  </div>
                </div>
              </section>

              {/* Full-Width "Why Complete This Assessment?" Band */}
              <section className="w-full bg-white border-b border-[var(--border)]">
                <div
                  className={`${
                    isMobilePreview ? "px-4 py-6 space-y-5" : "px-5 sm:px-8 lg:px-12 py-10"
                  } w-full`}
                >
                  <div
                    className={
                      isMobilePreview
                        ? "space-y-5"
                        : "grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
                    }
                  >
                    <div className={isMobilePreview ? "" : "lg:col-span-5 xl:col-span-4"}>
                      <img
                        src="/images/care-consultation.jpg"
                        alt="Physician reviewing a personalized preventive care plan with a smiling couple"
                        className={`w-full ${
                          isMobilePreview ? "h-48" : "h-64 xl:h-72"
                        } object-cover rounded-2xl border border-[var(--border)] shadow-xs`}
                      />
                    </div>
                    <div
                      className={`${
                        isMobilePreview ? "space-y-4" : "lg:col-span-7 xl:col-span-8 space-y-5"
                      }`}
                    >
                      <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-[var(--navy)] tracking-tight">
                          Why Complete This Preventive Health Assessment?
                        </h2>
                        <p className="text-sm sm:text-base text-[var(--muted)] mt-1.5 leading-relaxed max-w-3xl">
                          Many serious conditions &mdash; including early breast or lung changes,
                          coronary plaque, and bone thinning &mdash; develop quietly for years
                          without symptoms. Taking five minutes today gives you and your care team
                          clarity, confidence, and peace of mind.
                        </p>
                      </div>

                      <div
                        className={`grid ${
                          isMobilePreview ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"
                        } gap-4`}
                      >
                        <div className="rounded-xl bg-[var(--bg)] border border-[var(--border)] p-4 space-y-2">
                          <div className="h-9 w-9 rounded-lg bg-[var(--teal-soft)] text-[var(--teal)] flex items-center justify-center">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <h3 className="text-sm font-bold text-[var(--navy)]">Early Detection</h3>
                          <p className="text-xs text-[var(--muted)] leading-relaxed">
                            Pinpoints recommended screenings before symptoms appear, when care is
                            simplest and most effective.
                          </p>
                        </div>
                        <div className="rounded-xl bg-[var(--bg)] border border-[var(--border)] p-4 space-y-2">
                          <div className="h-9 w-9 rounded-lg bg-[var(--teal-soft)] text-[var(--teal)] flex items-center justify-center">
                            <Users className="h-4 w-4" />
                          </div>
                          <h3 className="text-sm font-bold text-[var(--navy)]">
                            Built Around Your Family
                          </h3>
                          <p className="text-xs text-[var(--muted)] leading-relaxed">
                            Accounts for family history and personal risk factors &mdash; never a
                            generic one-size-fits-all checklist.
                          </p>
                        </div>
                        <div className="rounded-xl bg-[var(--bg)] border border-[var(--border)] p-4 space-y-2">
                          <div className="h-9 w-9 rounded-lg bg-[var(--teal-soft)] text-[var(--teal)] flex items-center justify-center">
                            <CalendarCheck className="h-4 w-4" />
                          </div>
                          <h3 className="text-sm font-bold text-[var(--navy)]">Clear Next Steps</h3>
                          <p className="text-xs text-[var(--muted)] leading-relaxed">
                            Checks preventive insurance coverage right away and lets you schedule a
                            guided review with a clinician.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Full-Width Profile & Screening Choices Workspace */}
              <section
                id="intake-profile-section"
                className={`w-full ${
                  isMobilePreview ? "px-4 py-6 pb-24" : "px-5 sm:px-8 lg:px-12 py-8 pb-24 sm:pb-10"
                }`}
              >
                <form
                  onSubmit={(e) => void handleStartIntake(e)}
                  className="w-full rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-8 shadow-xs space-y-7"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-[var(--navy)] tracking-tight">
                        Step 1: Tell Us a Little About Yourself
                      </h2>
                      <p className="text-sm text-[var(--muted)] mt-1">
                        Your age and sex assigned at birth help us automatically skip questions
                        that don&apos;t apply to you.
                      </p>
                    </div>
                    <button
                      id="fill-synthetic-profile-btn"
                      type="button"
                      onClick={fillSyntheticDemo}
                      className="text-xs font-semibold px-4 py-2.5 min-h-[40px] rounded-xl border border-[var(--teal)] text-[var(--teal-dark)] hover:bg-[var(--teal-soft)] cursor-pointer transition-colors"
                    >
                      Fill Synthetic Test Profile
                    </button>
                  </div>

                  <div
                    className={`grid ${
                      isMobilePreview
                        ? "grid-cols-1"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                    } gap-4`}
                  >
                    <label className="space-y-1.5 text-xs font-semibold text-[var(--navy)]">
                      <span>First Name *</span>
                      <input
                        id="intake-first-name"
                        required
                        placeholder="e.g., Claire"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full h-12 sm:h-11 rounded-xl border border-slate-300 px-3.5 text-base sm:text-sm font-normal focus:outline-none focus:border-[var(--teal)]"
                      />
                    </label>
                    <label className="space-y-1.5 text-xs font-semibold text-[var(--navy)]">
                      <span>Last Name *</span>
                      <input
                        id="intake-last-name"
                        required
                        placeholder="e.g., Bennett"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full h-12 sm:h-11 rounded-xl border border-slate-300 px-3.5 text-base sm:text-sm font-normal focus:outline-none focus:border-[var(--teal)]"
                      />
                    </label>
                    <label className="space-y-1.5 text-xs font-semibold text-[var(--navy)]">
                      <span>Date of Birth *</span>
                      <input
                        id="intake-dob"
                        type="date"
                        required
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="w-full h-12 sm:h-11 rounded-xl border border-slate-300 px-3.5 text-base sm:text-sm font-normal focus:outline-none focus:border-[var(--teal)]"
                      />
                    </label>
                    <label className="space-y-1.5 text-xs font-semibold text-[var(--navy)]">
                      <span>Sex Assigned at Birth *</span>
                      <select
                        id="intake-sex"
                        value={sexAtBirth}
                        onChange={(e) => setSexAtBirth(e.target.value as SexAtBirth)}
                        className="w-full h-12 sm:h-11 rounded-xl border border-slate-300 px-3.5 text-base sm:text-sm font-normal bg-white focus:outline-none focus:border-[var(--teal)]"
                      >
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                        <option value="Intersex">Intersex</option>
                        <option value="Unknown">Prefer not to say</option>
                      </select>
                    </label>
                    <label className="space-y-1.5 text-xs font-semibold text-[var(--navy)]">
                      <span>ZIP Code *</span>
                      <input
                        id="intake-zip"
                        required
                        inputMode="numeric"
                        placeholder="e.g., 94107"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        className="w-full h-12 sm:h-11 rounded-xl border border-slate-300 px-3.5 text-base sm:text-sm font-normal focus:outline-none focus:border-[var(--teal)]"
                      />
                    </label>
                    <label className="space-y-1.5 text-xs font-semibold text-[var(--navy)]">
                      <span>Email (Optional)</span>
                      <input
                        id="intake-email"
                        type="email"
                        placeholder="For visit confirmation"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full h-12 sm:h-11 rounded-xl border border-slate-300 px-3.5 text-base sm:text-sm font-normal focus:outline-none focus:border-[var(--teal)]"
                      />
                    </label>
                  </div>

                  <div className="space-y-3.5 pt-2">
                    <div>
                      <p className="text-base font-bold text-[var(--navy)]">
                        Choose the Health Areas You&apos;d Like to Explore
                      </p>
                      <p className="text-xs sm:text-sm text-[var(--muted)] mt-0.5">
                        Select one or more focus areas below &mdash; each card explains what it
                        screens for and how it supports preventive care.
                      </p>
                    </div>
                    <div
                      className={`grid ${
                        isMobilePreview
                          ? "grid-cols-1"
                          : "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
                      } gap-3`}
                    >
                      {MODULE_OPTIONS.map((mod) => {
                        const active = selectedModules.includes(mod.id);
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => toggleModule(mod.id)}
                            className={`text-left rounded-xl border p-4 transition-all cursor-pointer space-y-2 flex flex-col justify-between ${
                              active
                                ? "border-[var(--teal)] bg-[var(--teal-soft)] ring-1 ring-[var(--teal)]"
                                : "border-[var(--border)] bg-white hover:border-[var(--teal)]/60 hover:bg-slate-50/70"
                            }`}
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-bold text-[var(--navy)] leading-snug">
                                  {mod.label}
                                </span>
                                <span
                                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${
                                    active
                                      ? "bg-[var(--teal)] text-white"
                                      : "border border-slate-300 text-transparent"
                                  }`}
                                >
                                  ✓
                                </span>
                              </div>
                              <p className="text-xs text-[var(--muted)] leading-relaxed">
                                {mod.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Desktop Footer Bar */}
                  <div
                    className={`${
                      isMobilePreview
                        ? "hidden"
                        : "hidden sm:flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--border)]"
                    }`}
                  >
                    <p className="text-xs text-[var(--muted)]">
                      All measurements use <strong>US Standard units</strong> (feet, inches, and
                      pounds).
                    </p>
                    <button
                      id="start-questionnaire-btn"
                      type="submit"
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--navy)] px-7 py-3 text-sm font-semibold text-white hover:bg-[var(--navy-dark)] disabled:opacity-50 cursor-pointer shadow-xs transition-colors"
                    >
                      {busy ? "Preparing Your Questions..." : "Continue to Your Health Questions"}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Sticky Mobile Action Bar */}
                  <div
                    className={`${
                      isMobilePreview
                        ? "sticky bottom-0 -mx-5 -mb-5 px-4 py-3 bg-white/95 backdrop-blur-md border-t border-[var(--border)]"
                        : "sm:hidden fixed bottom-0 inset-x-0 px-4 py-3 bg-white/95 backdrop-blur-md border-t border-[var(--border)] z-30 shadow-lg"
                    }`}
                  >
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full h-12 rounded-xl bg-[var(--navy)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {busy ? "Preparing Questions..." : "Continue to Health Questions"}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {/* STEP 2: Full-Page Dynamic Questionnaire (2-Column Desktop + Mobile Thumb Flow) */}
          {step === 2 && (
            <div
              className={`w-full ${
                isMobilePreview ? "px-4 py-5 pb-24" : "px-5 sm:px-8 lg:px-12 py-7 pb-24 sm:pb-10"
              } space-y-5`}
            >
              <div className="rounded-2xl border border-[var(--border)] bg-white p-5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
                <div>
                  <h1 className="text-xl font-bold text-[var(--navy)] tracking-tight">
                    Your Personalized Health Questions
                  </h1>
                  <p className="text-sm text-[var(--muted)] mt-0.5">
                    Answered <strong>{totalAnswered}</strong> of{" "}
                    <strong>{visibleQuestions.length}</strong> tailored questions. Every question
                    explains why it matters.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {liveBmi !== null && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--teal-soft)] border border-[var(--teal)]/25 px-3 py-1.5 text-xs font-semibold text-[var(--navy)]">
                      Calculated BMI: {liveBmi}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)] hover:text-[var(--navy)] cursor-pointer px-3 py-2 rounded-lg border border-[var(--border)]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Edit Profile
                  </button>
                </div>
              </div>

              {/* Domain Filter Chips (Mobile Horizontal Scroll) */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setActiveDomainFilter("ALL")}
                  className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
                    activeDomainFilter === "ALL"
                      ? "bg-[var(--navy)] text-white border-[var(--navy)]"
                      : "bg-white text-[var(--navy)] border-[var(--border)] hover:border-[var(--teal)]"
                  }`}
                >
                  All Sections ({visibleQuestions.length})
                </button>
                {domainsSummary.map((d) => (
                  <button
                    key={d.domain}
                    type="button"
                    onClick={() => setActiveDomainFilter(d.domain)}
                    className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
                      activeDomainFilter === d.domain
                        ? "bg-[var(--navy)] text-white border-[var(--navy)]"
                        : "bg-white text-[var(--navy)] border-[var(--border)] hover:border-[var(--teal)]"
                    }`}
                  >
                    {d.domain} ({d.answered}/{d.total})
                  </button>
                ))}
              </div>

              <div
                className={
                  isMobilePreview
                    ? "space-y-4"
                    : "grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                }
              >
                {/* Desktop Sticky Section Sidebar */}
                {!isMobilePreview && (
                  <aside className="hidden lg:block lg:col-span-3 sticky top-32 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-xs space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-[var(--navy)]">
                        Assessment Sections
                      </p>
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-[var(--teal)] transition-all duration-300"
                          style={{
                            width: `${
                              visibleQuestions.length > 0
                                ? Math.round((totalAnswered / visibleQuestions.length) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-[var(--muted)]">
                        {totalAnswered} of {visibleQuestions.length} answered
                      </p>
                    </div>
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => setActiveDomainFilter("ALL")}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer ${
                          activeDomainFilter === "ALL"
                            ? "bg-[var(--teal-soft)] text-[var(--navy)]"
                            : "text-[var(--muted)] hover:bg-slate-50"
                        }`}
                      >
                        <span>All Sections</span>
                        <span>{visibleQuestions.length}</span>
                      </button>
                      {domainsSummary.map((d) => (
                        <button
                          key={d.domain}
                          type="button"
                          onClick={() => setActiveDomainFilter(d.domain)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between cursor-pointer ${
                            activeDomainFilter === d.domain
                              ? "bg-[var(--teal-soft)] text-[var(--navy)] font-semibold"
                              : "text-[var(--muted)] hover:bg-slate-50"
                          }`}
                        >
                          <span>{d.domain}</span>
                          <span className="font-mono text-[11px]">
                            {d.answered}/{d.total}
                          </span>
                        </button>
                      ))}
                    </div>
                  </aside>
                )}

                {/* Question Stream */}
                <div className={`${isMobilePreview ? "" : "lg:col-span-9"} space-y-4`}>
                  {displayedQuestions.map((q) => {
                    const currentVal = answers[q.question_key];
                    const isHeightUs = q.question_key === "height_cm";
                    const isWeightUs = q.question_key === "weight_kg";
                    const showTip = !collapsedTips[q.question_key];

                    const displayHeight =
                      isHeightUs && typeof currentVal === "number"
                        ? cmToFeetInches(currentVal)
                        : null;
                    const displayLbs =
                      isWeightUs && typeof currentVal === "number" ? kgToLbs(currentVal) : null;

                    return (
                      <div
                        key={q.id}
                        className="rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-6 shadow-xs space-y-3.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--navy)] bg-[var(--teal-soft)] px-2.5 py-0.5 rounded-md">
                                {q.domain}
                              </span>
                              {q.is_knockout_gate && (
                                <span className="text-[11px] font-medium text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-md">
                                  Key Screening Question
                                </span>
                              )}
                            </div>
                            <p className="text-base font-semibold text-[var(--navy)] leading-snug">
                              {isHeightUs
                                ? "What is your height (feet and inches)?"
                                : isWeightUs
                                  ? "What is your current weight (in pounds, lbs)?"
                                  : q.label_plain_english}
                            </p>
                          </div>

                          {q.helper_tooltip && (
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedTips((prev) => ({
                                  ...prev,
                                  [q.question_key]: !prev[q.question_key],
                                }))
                              }
                              className="inline-flex items-center gap-1 shrink-0 text-xs font-medium text-[var(--teal-dark)] hover:underline cursor-pointer"
                            >
                              <HelpCircle className="h-4 w-4" />
                              <span className="hidden sm:inline">
                                {showTip ? "Hide" : "Why we ask"}
                              </span>
                            </button>
                          )}
                        </div>

                        {showTip && q.helper_tooltip && (
                          <div className="rounded-xl bg-[var(--bg)] border border-[var(--border)] px-3.5 py-2.5 text-xs text-[var(--muted)] flex items-start gap-2 leading-relaxed">
                            <Info className="h-3.5 w-3.5 text-[var(--teal)] shrink-0 mt-0.5" />
                            <span>
                              <strong className="text-[var(--navy)]">Why we ask:</strong>{" "}
                              {q.helper_tooltip}
                            </span>
                          </div>
                        )}

                        {/* US Standard Height: Feet & Inches */}
                        {isHeightUs && (
                          <div className="flex flex-wrap items-center gap-3">
                            <select
                              aria-label="Height in feet"
                              value={
                                heightFeet !== ""
                                  ? heightFeet
                                  : displayHeight
                                    ? String(displayHeight.feet)
                                    : ""
                              }
                              onChange={(e) =>
                                updateHeightUs(
                                  e.target.value,
                                  heightInches ||
                                    (displayHeight ? String(displayHeight.inches) : "0"),
                                )
                              }
                              className="h-12 sm:h-11 w-28 rounded-xl border border-slate-300 bg-white px-3 text-base sm:text-sm"
                            >
                              <option value="">Feet</option>
                              {[3, 4, 5, 6, 7].map((ft) => (
                                <option key={ft} value={ft}>
                                  {ft} ft
                                </option>
                              ))}
                            </select>
                            <select
                              aria-label="Height in inches"
                              value={
                                heightInches !== ""
                                  ? heightInches
                                  : displayHeight
                                    ? String(displayHeight.inches)
                                    : ""
                              }
                              onChange={(e) =>
                                updateHeightUs(
                                  heightFeet || (displayHeight ? String(displayHeight.feet) : "5"),
                                  e.target.value,
                                )
                              }
                              className="h-12 sm:h-11 w-32 rounded-xl border border-slate-300 bg-white px-3 text-base sm:text-sm"
                            >
                              <option value="">Inches</option>
                              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((inch) => (
                                <option key={inch} value={inch}>
                                  {inch} in
                                </option>
                              ))}
                            </select>
                            {displayHeight && (
                              <span className="text-xs font-semibold text-[var(--teal-dark)]">
                                Recorded: {displayHeight.feet}&apos; {displayHeight.inches}&quot;
                              </span>
                            )}
                          </div>
                        )}

                        {/* US Standard Weight: Pounds (lbs) */}
                        {isWeightUs && (
                          <div className="flex items-center gap-2.5">
                            <div className="relative max-w-[220px] w-full">
                              <input
                                type="number"
                                inputMode="decimal"
                                min={50}
                                max={600}
                                step="1"
                                placeholder="e.g., 165"
                                value={
                                  weightLbsInput !== ""
                                    ? weightLbsInput
                                    : displayLbs !== null
                                      ? String(displayLbs)
                                      : ""
                                }
                                onChange={(e) => updateWeightUs(e.target.value)}
                                className="w-full h-12 sm:h-11 rounded-xl border border-slate-300 pl-3.5 pr-12 text-base sm:text-sm"
                              />
                              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--muted)]">
                                lbs
                              </span>
                            </div>
                            {displayLbs !== null && (
                              <span className="text-xs font-semibold text-[var(--teal-dark)]">
                                Recorded: {displayLbs} lbs
                              </span>
                            )}
                          </div>
                        )}

                        {/* Boolean Buttons — Large 48px Touch Targets */}
                        {!isHeightUs && !isWeightUs && q.input_type === "boolean" && (
                          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2.5">
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
                                className={`h-12 sm:h-10 sm:px-8 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${
                                  currentVal === opt.val
                                    ? "border-[var(--navy)] bg-[var(--navy)] text-white shadow-xs"
                                    : "border-slate-300 bg-white text-[var(--navy)] hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]/50"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}

                        {!isHeightUs &&
                          !isWeightUs &&
                          (q.input_type === "number" || q.input_type === "lab_numeric") && (
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              placeholder="Enter value"
                              value={currentVal === undefined ? "" : String(currentVal)}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setAnswers((prev) => ({
                                  ...prev,
                                  [q.question_key]: raw === "" ? undefined : Number(raw),
                                }));
                              }}
                              className="w-full max-w-xs h-12 sm:h-11 rounded-xl border border-slate-300 px-3.5 text-base sm:text-sm"
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
                                className={`min-h-[44px] px-4 py-2 rounded-xl border text-sm transition-all cursor-pointer ${
                                  currentVal === opt.value
                                    ? "border-[var(--navy)] bg-[var(--navy)] text-white font-semibold"
                                    : "border-slate-300 bg-white text-[var(--navy)] hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]/40"
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
                            className="w-full max-w-xs h-12 sm:h-11 rounded-xl border border-slate-300 px-3.5 text-base sm:text-sm"
                          />
                        )}

                        {q.input_type === "pedigree_array" && (
                          <div className="space-y-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] p-4">
                            <p className="text-xs text-[var(--muted)]">
                              Add close biological relatives diagnosed with cancer so we can
                              accurately evaluate hereditary screening eligibility:
                            </p>
                            <div
                              className={`grid ${
                                isMobilePreview ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-4"
                              } gap-2`}
                            >
                              <select
                                aria-label="Relative relationship"
                                value={pedigreeDraft.relation}
                                onChange={(e) =>
                                  setPedigreeDraft({ ...pedigreeDraft, relation: e.target.value })
                                }
                                className="h-11 sm:h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm sm:text-xs"
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
                                  setPedigreeDraft({
                                    ...pedigreeDraft,
                                    cancer_type: e.target.value,
                                  })
                                }
                                className="h-11 sm:h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm sm:text-xs"
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
                                className="h-11 sm:h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm sm:text-xs"
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
                                className="inline-flex items-center justify-center gap-1 h-11 sm:h-9 rounded-lg bg-[var(--teal)] text-white text-xs font-semibold cursor-pointer"
                              >
                                <Plus className="h-3.5 w-3.5" /> Add Relative
                              </button>
                            </div>

                            {Array.isArray(currentVal) && currentVal.length > 0 && (
                              <ul className="space-y-1.5">
                                {(currentVal as PedigreeRow[]).map((rel, idx) => (
                                  <li
                                    key={idx}
                                    className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
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
                                      className="text-slate-400 hover:text-rose-700 cursor-pointer p-1"
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

                  <div className={isMobilePreview ? "hidden" : "hidden sm:flex justify-end pt-2"}>
                    <button
                      id="continue-insurance-btn"
                      type="button"
                      onClick={() => {
                        setStep(3);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--navy)] px-7 py-3 text-sm font-semibold text-white hover:bg-[var(--navy-dark)] cursor-pointer shadow-xs"
                    >
                      Continue to Benefits &amp; Coverage Check
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Sticky Mobile Bottom CTA for Step 2 */}
              <div
                className={`${
                  isMobilePreview
                    ? "sticky bottom-0 -mx-4 px-4 py-3 bg-white/95 backdrop-blur-md border-t border-[var(--border)]"
                    : "sm:hidden fixed bottom-0 inset-x-0 px-4 py-3 bg-white/95 backdrop-blur-md border-t border-[var(--border)] z-30 shadow-lg"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setStep(3);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="w-full h-12 rounded-xl bg-[var(--navy)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  Continue to Coverage Check ({totalAnswered}/{visibleQuestions.length})
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Full-Page Real-Time Insurance Coverage Check */}
          {step === 3 && (
            <div
              className={`w-full ${
                isMobilePreview ? "px-4 py-5 pb-24" : "px-5 sm:px-8 lg:px-12 py-8"
              }`}
            >
              <div className="w-full max-w-4xl mx-auto rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-8 shadow-xs space-y-6">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-[var(--navy)] tracking-tight">
                    Real-Time Preventive Coverage Check
                  </h1>
                  <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
                    Most preventive imaging screenings are covered at <strong>$0 copay</strong>{" "}
                    under preventive care benefits. Check your eligibility instantly before
                    scheduling so there are no billing surprises.
                  </p>
                </div>

                <div
                  className={`grid ${isMobilePreview ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"} gap-4`}
                >
                  <label className="space-y-1.5 text-xs font-semibold text-[var(--navy)]">
                    <span>Insurance Plan / Payer</span>
                    <select
                      id="insurance-payer-select"
                      value={payerId}
                      onChange={(e) => setPayerId(e.target.value)}
                      className="w-full h-12 sm:h-11 rounded-xl border border-slate-300 px-3.5 text-base sm:text-sm font-normal bg-white"
                    >
                      {PAYER_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5 text-xs font-semibold text-[var(--navy)]">
                    <span>Member ID</span>
                    <input
                      id="insurance-member-id"
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                      className="w-full h-12 sm:h-11 rounded-xl border border-slate-300 px-3.5 text-base sm:text-sm font-mono"
                    />
                  </label>
                </div>

                <button
                  id="verify-stedi-btn"
                  type="button"
                  disabled={busy || !memberId.trim()}
                  onClick={() => void handleVerifyInsurance()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--teal)] text-[var(--teal-dark)] px-5 py-3 min-h-[44px] text-sm font-semibold hover:bg-[var(--teal-soft)] cursor-pointer transition-colors w-full sm:w-auto"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {busy ? "Checking Coverage..." : "Verify My Preventive Benefits"}
                </button>

                {insuranceStatus && (
                  <div
                    className={`rounded-xl border p-4 space-y-1.5 text-sm ${
                      insuranceStatus.eligible
                        ? "border-[var(--teal)]/40 bg-[var(--teal-soft)] text-[var(--navy)]"
                        : "border-rose-200 bg-rose-50 text-rose-950"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-[var(--teal)]" />
                        Coverage {insuranceStatus.coverage_status}: {insuranceStatus.plan_name}
                      </span>
                      <span className="font-mono text-xs text-[var(--muted)]">
                        {insuranceStatus.x12_transaction_id}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted)]">
                      Estimated Preventive Screening Copay:{" "}
                      <strong className="text-[var(--navy)]">
                        ${insuranceStatus.preventive_screening_copay_usd}
                      </strong>{" "}
                      &middot; Remaining Deductible:{" "}
                      <strong className="text-[var(--navy)]">
                        ${insuranceStatus.deductible_remaining_usd}
                      </strong>
                    </p>
                  </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="inline-flex items-center justify-center gap-1.5 h-11 px-4 text-sm font-medium text-[var(--muted)] hover:text-[var(--navy)] cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back to Questions
                  </button>
                  <button
                    id="submit-evaluate-btn"
                    type="button"
                    disabled={busy}
                    onClick={() => void handleEvaluateAndLoadSlots()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--navy)] px-7 py-3 min-h-[48px] text-sm font-semibold text-white hover:bg-[var(--navy-dark)] disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {busy ? "Creating Your Personalized Care Plan..." : "Submit & View My Care Plan"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Full-Page Personalized Results Summary & Visit Scheduling */}
          {step === 4 && evaluation && (
            <div
              className={`w-full ${
                isMobilePreview ? "px-4 py-5 space-y-4" : "px-5 sm:px-8 lg:px-12 py-8 space-y-6"
              }`}
            >
              {(evaluation.highest_acuity === "ACUTE_RED_FLAG" ||
                evaluation.workqueue_priority === "HIGH") && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 space-y-1.5">
                  <p className="text-sm font-bold flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" />
                    High-Priority Clinical Findings Flagged for Prompt Review
                  </p>
                  <p className="text-xs leading-relaxed">
                    One or more of your answers indicate findings that deserve prompt physician
                    review. If you are experiencing severe or sudden symptoms right now, please
                    call 911 or visit the nearest emergency department. Our RadManagement care team
                    has flagged your record as <strong>High Priority</strong> for outreach.
                  </p>
                </div>
              )}

              <div
                className={`grid ${
                  isMobilePreview ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-12"
                } gap-6 items-start`}
              >
                <div
                  className={`${
                    isMobilePreview ? "" : "lg:col-span-7"
                  } rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-7 shadow-xs space-y-4`}
                >
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-[var(--navy)] tracking-tight">
                      Your Personalized Preventive Care Plan
                    </h1>
                    <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
                      {evaluation.triggered_count === 0
                        ? "Great news — no elevated preventive imaging risk pathways were triggered today. Continue routine annual wellness checkups with your physician."
                        : `Based on your answers, we identified ${evaluation.triggered_count} personalized preventive pathway${
                            evaluation.triggered_count === 1 ? "" : "s"
                          } to review with a RadManagement imaging clinician.`}
                    </p>
                  </div>

                  {evaluation.triggered_pathways.length > 0 && (
                    <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl overflow-hidden">
                      {evaluation.triggered_pathways.map((p) => {
                        const isHigh =
                          p.acuity_level === "ACUTE_RED_FLAG" || p.acuity_level === "HIGH_RISK";
                        return (
                          <li key={p.rule_code} className="p-4 space-y-1.5 bg-white">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-bold text-[var(--navy)]">
                                {p.display_name ?? p.rule_code}
                              </span>
                              <span
                                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                                  isHigh
                                    ? "bg-amber-100 text-amber-900"
                                    : "bg-[var(--teal-soft)] text-[var(--navy)]"
                                }`}
                              >
                                {isHigh ? "High Priority" : "Standard Preventive"}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--muted)] leading-relaxed">
                              {p.recommended_intervention}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Visit Scheduling */}
                <div
                  className={`${
                    isMobilePreview ? "" : "lg:col-span-5"
                  } rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-7 shadow-xs space-y-4`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-[var(--teal-soft)] text-[var(--teal)] flex items-center justify-center shrink-0">
                      <CalendarCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-[var(--navy)]">
                        Schedule Your Guided Risk Review Visit
                      </h2>
                      <p className="text-xs text-[var(--muted)]">
                        Pick a convenient time to review your summary and coordinate recommended
                        imaging.
                      </p>
                    </div>
                  </div>

                  {bookedSlot && appointmentId ? (
                    <div className="rounded-xl border border-[var(--teal)]/40 bg-[var(--teal-soft)] p-4 text-sm text-[var(--navy)] space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-[var(--teal)]" />
                        Appointment Confirmed &mdash; Added to Care Calendar
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {new Date(bookedSlot.scheduled_start).toLocaleString()} &middot;{" "}
                        {bookedSlot.provider_display} ({bookedSlot.modality})
                      </p>
                      <p className="text-[11px] font-mono text-[var(--teal-dark)]">
                        Confirmation Ref: {appointmentId}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {slots.map((slot) => (
                        <button
                          key={slot.slot_id}
                          type="button"
                          disabled={busy}
                          onClick={() => void handleBookSlot(slot)}
                          className="text-left rounded-xl border border-[var(--border)] p-4 hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]/50 transition-all cursor-pointer space-y-1 min-h-[64px]"
                        >
                          <p className="text-sm font-semibold text-[var(--navy)]">
                            {new Date(slot.scheduled_start).toLocaleString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                          <p className="text-xs text-[var(--muted)]">{slot.provider_display}</p>
                          <p className="text-[11px] text-[var(--teal-dark)] font-semibold">
                            {slot.modality}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="w-full border-t border-[var(--border)] bg-white py-4 px-5 sm:px-8 lg:px-12 mt-auto">
          <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
            <span>
              &copy; {new Date().getFullYear()} RadManagement LLC &middot; Clinical Imaging &amp;
              Radiology Solutions
            </span>
            <span>HIPAA-Protected Assessment &middot; US Standard Measurements</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
