"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Lock,
  LogOut,
  Printer,
  ShieldCheck,
} from "lucide-react";
import {
  CONTRACT_GOVERNING_STATE,
  DEMO_AGREEMENT_VERSION,
  HARDCODED_SUPER_ADMIN_EMAIL,
  PRE_DEMO_CONTRACTS,
  PRE_PRODUCTION_CONTRACTS,
  type DemoSessionPayload,
  type LegalContractDocument,
} from "@healthcare/shared-contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ContractViewer({ contract }: { contract: LegalContractDocument }) {
  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden">
      <div className="px-4 py-3 bg-[#f4f8fa] border-b border-border flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-[#0b2545]">{contract.title}</p>
          <p className="text-[11px] text-muted-foreground">{contract.subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300">
            {contract.reviewStatus}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#e4f4f7] text-[#127080]">
            {contract.governingLaw}
          </span>
        </div>
      </div>
      <div className="p-4 max-h-64 overflow-y-auto space-y-3 text-xs text-slate-700 leading-relaxed">
        {contract.sections.map((sec) => (
          <div key={sec.heading} className="space-y-1">
            <p className="font-bold text-[#0b2545]">{sec.heading}</p>
            <p>{sec.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    "Google OAuth Client ID & Secret have not been attached to this Cloud Run service yet. See the 3-step setup instructions below or sign in with your password.",
  google_state_mismatch: "Google Sign-In session expired. Please try signing in again.",
  google_token_exchange_failed: "Google Sign-In token exchange failed. Please verify the OAuth redirect URI.",
  google_identity_unverified: "Your Google account email must be verified to sign in.",
  google_account_not_authorized:
    "This Google account is not authorized to view the demo. Contact RadManagement LLC to request access.",
  google_callback_error: "An unexpected error occurred during Google Sign-In. Please try again.",
};

function DemoGateInner() {
  const router = useRouter();
  const params = useSearchParams();
  const nextTarget = params.get("next") || "/demo";
  const googleSetupHint = params.get("google_setup") === "1";
  const urlError = params.get("error");

  const [loadingSession, setLoadingSession] = useState(true);
  const [session, setSession] = useState<DemoSessionPayload | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState(false);

  // Login Form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? (ERROR_MESSAGES[urlError] ?? "Authentication failed.") : null,
  );

  // Agreement E-Signature Form
  const [activeDocTab, setActiveDocTab] = useState<"pre-demo" | "pre-prod">("pre-demo");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerOrg, setSignerOrg] = useState("");
  const [signedDate, setSignedDate] = useState(todayIsoDate());
  const [acceptMnda, setAcceptMnda] = useState(false);
  const [acceptSandbox, setAcceptSandbox] = useState(false);
  const [acceptNonPhi, setAcceptNonPhi] = useState(false);
  const [acceptPreProd, setAcceptPreProd] = useState(false);

  function navigateToDestination() {
    if (nextTarget.startsWith("https://") && nextTarget.includes(".demo.risk.radmgmt.org")) {
      window.location.href = nextTarget;
    } else {
      router.push(nextTarget.startsWith("/") ? nextTarget : "/demo");
      router.refresh();
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok || !active) return;
        const data = (await res.json()) as {
          authenticated: boolean;
          session: DemoSessionPayload | null;
          googleOAuthConfigured: boolean;
        };
        setGoogleConfigured(Boolean(data.googleOAuthConfigured));
        if (data.authenticated && data.session) {
          setSession(data.session);
          setSignerName(data.session.fullName || "");
          setSignerEmail(data.session.email || "");
          setSignerOrg(data.session.organization || "");
          if (data.session.isSuperAdmin || data.session.agreementSigned) {
            navigateToDestination();
          }
        }
      } finally {
        if (active) setLoadingSession(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json()) as {
        error?: string;
        user?: {
          email: string;
          full_name: string;
          role: DemoSessionPayload["role"];
          organization?: string | null;
          is_hardcoded_admin: boolean;
        };
        requires_agreement?: boolean;
        agreement_signed?: boolean;
      };
      if (!res.ok || !data.user) {
        setError(data.error ?? "Invalid email or password.");
        return;
      }

      if (data.user.is_hardcoded_admin || data.agreement_signed) {
        navigateToDestination();
        return;
      }

      setSession({
        email: data.user.email,
        fullName: data.user.full_name,
        role: data.user.role,
        organization: data.user.organization ?? null,
        isSuperAdmin: data.user.is_hardcoded_admin,
        agreementSigned: false,
        authMethod: "password",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      setSignerName(data.user.full_name);
      setSignerEmail(data.user.email);
      setSignerOrg(data.user.organization ?? "");
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignAgreement(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!acceptMnda || !acceptSandbox || !acceptNonPhi || !acceptPreProd) {
      setError("Please check all four agreement acknowledgments before continuing.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/sign-agreement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: signerEmail.trim(),
          full_name: signerName.trim(),
          organization: signerOrg.trim() || undefined,
          signed_date: signedDate,
          accepted_mnda: acceptMnda,
          accepted_sandbox: acceptSandbox,
          accepted_non_phi: acceptNonPhi,
          accepted_pre_prod_notice: acceptPreProd,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Unable to record your electronic signature.");
        return;
      }
      navigateToDestination();
    } catch {
      setError("Network error while recording signature. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
    setPassword("");
    setError(null);
  }

  const allChecked = acceptMnda && acceptSandbox && acceptNonPhi && acceptPreProd;

  if (loadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f8fa] text-sm text-[#0b2545]">
        Verifying session...
      </div>
    );
  }

  // =========================================================================
  // STAGE 2: AUTHENTICATED NON-ADMIN -> MANDATORY PRE-DEMO CONTRACT SIGNING
  // =========================================================================
  if (session && !session.isSuperAdmin && !session.agreementSigned) {
    return (
      <div className="min-h-screen bg-[#f4f8fa] py-8 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-5">
          <div className="rounded-2xl bg-[#0b2545] text-white p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                RadManagement LLC · State of {CONTRACT_GOVERNING_STATE} · Version{" "}
                {DEMO_AGREEMENT_VERSION}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                Pre-Demo Agreements &amp; Electronic Signature Required
              </h1>
              <p className="text-xs sm:text-sm text-slate-200">
                Signed in as <strong>{session.email}</strong> ({session.role}). Prior to entering
                the Demo Hub and viewing the platform, please review and electronically sign the
                agreements below.
              </p>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="bg-white/10 border-white/25 text-white hover:bg-white/20"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Drafts
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleLogout()}
                className="bg-white/10 border-white/25 text-white hover:bg-white/20"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>SYNTHETIC DEMO ONLY — ZERO REAL PHI PERMITTED:</strong> All contracts below
              are prepared under <strong>New York law</strong> for legal counsel review. Real
              patient data may never be entered into <code>demo.risk.radmgmt.org</code>.
            </div>
          </div>

          {/* Toggle between Pre-Demo Contracts (Mandatory) and Pre-Production Contracts (Review) */}
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => setActiveDocTab("pre-demo")}
              className={`px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                activeDocTab === "pre-demo"
                  ? "bg-[#0b2545] text-white border-[#0b2545]"
                  : "bg-white text-[#0b2545] border-border hover:bg-secondary"
              }`}
            >
              Pre-Demo Contracts (MNDA + Synthetic Sandbox) — Required to Sign
            </button>
            <button
              type="button"
              onClick={() => setActiveDocTab("pre-prod")}
              className={`px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                activeDocTab === "pre-prod"
                  ? "bg-[#0b2545] text-white border-[#0b2545]"
                  : "bg-white text-[#0b2545] border-border hover:bg-secondary"
              }`}
            >
              Pre-Production Contracts (HIPAA BAA + MSA + IP Licensing) — For Review
            </button>
          </div>

          <div className="space-y-4">
            {(activeDocTab === "pre-demo" ? PRE_DEMO_CONTRACTS : PRE_PRODUCTION_CONTRACTS).map(
              (contract) => (
                <ContractViewer key={contract.id} contract={contract} />
              ),
            )}
          </div>

          {/* Electronic Signature Block */}
          <Card className="border-[#127080]/40 shadow-sm">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-base text-[#0b2545] flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#127080]" />
                Electronic Acceptance &amp; Signature Block (Required Before Entering Demo Hub)
              </CardTitle>
              <CardDescription className="text-xs">
                By completing and submitting this block, you agree to the New York Pre-Demo Mutual
                NDA and Synthetic Demo Evaluation Agreement. Your signature, date, email, and UTC
                timestamp are recorded immutably in RadManagement LLC&apos;s compliance ledger.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={(e) => void handleSignAgreement(e)} className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 font-medium">
                    {error}
                  </div>
                )}

                <div className="space-y-2.5 text-xs text-[#0b2545]">
                  <label className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/30 p-3 cursor-pointer">
                    <input
                      id="agree-mnda"
                      type="checkbox"
                      checked={acceptMnda}
                      onChange={(e) => setAcceptMnda(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#127080]"
                    />
                    <span>
                      <strong>Mutual Non-Disclosure Agreement (State of New York):</strong> I have
                      reviewed and agree to maintain confidentiality over RadManagement LLC&apos;s
                      platform, 69 clinical rules, prompts, architecture, and documentation, and not
                      to copy or reverse-engineer the software.
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/30 p-3 cursor-pointer">
                    <input
                      id="agree-sandbox"
                      type="checkbox"
                      checked={acceptSandbox}
                      onChange={(e) => setAcceptSandbox(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#127080]"
                    />
                    <span>
                      <strong>Synthetic Demo Evaluation &amp; Non-Clinical Disclaimer:</strong> I
                      understand this demo is provided &ldquo;AS-IS&rdquo; strictly for evaluation
                      and does not constitute medical advice, diagnosis, or treatment.
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 rounded-lg border border-border bg-rose-50/70 p-3 cursor-pointer">
                    <input
                      id="agree-non-phi"
                      type="checkbox"
                      checked={acceptNonPhi}
                      onChange={(e) => setAcceptNonPhi(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#be123c]"
                    />
                    <span>
                      <strong>Zero-PHI Prohibition (HIPAA &amp; NY SHIELD Act):</strong> I agree
                      that I will <strong>NOT</strong> enter, upload, or transmit any real Protected
                      Health Information (PHI) or real patient identifiers into this demo
                      environment.
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/30 p-3 cursor-pointer">
                    <input
                      id="agree-pre-prod"
                      type="checkbox"
                      checked={acceptPreProd}
                      onChange={(e) => setAcceptPreProd(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#127080]"
                    />
                    <span>
                      <strong>Pre-Production Governance Acknowledgment:</strong> I acknowledge that
                      production use with real ePHI requires a separate BAA-covered GCP deployment (
                      <code>hrp-prod-01</code>), executed HIPAA BAAs, MSA, and commercial CPT® /
                      scoring-instrument licenses.
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  <label className="space-y-1 text-xs font-semibold text-[#0b2545]">
                    <span>Full Legal Name (Signature) *</span>
                    <Input
                      id="agreement-full-name"
                      required
                      placeholder="Full Name"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-[#0b2545]">
                    <span>Email Address *</span>
                    <Input
                      id="agreement-email"
                      type="email"
                      required
                      readOnly
                      value={signerEmail}
                      className="bg-slate-100 text-slate-700"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-[#0b2545]">
                    <span>Organization (Optional)</span>
                    <Input
                      id="agreement-org"
                      placeholder="Health System / Group"
                      value={signerOrg}
                      onChange={(e) => setSignerOrg(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-[#0b2545]">
                    <span>Signature Date *</span>
                    <Input
                      id="agreement-date"
                      type="date"
                      required
                      value={signedDate}
                      onChange={(e) => setSignedDate(e.target.value)}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <p className="text-[11px] text-muted-foreground">
                    Governing Law: State of {CONTRACT_GOVERNING_STATE} · Electronic Signature
                    enforceable under NY ESRA &amp; Federal ESIGN Act.
                  </p>
                  <Button
                    id="sign-and-enter-demo-btn"
                    type="submit"
                    disabled={busy || !allChecked}
                    className="bg-[#0b2545] hover:bg-[#133b66] text-white px-6"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {busy ? "Recording Electronic Signature..." : "Agree, Sign & Enter Demo Hub"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STAGE 1: UNAUTHENTICATED -> GOOGLE ADMIN LOGIN + INVITED USER LOGIN
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#f4f8fa] flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg space-y-5">
        <div className="rounded-2xl overflow-hidden border border-border bg-[#0b2545] shadow-sm">
          <img
            src="/brand/radmanagement-banner-dark.png"
            alt="RadManagement LLC"
            className="w-full h-24 sm:h-28 object-contain sm:object-cover sm:object-left"
          />
        </div>

        <Card className="shadow-sm border-border">
          <CardHeader className="space-y-2 border-b border-border pb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e4f4f7] text-[#127080]">
                <Lock className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-950 border border-amber-300">
                Synthetic Demo · Authorized Access
              </span>
            </div>
            <CardTitle className="text-lg text-[#0b2545]">
              Sign In to RadManagement LLC Demo Hub
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Platform Owner (<code>{HARDCODED_SUPER_ADMIN_EMAIL}</code>) signs in with Google with
              instant access (no agreements required). Invited evaluators sign in with their issued
              email &amp; password and complete the New York Pre-Demo NDA &amp; Sandbox Agreement.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-5 space-y-5">
            {error && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 font-medium">
                {error}
              </div>
            )}

            {/* Google Sign-In for Hardcoded Super-Admin */}
            <div className="space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#127080]">
                Platform Owner / Hardcoded Admin
              </p>
              <a
                id="google-signin-btn"
                href={`/api/auth/google/start?next=${encodeURIComponent(nextTarget)}`}
                className="w-full h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-[#0b2545] text-sm font-semibold flex items-center justify-center gap-2.5 shadow-xs transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                  />
                </svg>
                <span>Sign in with Google ({HARDCODED_SUPER_ADMIN_EMAIL})</span>
              </a>

              {(googleSetupHint || !googleConfigured) && (
                <div className="rounded-lg border border-sky-200 bg-sky-50/80 p-3 text-[11px] text-sky-950 space-y-1">
                  <p className="font-bold">Google OAuth Client Setup (One-Time in GCP Console):</p>
                  <p>
                    Create a Web OAuth Client ID in GCP Console →{" "}
                    <strong>APIs &amp; Services → Credentials</strong> with Redirect URI{" "}
                    <code className="font-mono bg-white px-1 py-0.5 rounded border">
                      https://admin.demo.risk.radmgmt.org/api/auth/google/callback
                    </code>{" "}
                    and attach <code>GOOGLE_OAUTH_CLIENT_ID</code> &amp;{" "}
                    <code>GOOGLE_OAUTH_CLIENT_SECRET</code>. Until then,{" "}
                    <code>{HARDCODED_SUPER_ADMIN_EMAIL}</code> can also sign in below with the
                    bootstrap password.
                  </p>
                </div>
              )}
            </div>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-border" />
              <span className="mx-3 shrink text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Or Invited Evaluator / User Login
              </span>
              <div className="flex-grow border-t border-border" />
            </div>

            {/* Email + Password Login for Admin-Created Users */}
            <form onSubmit={(e) => void handlePasswordLogin(e)} className="space-y-3">
              <label className="block space-y-1 text-xs font-semibold text-[#0b2545]">
                <span>Email Address</span>
                <Input
                  id="demo-login-email"
                  type="email"
                  required
                  placeholder="evaluator@organization.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block space-y-1 text-xs font-semibold text-[#0b2545]">
                <span>Password</span>
                <Input
                  id="demo-login-password"
                  type="password"
                  required
                  placeholder="Enter your issued password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <Button
                id="demo-login-submit-btn"
                type="submit"
                disabled={busy}
                className="w-full h-11 bg-[#0b2545] hover:bg-[#133b66] text-white font-semibold"
              >
                {busy ? "Signing In..." : "Sign In & Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DemoGatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f8fa]" />}>
      <DemoGateInner />
    </Suspense>
  );
}
