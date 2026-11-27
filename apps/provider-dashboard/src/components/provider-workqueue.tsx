"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileSearch,
  ListTodo,
  Mail,
  Phone,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

type WorkqueuePriority = "HIGH" | "STANDARD";
type WorkqueueStatus =
  | "CONTACT_PENDING"
  | "APPOINTMENT_SCHEDULED"
  | "EXAMS_ORDERED"
  | "PATIENT_COMPLETED";

const STATUS_META: Record<
  WorkqueueStatus,
  { label: string; shortLabel: string; badgeClass: string; dotClass: string }
> = {
  CONTACT_PENDING: {
    label: "Contact Pending",
    shortLabel: "Contact Pending",
    badgeClass: "bg-amber-50 text-amber-900 border-amber-200",
    dotClass: "bg-amber-500",
  },
  APPOINTMENT_SCHEDULED: {
    label: "Appointment Scheduled",
    shortLabel: "Scheduled",
    badgeClass: "bg-sky-50 text-sky-900 border-sky-200",
    dotClass: "bg-sky-500",
  },
  EXAMS_ORDERED: {
    label: "Exams Ordered",
    shortLabel: "Exams Ordered",
    badgeClass: "bg-teal-50 text-teal-900 border-teal-200",
    dotClass: "bg-[#1f9fb3]",
  },
  PATIENT_COMPLETED: {
    label: "Patient Completed",
    shortLabel: "Completed",
    badgeClass: "bg-emerald-50 text-emerald-900 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
};

const ALL_STATUSES: WorkqueueStatus[] = [
  "CONTACT_PENDING",
  "APPOINTMENT_SCHEDULED",
  "EXAMS_ORDERED",
  "PATIENT_COMPLETED",
];

const VISIT_TYPE_OPTIONS = [
  { value: "RISK_REVIEW_CONSULT", label: "Preventive Risk Review Consult" },
  { value: "HIGH_RISK_BREAST_MRI_CONSULT", label: "High-Risk Breast MRI Consult" },
  { value: "LOW_DOSE_CT_LUNG_SCREEN", label: "Low-Dose CT Lung Screen" },
  { value: "CORONARY_CALCIUM_CT", label: "Coronary Calcium (CAC) CT" },
  { value: "DEXA_BONE_DENSITY_SCAN", label: "DEXA Bone Density Scan" },
  { value: "NEUROIMAGING_CONSULT", label: "Priority Neuroimaging Consult" },
];

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

interface PatientAppointment {
  id: string;
  patient_id: string;
  workqueue_item_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  visit_type: string;
  status: string;
}

interface CalendarAppointment extends PatientAppointment {
  patient_name: string;
  mrn: string | null;
  dob: string;
  priority: WorkqueuePriority;
  workqueue_status: WorkqueueStatus;
}

interface WorkqueueItem {
  id: string;
  patient_id: string;
  session_id: string;
  assigned_provider_id: string | null;
  priority: WorkqueuePriority;
  status: WorkqueueStatus;
  notes: string | null;
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
    phone?: string | null;
    email?: string | null;
    insurance_status: {
      eligible?: boolean;
      coverage_status?: string;
      plan_name?: string;
    };
  };
  triggered_pathways: TriggeredPathwayItem[];
  responses: ProvenanceResponseItem[];
  documents: ClinicalDocItem[];
  appointments?: PatientAppointment[];
}

interface DispatchedOrder {
  order_id: string;
  rule_code: string;
  format: string;
  dispatched_via: string;
  payload: unknown;
}

function formatUsMeasurement(questionKey: string, answerValue: unknown): string {
  if (questionKey === "height_cm" && typeof answerValue === "number" && answerValue > 0) {
    const totalInches = Math.round(answerValue / 2.54);
    const ft = Math.floor(totalInches / 12);
    const inch = totalInches % 12;
    return `${ft}' ${inch}" (${ft} ft ${inch} in)`;
  }
  if (questionKey === "weight_kg" && typeof answerValue === "number" && answerValue > 0) {
    const lbs = Math.round(answerValue / 0.45359237);
    return `${lbs} lbs`;
  }
  if (typeof answerValue === "boolean") return answerValue ? "Yes" : "No";
  if (typeof answerValue === "string") return answerValue;
  return JSON.stringify(answerValue);
}

