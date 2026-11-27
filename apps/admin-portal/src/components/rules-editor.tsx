"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  GitBranch,
  History,
  Play,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type {
  AcuityLevel,
  AdminRuleDto,
  AdminVersionHistoryEntry,
  QuestionDto,
  RuleType,
} from "@healthcare/shared-contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DERIVED_VARIABLE_OPTIONS,
  SYNTHETIC_DRY_RUN_PRESETS,
  parseToVisualModel,
  serializeVisualModel,
  type LogicCombinator,
  type LogicOperator,
  type VisualRuleModel,
} from "@/lib/jsonlogic-builder";
import { cn } from "@/lib/utils";

const ACUITY_BADGE_VARIANT: Record<AcuityLevel, "acute" | "high" | "moderate" | "routine"> = {
  ACUTE_RED_FLAG: "acute",
  HIGH_RISK: "high",
  MODERATE_RISK: "moderate",
  ROUTINE: "routine",
};

const ACUITY_LABEL: Record<AcuityLevel, string> = {
  ACUTE_RED_FLAG: "Acute Red Flag",
  HIGH_RISK: "High Risk",
  MODERATE_RISK: "Moderate Risk",
  ROUTINE: "Routine",
};

const SPECIALTY_OPTIONS = [
  "Oncology",
  "Pulmonology",
  "Urology",
  "OBGYN",
  "Cardiology",
  "Neurology",
  "Sleep",
  "Bone",
  "MSK",
  "Hematology",
  "Hepatology",
];

