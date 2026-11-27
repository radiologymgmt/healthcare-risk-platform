"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function DemoGateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/demo";
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <CardTitle className="text-base">Synthetic Demo Access</CardTitle>
          <CardDescription>
            Enter the demo passcode to access the Clinical Configuration Portal (synthetic data
            only — never enter real PHI).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
            {error && <p className="text-xs text-rose-700">{error}</p>}
            <Input
              type="password"
              required
              placeholder="Demo passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Verifying..." : "Unlock Demo Portal"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DemoGatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DemoGateForm />
    </Suspense>
  );
}
