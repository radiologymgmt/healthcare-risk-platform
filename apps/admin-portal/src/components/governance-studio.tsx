"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Code2,
  DatabaseBackup,
  History,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sliders,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: "ADMIN" | "PROVIDER" | "COORDINATOR" | "AUDITOR";
  npi_number: string | null;
  specialty: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

interface AcceptedPayer {
  id: string;
  payer_code: string;
  stedi_trading_partner_id: string;
  payer_name: string;
  acceptance_status: "IN_NETWORK" | "OUT_OF_NETWORK_ACCEPTED" | "NOT_ACCEPTED";
  accepted_plan_types: string[];
  excluded_plan_keywords: string[];
  requires_pcp_referral: boolean;
  prior_auth_modalities: string[];
  self_pay_available: boolean;
  patient_guidance_note: string | null;
  is_active: boolean;
  sort_order: number;
}

interface PlatformSetting {
  setting_key: string;
  category: string;
  label: string;
  description: string | null;
  value_json: Record<string, unknown>;
  version: number;
  updated_by: string;
  updated_at: string;
}

interface ConfigSnapshot {
  id: string;
  label: string;
  notes: string | null;
  trigger_type: "MANUAL" | "AUTO_PRE_RESTORE" | "AUTO_SEED";
  created_by: string;
  created_at: string;
  questions_count: number;
  rules_count: number;
  payers_count: number;
  settings_count: number;
}

interface SnapshotDiff {
  snapshot_id: string;
  label: string;
  diff: Record<string, { added: number; removed: number; modified: number }>;
}

type GovTab = "users" | "payers" | "settings" | "snapshots";

