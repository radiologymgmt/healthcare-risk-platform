"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function UnauthorizedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const blockedRole = searchParams.get("role") ?? "UNAUTHENTICATED";
  const [restoring, setRestoring] = useState(false);

  async function restoreDevAdmin() {
    setRestoring(true);
    try {
      const res = await fetch("/api/auth/dev-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      });
      if (res.ok) {
        router.push("/rules");
        router.refresh();
      }
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">Admin Portal Access Restricted (RBAC)</CardTitle>
            <CardDescription>
              This portal is protected by Google Identity-Aware Proxy (IAP) with mandatory{" "}
              <strong className="text-foreground">ADMIN</strong> role privileges.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Detected Caller Role</span>
            <Badge variant="acute" className="font-mono">
              {blockedRole}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Unauthorized access attempts are blocked at middleware before reaching clinical
            configuration endpoints and recorded to immutable HIPAA audit logs.
          </p>
          {(process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_MODE === "true") && (
            <Button
              id="restore-dev-admin-btn"
              className="w-full"
              disabled={restoring}
              onClick={() => void restoreDevAdmin()}
            >
              Restore Synthetic Dev ADMIN Session
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <UnauthorizedContent />
    </Suspense>
  );
}
