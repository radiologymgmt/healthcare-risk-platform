"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileSignature,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ManagedUser {
  id: string;
  email: string;
  full_name: string;
  role: "VIEWER" | "ADMIN" | "PROVIDER" | "COORDINATOR" | "AUDITOR";
  organization: string | null;
  npi_number: string | null;
  specialty: string | null;
  is_active: boolean;
  is_hardcoded_admin?: boolean;
  requires_demo_agreement?: boolean;
  has_password?: boolean;
  agreement_signed_at?: string | null;
  last_login_at?: string | null;
  created_by: string;
  created_at: string;
}

interface SignedAgreementRecord {
  id: string;
  email: string;
  full_name: string;
  organization: string | null;
  signed_date: string;
  agreement_version: string;
  agreements_accepted: string[];
  agreement_hash: string;
  ip_address: string | null;
  signed_at: string;
}

function generateStrongPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  let out = "RadM-";
  for (let i = 0; i < 10; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return out;
}

export function UserManagementPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [agreements, setAgreements] = useState<SignedAgreementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Search / filter
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  // Create form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<ManagedUser["role"]>("VIEWER");
  const [npiNumber, setNpiNumber] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [requiresAgreement, setRequiresAgreement] = useState(true);

  // Last created credentials banner (copy helper)
  const [issuedCreds, setIssuedCreds] = useState<{
    email: string;
    password: string;
    role: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Inline password reset
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [uRes, aRes] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/agreements", { cache: "no-store" }),
      ]);
      if (!uRes.ok) {
        const errBody = (await uRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? "Failed to load user directory.");
      }
      const uData = (await uRes.json()) as { users?: ManagedUser[] };
      setUsers(uData.users ?? []);

      if (aRes.ok) {
        const aData = (await aRes.json()) as { agreements?: SignedAgreementRecord[] };
        setAgreements(aData.agreements ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.organization ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setToast(null);
    setIssuedCreds(null);
    setCopied(false);
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: trimmedEmail,
          organization: organization.trim() || null,
          password: trimmedPassword,
          role,
          npi_number: npiNumber.trim() || null,
          specialty: specialty.trim() || null,
          requires_demo_agreement: requiresAgreement,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create user.");

      setIssuedCreds({ email: trimmedEmail, password: trimmedPassword, role });
      setFullName("");
      setEmail("");
      setOrganization("");
      setPassword("");
      setNpiNumber("");
      setSpecialty("");
      setToast(`User account created for ${trimmedEmail}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateUser(
    id: string,
    patch: Partial<ManagedUser> & { password?: string },
  ) {
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
      if (!res.ok) throw new Error(data.error ?? "Failed to update user.");

      if (patch.password) {
        setResetTargetId(null);
        setResetPasswordVal("");
        setToast("Password updated and securely hashed.");
      } else {
        setToast("User updated.");
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteUser(u: ManagedUser) {
    if (!window.confirm(`Permanently delete user ${u.full_name} (${u.email})?`)) return;
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete user.");
      setToast(`Deleted user ${u.email}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyCredentials() {
    if (!issuedCreds) return;
    const text = `RadManagement LLC Demo Portal Access\nURL: https://admin.demo.risk.radmgmt.org/demo\nEmail: ${issuedCreds.email}\nPassword: ${issuedCreds.password}\nRole: ${issuedCreds.role}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const activeCount = users.filter((u) => u.is_active).length;
  const viewerCount = users.filter((u) => u.role === "VIEWER").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0b2545] flex items-center gap-2">
            <Users className="h-5 w-5 text-[#127080]" />
            User Creation &amp; Access Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create demo viewer and staff accounts with passwords, manage roles and access status,
            and review electronically signed New York Pre-Demo agreements.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-xs text-muted-foreground font-medium">Total Users</p>
          <p className="text-2xl font-bold text-[#0b2545] mt-0.5">{users.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-xs text-muted-foreground font-medium">Active Accounts</p>
          <p className="text-2xl font-bold text-emerald-700 mt-0.5">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-xs text-muted-foreground font-medium">Demo Viewers</p>
          <p className="text-2xl font-bold text-[#127080] mt-0.5">{viewerCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-xs text-muted-foreground font-medium">Signed NY Agreements</p>
          <p className="text-2xl font-bold text-[#0b2545] mt-0.5">{agreements.length}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-700 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {toast && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs text-teal-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-teal-700 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {issuedCreds && (
        <div className="rounded-xl border border-[#127080] bg-[#e4f4f7]/70 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-xs">
            <p className="font-bold text-[#0b2545]">
              New User Credentials Ready to Share (Shown Once):
            </p>
            <p className="font-mono text-[#0b2545]">
              URL: https://admin.demo.risk.radmgmt.org/demo · Email: {issuedCreds.email} · Password:{" "}
              <strong>{issuedCreds.password}</strong>
            </p>
          </div>
          <Button size="sm" onClick={() => void handleCopyCredentials()}>
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied!" : "Copy Login Details"}
          </Button>
        </div>
      )}

      {/* Main Split: Create User Form + User Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-[#0b2545]">
              <UserPlus className="h-4 w-4 text-[#127080]" />
              Create New User Account
            </CardTitle>
            <CardDescription className="text-xs">
              Issue credentials for evaluators, clinicians, or administrators. Non-admin users will
              sign the New York Pre-Demo NDA &amp; Sandbox Agreement upon first login.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleCreateUser(e)} className="space-y-3">
              <label className="block space-y-1 text-xs font-semibold text-[#0b2545]">
                <span>Full Name *</span>
                <input
                  id="users-create-name"
                  required
                  placeholder="e.g., Dr. Jordan Rivera"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs font-normal"
                />
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#0b2545]">
                <span>Email Address *</span>
                <input
                  id="users-create-email"
                  required
                  type="email"
                  placeholder="evaluator@organization.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs font-normal"
                />
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#0b2545]">
                <span>Organization (Optional)</span>
                <input
                  id="users-create-org"
                  placeholder="e.g., NY Radiology Partners"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs font-normal"
                />
              </label>

              <div className="space-y-1 text-xs font-semibold text-[#0b2545]">
                <div className="flex items-center justify-between">
                  <span>Password (min 8 characters) *</span>
                  <button
                    type="button"
                    onClick={() => setPassword(generateStrongPassword())}
                    className="text-[11px] font-semibold text-[#127080] hover:underline cursor-pointer"
                  >
                    Generate Password
                  </button>
                </div>
                <input
                  id="users-create-password"
                  required
                  minLength={8}
                  type="text"
                  placeholder="Enter or generate password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs font-mono font-normal"
                />
              </div>

              <label className="block space-y-1 text-xs font-semibold text-[#0b2545]">
                <span>Access Level / Role *</span>
                <select
                  id="users-create-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as ManagedUser["role"])}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs font-normal"
                >
                  <option value="VIEWER">
                    VIEWER — Product Demo Access (Demo Hub, Patient, Mobile &amp; Provider)
                  </option>
                  <option value="PROVIDER">PROVIDER — Clinical Workqueue, Orders &amp; PDFs</option>
                  <option value="COORDINATOR">COORDINATOR — Scheduling &amp; Outreach</option>
                  <option value="AUDITOR">AUDITOR — Read-Only Compliance</option>
                  <option value="ADMIN">ADMIN — Full Platform Administration</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-muted-foreground pt-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiresAgreement}
                  onChange={(e) => setRequiresAgreement(e.target.checked)}
                  className="h-4 w-4 accent-[#127080]"
                />
                <span>Require NY Pre-Demo NDA &amp; Sandbox Signature before viewing</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1 text-xs font-medium">
                  <span>NPI (Optional)</span>
                  <input
                    placeholder="10-digit NPI"
                    value={npiNumber}
                    onChange={(e) => setNpiNumber(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs font-mono"
                  />
                </label>
                <label className="block space-y-1 text-xs font-medium">
                  <span>Specialty</span>
                  <input
                    placeholder="Radiology"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs"
                  />
                </label>
              </div>

              <Button
                id="users-create-submit"
                type="submit"
                size="sm"
                className="w-full bg-[#0b2545] hover:bg-[#133b66] text-white"
                disabled={busy}
              >
                <Plus className="h-3.5 w-3.5" />
                {busy ? "Creating User..." : "Create User & Set Password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm text-[#0b2545]">
                  Authorized Users ({filteredUsers.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Manage passwords, roles, suspension status, or remove expired demo accounts.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search name, email, org..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-48 rounded-md border border-input bg-card pl-8 pr-2.5 text-xs"
                  />
                </div>
                <select
                  aria-label="Filter users by role"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                >
                  <option value="ALL">All Roles</option>
                  <option value="VIEWER">VIEWER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="PROVIDER">PROVIDER</option>
                  <option value="COORDINATOR">COORDINATOR</option>
                  <option value="AUDITOR">AUDITOR</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {filteredUsers.map((u) => {
              const isLockedOwner = Boolean(u.is_hardcoded_admin);
              const isResetting = resetTargetId === u.id;
              return (
                <div
                  key={u.id}
                  className={`rounded-lg border p-3.5 space-y-2.5 ${
                    isLockedOwner ? "border-[#127080] bg-[#e4f4f7]/35" : "border-border bg-card"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-[#0b2545]">{u.full_name}</span>
                        <Badge variant={u.is_active ? "teal" : "outline"}>{u.role}</Badge>
                        {isLockedOwner && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0b2545] text-white">
                            <Lock className="h-2.5 w-2.5" />
                            SUPER-ADMIN · GOOGLE AUTH
                          </span>
                        )}
                        {!isLockedOwner && u.has_password && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            Password Active
                          </span>
                        )}
                        {!isLockedOwner && u.agreement_signed_at && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                            NY NDA Signed
                          </span>
                        )}
                        {!isLockedOwner &&
                          u.requires_demo_agreement &&
                          !u.agreement_signed_at && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300">
                              Agreement Pending
                            </span>
                          )}
                        {!u.is_active && <Badge variant="acute">SUSPENDED</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {u.email}
                        {u.organization ? ` · ${u.organization}` : ""}
                        {u.npi_number ? ` · NPI ${u.npi_number}` : ""}
                        {u.specialty ? ` · ${u.specialty}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          if (isResetting) {
                            setResetTargetId(null);
                            setResetPasswordVal("");
                          } else {
                            setResetTargetId(u.id);
                            setResetPasswordVal(generateStrongPassword());
                          }
                        }}
                      >
                        <KeyRound className="h-3 w-3" />
                        {isResetting ? "Cancel" : u.has_password ? "Reset Password" : "Set Password"}
                      </Button>

                      {!isLockedOwner && (
                        <>
                          <select
                            aria-label={`Change role for ${u.full_name}`}
                            disabled={busy}
                            value={u.role}
                            onChange={(e) =>
                              void handleUpdateUser(u.id, {
                                role: e.target.value as ManagedUser["role"],
                              })
                            }
                            className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                          >
                            <option value="VIEWER">VIEWER</option>
                            <option value="PROVIDER">PROVIDER</option>
                            <option value="COORDINATOR">COORDINATOR</option>
                            <option value="AUDITOR">AUDITOR</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void handleUpdateUser(u.id, { is_active: !u.is_active })}
                          >
                            {u.is_active ? "Suspend" : "Reactivate"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void handleDeleteUser(u)}
                            className="text-rose-700 hover:bg-rose-50 hover:text-rose-800 border-rose-200"
                            title={`Delete ${u.email}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {isResetting && (
                    <div className="pt-2 border-t border-border flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        minLength={8}
                        value={resetPasswordVal}
                        onChange={(e) => setResetPasswordVal(e.target.value)}
                        placeholder="New password (min 8 chars)"
                        className="flex-1 min-w-[200px] h-8 rounded-md border border-input bg-white px-2.5 text-xs font-mono"
                      />
                      <Button
                        size="sm"
                        disabled={busy || resetPasswordVal.trim().length < 8}
                        onClick={() =>
                          void handleUpdateUser(u.id, { password: resetPasswordVal.trim() })
                        }
                      >
                        <Save className="h-3 w-3" />
                        Save Password
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Signed Pre-Demo Agreements Ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-[#0b2545] flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-[#127080]" />
            Signed Pre-Demo Agreements Ledger (State of New York — {agreements.length})
          </CardTitle>
          <CardDescription className="text-xs">
            Immutable compliance record of every evaluator who agreed and electronically signed
            prior to accessing the Demo Hub.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agreements.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">
              No evaluators have signed yet. Signed records (Full Name, Email, Date, IP Address, and
              SHA-256 hash) appear here immediately after a user completes the pre-demo agreements.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-[#0b2545]">
                    <th className="py-2 px-3 font-bold">Full Name</th>
                    <th className="py-2 px-3 font-bold">Email</th>
                    <th className="py-2 px-3 font-bold">Organization</th>
                    <th className="py-2 px-3 font-bold">Signed Date</th>
                    <th className="py-2 px-3 font-bold">Version</th>
                    <th className="py-2 px-3 font-bold">IP / UTC Timestamp</th>
                    <th className="py-2 px-3 font-bold">SHA-256 Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-muted-foreground">
                  {agreements.map((ag) => (
                    <tr key={ag.id} className="hover:bg-secondary/20">
                      <td className="py-2 px-3 font-semibold text-[#0b2545]">{ag.full_name}</td>
                      <td className="py-2 px-3 font-mono text-[11px]">{ag.email}</td>
                      <td className="py-2 px-3">{ag.organization ?? "—"}</td>
                      <td className="py-2 px-3 font-mono">{ag.signed_date}</td>
                      <td className="py-2 px-3">
                        <Badge variant="teal">{ag.agreement_version}</Badge>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px]">
                        {ag.ip_address ?? "—"} · {new Date(ag.signed_at).toLocaleString()}
                      </td>
                      <td className="py-2 px-3 font-mono text-[10px]">
                        {ag.agreement_hash.slice(0, 14)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
