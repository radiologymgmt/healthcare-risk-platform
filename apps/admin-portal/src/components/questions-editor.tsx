"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  GitBranch,
  HelpCircle,
  Plus,
  Save,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import type {
  DataSource,
  QuestionDto,
  QuestionInputType,
  SexAtBirth,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const DOMAIN_OPTIONS = [
  "Demographics",
  "Acute",
  "Oncology",
  "Pulmonology",
  "Urology",
  "OBGYN",
  "Cardio",
  "Neurology",
  "Sleep",
  "Bone",
  "MSK",
  "Hematology",
  "Hepatology",
  "Gastroenterology",
  "Endocrine",
  "Metabolic",
  "Behavioral",
];

const INPUT_TYPES: QuestionInputType[] = [
  "boolean",
  "number",
  "select",
  "date",
  "pedigree_array",
  "lab_numeric",
];

interface QuestionsApiResponse {
  questions_version_snapshot: number;
  total: number;
  domains: string[];
  questions: QuestionDto[];
}

export function QuestionsEditor() {
  const [questions, setQuestions] = useState<QuestionDto[]>([]);
  const [snapshotVersion, setSnapshotVersion] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  // Edit draft
  const [domain, setDomain] = useState("Demographics");
  const [labelPlain, setLabelPlain] = useState("");
  const [helperTooltip, setHelperTooltip] = useState("");
  const [inputType, setInputType] = useState<QuestionInputType>("boolean");
  const [dataSource, setDataSource] = useState<DataSource>("HYBRID");
  const [sortOrder, setSortOrder] = useState(100);
  const [isKnockoutGate, setIsKnockoutGate] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [optionsJson, setOptionsJson] = useState<Array<{ value: string; label: string }>>([]);
  const [sexCondition, setSexCondition] = useState<string>("");
  const [minAge, setMinAge] = useState<string>("");
  const [maxAge, setMaxAge] = useState<string>("");
  const [dependsOnJson, setDependsOnJson] = useState<string>("{}");

  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create Dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState({
    question_key: "",
    domain: "Oncology",
    label_plain_english: "",
    helper_tooltip: "",
    input_type: "boolean" as QuestionInputType,
    data_source: "PATIENT" as DataSource,
    is_knockout_gate: false,
    sort_order: 250,
  });

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/questions?include_inactive=true", { cache: "no-store" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Failed to load questions (${res.status})`);
      }
      const data = (await res.json()) as QuestionsApiResponse;
      setQuestions(data.questions);
      setSnapshotVersion(data.questions_version_snapshot);
      setSelectedId((prev) =>
        prev && data.questions.some((q) => q.id === prev)
          ? prev
          : (data.questions[0]?.id ?? null),
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load questions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const selectedQuestion = useMemo(
    () => questions.find((q) => q.id === selectedId) ?? null,
    [questions, selectedId],
  );

  useEffect(() => {
    if (!selectedQuestion) return;
    setDomain(selectedQuestion.domain);
    setLabelPlain(selectedQuestion.label_plain_english);
    setHelperTooltip(selectedQuestion.helper_tooltip ?? "");
    setInputType(selectedQuestion.input_type);
    setDataSource(selectedQuestion.data_source);
    setSortOrder(selectedQuestion.sort_order);
    setIsKnockoutGate(selectedQuestion.is_knockout_gate);
    setIsActive(selectedQuestion.is_active);
    setOptionsJson(
      (selectedQuestion.options_json ?? []).map((o) => ({
        value: String(o.value),
        label: o.label,
      })),
    );
    const cond = selectedQuestion.display_conditions ?? {};
    setSexCondition(typeof cond.sex_at_birth === "string" ? cond.sex_at_birth : "");
    setMinAge(typeof cond.min_age === "number" ? String(cond.min_age) : "");
    setMaxAge(typeof cond.max_age === "number" ? String(cond.max_age) : "");
    setDependsOnJson(cond.depends_on ? JSON.stringify(cond.depends_on, null, 2) : "{}");
    setBanner(null);
  }, [selectedQuestion]);

  const filteredQuestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return questions.filter((item) => {
      if (domainFilter && item.domain !== domainFilter) return false;
      if (sourceFilter && item.data_source !== sourceFilter) return false;
      if (!q) return true;
      return (
        item.question_key.toLowerCase().includes(q) ||
        item.label_plain_english.toLowerCase().includes(q) ||
        item.domain.toLowerCase().includes(q)
      );
    });
  }, [questions, search, domainFilter, sourceFilter]);

  async function handleSaveQuestion() {
    if (!selectedQuestion) return;
    setBanner(null);

    let parsedDepends: Record<string, unknown> | undefined;
    try {
      const obj = JSON.parse(dependsOnJson) as Record<string, unknown>;
      if (obj && typeof obj === "object" && Object.keys(obj).length > 0) {
        parsedDepends = obj;
      }
    } catch {
      setBanner({ type: "error", text: "Invalid JSON in depends_on branching condition." });
      return;
    }

    const display_conditions: Record<string, unknown> = {};
    if (sexCondition) display_conditions.sex_at_birth = sexCondition as SexAtBirth;
    if (minAge.trim() !== "") display_conditions.min_age = Number(minAge);
    if (maxAge.trim() !== "") display_conditions.max_age = Number(maxAge);
    if (parsedDepends) display_conditions.depends_on = parsedDepends;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/questions/${selectedQuestion.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain,
          label_plain_english: labelPlain,
          helper_tooltip: helperTooltip || null,
          input_type: inputType,
          options_json: inputType === "select" ? optionsJson : [],
          data_source: dataSource,
          is_knockout_gate: isKnockoutGate,
          display_conditions,
          sort_order: Number(sortOrder),
          is_active: isActive,
        }),
      });
      const data = (await res.json()) as { question?: QuestionDto; error?: string };
      if (!res.ok || !data.question) {
        throw new Error(data.error ?? "Failed to update question");
      }
      const updated = data.question;
      setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      setSnapshotVersion((v) => Math.max(v, updated.version));
      setBanner({
        type: "success",
        text: `Saved ${updated.question_key} (v${updated.version}). Updated across all dynamic questionnaires.`,
      });
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateQuestion(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...createDraft,
          question_key: createDraft.question_key.trim().toLowerCase(),
          helper_tooltip: createDraft.helper_tooltip.trim() || null,
          options_json: [],
          display_conditions: {},
          is_active: true,
        }),
      });
      const data = (await res.json()) as { question?: QuestionDto; error?: string };
      if (!res.ok || !data.question) {
        throw new Error(data.error ?? "Failed to create question");
      }
      setQuestions((prev) => [data.question!, ...prev]);
      setSelectedId(data.question.id);
      setCreateOpen(false);
      setCreateDraft({
        question_key: "",
        domain: "Oncology",
        label_plain_english: "",
        helper_tooltip: "",
        input_type: "boolean",
        data_source: "PATIENT",
        is_knockout_gate: false,
        sort_order: 250,
      });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create question");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Unified Question Registry Editor
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage shared Question IDs, plain-English tooltips, knockout gates, and demographic
            branching consumed by Web, Mobile, and EHR parsers.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
            <GitBranch className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">Registry Version</span>
            <Badge variant="teal" className="font-mono">
              v{snapshotVersion}
            </Badge>
            <span className="text-muted-foreground">&middot; {questions.length} items</span>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button id="create-question-button" size="sm">
                <Plus className="h-3.5 w-3.5" />
                New Question
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Shared Question to Registry</DialogTitle>
                <DialogDescription>
                  Create a normalized question_key available to all questionnaires and JsonLogic
                  rules.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => void handleCreateQuestion(e)} className="space-y-3">
                {createError && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                    {createError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="new-q-key">Question Key (snake_case)</Label>
                    <Input
                      id="new-q-key"
                      required
                      className="font-mono"
                      placeholder="has_radon_exposure"
                      value={createDraft.question_key}
                      onChange={(e) =>
                        setCreateDraft({ ...createDraft, question_key: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-q-domain">Domain</Label>
                    <select
                      id="new-q-domain"
                      className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                      value={createDraft.domain}
                      onChange={(e) => setCreateDraft({ ...createDraft, domain: e.target.value })}
                    >
                      {DOMAIN_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-q-label">Plain-English Label</Label>
                  <Input
                    id="new-q-label"
                    required
                    placeholder="Have you lived in a home with elevated radon gas?"
                    value={createDraft.label_plain_english}
                    onChange={(e) =>
                      setCreateDraft({ ...createDraft, label_plain_english: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-q-tooltip">Plain-English Helper Tooltip</Label>
                  <Textarea
                    id="new-q-tooltip"
                    className="min-h-[64px]"
                    value={createDraft.helper_tooltip}
                    onChange={(e) =>
                      setCreateDraft({ ...createDraft, helper_tooltip: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="new-q-input-type">Input Type</Label>
                    <select
                      id="new-q-input-type"
                      className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                      value={createDraft.input_type}
                      onChange={(e) =>
                        setCreateDraft({
                          ...createDraft,
                          input_type: e.target.value as QuestionInputType,
                        })
                      }
                    >
                      {INPUT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-q-source">Data Source</Label>
                    <select
                      id="new-q-source"
                      className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                      value={createDraft.data_source}
                      onChange={(e) =>
                        setCreateDraft({
                          ...createDraft,
                          data_source: e.target.value as DataSource,
                        })
                      }
                    >
                      <option value="PATIENT">PATIENT</option>
                      <option value="HYBRID">HYBRID</option>
                      <option value="EHR_LAB">EHR_LAB</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-q-sort">Sort Order</Label>
                    <Input
                      id="new-q-sort"
                      type="number"
                      value={createDraft.sort_order}
                      onChange={(e) =>
                        setCreateDraft({ ...createDraft, sort_order: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    id="new-q-knockout"
                    checked={createDraft.is_knockout_gate}
                    onCheckedChange={(v) =>
                      setCreateDraft({ ...createDraft, is_knockout_gate: v })
                    }
                  />
                  <Label htmlFor="new-q-knockout">Mark as Knockout Branching Gate</Label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create Question</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loadError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-center justify-between">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={() => void loadQuestions()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Question Registry List */}
        <Card className="lg:col-span-4 overflow-hidden">
          <div className="p-3.5 border-b border-border space-y-2.5 bg-secondary/25">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
              <Input
                id="questions-search-input"
                placeholder="Search question_key or plain-English text..."
                className="pl-8 h-8 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <select
                aria-label="Filter by domain"
                className="h-7 rounded-md border border-input bg-card px-2 text-[11px]"
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
              >
                <option value="">All Domains</option>
                {DOMAIN_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by data source"
                className="h-7 rounded-md border border-input bg-card px-2 text-[11px]"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="">All Sources</option>
                <option value="PATIENT">PATIENT</option>
                <option value="HYBRID">HYBRID</option>
                <option value="EHR_LAB">EHR_LAB</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-border max-h-[calc(100vh-230px)] overflow-y-auto">
            {loading && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Loading question registry...
              </div>
            )}
            {filteredQuestions.map((item) => {
              const selected = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "w-full text-left px-3.5 py-3 transition-colors hover:bg-secondary/50 cursor-pointer",
                    selected && "bg-accent/60 border-l-2 border-l-primary",
                    !item.is_active && "opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-foreground truncate">
                      {item.question_key}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.is_knockout_gate && (
                        <Badge variant="high" className="text-[10px] px-1.5 py-0 gap-0.5">
                          <Zap className="h-2.5 w-2.5" />
                          Gate
                        </Badge>
                      )}
                      <span className="font-mono text-[10px] text-muted-foreground">
                        v{item.version}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-foreground/80 mt-1 line-clamp-2">
                    {item.label_plain_english}
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px] text-muted-foreground">
                    <span>{item.domain}</span>
                    <span className="font-mono">
                      {item.data_source} &middot; {item.input_type}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Right Question Editor */}
        <div className="lg:col-span-8 space-y-4">
          {!selectedQuestion ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Select a question from the registry to configure its wording, tooltip, and branching
              rules.
            </Card>
          ) : (
            <>
              {banner && (
                <div
                  role="status"
                  className={cn(
                    "rounded-md border px-4 py-2.5 text-xs flex items-center gap-2",
                    banner.type === "success"
                      ? "border-teal-200 bg-teal-50 text-teal-900"
                      : "border-rose-200 bg-rose-50 text-rose-900",
                  )}
                >
                  {banner.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-teal-700" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-rose-700" />
                  )}
                  <span>{banner.text}</span>
                </div>
              )}

              {/* Live Patient Preview */}
              <Card className="bg-gradient-to-br from-card to-secondary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <Eye className="h-3.5 w-3.5 text-primary" />
                    Patient Intake Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{labelPlain || "Untitled question"}</p>
                  {helperTooltip && (
                    <div className="flex items-start gap-2 rounded-md border border-teal-200/80 bg-teal-50/70 px-3 py-2 text-xs text-teal-950">
                      <HelpCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-teal-700" />
                      <span>{helperTooltip}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Editor Form */}
              <Card>
                <CardHeader className="pb-4 border-b border-border flex-row items-center justify-between space-y-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {selectedQuestion.question_key}
                      </span>
                      <Badge variant="outline" className="font-mono">
                        v{selectedQuestion.version} &rarr; v{selectedQuestion.version + 1}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1">
                      Referenced in JsonLogic as{" "}
                      <code className="font-mono text-foreground">
                        answers.{selectedQuestion.question_key}
                      </code>
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="question-active-switch"
                        checked={isActive}
                        onCheckedChange={setIsActive}
                      />
                      <Label htmlFor="question-active-switch">
                        {isActive ? "Active" : "Inactive"}
                      </Label>
                    </div>
                    <Button
                      id="save-question-button"
                      size="sm"
                      disabled={saving}
                      onClick={() => void handleSaveQuestion()}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saving ? "Saving..." : "Save Question"}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="edit-q-label">Plain-English Question Label</Label>
                    <Textarea
                      id="edit-q-label"
                      className="min-h-[68px]"
                      value={labelPlain}
                      onChange={(e) => setLabelPlain(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-q-tooltip">Plain-English Helper Tooltip</Label>
                    <Textarea
                      id="edit-q-tooltip"
                      className="min-h-[68px] text-xs"
                      value={helperTooltip}
                      onChange={(e) => setHelperTooltip(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="edit-q-domain">Clinical Domain</Label>
                      <select
                        id="edit-q-domain"
                        className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                      >
                        {DOMAIN_OPTIONS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="edit-q-input-type">Input Type</Label>
                      <select
                        id="edit-q-input-type"
                        className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                        value={inputType}
                        onChange={(e) => setInputType(e.target.value as QuestionInputType)}
                      >
                        {INPUT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="edit-q-source">Data Source</Label>
                      <select
                        id="edit-q-source"
                        className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                        value={dataSource}
                        onChange={(e) => setDataSource(e.target.value as DataSource)}
                      >
                        <option value="PATIENT">PATIENT</option>
                        <option value="HYBRID">HYBRID</option>
                        <option value="EHR_LAB">EHR_LAB</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="edit-q-sort">Sort Order</Label>
                      <Input
                        id="edit-q-sort"
                        type="number"
                        value={sortOrder}
                        onChange={(e) => setSortOrder(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-border bg-secondary/20 px-3.5 py-2.5">
                    <div>
                      <p className="text-xs font-medium text-foreground">Knockout Branching Gate</p>
                      <p className="text-[11px] text-muted-foreground">
                        Promotes this question into the primary gateway triage set for dynamic
                        branching.
                      </p>
                    </div>
                    <Switch
                      id="edit-q-knockout"
                      checked={isKnockoutGate}
                      onCheckedChange={setIsKnockoutGate}
                    />
                  </div>

                  {inputType === "select" && (
                    <div className="space-y-2 rounded-md border border-border bg-secondary/20 p-3.5">
                      <div className="flex items-center justify-between">
                        <Label>Select Options (options_json)</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setOptionsJson([...optionsJson, { value: "", label: "" }])
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Option
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {optionsJson.map((opt, idx) => (
                          <div key={idx} className="grid grid-cols-11 gap-2 items-center">
                            <Input
                              placeholder="value"
                              className="col-span-4 h-8 font-mono text-xs"
                              value={opt.value}
                              onChange={(e) =>
                                setOptionsJson(
                                  optionsJson.map((o, i) =>
                                    i === idx ? { ...o, value: e.target.value } : o,
                                  ),
                                )
                              }
                            />
                            <Input
                              placeholder="Plain-English label"
                              className="col-span-6 h-8 text-xs"
                              value={opt.label}
                              onChange={(e) =>
                                setOptionsJson(
                                  optionsJson.map((o, i) =>
                                    i === idx ? { ...o, label: e.target.value } : o,
                                  ),
                                )
                              }
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="col-span-1 h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setOptionsJson(optionsJson.filter((_, i) => i !== idx))
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Demographic & Branching Display Conditions */}
                  <div className="space-y-3 rounded-md border border-border bg-secondary/20 p-3.5">
                    <p className="text-xs font-medium text-foreground">
                      Display &amp; Branching Conditions
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="cond-sex">Sex at Birth Filter</Label>
                        <select
                          id="cond-sex"
                          className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
                          value={sexCondition}
                          onChange={(e) => setSexCondition(e.target.value)}
                        >
                          <option value="">All Sexes</option>
                          <option value="Female">Female Only</option>
                          <option value="Male">Male Only</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="cond-min-age">Min Age</Label>
                        <Input
                          id="cond-min-age"
                          type="number"
                          placeholder="Any"
                          className="h-8 text-xs"
                          value={minAge}
                          onChange={(e) => setMinAge(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="cond-max-age">Max Age</Label>
                        <Input
                          id="cond-max-age"
                          type="number"
                          placeholder="Any"
                          className="h-8 text-xs"
                          value={maxAge}
                          onChange={(e) => setMaxAge(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cond-depends">Depends On (JSON Branching Map)</Label>
                      <Textarea
                        id="cond-depends"
                        className="font-mono text-xs min-h-[64px]"
                        value={dependsOnJson}
                        onChange={(e) => setDependsOnJson(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