function formatVisitType(vt: string): string {
  return vt
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function toDateKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const [activeTab, setActiveTab] = useState<"workqueue" | "calendar">("workqueue");
  const [items, setItems] = useState<WorkqueueItem[]>([]);
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<"" | WorkqueuePriority>("");
  const [statusFilter, setStatusFilter] = useState<"" | WorkqueueStatus>("");
  const [orderFormat, setOrderFormat] = useState<"FHIR_SERVICE_REQUEST" | "HL7_ORM">(
    "FHIR_SERVICE_REQUEST",
  );
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastDispatched, setLastDispatched] = useState<DispatchedOrder[]>([]);
  const [highlightedDocId, setHighlightedDocId] = useState<string | null>(null);

  // Quick Visit Scheduler state
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [schedDate, setSchedDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return toDateKey(tomorrow);
  });
  const [schedTime, setSchedTime] = useState("10:00");
  const [schedVisitType, setSchedVisitType] = useState(VISIT_TYPE_OPTIONS[0]!.value);

  // Calendar month navigation
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wqRes, apptRes] = await Promise.all([
        fetch("/api/provider", { cache: "no-store" }),
        fetch("/api/provider/appointments", { cache: "no-store" }),
      ]);
      if (!wqRes.ok) throw new Error(`Failed to load workqueue (${wqRes.status})`);
      const wqData = (await wqRes.json()) as { items?: WorkqueueItem[] };
      const list = wqData.items ?? [];
      setItems(list);
      setSelectedId((prev) =>
        prev && list.some((i) => i.id === prev) ? prev : (list[0]?.id ?? null),
      );

      if (apptRes.ok) {
        const apptData = (await apptRes.json()) as { appointments?: CalendarAppointment[] };
        setAppointments(apptData.appointments ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workqueue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (priorityFilter && item.priority !== priorityFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      return true;
    });
  }, [items, priorityFilter, statusFilter]);

  const selected = useMemo(
    () => filteredItems.find((i) => i.id === selectedId) ?? filteredItems[0] ?? null,
    [filteredItems, selectedId],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<WorkqueueStatus, number> = {
      CONTACT_PENDING: 0,
      APPOINTMENT_SCHEDULED: 0,
      EXAMS_ORDERED: 0,
      PATIENT_COMPLETED: 0,
    };
    for (const i of items) {
      if (i.status in counts) counts[i.status] += 1;
    }
    return counts;
  }, [items]);

  const highOpenCount = items.filter(
    (i) => i.priority === "HIGH" && i.status !== "PATIENT_COMPLETED",
  ).length;

  async function seedSyntheticCases() {
    setError(null);
    setToast(null);
    setLoading(true);
    try {
      const res = await fetch("/api/provider/demo-seed", { method: "POST" });
      if (!res.ok) throw new Error("Unable to seed synthetic workqueue cases");
      setToast("Seeded 4 synthetic patient cases across all workflow statuses + 3 calendar visits.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
      setLoading(false);
    }
  }

  async function updateCaseStatus(workqueueId: string, nextStatus: WorkqueueStatus) {
    setBusyAction(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch(`/api/provider/${workqueueId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Status update failed");
      }
      setToast(`Workqueue status updated to "${STATUS_META[nextStatus].label}".`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusyAction(false);
    }
  }

  async function submitScheduleVisit(e: React.FormEvent, workqueueId: string) {
    e.preventDefault();
    setBusyAction(true);
    setError(null);
    setToast(null);
    try {
      const start = new Date(`${schedDate}T${schedTime}:00`);
      const end = new Date(start.getTime() + 45 * 60 * 1000);
      const res = await fetch(`/api/provider/${workqueueId}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduled_start: start.toISOString(),
          scheduled_end: end.toISOString(),
          visit_type: schedVisitType,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Unable to schedule patient visit");
      }
      setShowScheduleForm(false);
      setToast("Patient visit scheduled and added to the Visits Calendar.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scheduling failed");
    } finally {
      setBusyAction(false);
    }
  }

  async function submitOrderAction(
    workqueueId: string,
    disposition: "ORDERED" | "DECLINED",
    pathwayIds?: string[],
  ) {
    setBusyAction(true);
    setError(null);
    setToast(null);
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
      setToast(
        disposition === "ORDERED"
          ? `Dispatched ${data.dispatched_orders?.length ?? 0} exam order(s) and moved case to "Exams Ordered".`
          : "Pathway recommendation declined.",
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order action failed");
    } finally {
      setBusyAction(false);
    }
  }

  // Calendar grid helpers
  const calendarDays = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ dateKey: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push({ dateKey: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      cells.push({ dateKey: toDateKey(dt), dayNum: d });
    }
    return cells;
  }, [calMonth]);

  const apptsByDate = useMemo(() => {
    const map: Record<string, CalendarAppointment[]> = {};
    for (const a of appointments) {
      const key = toDateKey(a.scheduled_start);
      if (!map[key]) map[key] = [];
      map[key]!.push(a);
    }
    return map;
  }, [appointments]);

  const visibleCalendarAppointments = useMemo(() => {
    if (!selectedCalDate) return appointments;
    return apptsByDate[selectedCalDate] ?? [];
  }, [appointments, apptsByDate, selectedCalDate]);

  const todayKey = toDateKey(new Date());

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      {isDemoMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center text-xs font-medium text-amber-950 flex items-center justify-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
          <span>SYNTHETIC DEMO ENVIRONMENT &mdash; DO NOT ENTER REAL PHI</span>
        </div>
      )}

      {/* Branded RadManagement Clinical Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/95 backdrop-blur-sm shadow-xs">
        <div className="mx-auto max-w-[1680px] px-5 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <img
              src="/brand/radmanagement-logo-light.png"
              alt="RadManagement LLC — Clinical Imaging & Radiology Solutions"
              className="h-10 w-auto object-contain"
            />
            <div className="hidden md:block h-7 w-px bg-[var(--border)]" />
            <nav aria-label="Provider views" className="flex items-center gap-1.5 bg-[var(--bg)] p-1 rounded-xl border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setActiveTab("workqueue")}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "workqueue"
                    ? "bg-[var(--navy)] text-white shadow-xs"
                    : "text-[var(--muted)] hover:text-[var(--navy)]"
                }`}
              >
                <ListTodo className="h-3.5 w-3.5" />
                Workqueue ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("calendar")}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "calendar"
                    ? "bg-[var(--navy)] text-white shadow-xs"
                    : "text-[var(--muted)] hover:text-[var(--navy)]"
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                Patient Visits &amp; Calendar ({appointments.length})
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            {highOpenCount > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                {highOpenCount} High-Priority Open
              </span>
            )}
            <span className="hidden lg:inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-mono text-[var(--navy)]">
              {providerId} ({providerRole})
            </span>
            <button
              type="button"
              onClick={() => void loadAll()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-[var(--navy)] hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1680px] flex-1 px-5 py-5 space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-700 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {toast && (
          <div className="rounded-xl border border-[var(--teal)]/40 bg-[var(--teal-soft)] px-4 py-2.5 text-xs text-[var(--navy)] flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--teal)] shrink-0" />
            <span>{toast}</span>
          </div>
        )}

        {/* WORKFLOW STATUS SUMMARY STRIP */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {ALL_STATUSES.map((st) => {
            const meta = STATUS_META[st];
            const active = activeTab === "workqueue" && statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setActiveTab("workqueue");
                  setStatusFilter((prev) => (prev === st ? "" : st));
                }}
                className={`text-left rounded-xl border p-3.5 transition-all cursor-pointer flex items-center justify-between ${
                  active
                    ? "border-[var(--navy)] bg-[var(--navy)] text-white shadow-xs"
                    : "border-[var(--border)] bg-white hover:border-[var(--teal)]"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${active ? "bg-[#64d8ea]" : meta.dotClass}`} />
                    <span
                      className={`text-xs font-semibold ${active ? "text-slate-100" : "text-[var(--muted)]"}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className={`text-2xl font-bold ${active ? "text-white" : "text-[var(--navy)]"}`}>
                    {statusCounts[st]}
                  </p>
                </div>
                <span
                  className={`text-[11px] font-medium ${active ? "text-[#64d8ea]" : "text-[var(--teal)]"}`}
                >
                  {active ? "Clear" : "Filter"}
                </span>
              </button>
            );
          })}
        </section>

        {/* TAB 1: WORKQUEUE VIEW */}
        {activeTab === "workqueue" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT RAIL: Workqueue List */}
            <aside className="lg:col-span-4 xl:col-span-3 rounded-xl border border-[var(--border)] bg-white overflow-hidden shadow-xs">
              <div className="p-3.5 border-b border-[var(--border)] bg-[var(--bg)]/80 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-[var(--navy)]">
                    Imaging Workqueue ({filteredItems.length})
                  </span>
                  {isDemoMode && (
                    <button
                      id="seed-workqueue-btn"
                      type="button"
                      onClick={() => void seedSyntheticCases()}
                      className="text-[11px] font-semibold text-[var(--teal-dark)] hover:underline cursor-pointer"
                    >
                      + Seed Synthetic Cases
                    </button>
                  )}
                </div>

                {/* Priority Filter Pills: All | HIGH | STANDARD */}
                <div className="grid grid-cols-3 gap-1.5">
                  {(["", "HIGH", "STANDARD"] as const).map((p) => (
                    <button
                      key={p || "ALL"}
                      type="button"
                      onClick={() => setPriorityFilter(p)}
                      className={`h-7 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                        priorityFilter === p
                          ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                          : "border-[var(--border)] bg-white text-[var(--muted)] hover:text-[var(--navy)]"
                      }`}
                    >
                      {p === "" ? "All Priority" : p}
                    </button>
                  ))}
                </div>

                {/* Status Filter Dropdown */}
                <select
                  aria-label="Filter workqueue by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as "" | WorkqueueStatus)}
                  className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-[var(--navy)]"
                >
                  <option value="">All Workflow Statuses</option>
                  {ALL_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {STATUS_META[st].label} ({statusCounts[st]})
                    </option>
                  ))}
                </select>
              </div>

              <div className="divide-y divide-[var(--border)] max-h-[72vh] overflow-y-auto">
                {filteredItems.length === 0 ? (
                  <div className="p-6 text-center space-y-2.5">
                    <p className="text-xs text-[var(--muted)]">
                      No patient cases match the current workqueue filter.
                    </p>
                    {isDemoMode && items.length === 0 && (
                      <button
                        type="button"
                        onClick={() => void seedSyntheticCases()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--navy)] px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Load 4 Synthetic Workqueue Cases
                      </button>
                    )}
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const isSelected = selected?.id === item.id;
                    const stMeta = STATUS_META[item.status] ?? STATUS_META.CONTACT_PENDING;
                    const nextAppt = item.appointments?.[0];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(item.id);
                          setLastDispatched([]);
                          setHighlightedDocId(null);
                          setShowScheduleForm(false);
                        }}
                        className={`w-full text-left p-3.5 transition-colors cursor-pointer space-y-2 ${
                          isSelected ? "bg-[var(--teal-soft)]/70" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-[var(--navy)] truncate">
                            {item.patient.first_name} {item.patient.last_name}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                              item.priority === "HIGH"
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {item.priority}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${stMeta.badgeClass}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${stMeta.dotClass}`} />
                            {stMeta.label}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--muted)]">
                            {item.patient.mrn ?? "No MRN"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                          <span>
                            {item.triggered_pathways.length} pathway
                            {item.triggered_pathways.length === 1 ? "" : "s"}
                          </span>
                          {nextAppt ? (
                            <span className="inline-flex items-center gap-1 text-[var(--teal-dark)] font-medium">
                              <Calendar className="h-3 w-3" />
                              {new Date(nextAppt.scheduled_start).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          ) : (
                            <span>No visit booked</span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* MAIN DETAIL WORKBENCH */}
            <section className="lg:col-span-8 xl:col-span-9 space-y-4">
              {!selected ? (
                <div className="rounded-xl border border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--muted)]">
                  Select a patient from the Clinical Workqueue to update status, schedule a visit,
                  review evidence excerpts, or dispatch imaging orders.
                </div>
              ) : (
                <>
                  {/* Patient Header + Workflow Status Bar + Quick Visit Scheduler */}
                  <div className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-xs space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-bold text-[var(--navy)]">
                            {selected.patient.first_name} {selected.patient.last_name}
                          </h2>
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                              selected.priority === "HIGH"
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {selected.priority} Priority
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-md border ${
                              STATUS_META[selected.status].badgeClass
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${STATUS_META[selected.status].dotClass}`}
                            />
                            {STATUS_META[selected.status].label}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                          <span>DOB: {selected.patient.dob}</span>
                          <span>&middot;</span>
                          <span>Sex: {selected.patient.sex_at_birth ?? "Unknown"}</span>
                          <span>&middot;</span>
                          <span className="font-mono">MRN: {selected.patient.mrn ?? "N/A"}</span>
                          {selected.patient.phone && (
                            <>
                              <span>&middot;</span>
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {selected.patient.phone}
                              </span>
                            </>
                          )}
                          {selected.patient.email && (
                            <>
                              <span>&middot;</span>
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {selected.patient.email}
                              </span>
                            </>
                          )}
                        </div>

                        {selected.patient.insurance_status?.plan_name && (
                          <p className="text-xs text-[var(--teal-dark)] font-medium inline-flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Coverage {selected.patient.insurance_status.coverage_status ?? "ACTIVE"}:{" "}
                            {selected.patient.insurance_status.plan_name}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowScheduleForm((v) => !v)}
                          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[var(--teal)] text-[var(--teal-dark)] bg-[var(--teal-soft)]/50 hover:bg-[var(--teal-soft)] text-xs font-semibold cursor-pointer"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" />
                          {showScheduleForm ? "Close Scheduler" : "Schedule Visit"}
                        </button>
                        <select
                          aria-label="Outbound order format"
                          value={orderFormat}
                          onChange={(e) =>
                            setOrderFormat(e.target.value as "FHIR_SERVICE_REQUEST" | "HL7_ORM")
                          }
                          className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-[var(--navy)]"
                        >
                          <option value="FHIR_SERVICE_REQUEST">FHIR R4 ServiceRequest</option>
                          <option value="HL7_ORM">HL7 v2 ORM^O01</option>
                        </select>
                        <button
                          id="approve-all-orders-btn"
                          type="button"
                          disabled={
                            busyAction ||
                            selected.triggered_pathways.every(
                              (p) => p.clinician_disposition !== "PENDING",
                            )
                          }
                          onClick={() => void submitOrderAction(selected.id, "ORDERED")}
                          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[var(--navy)] text-white text-xs font-semibold hover:bg-[var(--navy-dark)] disabled:opacity-50 cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {busyAction ? "Processing..." : "Order Pending Exams"}
                        </button>
                      </div>
                    </div>

                    {/* Workflow Status Stepper */}
                    <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                        Workqueue Status:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_STATUSES.map((st) => {
                          const active = selected.status === st;
                          return (
                            <button
                              key={st}
                              type="button"
                              disabled={busyAction || active}
                              onClick={() => void updateCaseStatus(selected.id, st)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                                active
                                  ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                                  : "border-[var(--border)] bg-white text-[var(--navy)] hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]/50"
                              }`}
                            >
                              {STATUS_META[st].label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Inline Visit Scheduler Drawer */}
                    {showScheduleForm && (
                      <form
                        onSubmit={(e) => void submitScheduleVisit(e, selected.id)}
                        className="rounded-xl bg-[var(--bg)] border border-[var(--border)] p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
                      >
                        <label className="space-y-1 text-xs font-semibold text-[var(--navy)]">
                          <span>Visit Date</span>
                          <input
                            type="date"
                            required
                            value={schedDate}
                            onChange={(e) => setSchedDate(e.target.value)}
                            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold text-[var(--navy)]">
                          <span>Start Time</span>
                          <input
                            type="time"
                            required
                            value={schedTime}
                            onChange={(e) => setSchedTime(e.target.value)}
                            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold text-[var(--navy)]">
                          <span>Imaging / Consult Visit Type</span>
                          <select
                            value={schedVisitType}
                            onChange={(e) => setSchedVisitType(e.target.value)}
                            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                          >
                            {VISIT_TYPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="submit"
                          disabled={busyAction}
                          className="h-9 rounded-lg bg-[var(--teal)] hover:bg-[var(--teal-dark)] text-white text-xs font-semibold cursor-pointer"
                        >
                          Confirm &amp; Add to Calendar
                        </button>
                      </form>
                    )}

                    {/* Linked Upcoming Visits on Case */}
                    {selected.appointments && selected.appointments.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {selected.appointments.map((a) => (
                          <div
                            key={a.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-1.5 text-xs text-sky-950"
                          >
                            <Calendar className="h-3.5 w-3.5 text-sky-700" />
                            <span className="font-semibold">{formatVisitType(a.visit_type)}</span>
                            <span>
                              {new Date(a.scheduled_start).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                            <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-sky-200">
                              {a.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Outbound FHIR / HL7 Order Confirmation */}
                  {lastDispatched.length > 0 && (
                    <div className="rounded-xl border border-[var(--teal)]/40 bg-[var(--teal-soft)] p-4 space-y-2">
                      <p className="text-xs font-bold text-[var(--navy)] flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-[var(--teal)]" />
                        Dispatched {lastDispatched.length} Outbound Order
                        {lastDispatched.length === 1 ? "" : "s"} ({lastDispatched[0]?.format})
                      </p>
                      <pre className="text-[11px] font-mono bg-white border border-[var(--border)] rounded-lg p-3 overflow-x-auto max-h-48 text-slate-800">
                        {JSON.stringify(lastDispatched[0]?.payload, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* SPLIT SCREEN: Left = Triggered Pathways + CPT/ICD-10 | Right = Provenance & Docs */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                    {/* Triggered Clinical Pathways */}
                    <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-xs space-y-3">
                      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
                        <ClipboardCheck className="h-4 w-4 text-[var(--teal)]" />
                        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--navy)]">
                          Recommended Imaging &amp; Clinical Pathways (
                          {selected.triggered_pathways.length})
                        </h3>
                      </div>

                      {selected.triggered_pathways.length === 0 ? (
                        <p className="text-xs text-[var(--muted)]">
                          No pathways triggered for this case.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {selected.triggered_pathways.map((p) => {
                            const isHigh =
                              p.acuity_level === "ACUTE_RED_FLAG" || p.acuity_level === "HIGH_RISK";
                            return (
                              <div
                                key={p.id}
                                className="rounded-xl border border-[var(--border)] p-3.5 space-y-2.5 bg-[var(--bg)]/40"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-bold text-[var(--navy)]">
                                      {p.display_name}
                                    </p>
                                    <p className="text-[11px] text-[var(--muted)]">
                                      {p.specialty} &middot;{" "}
                                      <span className="font-mono">{p.rule_code}</span>
                                      {p.calculated_score !== null && (
                                        <> &middot; Score: {p.calculated_score}</>
                                      )}
                                    </p>
                                  </div>
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                      isHigh
                                        ? "bg-amber-100 text-amber-900"
                                        : "bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    {isHigh ? "HIGH" : "STANDARD"}
                                  </span>
                                </div>

                                <p className="text-xs text-slate-800 leading-relaxed">
                                  {p.recommended_intervention}
                                </p>

                                <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
                                  {p.cpt_codes.map((c) => (
                                    <span
                                      key={c}
                                      className="rounded bg-[var(--teal-soft)] border border-[var(--teal)]/25 px-1.5 py-0.5 text-[var(--navy)]"
                                    >
                                      CPT {c}
                                    </span>
                                  ))}
                                  {p.icd10_codes.map((c) => (
                                    <span
                                      key={c}
                                      className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-slate-700"
                                    >
                                      ICD-10 {c}
                                    </span>
                                  ))}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                                  <span className="text-[11px] font-semibold text-[var(--muted)]">
                                    Disposition:{" "}
                                    <strong className="text-[var(--navy)]">
                                      {p.clinician_disposition}
                                    </strong>
                                  </span>
                                  {p.clinician_disposition === "PENDING" && (
                                    <div className="flex gap-1.5">
                                      <button
                                        type="button"
                                        disabled={busyAction}
                                        onClick={() =>
                                          void submitOrderAction(selected.id, "ORDERED", [p.id])
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--teal)] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[var(--teal-dark)] cursor-pointer"
                                      >
                                        <CheckCircle2 className="h-3 w-3" /> Order Exam
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busyAction}
                                        onClick={() =>
                                          void submitOrderAction(selected.id, "DECLINED", [p.id])
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                                      >
                                        <XCircle className="h-3 w-3" /> Decline
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Provenance Evidence & Source Documents (US Standard Units) */}
                    <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-xs space-y-4">
                      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
                        <FileSearch className="h-4 w-4 text-[var(--teal)]" />
                        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--navy)]">
                          Patient Responses (US Units) &amp; AI Excerpts (
                          {selected.responses.length})
                        </h3>
                      </div>

                      <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                        {selected.responses.map((r) => (
                          <div
                            key={r.id}
                            onMouseEnter={() =>
                              r.source_document_id && setHighlightedDocId(r.source_document_id)
                            }
                            onMouseLeave={() => setHighlightedDocId(null)}
                            className="rounded-lg border border-[var(--border)] p-3 text-xs space-y-1.5 hover:border-[var(--teal)] transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-[var(--navy)]">
                                {r.label_plain_english}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--teal-soft)] text-[var(--navy)] shrink-0">
                                {r.provenance}
                                {r.confidence_score !== null &&
                                  ` · ${Math.round(r.confidence_score * 100)}%`}
                              </span>
                            </div>
                            <p className="font-semibold text-[var(--teal-dark)]">
                              Answer: {formatUsMeasurement(r.question_key, r.answer_value)}
                            </p>
                            {r.source_excerpt && (
                              <blockquote className="rounded bg-amber-50/70 border-l-2 border-amber-400 px-2.5 py-1.5 text-[11px] italic text-amber-950">
                                &ldquo;{r.source_excerpt}&rdquo;
                              </blockquote>
                            )}
                          </div>
                        ))}
                      </div>

                      {selected.documents.length > 0 && (
                        <div className="space-y-2 pt-3 border-t border-[var(--border)]">
                          <h4 className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            Ingested Clinical Documents ({selected.documents.length})
                          </h4>
                          {selected.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className={`rounded-lg border p-3 text-xs space-y-1.5 transition-colors ${
                                highlightedDocId === doc.id
                                  ? "border-[var(--teal)] bg-[var(--teal-soft)]/50"
                                  : "border-[var(--border)] bg-[var(--bg)]/50"
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-[var(--navy)]">
                                  {doc.document_category} ({doc.source_type})
                                </span>
                                <span className="font-mono text-[10px] text-[var(--muted)]">
                                  {doc.parsed_status}
                                </span>
                              </div>
                              {doc.extracted_text && (
                                <p className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                                  {doc.extracted_text}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: PATIENT VISITS & CALENDAR VIEW */}
        {activeTab === "calendar" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Monthly Calendar Grid */}
            <div className="lg:col-span-8 rounded-xl border border-[var(--border)] bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[var(--navy)]">
                    {calMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    Click any date to inspect scheduled imaging visits &amp; consultations.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                      setSelectedCalDate(null);
                    }}
                    className="h-8 px-3 rounded-lg border border-[var(--border)] text-xs font-semibold text-[var(--navy)] hover:bg-slate-50 cursor-pointer"
                  >
                    Today / All
                  </button>
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() =>
                      setCalMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                    }
                    className="h-8 w-8 rounded-lg border border-[var(--border)] inline-flex items-center justify-center hover:bg-slate-50 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() =>
                      setCalMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                    }
                    className="h-8 w-8 rounded-lg border border-[var(--border)] inline-flex items-center justify-center hover:bg-slate-50 cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold uppercase text-[var(--muted)] pb-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map((cell, idx) => {
                  if (!cell.dateKey) {
                    return <div key={idx} className="h-24 rounded-lg bg-slate-50/50" />;
                  }
                  const dayAppts = apptsByDate[cell.dateKey] ?? [];
                  const isToday = cell.dateKey === todayKey;
                  const isSel = selectedCalDate === cell.dateKey;
                  return (
                    <button
                      key={cell.dateKey}
                      type="button"
                      onClick={() =>
                        setSelectedCalDate((prev) =>
                          prev === cell.dateKey ? null : cell.dateKey,
                        )
                      }
                      className={`h-24 rounded-xl border p-2 text-left flex flex-col justify-between transition-all cursor-pointer overflow-hidden ${
                        isSel
                          ? "border-[var(--navy)] bg-[var(--teal-soft)] ring-1 ring-[var(--navy)]"
                          : isToday
                            ? "border-[var(--teal)] bg-[var(--teal-soft)]/30"
                            : "border-[var(--border)] bg-white hover:border-[var(--teal)]/60"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={`text-xs font-bold ${
                            isToday ? "text-[var(--teal-dark)]" : "text-[var(--navy)]"
                          }`}
                        >
                          {cell.dayNum}
                        </span>
                        {dayAppts.length > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--navy)] text-white">
                            {dayAppts.length}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 w-full overflow-hidden">
                        {dayAppts.slice(0, 2).map((a) => (
                          <div
                            key={a.id}
                            className={`truncate rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              a.priority === "HIGH"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-[var(--teal-soft)] text-[var(--navy)]"
                            }`}
                          >
                            {a.patient_name}
                          </div>
                        ))}
                        {dayAppts.length > 2 && (
                          <div className="text-[10px] text-[var(--muted)] font-medium">
                            +{dayAppts.length - 2} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Panel: Scheduled Visits List */}
            <aside className="lg:col-span-4 rounded-xl border border-[var(--border)] bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--navy)]">
                    {selectedCalDate ? `Visits on ${selectedCalDate}` : "All Scheduled Visits"}
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    {visibleCalendarAppointments.length} appointment
                    {visibleCalendarAppointments.length === 1 ? "" : "s"}
                  </p>
                </div>
                {selectedCalDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedCalDate(null)}
                    className="text-xs font-semibold text-[var(--teal-dark)] hover:underline cursor-pointer"
                  >
                    Show All
                  </button>
                )}
              </div>

              {visibleCalendarAppointments.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-xs text-[var(--muted)]">
                    No visits scheduled for this view yet.
                  </p>
                  {isDemoMode && appointments.length === 0 && (
                    <button
                      type="button"
                      onClick={() => void seedSyntheticCases()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--navy)] px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Seed Synthetic Visits
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 max-h-[68vh] overflow-y-auto pr-1">
                  {visibleCalendarAppointments.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-[var(--border)] p-3.5 space-y-2 bg-[var(--bg)]/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-[var(--navy)]">{a.patient_name}</p>
                          <p className="text-[11px] font-mono text-[var(--muted)]">
                            {a.mrn ?? "No MRN"} &middot; DOB {a.dob}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            a.priority === "HIGH"
                              ? "bg-amber-100 text-amber-900 border border-amber-300"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {a.priority}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-[var(--teal-dark)]">
                        {formatVisitType(a.visit_type)}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(a.scheduled_start).toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-[var(--border)]">
                          {a.status}
                        </span>
                      </div>

                      {a.workqueue_item_id && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(a.workqueue_item_id);
                            setStatusFilter("");
                            setPriorityFilter("");
                            setActiveTab("workqueue");
                          }}
                          className="w-full mt-1 h-8 rounded-lg border border-[var(--navy)]/20 bg-white text-[11px] font-semibold text-[var(--navy)] hover:bg-[var(--teal-soft)] cursor-pointer"
                        >
                          Open Patient Case in Workqueue
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