export function GovernanceStudio() {
  const [activeTab, setActiveTab] = useState<GovTab>("users");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Data
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [payers, setPayers] = useState<AcceptedPayer[]>([]);
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [snapshots, setSnapshots] = useState<ConfigSnapshot[]>([]);

  // Tab 1: Create User form
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<AdminUser["role"]>("PROVIDER");
  const [newUserNpi, setNewUserNpi] = useState("");
  const [newUserSpecialty, setNewUserSpecialty] = useState("");

  // Tab 2: Add Payer form
  const [showAddPayer, setShowAddPayer] = useState(false);
  const [newPayerCode, setNewPayerCode] = useState("");
  const [newPayerStediId, setNewPayerStediId] = useState("");
  const [newPayerName, setNewPayerName] = useState("");
  const [newPayerStatus, setNewPayerStatus] =
    useState<AcceptedPayer["acceptance_status"]>("IN_NETWORK");
  const [newPayerNote, setNewPayerNote] = useState("");

  // Tab 3: Settings & Light-Code Studio
  const [selectedSettingKey, setSelectedSettingKey] = useState<string>("patient_release_consent");
  const [settingJsonDraft, setSettingJsonDraft] = useState<string>("{}");

  // Tab 4: Restore Points
  const [snapLabel, setSnapLabel] = useState("");
  const [snapNotes, setSnapNotes] = useState("");
  const [diffPreview, setDiffPreview] = useState<SnapshotDiff | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [uRes, pRes, sRes, snapRes] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/payers", { cache: "no-store" }),
        fetch("/api/admin/settings", { cache: "no-store" }),
        fetch("/api/admin/snapshots", { cache: "no-store" }),
      ]);
      if (uRes.ok) {
        const d = (await uRes.json()) as { users?: AdminUser[] };
        setUsers(d.users ?? []);
      }
      if (pRes.ok) {
        const d = (await pRes.json()) as { payers?: AcceptedPayer[] };
        setPayers(d.payers ?? []);
      }
      if (sRes.ok) {
        const d = (await sRes.json()) as { settings?: PlatformSetting[] };
        const list = d.settings ?? [];
        setSettings(list);
        const current = list.find((s) => s.setting_key === selectedSettingKey) ?? list[0];
        if (current) {
          setSelectedSettingKey(current.setting_key);
          setSettingJsonDraft(JSON.stringify(current.value_json, null, 2));
        }
      }
      if (snapRes.ok) {
        const d = (await snapRes.json()) as { snapshots?: ConfigSnapshot[] };
        setSnapshots(d.snapshots ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load governance data");
    } finally {
      setLoading(false);
    }
  }, [selectedSettingKey]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function selectSetting(s: PlatformSetting) {
    setSelectedSettingKey(s.setting_key);
    setSettingJsonDraft(JSON.stringify(s.value_json, null, 2));
    setError(null);
  }

  // ---- Tab 1 Actions ----
  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: newUserEmail.trim(),
          full_name: newUserName.trim(),
          role: newUserRole,
          npi_number: newUserNpi.trim() || null,
          specialty: newUserSpecialty.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create user");
      setNewUserEmail("");
      setNewUserName("");
      setNewUserNpi("");
      setNewUserSpecialty("");
      setToast("User account created and recorded in HIPAA audit log.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "User creation failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateUser(id: string, patch: Partial<AdminUser>) {
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update user");
      setToast("User permissions updated.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "User update failed");
    } finally {
      setBusy(false);
    }
  }

  // ---- Tab 2 Actions ----
  async function handleCreatePayer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch("/api/admin/payers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payer_code: newPayerCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
          stedi_trading_partner_id: newPayerStediId.trim(),
          payer_name: newPayerName.trim(),
          acceptance_status: newPayerStatus,
          patient_guidance_note: newPayerNote.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to add payer");
      setNewPayerCode("");
      setNewPayerStediId("");
      setNewPayerName("");
      setNewPayerNote("");
      setShowAddPayer(false);
      setToast("Accepted payer added and immediately live in Patient Intake.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add payer");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdatePayer(id: string, patch: Partial<AcceptedPayer>) {
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch(`/api/admin/payers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update payer");
      setToast("Payer network acceptance updated live.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update payer");
    } finally {
      setBusy(false);
    }
  }

  // ---- Tab 3 Actions ----
  async function handleSaveSetting() {
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(settingJsonDraft) as Record<string, unknown>;
      } catch {
        throw new Error("Invalid JSON syntax. Please check commas, quotes, and braces.");
      }
      const res = await fetch(`/api/admin/settings/${selectedSettingKey}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value_json: parsed }),
      });
      const data = (await res.json()) as { setting?: PlatformSetting; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save setting");
      setToast(
        `Saved '${selectedSettingKey}' (now v${data.setting?.version ?? "?"}) directly to PostgreSQL.`,
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save setting");
    } finally {
      setBusy(false);
    }
  }

  // ---- Tab 4 Actions ----
  async function handleCreateSnapshot(e: React.FormEvent) {
    e.preventDefault();
    if (!snapLabel.trim()) return;
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch("/api/admin/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: snapLabel.trim(), notes: snapNotes.trim() || undefined }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create restore point");
      setSnapLabel("");
      setSnapNotes("");
      setToast("Configuration restore point created cleanly.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create restore point");
    } finally {
      setBusy(false);
    }
  }

  async function handlePreviewDiff(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/snapshots/${id}/diff`, { cache: "no-store" });
      const data = (await res.json()) as SnapshotDiff & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to compute diff");
      setDiffPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compute diff");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreSnapshot(snap: ConfigSnapshot) {
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch(`/api/admin/snapshots/${snap.id}/restore`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Restore failed");
      setDiffPreview(null);
      setToast(
        `Atomically restored '${snap.label}' (an automatic safety backup of the prior state was also saved).`,
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }

  const activeSetting = settings.find((s) => s.setting_key === selectedSettingKey) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Enterprise Governance, Users, Payers &amp; Restore Points
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage RBAC accounts, RadManagement LLC accepted insurance plans, live DB-backed
            portal/light-code settings, and one-click configuration restore points without code deploys.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadAll()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {(
          [
            { id: "users", label: `Users & Access (${users.length})`, icon: Users },
            { id: "payers", label: `Accepted Payers (${payers.length})`, icon: Building2 },
            { id: "settings", label: `Portal & Light-Code Studio (${settings.length})`, icon: Code2 },
            { id: "snapshots", label: `Restore Points (${snapshots.length})`, icon: DatabaseBackup },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setError(null);
              }}
              className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-card text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-700 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {toast && (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs text-teal-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-teal-700 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 1: USERS & RBAC DIRECTORY                                     */}
      {/* ================================================================= */}
      {activeTab === "users" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <Card className="lg:col-span-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserPlus className="h-4 w-4 text-primary" />
                Create Platform User
              </CardTitle>
              <CardDescription>
                Add clinical admins, ordering providers, imaging coordinators, or HIPAA auditors.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleCreateUser(e)} className="space-y-3">
                <label className="block space-y-1 text-xs font-medium">
                  <span>Full Name *</span>
                  <input
                    required
                    placeholder="e.g., Dr. Marcus Reed, MD"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs"
                  />
                </label>
                <label className="block space-y-1 text-xs font-medium">
                  <span>Organization Email *</span>
                  <input
                    required
                    type="email"
                    placeholder="m.reed@radmgmt.org"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs"
                  />
                </label>
                <label className="block space-y-1 text-xs font-medium">
                  <span>RBAC Role *</span>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as AdminUser["role"])}
                    className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs"
                  >
                    <option value="PROVIDER">PROVIDER (Workqueue, Orders &amp; Clinical PDFs)</option>
                    <option value="ADMIN">ADMIN (Full Configuration &amp; Governance)</option>
                    <option value="COORDINATOR">COORDINATOR (Scheduling &amp; Outreach)</option>
                    <option value="AUDITOR">AUDITOR (Read-Only Compliance)</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1 text-xs font-medium">
                    <span>NPI Number</span>
                    <input
                      placeholder="10-digit NPI"
                      value={newUserNpi}
                      onChange={(e) => setNewUserNpi(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs font-mono"
                    />
                  </label>
                  <label className="block space-y-1 text-xs font-medium">
                    <span>Specialty</span>
                    <input
                      placeholder="Radiology"
                      value={newUserSpecialty}
                      onChange={(e) => setNewUserSpecialty(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs"
                    />
                  </label>
                </div>
                <Button type="submit" size="sm" className="w-full" disabled={busy}>
                  <Plus className="h-3.5 w-3.5" />
                  Create User Account
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="lg:col-span-8">
            <CardHeader>
              <CardTitle className="text-sm">Active &amp; Provisioned Users</CardTitle>
              <CardDescription>
                Role changes and account suspensions are written immediately to immutable HIPAA
                audit_logs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="rounded-lg border border-border p-3.5 flex flex-wrap items-center justify-between gap-3 bg-card"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{u.full_name}</span>
                      <Badge variant={u.is_active ? "teal" : "outline"}>{u.role}</Badge>
                      {!u.is_active && <Badge variant="acute">SUSPENDED</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      {u.email}
                      {u.npi_number ? ` · NPI ${u.npi_number}` : ""}
                      {u.specialty ? ` · ${u.specialty}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Change role for ${u.full_name}`}
                      disabled={busy}
                      value={u.role}
                      onChange={(e) =>
                        void handleUpdateUser(u.id, { role: e.target.value as AdminUser["role"] })
                      }
                      className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="PROVIDER">PROVIDER</option>
                      <option value="COORDINATOR">COORDINATOR</option>
                      <option value="AUDITOR">AUDITOR</option>
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handleUpdateUser(u.id, { is_active: !u.is_active })}
                    >
                      {u.is_active ? "Suspend" : "Reactivate"}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: ORGANIZATION ACCEPTED PAYERS & STEDI COVERAGE RULES        */}
      {/* ================================================================= */}
      {activeTab === "payers" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground max-w-2xl">
              Controls Layer 1 of the <strong>2-Layer Insurance Acceptance Engine</strong>. Patient
              Intake checks this registry alongside live Stedi X12 270/271 benefit verification to
              tell patients whether RadManagement LLC is In-Network, requires a referral, or offers
              transparent self-pay.
            </p>
            <Button size="sm" onClick={() => setShowAddPayer((v) => !v)}>
              <Plus className="h-3.5 w-3.5" />
              {showAddPayer ? "Close Form" : "Add Accepted Payer"}
            </Button>
          </div>

          {showAddPayer && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Register Insurance Payer</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => void handleCreatePayer(e)}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3"
                >
                  <input
                    required
                    placeholder="Payer Code (e.g., HUMANA_61101)"
                    value={newPayerCode}
                    onChange={(e) => setNewPayerCode(e.target.value)}
                    className="h-9 rounded-md border border-input px-3 text-xs font-mono"
                  />
                  <input
                    required
                    placeholder="Stedi Trading Partner ID (e.g., 61101)"
                    value={newPayerStediId}
                    onChange={(e) => setNewPayerStediId(e.target.value)}
                    className="h-9 rounded-md border border-input px-3 text-xs font-mono"
                  />
                  <input
                    required
                    placeholder="Payer Display Name"
                    value={newPayerName}
                    onChange={(e) => setNewPayerName(e.target.value)}
                    className="h-9 rounded-md border border-input px-3 text-xs"
                  />
                  <select
                    value={newPayerStatus}
                    onChange={(e) =>
                      setNewPayerStatus(e.target.value as AcceptedPayer["acceptance_status"])
                    }
                    className="h-9 rounded-md border border-input px-3 text-xs"
                  >
                    <option value="IN_NETWORK">IN_NETWORK (Accepted)</option>
                    <option value="OUT_OF_NETWORK_ACCEPTED">OUT_OF_NETWORK_ACCEPTED</option>
                    <option value="NOT_ACCEPTED">NOT_ACCEPTED (Self-Pay Only)</option>
                  </select>
                  <input
                    placeholder="Patient-facing coverage guidance note..."
                    value={newPayerNote}
                    onChange={(e) => setNewPayerNote(e.target.value)}
                    className="md:col-span-3 h-9 rounded-md border border-input px-3 text-xs"
                  />
                  <Button type="submit" size="sm" disabled={busy}>
                    Save Payer
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {payers.map((p) => (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">{p.payer_name}</CardTitle>
                      <CardDescription className="font-mono text-[11px]">
                        {p.payer_code} &middot; Stedi ID: {p.stedi_trading_partner_id}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        p.acceptance_status === "IN_NETWORK"
                          ? "teal"
                          : p.acceptance_status === "OUT_OF_NETWORK_ACCEPTED"
                            ? "high"
                            : "acute"
                      }
                    >
                      {p.acceptance_status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {p.patient_guidance_note && (
                    <p className="text-muted-foreground leading-relaxed">
                      {p.patient_guidance_note}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border">
                    <select
                      aria-label={`Acceptance status for ${p.payer_name}`}
                      disabled={busy}
                      value={p.acceptance_status}
                      onChange={(e) =>
                        void handleUpdatePayer(p.id, {
                          acceptance_status: e.target.value as AcceptedPayer["acceptance_status"],
                        })
                      }
                      className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                    >
                      <option value="IN_NETWORK">In-Network</option>
                      <option value="OUT_OF_NETWORK_ACCEPTED">Out-of-Network (Self-Pay)</option>
                      <option value="NOT_ACCEPTED">Not Accepted (Self-Pay Only)</option>
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.requires_pcp_referral}
                        onChange={(e) =>
                          void handleUpdatePayer(p.id, { requires_pcp_referral: e.target.checked })
                        }
                      />
                      PCP Referral
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.self_pay_available}
                        onChange={(e) =>
                          void handleUpdatePayer(p.id, { self_pay_available: e.target.checked })
                        }
                      />
                      Self-Pay Option
                    </label>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: PORTAL COPY, CONSENT & SANDBOXED LIGHT-CODE STUDIO         */}
      {/* ================================================================= */}
      {activeTab === "settings" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <aside className="lg:col-span-4 space-y-2">
            {settings.map((s) => (
              <button
                key={s.setting_key}
                type="button"
                onClick={() => selectSetting(s)}
                className={`w-full text-left rounded-xl border p-3.5 transition-colors cursor-pointer space-y-1 ${
                  selectedSettingKey === s.setting_key
                    ? "border-primary bg-accent/40 shadow-xs"
                    : "border-border bg-card hover:bg-secondary/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{s.label}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    v{s.version}
                  </Badge>
                </div>
                <p className="text-[11px] font-mono text-muted-foreground">{s.setting_key}</p>
              </button>
            ))}
          </aside>

          <Card className="lg:col-span-8">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sliders className="h-4 w-4 text-primary" />
                    {activeSetting?.label ?? "Platform Setting"}
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    {activeSetting?.description}
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => void handleSaveSetting()} disabled={busy}>
                  <Save className="h-3.5 w-3.5" />
                  Save to Database (v{(activeSetting?.version ?? 0) + 1})
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-secondary/40 border border-border px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                <span>
                  Edits update PostgreSQL live with automatic version bumping and HIPAA audit
                  logging. Custom metric formulas are validated as safe declarative JsonLogic AST
                  (zero arbitrary code execution).
                </span>
              </div>
              <textarea
                aria-label="Setting JSON editor"
                rows={18}
                value={settingJsonDraft}
                onChange={(e) => setSettingJsonDraft(e.target.value)}
                className="w-full rounded-lg border border-input bg-slate-950 text-teal-200 font-mono text-xs p-4 leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
                spellCheck={false}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 4: IN-APP DATABASE CONFIGURATION RESTORE POINTS               */}
      {/* ================================================================= */}
      {activeTab === "snapshots" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <Card className="lg:col-span-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <DatabaseBackup className="h-4 w-4 text-primary" />
                Create Restore Point
              </CardTitle>
              <CardDescription>
                Captures an atomic JSONB snapshot of all Questions, Clinical Rules, Accepted Payers,
                Consent Releases, and Light-Code Settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleCreateSnapshot(e)} className="space-y-3">
                <label className="block space-y-1 text-xs font-medium">
                  <span>Restore Point Label *</span>
                  <input
                    required
                    placeholder="e.g., Pre-Q4 Breast Screening Update"
                    value={snapLabel}
                    onChange={(e) => setSnapLabel(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs"
                  />
                </label>
                <label className="block space-y-1 text-xs font-medium">
                  <span>Release Notes</span>
                  <textarea
                    rows={3}
                    placeholder="What changed before this checkpoint..."
                    value={snapNotes}
                    onChange={(e) => setSnapNotes(e.target.value)}
                    className="w-full rounded-md border border-input bg-card p-2.5 text-xs"
                  />
                </label>
                <Button type="submit" size="sm" className="w-full" disabled={busy}>
                  <Save className="h-3.5 w-3.5" />
                  Save Restore Point Now
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="lg:col-span-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-primary" />
                Available Configuration Restore Points
              </CardTitle>
              <CardDescription>
                Restoring automatically creates a pre-restore safety backup first and applies all
                tables inside a single PostgreSQL transaction.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {diffPreview && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2 text-xs text-amber-950">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      Live Diff Preview vs. &ldquo;{diffPreview.label}&rdquo;
                    </span>
                    <button
                      type="button"
                      onClick={() => setDiffPreview(null)}
                      className="text-[11px] underline cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                    {Object.entries(diffPreview.diff).map(([tbl, d]) => (
                      <div key={tbl} className="rounded bg-white border border-amber-200 p-2">
                        <p className="font-semibold text-foreground">{tbl}</p>
                        <p className="text-muted-foreground">
                          +{d.added} / ~{d.modified} / -{d.removed}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="rounded-xl border border-border p-4 flex flex-wrap items-start justify-between gap-3 bg-card"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{snap.label}</span>
                      <Badge variant={snap.trigger_type === "MANUAL" ? "teal" : "outline"}>
                        {snap.trigger_type}
                      </Badge>
                    </div>
                    {snap.notes && <p className="text-xs text-muted-foreground">{snap.notes}</p>}
                    <p className="text-[11px] font-mono text-muted-foreground">
                      {new Date(snap.created_at).toLocaleString()} &middot; by {snap.created_by}{" "}
                      &middot; {snap.questions_count} questions &middot; {snap.rules_count} rules
                      &middot; {snap.payers_count} payers &middot; {snap.settings_count} settings
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handlePreviewDiff(snap.id)}
                    >
                      Preview Diff
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleRestoreSnapshot(snap)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
