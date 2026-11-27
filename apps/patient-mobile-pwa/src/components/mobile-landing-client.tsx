"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Smartphone, Sparkles } from "lucide-react";

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
    <div className="min-h-screen flex flex-col">
      {isDemoMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
          SYNTHETIC DEMO ENVIRONMENT &mdash; DO NOT ENTER REAL PHI
        </div>
      )}
      <main className="flex-1 mx-auto max-w-md w-full px-4 py-10 flex flex-col justify-center gap-5">
        <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--teal)] text-white flex items-center justify-center">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Mobile Risk Review</h1>
              <p className="text-xs text-[var(--muted)]">Tokenized Magic-Link PWA</p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Open the unique link sent by your clinic, or paste your invitation token below to verify
            your identity and review pre-populated clinical answers.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (tokenInput.trim()) router.push(`/m/${encodeURIComponent(tokenInput.trim())}`);
            }}
            className="space-y-3"
          >
            <input
              aria-label="Magic link token"
              placeholder="Paste invitation token..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-300 px-3 text-xs font-mono"
            />
            <button
              type="submit"
              disabled={!tokenInput.trim()}
              className="w-full h-11 rounded-xl bg-[var(--teal)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              Open Magic Link
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {isDemoMode && (
            <div className="border-t border-slate-200 pt-4 space-y-2.5">
              <button
                id="generate-demo-magic-link-btn"
                type="button"
                disabled={loading}
                onClick={() => void generateSyntheticLink()}
                className="w-full h-10 rounded-xl border border-[var(--teal)] text-[var(--teal)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[var(--teal-soft)] cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {loading ? "Creating Synthetic Session..." : "Generate Synthetic Demo Magic Link"}
              </button>

              {demoInfo && (
                <div className="rounded-xl bg-teal-50 border border-teal-200 p-3 text-[11px] text-teal-950 space-y-1">
                  <p className="font-semibold">Synthetic Verification Credentials:</p>
                  <p className="font-mono">
                    DOB: {demoInfo.synthetic_dob} &middot; ZIP: {demoInfo.synthetic_zip}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
