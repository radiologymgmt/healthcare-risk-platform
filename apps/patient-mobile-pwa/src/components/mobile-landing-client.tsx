"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

export function MobileLandingClient({ isDemoMode }: { isDemoMode: boolean }) {
  const router = useRouter();
  const [tokenInput, setTokenInput] = useState("");
  const [demoInfo, setDemoInfo] = useState<{
    token: string;
    synthetic_dob: string;
    synthetic_zip: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function generateSyntheticLink() {
    setLoading(true);
    try {
      const res = await fetch("/api/magic-link/demo-seed", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as {
          token: string;
          synthetic_dob: string;
          synthetic_zip: string;
        };
        setDemoInfo(data);
        setTokenInput(data.token);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      {isDemoMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
          SYNTHETIC DEMO ENVIRONMENT &mdash; DO NOT ENTER REAL PHI
        </div>
      )}

      <header className="border-b border-[var(--border)] bg-white px-4 h-15 flex items-center justify-center shadow-xs">
        <img
          src="/brand/radmanagement-logo-light.png"
          alt="RadManagement LLC — Clinical Imaging & Radiology Solutions"
          className="h-9 w-auto object-contain"
        />
      </header>

      <main className="flex-1 mx-auto max-w-md w-full px-4 py-6 flex flex-col justify-center gap-5">
        <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden shadow-sm">
          <div className="relative h-44 w-full">
            <img
              src="/images/family-hero.jpg"
              alt="Smiling family together outdoors"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--navy)]/95 via-[var(--navy)]/60 to-transparent flex flex-col justify-end p-5 text-white">
              <span className="inline-block w-fit rounded-full bg-[var(--navy)]/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#b8f0fa] mb-1">
                2-Minute Care Check-In
              </span>
              <h1 className="text-lg font-bold tracking-tight leading-snug">
                Confirm Your Preventive Health Details
              </h1>
            </div>
          </div>

          <div className="p-5 space-y-5">
            <div className="space-y-2 text-xs text-[var(--muted)] leading-relaxed">
              <p>
                To save you time, our clinical team pre-filled key details from your recent medical
                records. Taking two minutes to confirm them ensures your preventive imaging
                recommendations are accurate for you and your family.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-lg bg-[var(--bg)] border border-[var(--border)] p-2.5 flex items-center gap-1.5 text-[11px] text-[var(--navy)] font-medium">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--teal)] shrink-0" />
                  HIPAA-Protected
                </div>
                <div className="rounded-lg bg-[var(--bg)] border border-[var(--border)] p-2.5 flex items-center gap-1.5 text-[11px] text-[var(--navy)] font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--teal)] shrink-0" />
                  Clinician-Reviewed
                </div>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (tokenInput.trim()) router.push(`/m/${encodeURIComponent(tokenInput.trim())}`);
              }}
              className="space-y-3"
            >
              <label className="block space-y-1 text-xs font-semibold text-[var(--navy)]">
                <span>Your Invitation Code</span>
                <input
                  aria-label="Magic link token"
                  placeholder="Paste invitation token..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-xs font-mono font-normal"
                />
              </label>
              <button
                type="submit"
                disabled={!tokenInput.trim()}
                className="w-full h-11 rounded-xl bg-[var(--navy)] hover:bg-[var(--navy-dark)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer transition-colors"
              >
                Open My Secure Review
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            {isDemoMode && (
              <div className="border-t border-[var(--border)] pt-4 space-y-2.5">
                <button
                  id="generate-demo-magic-link-btn"
                  type="button"
                  disabled={loading}
                  onClick={() => void generateSyntheticLink()}
                  className="w-full h-10 rounded-xl border border-[var(--teal)] text-[var(--teal-dark)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[var(--teal-soft)] cursor-pointer transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {loading ? "Creating Synthetic Session..." : "Generate Synthetic Demo Magic Link"}
                </button>

                {demoInfo && (
                  <div className="rounded-xl bg-[var(--teal-soft)] border border-[var(--teal)]/30 p-3 text-[11px] text-[var(--navy)] space-y-1">
                    <p className="font-semibold">Synthetic Verification Credentials:</p>
                    <p className="font-mono">
                      DOB: {demoInfo.synthetic_dob} &middot; ZIP: {demoInfo.synthetic_zip}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
