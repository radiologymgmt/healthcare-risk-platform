"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShieldCheck,
  SlidersHorizontal,
  ListChecks,
  Lock,
  BarChart3,
  Rocket,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AdminShellProps {
  children: React.ReactNode;
  actorId: string;
  actorRole: string;
  authSource: string;
  isProduction: boolean;
  isDemoMode?: boolean;
}

export function AdminShell({
  children,
  actorId,
  actorRole,
  authSource,
  isProduction,
  isDemoMode = false,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleRoleSwitch(nextRole: string) {
    setSwitching(true);
    try {
      await fetch("/api/auth/dev-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      router.refresh();
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  }

  const showDevControls = !isProduction || isDemoMode;

  const navItems = [
    ...(showDevControls
      ? [
          {
            href: "/demo",
            label: "Demo Hub",
            icon: Rocket,
            active: pathname.startsWith("/demo"),
          },
        ]
      : []),
    {
      href: "/rules",
      label: "Clinical Rules & CPT/ICD-10",
      icon: SlidersHorizontal,
      active: pathname === "/" || pathname.startsWith("/rules"),
    },
    {
      href: "/questions",
      label: "Question Registry",
      icon: ListChecks,
      active: pathname.startsWith("/questions"),
    },
    {
      href: "/analytics",
      label: "Analytics & PDF",
      icon: BarChart3,
      active: pathname.startsWith("/analytics"),
    },
    {
      href: "/governance",
      label: "Governance & Restore",
      icon: ShieldCheck,
      active: pathname.startsWith("/governance"),
    },
  ];

  return (
    <div className="min-h-screen w-full overflow-x-hidden flex flex-col bg-background text-foreground">
      {isDemoMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-center text-xs font-medium text-amber-950 flex items-center justify-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
          <span>SYNTHETIC DEMO ENVIRONMENT &mdash; DO NOT ENTER REAL PHI</span>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-sm shadow-xs">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-5">
          <div className="flex items-center gap-4 lg:gap-6 min-w-0">
            <Link href="/demo" className="flex items-center gap-3 shrink-0">
              <img
                src="/brand/radmanagement-logo-light.png"
                alt="RadManagement LLC — Clinical Imaging & Radiology Solutions"
                className="h-8 sm:h-10 w-auto object-contain"
              />
            </Link>

            <nav aria-label="Admin Portal sections" className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap",
                      item.active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden xl:flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-xs">
              <Lock className="h-3.5 w-3.5 text-primary" />
              <span className="font-mono text-[11px] text-muted-foreground">{actorId}</span>
              <Badge variant="teal" className="font-mono text-[10px] px-1.5 py-0">
                {actorRole}
              </Badge>
              <span className="text-[10px] text-muted-foreground">({authSource})</span>
            </div>

            {showDevControls && (
              <div className="hidden sm:flex items-center gap-1.5">
                <label htmlFor="dev-rbac-switch" className="sr-only">
                  Simulate RBAC Role
                </label>
                <select
                  id="dev-rbac-switch"
                  aria-label="Simulate RBAC Role"
                  disabled={switching}
                  value={actorRole}
                  onChange={(e) => void handleRoleSwitch(e.target.value)}
                  className="h-9 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  title="Demo HttpOnly cookie switcher to test RBAC middleware"
                >
                  <option value="ADMIN">RBAC: ADMIN</option>
                  <option value="PROVIDER">RBAC: PROVIDER (403)</option>
                  <option value="PATIENT">RBAC: PATIENT (403)</option>
                </select>
              </div>
            )}

            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg border border-border bg-card text-xs font-semibold text-foreground hover:bg-secondary cursor-pointer"
            >
              {mobileMenuOpen ? "Close" : "Menu"}
            </button>
          </div>
        </div>

        {/* Responsive mobile/tablet navigation drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-border bg-card px-4 py-3 space-y-2.5 shadow-sm">
            <nav aria-label="Mobile Admin Portal sections" className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "inline-flex items-center gap-2.5 rounded-lg px-3 py-2.5 min-h-[44px] text-sm font-medium transition-colors",
                      item.active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <Lock className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="font-mono text-[11px] text-muted-foreground">{actorId}</span>
                <Badge variant="teal" className="font-mono text-[10px] px-1.5 py-0">
                  {actorRole}
                </Badge>
              </div>

              {showDevControls && (
                <select
                  aria-label="Simulate RBAC Role (Mobile)"
                  disabled={switching}
                  value={actorRole}
                  onChange={(e) => void handleRoleSwitch(e.target.value)}
                  className="h-10 rounded-md border border-input bg-card px-2.5 text-sm text-foreground"
                >
                  <option value="ADMIN">RBAC: ADMIN</option>
                  <option value="PROVIDER">RBAC: PROVIDER (403)</option>
                  <option value="PATIENT">RBAC: PATIENT (403)</option>
                </select>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 sm:px-5 py-5">{children}</main>
    </div>
  );
}