const CPT_REGEX = /^[A-Z0-9]{4,7}$/i;
const ICD10_REGEX = /^[A-TV-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/i;

interface RulesResponse {
  rules_version_snapshot: number;
  total: number;
  specialties: string[];
  rules: AdminRuleDto[];
  recent_version_history: AdminVersionHistoryEntry[];
}

interface QuestionsResponse {
  questions: QuestionDto[];
}

interface DryRunResult {
  matched: boolean;
  calculated_score: number | null;
  derived_metrics: Record<string, unknown>;
}

export function RulesEditor() {
  const [rules, setRules] = useState<AdminRuleDto[]>([]);
  const [questions, setQuestions] = useState<QuestionDto[]>([]);
  const [snapshotVersion, setSnapshotVersion] = useState<number>(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ruleHistory, setRuleHistory] = useState<AdminVersionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [acuityFilter, setAcuityFilter] = useState("");
  const [ruleTypeFilter, setRuleTypeFilter] = useState("");

  // Editor draft state
  const [displayName, setDisplayName] = useState("");
  const [specialty, setSpecialty] = useState("Oncology");
  const [ruleType, setRuleType] = useState<RuleType>("PATIENT_REPORTED");
  const [acuityLevel, setAcuityLevel] = useState<AcuityLevel>("HIGH_RISK");
  const [intervention, setIntervention] = useState("");
  const [rationale, setRationale] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [cptCodes, setCptCodes] = useState<string[]>([]);
  const [icd10Codes, setIcd10Codes] = useState<string[]>([]);
  const [newCpt, setNewCpt] = useState("");
  const [newIcd10, setNewIcd10] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  // JsonLogic state
  const [rawJson, setRawJson] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [visualModel, setVisualModel] = useState<VisualRuleModel | null>(null);
  const [logicTab, setLogicTab] = useState<"visual" | "raw">("visual");

  // Save & Dry-run state
  const [saving, setSaving] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const [presetId, setPresetId] = useState<string>(SYNTHETIC_DRY_RUN_PRESETS[0]!.id);
  const [dryRunDob, setDryRunDob] = useState<string>(SYNTHETIC_DRY_RUN_PRESETS[0]!.dob);
  const [dryRunSex, setDryRunSex] = useState<"Female" | "Male">(
    SYNTHETIC_DRY_RUN_PRESETS[0]!.sex_at_birth,
  );
  const [dryRunAnswersJson, setDryRunAnswersJson] = useState<string>(
    JSON.stringify(SYNTHETIC_DRY_RUN_PRESETS[0]!.answers, null, 2),
  );
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [dryRunning, setDryRunning] = useState(false);

  // Create Rule dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    rule_code: "",
    display_name: "",
    specialty: "Pulmonology",
    rule_type: "PATIENT_REPORTED" as RuleType,
    acuity_level: "HIGH_RISK" as AcuityLevel,
    recommended_intervention: "",
    cpt_code: "71271",
    icd10_code: "Z87.891",
    prior_auth_rationale_template: "",
    logic_json: JSON.stringify(
      { and: [{ ">=": [{ var: "derived.age" }, 50] }, { ">=": [{ var: "answers.pack_years" }, 20] }] },
      null,
      2,
    ),
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rulesRes, questionsRes] = await Promise.all([
        fetch("/api/admin/rules?include_inactive=true", { cache: "no-store" }),
        fetch("/api/admin/questions?include_inactive=false", { cache: "no-store" }),
      ]);
      if (!rulesRes.ok) {
        const err = (await rulesRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Failed to load rules (${rulesRes.status})`);
      }
      const rulesData = (await rulesRes.json()) as RulesResponse;
      setRules(rulesData.rules);
      setSnapshotVersion(rulesData.rules_version_snapshot);

      if (questionsRes.ok) {
        const qData = (await questionsRes.json()) as QuestionsResponse;
        setQuestions(qData.questions);
      }

      setSelectedId((prev) =>
        prev && rulesData.rules.some((r) => r.id === prev)
          ? prev
          : (rulesData.rules[0]?.id ?? null),
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load clinical rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedRule = useMemo(
    () => rules.find((r) => r.id === selectedId) ?? null,
    [rules, selectedId],
  );

  // Sync draft form & fetch version history whenever selectedRule changes
  useEffect(() => {
    if (!selectedRule) return;
    setDisplayName(selectedRule.display_name);
    setSpecialty(selectedRule.specialty);
    setRuleType(selectedRule.rule_type);
    setAcuityLevel(selectedRule.acuity_level);
    setIntervention(selectedRule.recommended_intervention);
    setRationale(selectedRule.prior_auth_rationale_template ?? "");
    setIsActive(selectedRule.is_active);
    setCptCodes([...selectedRule.cpt_codes]);
    setIcd10Codes([...selectedRule.icd10_codes]);
    setCodeError(null);
    setJsonError(null);
    setStatusBanner(null);
    setDryRunResult(null);

    const formatted = JSON.stringify(selectedRule.logic_expression, null, 2);
    setRawJson(formatted);
    const parsedVisual = parseToVisualModel(selectedRule.logic_expression);
    setVisualModel(parsedVisual);
    setLogicTab(parsedVisual ? "visual" : "raw");

    fetch(`/api/admin/rules/${selectedRule.id}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { version_history?: AdminVersionHistoryEntry[] } | null) => {
        setRuleHistory(data?.version_history ?? []);
      })
      .catch(() => setRuleHistory([]));
  }, [selectedRule]);

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (specialtyFilter && r.specialty !== specialtyFilter) return false;
      if (acuityFilter && r.acuity_level !== acuityFilter) return false;
      if (ruleTypeFilter && r.rule_type !== ruleTypeFilter) return false;
      if (!q) return true;
      return (
        r.rule_code.toLowerCase().includes(q) ||
        r.display_name.toLowerCase().includes(q) ||
        r.specialty.toLowerCase().includes(q) ||
        r.cpt_codes.some((c) => c.toLowerCase().includes(q)) ||
        r.icd10_codes.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [rules, search, specialtyFilter, acuityFilter, ruleTypeFilter]);

  const variableOptions = useMemo(() => {
    const answerOpts = questions.map((q) => ({
      value: `answers.${q.question_key}`,
      label: `answers.${q.question_key} (${q.domain})`,
    }));
    return [...DERIVED_VARIABLE_OPTIONS, ...answerOpts];
  }, [questions]);

  function handleVisualChange(next: VisualRuleModel) {
    setVisualModel(next);
    const serialized = serializeVisualModel(next);
    setRawJson(JSON.stringify(serialized, null, 2));
    setJsonError(null);
  }

  function handleRawJsonChange(text: string) {
    setRawJson(text);
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonError("JsonLogic expression must be a JSON object");
        setVisualModel(null);
        return;
      }
      setJsonError(null);
      setVisualModel(parseToVisualModel(parsed as Record<string, unknown>));
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON syntax");
    }
  }

  function addCptCode() {
    const clean = newCpt.trim().toUpperCase();
    if (!clean) return;
    if (!CPT_REGEX.test(clean)) {
      setCodeError(`"${clean}" is not a valid CPT/HCPCS code (4–7 alphanumeric chars).`);
      return;
    }
    if (!cptCodes.includes(clean)) {
      setCptCodes([...cptCodes, clean]);
    }
    setNewCpt("");
    setCodeError(null);
  }

  function addIcd10Code() {
    const clean = newIcd10.trim().toUpperCase();
    if (!clean) return;
    if (!ICD10_REGEX.test(clean)) {
      setCodeError(`"${clean}" is not a valid ICD-10-CM code (e.g., Z15.01, Z87.891).`);
      return;
    }
    if (!icd10Codes.includes(clean)) {
      setIcd10Codes([...icd10Codes, clean]);
    }
    setNewIcd10("");
    setCodeError(null);
  }

  async function handleSaveRule() {
    if (!selectedRule) return;
    setStatusBanner(null);

    let parsedLogic: Record<string, unknown>;
    try {
      parsedLogic = JSON.parse(rawJson) as Record<string, unknown>;
      if (!parsedLogic || typeof parsedLogic !== "object" || Array.isArray(parsedLogic)) {
        throw new Error("JsonLogic must be a JSON object");
      }
    } catch (err) {
      setStatusBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Invalid JsonLogic JSON",
      });
      return;
    }

    if (cptCodes.length === 0 || icd10Codes.length === 0) {
      setStatusBanner({
        type: "error",
        text: "At least one CPT code and one ICD-10 code are required.",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/rules/${selectedRule.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          specialty,
          rule_type: ruleType,
          acuity_level: acuityLevel,
          logic_expression: parsedLogic,
          recommended_intervention: intervention,
          cpt_codes: cptCodes,
          icd10_codes: icd10Codes,
          prior_auth_rationale_template: rationale || null,
          is_active: isActive,
        }),
      });
      const data = (await res.json()) as {
        rule?: AdminRuleDto;
        rules_version_snapshot?: number;
        error?: string;
      };
      if (!res.ok || !data.rule) {
        throw new Error(data.error ?? "Failed to update clinical rule");
      }

      const updated = data.rule;
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      if (data.rules_version_snapshot) {
        setSnapshotVersion(data.rules_version_snapshot);
      }
      setStatusBanner({
        type: "success",
        text: `Published ${updated.rule_code} as Snapshot v${updated.version}. Live Rules Engine updated without code deployment.`,
      });
    } catch (err) {
      setStatusBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDryRun() {
    setDryRunning(true);
    setStatusBanner(null);
    try {
      const parsedLogic = JSON.parse(rawJson) as Record<string, unknown>;
      const parsedAnswers = JSON.parse(dryRunAnswersJson) as Record<string, unknown>;
      const res = await fetch("/api/admin/rules/dry-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rule_code: selectedRule?.rule_code,
          logic_expression: parsedLogic,
          synthetic_patient: { dob: dryRunDob, sex_at_birth: dryRunSex },
          answers: parsedAnswers,
        }),
      });
      const data = (await res.json()) as DryRunResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Dry-run evaluation failed");
      setDryRunResult(data);
    } catch (err) {
      setStatusBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Dry-run failed",
      });
    } finally {
      setDryRunning(false);
    }
  }

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    try {
      const parsedLogic = JSON.parse(createDraft.logic_json) as Record<string, unknown>;
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rule_code: createDraft.rule_code.trim().toUpperCase(),
          display_name: createDraft.display_name.trim(),
          specialty: createDraft.specialty,
          rule_type: createDraft.rule_type,
          acuity_level: createDraft.acuity_level,
          logic_expression: parsedLogic,
          recommended_intervention: createDraft.recommended_intervention.trim(),
          cpt_codes: [createDraft.cpt_code.trim().toUpperCase()],
          icd10_codes: [createDraft.icd10_code.trim().toUpperCase()],
          prior_auth_rationale_template: createDraft.prior_auth_rationale_template.trim() || null,
          is_active: true,
        }),
      });
      const data = (await res.json()) as {
        rule?: AdminRuleDto;
        rules_version_snapshot?: number;
        error?: string;
      };
      if (!res.ok || !data.rule) {
        throw new Error(data.error ?? "Failed to create rule");
      }
      setRules((prev) => [data.rule!, ...prev]);
      if (data.rules_version_snapshot) setSnapshotVersion(data.rules_version_snapshot);
      setSelectedId(data.rule.id);
      setCreateOpen(false);
      setCreateDraft((prev) => ({
        ...prev,
        rule_code: "",
        display_name: "",
        recommended_intervention: "",
      }));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Creation failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Clinical Rules &amp; CPT/ICD-10 Editor
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Edit JsonLogic thresholds, billing codes, and clinical interventions live in PostgreSQL
            with automatic version snapshotting.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
            <GitBranch className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">Active Rules Snapshot</span>
            <Badge variant="teal" className="font-mono">
              v{snapshotVersion}
            </Badge>
            <span className="text-muted-foreground">&middot; {rules.length} rules</span>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button id="create-rule-button" size="sm">
                <Plus className="h-3.5 w-3.5" />
                New Clinical Rule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Clinical Rule</DialogTitle>
                <DialogDescription>
                  Adds a new JsonLogic rule to PostgreSQL and bumps the global rules snapshot
                  version.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => void handleCreateRule(e)} className="space-y-3">
                {createError && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                    {createError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="new-rule-code">Rule Code (UPPER_SNAKE_CASE)</Label>
                    <Input
                      id="new-rule-code"
                      required
                      placeholder="CUSTOM_CARDIO_SCREEN"
                      className="font-mono"
                      value={createDraft.rule_code}
                      onChange={(e) =>
                        setCreateDraft({ ...createDraft, rule_code: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-rule-name">Display Name</Label>
                    <Input
                      id="new-rule-name"
                      required
                      placeholder="Custom Cardiology Risk Screen"
                      value={createDraft.display_name}
                      onChange={(e) =>
                        setCreateDraft({ ...createDraft, display_name: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="new-rule-specialty">Specialty</Label>
                    <select
                      id="new-rule-specialty"
                      className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                      value={createDraft.specialty}
                      onChange={(e) =>
                        setCreateDraft({ ...createDraft, specialty: e.target.value })
                      }
                    >
                      {SPECIALTY_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-rule-type">Rule Type</Label>
                    <select
                      id="new-rule-type"
                      className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                      value={createDraft.rule_type}
                      onChange={(e) =>
                        setCreateDraft({ ...createDraft, rule_type: e.target.value as RuleType })
                      }
                    >
                      <option value="PATIENT_REPORTED">PATIENT_REPORTED</option>
                      <option value="HYBRID">HYBRID</option>
                      <option value="EHR_LAB_DEPENDENT">EHR_LAB_DEPENDENT</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-rule-acuity">Acuity Level</Label>
                    <select
                      id="new-rule-acuity"
                      className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                      value={createDraft.acuity_level}
                      onChange={(e) =>
                        setCreateDraft({
                          ...createDraft,
                          acuity_level: e.target.value as AcuityLevel,
                        })
                      }
                    >
                      <option value="ACUTE_RED_FLAG">ACUTE_RED_FLAG</option>
                      <option value="HIGH_RISK">HIGH_RISK</option>
                      <option value="MODERATE_RISK">MODERATE_RISK</option>
                      <option value="ROUTINE">ROUTINE</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-rule-intervention">Recommended Intervention</Label>
                  <Input
                    id="new-rule-intervention"
                    required
                    placeholder="e.g., Low-Dose CT Thorax (LDCT)"
                    value={createDraft.recommended_intervention}
                    onChange={(e) =>
                      setCreateDraft({ ...createDraft, recommended_intervention: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="new-rule-cpt">Primary CPT Code</Label>
                    <Input
                      id="new-rule-cpt"
                      required
                      className="font-mono"
                      value={createDraft.cpt_code}
                      onChange={(e) => setCreateDraft({ ...createDraft, cpt_code: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-rule-icd10">Primary ICD-10 Code</Label>
                    <Input
                      id="new-rule-icd10"
                      required
                      className="font-mono"
                      value={createDraft.icd10_code}
                      onChange={(e) =>
                        setCreateDraft({ ...createDraft, icd10_code: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-rule-logic">JsonLogic Expression</Label>
                  <Textarea
                    id="new-rule-logic"
                    className="font-mono text-xs min-h-[110px]"
                    value={createDraft.logic_json}
                    onChange={(e) =>
                      setCreateDraft({ ...createDraft, logic_json: e.target.value })
                    }
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create &amp; Snapshot</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loadError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-center justify-between">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={() => void loadData()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Master Rule List */}
        <Card className="lg:col-span-4 overflow-hidden">
          <div className="p-3.5 border-b border-border space-y-2.5 bg-secondary/25">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
              <Input
                id="rules-search-input"
                placeholder="Search code, name, CPT, or ICD-10..."
                className="pl-8 h-8 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <select
                aria-label="Filter by specialty"
                className="h-7 rounded-md border border-input bg-card px-2 text-[11px]"
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value)}
              >
                <option value="">All Specialties</option>
                {SPECIALTY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by acuity"
                className="h-7 rounded-md border border-input bg-card px-2 text-[11px]"
                value={acuityFilter}
                onChange={(e) => setAcuityFilter(e.target.value)}
              >
                <option value="">All Acuities</option>
                <option value="ACUTE_RED_FLAG">Acute Red Flag</option>
                <option value="HIGH_RISK">High Risk</option>
                <option value="MODERATE_RISK">Moderate Risk</option>
                <option value="ROUTINE">Routine</option>
              </select>

              <select
                aria-label="Filter by source type"
                className="h-7 rounded-md border border-input bg-card px-2 text-[11px]"
                value={ruleTypeFilter}
                onChange={(e) => setRuleTypeFilter(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="PATIENT_REPORTED">Patient</option>
                <option value="HYBRID">Hybrid</option>
                <option value="EHR_LAB_DEPENDENT">EHR / Lab</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-border max-h-[calc(100vh-230px)] overflow-y-auto">
            {loading && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Loading clinical rules from PostgreSQL...
              </div>
            )}
            {!loading && filteredRules.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No rules match the current filters.
              </div>
            )}
            {filteredRules.map((rule) => {
              const selected = rule.id === selectedId;
              return (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => setSelectedId(rule.id)}
                  className={cn(
                    "w-full text-left px-3.5 py-3 transition-colors hover:bg-secondary/50 cursor-pointer",
                    selected && "bg-accent/60 border-l-2 border-l-primary",
                    !rule.is_active && "opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-foreground truncate">
                      {rule.rule_code}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={ACUITY_BADGE_VARIANT[rule.acuity_level]} className="text-[10px] px-1.5 py-0">
                        {ACUITY_LABEL[rule.acuity_level]}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        v{rule.version}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-foreground/85 mt-1 truncate">{rule.display_name}</p>
                  <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px] text-muted-foreground">
                    <span>{rule.specialty}</span>
                    <span className="font-mono truncate">
                      CPT {rule.cpt_codes.slice(0, 2).join(", ")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Right Detail Editor */}
        <div className="lg:col-span-8 space-y-4">
          {!selectedRule ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Select a clinical rule from the left registry to inspect and configure its JsonLogic
              thresholds and CPT/ICD-10 billing codes.
            </Card>
          ) : (
            <>
              {statusBanner && (
                <div
                  role="status"
                  className={cn(
                    "rounded-md border px-4 py-2.5 text-xs flex items-center gap-2",
                    statusBanner.type === "success"
                      ? "border-teal-200 bg-teal-50 text-teal-900"
                      : "border-rose-200 bg-rose-50 text-rose-900",
                  )}
                >
                  {statusBanner.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-700" />
                  )}
                  <span>{statusBanner.text}</span>
                </div>
              )}

              {/* Rule Header & Core Metadata */}
              <Card>
                <CardHeader className="pb-4 border-b border-border flex-row items-center justify-between space-y-0">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {selectedRule.rule_code}
                      </span>
                      <Badge variant={ACUITY_BADGE_VARIANT[acuityLevel]}>
                        {ACUITY_LABEL[acuityLevel]}
                      </Badge>
                      <Badge variant="outline" className="font-mono">
                        v{selectedRule.version} &rarr; v{Math.max(snapshotVersion, selectedRule.version) + 1}
                      </Badge>
                    </div>
                    <CardDescription>
                      Saving updates the live rule in PostgreSQL and records an immutable HIPAA
                      version snapshot in audit_logs.
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="rule-active-switch"
                        checked={isActive}
                        onCheckedChange={setIsActive}
                      />
                      <Label htmlFor="rule-active-switch">
                        {isActive ? "Active" : "Inactive"}
                      </Label>
                    </div>
                    <Button
                      id="save-rule-button"
                      size="sm"
                      disabled={saving || Boolean(jsonError)}
                      onClick={() => void handleSaveRule()}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saving ? "Publishing..." : "Save & Bump Snapshot"}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2 space-y-1">
                      <Label htmlFor="edit-rule-name">Clinical Display Name</Label>
                      <Input
                        id="edit-rule-name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-rule-specialty">Specialty</Label>
                      <select
                        id="edit-rule-specialty"
                        className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                        value={specialty}
                        onChange={(e) => setSpecialty(e.target.value)}
                      >
                        {SPECIALTY_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-rule-acuity">Acuity Level</Label>
                      <select
                        id="edit-rule-acuity"
                        className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                        value={acuityLevel}
                        onChange={(e) => setAcuityLevel(e.target.value as AcuityLevel)}
                      >
                        <option value="ACUTE_RED_FLAG">ACUTE_RED_FLAG (HIGH Priority)</option>
                        <option value="HIGH_RISK">HIGH_RISK (HIGH)</option>
                        <option value="MODERATE_RISK">MODERATE_RISK (STANDARD)</option>
                        <option value="ROUTINE">ROUTINE (STANDARD)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="edit-rule-type">Evaluation Source Type</Label>
                      <select
                        id="edit-rule-type"
                        className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                        value={ruleType}
                        onChange={(e) => setRuleType(e.target.value as RuleType)}
                      >
                        <option value="PATIENT_REPORTED">PATIENT_REPORTED</option>
                        <option value="HYBRID">HYBRID</option>
                        <option value="EHR_LAB_DEPENDENT">EHR_LAB_DEPENDENT</option>
                      </select>
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <Label htmlFor="edit-rule-intervention">Recommended Clinical Intervention</Label>
                      <Input
                        id="edit-rule-intervention"
                        value={intervention}
                        onChange={(e) => setIntervention(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* CPT & ICD-10 Billing Codes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-md border border-border bg-secondary/20 p-3.5">
                    <div className="space-y-2">
                      <Label htmlFor="add-cpt-input">CPT / HCPCS Procedure Codes</Label>
                      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                        {cptCodes.map((code) => (
                          <Badge
                            key={code}
                            variant="teal"
                            className="font-mono gap-1 pr-1"
                          >
                            {code}
                            <button
                              type="button"
                              aria-label={`Remove CPT ${code}`}
                              onClick={() => setCptCodes(cptCodes.filter((c) => c !== code))}
                              className="rounded-sm hover:bg-teal-200/70 p-0.5 cursor-pointer"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <Input
                          id="add-cpt-input"
                          placeholder="Add CPT (e.g., 77049)"
                          className="h-8 text-xs font-mono"
                          value={newCpt}
                          onChange={(e) => setNewCpt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addCptCode();
                            }
                          }}
                        />
                        <Button type="button" size="sm" variant="outline" onClick={addCptCode}>
                          Add
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="add-icd10-input">ICD-10-CM Diagnosis Codes</Label>
                      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                        {icd10Codes.map((code) => (
                          <Badge
                            key={code}
                            variant="outline"
                            className="font-mono gap-1 pr-1 bg-card"
                          >
                            {code}
                            <button
                              type="button"
                              aria-label={`Remove ICD-10 ${code}`}
                              onClick={() => setIcd10Codes(icd10Codes.filter((c) => c !== code))}
                              className="rounded-sm hover:bg-secondary p-0.5 cursor-pointer"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <Input
                          id="add-icd10-input"
                          placeholder="Add ICD-10 (e.g., Z15.01)"
                          className="h-8 text-xs font-mono"
                          value={newIcd10}
                          onChange={(e) => setNewIcd10(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addIcd10Code();
                            }
                          }}
                        />
                        <Button type="button" size="sm" variant="outline" onClick={addIcd10Code}>
                          Add
                        </Button>
                      </div>
                    </div>

                    {codeError && (
                      <p className="md:col-span-2 text-xs text-rose-700">{codeError}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-rule-rationale">Prior-Authorization Rationale Template</Label>
                    <Textarea
                      id="edit-rule-rationale"
                      className="min-h-[64px] text-xs"
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* JsonLogic Clinical Rule Expression Editor */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Code2 className="h-4 w-4 text-primary" />
                        JsonLogic Clinical Threshold Expression
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Evaluated live against unified patient answers, demographics, and EHR labs.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <Tabs
                    value={logicTab}
                    onValueChange={(v) => setLogicTab(v as "visual" | "raw")}
                  >
                    <TabsList>
                      <TabsTrigger value="visual">Visual Condition Builder</TabsTrigger>
                      <TabsTrigger value="raw">Raw JsonLogic AST</TabsTrigger>
                    </TabsList>

                    <TabsContent value="visual" className="space-y-3">
                      {!visualModel ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 flex items-center justify-between gap-3">
                          <span>
                            This rule uses nested compound groups (e.g., nested AND/OR branches).
                            Edit it in the <strong>Raw JsonLogic AST</strong> tab for full
                            precision.
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLogicTab("raw")}
                          >
                            Open Raw AST
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2.5 rounded-md border border-border bg-secondary/20 p-3.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground">Trigger pathway when</span>
                              <select
                                aria-label="Logic combinator"
                                className="h-7 rounded-md border border-input bg-card px-2 font-medium text-xs"
                                value={visualModel.combinator}
                                onChange={(e) =>
                                  handleVisualChange({
                                    ...visualModel,
                                    combinator: e.target.value as LogicCombinator,
                                  })
                                }
                              >
                                <option value="and">ALL conditions match (AND)</option>
                                <option value="or">ANY condition matches (OR)</option>
                              </select>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleVisualChange({
                                  ...visualModel,
                                  conditions: [
                                    ...visualModel.conditions,
                                    {
                                      id: `cond-${Date.now()}`,
                                      variable: "derived.age",
                                      operator: ">=",
                                      value: "50",
                                    },
                                  ],
                                })
                              }
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add Condition
                            </Button>
                          </div>

                          <div className="space-y-2">
                            {visualModel.conditions.map((cond, idx) => (
                              <div
                                key={cond.id}
                                className="grid grid-cols-12 gap-2 items-center"
                              >
                                <select
                                  aria-label={`Condition ${idx + 1} variable`}
                                  className="col-span-6 h-8 rounded-md border border-input bg-card px-2 font-mono text-xs"
                                  value={cond.variable}
                                  onChange={(e) => {
                                    const next = visualModel.conditions.map((c) =>
                                      c.id === cond.id ? { ...c, variable: e.target.value } : c,
                                    );
                                    handleVisualChange({ ...visualModel, conditions: next });
                                  }}
                                >
                                  {!variableOptions.some((o) => o.value === cond.variable) && (
                                    <option value={cond.variable}>{cond.variable}</option>
                                  )}
                                  {variableOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>

                                <select
                                  aria-label={`Condition ${idx + 1} operator`}
                                  className="col-span-2 h-8 rounded-md border border-input bg-card px-2 font-mono text-xs"
                                  value={cond.operator}
                                  onChange={(e) => {
                                    const next = visualModel.conditions.map((c) =>
                                      c.id === cond.id
                                        ? { ...c, operator: e.target.value as LogicOperator }
                                        : c,
                                    );
                                    handleVisualChange({ ...visualModel, conditions: next });
                                  }}
                                >
                                  <option value=">=">&gt;=</option>
                                  <option value="<=">&lt;=</option>
                                  <option value=">">&gt;</option>
                                  <option value="<">&lt;</option>
                                  <option value="==">==</option>
                                  <option value="!=">!=</option>
                                  <option value="in">in</option>
                                </select>

                                <Input
                                  aria-label={`Condition ${idx + 1} value`}
                                  className="col-span-3 h-8 font-mono text-xs"
                                  value={cond.value}
                                  onChange={(e) => {
                                    const next = visualModel.conditions.map((c) =>
                                      c.id === cond.id ? { ...c, value: e.target.value } : c,
                                    );
                                    handleVisualChange({ ...visualModel, conditions: next });
                                  }}
                                />

                                <div className="col-span-1 flex justify-end">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    disabled={visualModel.conditions.length <= 1}
                                    onClick={() =>
                                      handleVisualChange({
                                        ...visualModel,
                                        conditions: visualModel.conditions.filter(
                                          (c) => c.id !== cond.id,
                                        ),
                                      })
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="raw" className="space-y-2">
                      <Textarea
                        id="raw-jsonlogic-editor"
                        className="font-mono text-xs min-h-[190px] leading-relaxed"
                        value={rawJson}
                        onChange={(e) => handleRawJsonChange(e.target.value)}
                      />
                      {jsonError && <p className="text-xs text-rose-700">{jsonError}</p>}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              {/* Live Synthetic Dry-Run Sandbox & Version Audit Trail */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Synthetic Dry-Run Sandbox
                    </CardTitle>
                    <CardDescription>
                      Test draft JsonLogic against synthetic profiles before publishing (zero PHI).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="synthetic-preset-select">Synthetic Profile Preset</Label>
                      <select
                        id="synthetic-preset-select"
                        className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
                        value={presetId}
                        onChange={(e) => {
                          const next = SYNTHETIC_DRY_RUN_PRESETS.find((p) => p.id === e.target.value);
                          if (!next) return;
                          setPresetId(next.id);
                          setDryRunDob(next.dob);
                          setDryRunSex(next.sex_at_birth);
                          setDryRunAnswersJson(JSON.stringify(next.answers, null, 2));
                          setDryRunResult(null);
                        }}
                      >
                        {SYNTHETIC_DRY_RUN_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="dry-run-dob">Synthetic DOB</Label>
                        <Input
                          id="dry-run-dob"
                          className="h-8 font-mono text-xs"
                          value={dryRunDob}
                          onChange={(e) => setDryRunDob(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="dry-run-sex">Sex at Birth</Label>
                        <select
                          id="dry-run-sex"
                          className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
                          value={dryRunSex}
                          onChange={(e) => setDryRunSex(e.target.value as "Female" | "Male")}
                        >
                          <option value="Female">Female</option>
                          <option value="Male">Male</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="dry-run-answers">Synthetic Answers &amp; Labs (JSON)</Label>
                      <Textarea
                        id="dry-run-answers"
                        className="font-mono text-[11px] min-h-[100px]"
                        value={dryRunAnswersJson}
                        onChange={(e) => setDryRunAnswersJson(e.target.value)}
                      />
                    </div>

                    <Button
                      id="run-dry-run-button"
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={dryRunning || Boolean(jsonError)}
                      onClick={() => void handleDryRun()}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {dryRunning ? "Evaluating..." : "Run Synthetic Evaluation"}
                    </Button>

                    {dryRunResult && (
                      <div
                        className={cn(
                          "rounded-md border p-3 text-xs space-y-1",
                          dryRunResult.matched
                            ? "border-teal-200 bg-teal-50 text-teal-950"
                            : "border-slate-200 bg-slate-50 text-slate-800",
                        )}
                      >
                        <div className="flex items-center gap-1.5 font-semibold">
                          {dryRunResult.matched ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-teal-700" />
                              PATHWAY TRIGGERED
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 text-slate-500" />
                              NOT TRIGGERED
                            </>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          Derived age: {String(dryRunResult.derived_metrics.age)}
                          {dryRunResult.calculated_score !== null &&
                            ` · Score: ${dryRunResult.calculated_score}`}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-4 w-4 text-primary" />
                      Version Snapshot History
                    </CardTitle>
                    <CardDescription>
                      Immutable HIPAA audit_logs trail for {selectedRule.rule_code}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {ruleHistory.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4">
                        No admin edits recorded yet since initial seed (v{selectedRule.version}).
                      </p>
                    ) : (
                      <div className="divide-y divide-border max-h-[250px] overflow-y-auto">
                        {ruleHistory.map((entry) => (
                          <div key={entry.id} className="py-2.5 text-xs space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-medium text-foreground">
                                {entry.action}
                              </span>
                              <Badge variant="outline" className="font-mono text-[10px]">
                                v{String(entry.metadata.new_version ?? "?")}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                              <span className="font-mono">{entry.actor_id}</span>
                              <span>{new Date(entry.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
