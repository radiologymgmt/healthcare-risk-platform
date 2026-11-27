"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileText,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AnalyticsPayload {
  kpis: {
    total_sessions: number;
    total_triggered_pathways: number;
    open_workqueue_items: number;
    stat_triage_count: number;
    orders_approved_count: number;
    ai_parsed_answers_count: number;
    avg_ai_confidence: number | null;
  };
  by_specialty: Array<{ specialty: string; triggered_count: number; ordered_count: number }>;
  by_acuity: Array<{ acuity_level: string; count: number }>;
  by_channel: Array<{ channel: string; count: number }>;
  workqueue_funnel: Array<{ status: string; count: number }>;
  top_cpt_codes: Array<{ cpt_code: string; count: number }>;
  recent_sessions: Array<{
    session_id: string;
    channel: string;
    status: string;
    triggered_count: number;
    started_at: string;
  }>;
}

export function AnalyticsAndPdf() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analytics", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch analytics (${res.status})`);
      const json = (await res.json()) as AnalyticsPayload;
      setData(json);
      setSelectedSessionId((prev) => prev || json.recent_sessions[0]?.session_id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load executive analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  async function handleExportPdf(
    pdfType: "executive_overview" | "patient_summary" | "prior_auth_packet",
  ) {
    setDownloading(pdfType);
    setDownloadMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pdf/${pdfType}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          pdfType === "executive_overview" || !selectedSessionId
            ? {}
            : { session_id: selectedSessionId },
        ),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "PDF generation failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pdfType}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDownloadMsg(`Generated and downloaded ${pdfType}.pdf (${(blob.size / 1024).toFixed(1)} KB).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF export failed");
    } finally {
      setDownloading(null);
    }
  }

  const maxSpecialtyCount = Math.max(
    1,
    ...(data?.by_specialty.map((s) => s.triggered_count) ?? [1]),
  );
  const maxCptCount = Math.max(1, ...(data?.top_cpt_codes.map((c) => c.count) ?? [1]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Executive Analytics &amp; Headless PDF Engine
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time screening utilization, specialty conversion, and branded PDF export for
            Patient Summaries, Prior-Auth Packets, and Executive Overviews.
          </p>
        </div>

        <Button size="sm" variant="outline" onClick={() => void fetchAnalytics()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Metrics
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-700" />
          <span>{error}</span>
        </div>
      )}

      {downloadMsg && (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs text-teal-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-teal-700" />
          <span>{downloadMsg}</span>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Sessions</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {data?.kpis.total_sessions ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Triggered Pathways</CardDescription>
            <CardTitle className="text-2xl font-mono text-primary">
              {data?.kpis.total_triggered_pathways ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>STAT Acute Flags</CardDescription>
            <CardTitle className="text-2xl font-mono text-rose-700">
              {data?.kpis.stat_triage_count ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Orders Approved</CardDescription>
            <CardTitle className="text-2xl font-mono text-teal-700">
              {data?.kpis.orders_approved_count ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" />
              Avg AI Confidence
            </CardDescription>
            <CardTitle className="text-2xl font-mono">
              {data?.kpis.avg_ai_confidence !== null && data?.kpis.avg_ai_confidence !== undefined
                ? `${Math.round(data.kpis.avg_ai_confidence * 100)}%`
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Triggered Pathways &amp; Order Conversion by Specialty
            </CardTitle>
            <CardDescription>
              Live aggregation across all 54 clinical assessment models.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data || data.by_specialty.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No triggered pathways recorded yet. Evaluate a synthetic session to populate charts.
              </p>
            ) : (
              data.by_specialty.map((row) => (
                <div key={row.specialty} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{row.specialty}</span>
                    <span className="font-mono text-muted-foreground">
                      {row.triggered_count} triggered &middot; {row.ordered_count} ordered
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden flex">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${(row.triggered_count / maxSpecialtyCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Top Triggered CPT Procedure Codes
            </CardTitle>
            <CardDescription>
              Downstream preventive imaging, genetic panels, and consult demand.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {!data || data.top_cpt_codes.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No CPT procedure volume recorded yet.
              </p>
            ) : (
              data.top_cpt_codes.map((c) => (
                <div key={c.cpt_code} className="flex items-center gap-3 text-xs">
                  <Badge variant="teal" className="font-mono w-16 justify-center">
                    {c.cpt_code}
                  </Badge>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-slate-700"
                      style={{ width: `${(c.count / maxCptCount) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono w-8 text-right">{c.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Headless PDF Export Studio */}
      <Card>
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Headless PDF Export Studio
          </CardTitle>
          <CardDescription>
            Renders branded clinical PDFs server-side via headless Chromium and logs every export to
            immutable HIPAA audit_logs.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="pdf-session-select" className="text-xs font-medium text-foreground">
              Target Assessment Session (for Patient Summary &amp; Prior-Auth Packet):
            </label>
            <select
              id="pdf-session-select"
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="h-8 rounded-md border border-input bg-card px-2.5 font-mono text-xs min-w-[280px]"
            >
              {data?.recent_sessions.length ? (
                data.recent_sessions.map((s) => (
                  <option key={s.session_id} value={s.session_id}>
                    {s.session_id.slice(0, 8)} · {s.channel} · {s.triggered_count} pathways
                  </option>
                ))
              ) : (
                <option value="">No sessions available yet</option>
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border p-4 space-y-3 bg-secondary/20">
              <div>
                <p className="text-sm font-semibold">Executive Overview PDF</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Population screening KPIs, specialty conversion, and top CPT volume.
                </p>
              </div>
              <Button
                id="export-executive-pdf-btn"
                size="sm"
                variant="outline"
                className="w-full"
                disabled={downloading !== null}
                onClick={() => void handleExportPdf("executive_overview")}
              >
                <Download className="h-3.5 w-3.5" />
                {downloading === "executive_overview"
                  ? "Rendering PDF..."
                  : "Download Executive PDF"}
              </Button>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3 bg-secondary/20">
              <div>
                <p className="text-sm font-semibold">Patient Risk Summary PDF</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Plain-English preventive recommendations for the selected patient session.
                </p>
              </div>
              <Button
                id="export-patient-pdf-btn"
                size="sm"
                variant="outline"
                className="w-full"
                disabled={downloading !== null || !selectedSessionId}
                onClick={() => void handleExportPdf("patient_summary")}
              >
                <Download className="h-3.5 w-3.5" />
                {downloading === "patient_summary"
                  ? "Rendering PDF..."
                  : "Download Patient Summary"}
              </Button>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3 bg-secondary/20">
              <div>
                <p className="text-sm font-semibold">Prior-Auth Packet PDF</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CPT/ICD-10 medical necessity rationale + verbatim clinical document excerpts.
                </p>
              </div>
              <Button
                id="export-prior-auth-pdf-btn"
                size="sm"
                className="w-full"
                disabled={downloading !== null || !selectedSessionId}
                onClick={() => void handleExportPdf("prior_auth_packet")}
              >
                <Download className="h-3.5 w-3.5" />
                {downloading === "prior_auth_packet"
                  ? "Rendering PDF..."
                  : "Download Prior-Auth Packet"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
