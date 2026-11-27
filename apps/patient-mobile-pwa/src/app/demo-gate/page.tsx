"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";

function GateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/";
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth/demo-gate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (!res.ok) {
      setError("Incorrect demo passcode.");
      return;
    }
    router.push(nextPath);
    router.refresh();
  }

  return (
    <main className="min-h-screen mx-auto max-w-md px-4 flex items-center justify-center">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full rounded-2xl border border-[var(--border)] bg-white p-6 shadow-xs space-y-4"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-[var(--teal-soft)] text-[var(--teal)] flex items-center justify-center">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">Mobile PWA Demo Access</h1>
            <p className="text-[11px] text-[var(--muted)]">Synthetic data only &mdash; no real PHI</p>
          </div>
        </div>
        {error && <p className="text-xs text-rose-700">{error}</p>}
        <input
          type="password"
          required
          placeholder="Enter demo passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm"
        />
        <button
          type="submit"
          className="w-full h-11 rounded-xl bg-[var(--teal)] text-white text-xs font-semibold cursor-pointer"
        >
          Unlock Mobile Demo
        </button>
      </form>
    </main>
  );
}

export default function MobileDemoGatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg)]" />}>
      <GateForm />
    </Suspense>
  );
}
