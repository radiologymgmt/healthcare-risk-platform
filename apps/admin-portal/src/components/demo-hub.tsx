"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  HeartPulse,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DemoHubProps {
  urls: {
    patientWeb: string;
    mobilePwa: string;
    providerDashboard: string;
    adminPortal: string;
  };
}

export function DemoHub({ urls }: DemoHubProps) {
  const [resetting, setResetting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function handleResetDemo() {
    setResetting(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/demo-reset", { method: "POST" });
      if (!res.ok) throw new Error("Failed to reset synthetic demo data");
      setStatusMsg(
        "Cleared all synthetic patient sessions, workqueue items, and pathways. All clinical questions and 69 clinical rules remain intact.",
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  const portals = [
    {
      title: "1. Patient Web Intake Portal",
      subtitle: "Component 3 · Dynamic Renderer, Stedi X12 270/271 & Scheduling",
      href: urls.patientWeb,
      icon: HeartPulse,
      steps:
        "Click 'Fill Synthetic Test Profile', optionally add supplemental screenings, answer knockout questions, run Stedi X12 271 eligibility check, and book a consult.",
    },
    {
      title: "2. Patient Mobile Magic-Link PWA",
      subtitle: "Component 4 · DOB+ZIP HttpOnly Verification & AI Review Cards",
      href: urls.mobilePwa,
      icon: Smartphone,
      steps:
        "Click 'Generate Synthetic Demo Magic Link', unlock with synthetic DOB/ZIP, and confirm AI-parsed visit-note excerpts.",
    },
    {
      title: "3. Provider Clinical Workqueue & Visits Calendar",
      subtitle: "Component 5 · HIGH/STANDARD Priority, Workflow Statuses & Patient Calendar",
      href: urls.providerDashboard,
      icon: Stethoscope,
      steps:
        "Click '+ Seed Synthetic Cases' to load cases across Contact Pending, Appointment Scheduled, Exams Ordered, and Patient Completed, run any of 69 individual assessments, and download branded PDFs.",
    },
    {
      title: "4. Admin Configuration & Governance Studio",
      subtitle: "Component 8 · 69-Rule JsonLogic Editor, Analytics, Governance & Restore Points",
      href: urls.adminPortal,
      icon: SlidersHorizontal,
      steps:
        "Edit thresholds in /rules with live Synthetic Dry-Run, manage users/payers/restore points in /governance, view /analytics, and download RadManagement-branded PDF reports.",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl overflow-hidden border border-border shadow-sm bg-[#0b2545]">
        <img
          src="/brand/radmanagement-banner-dark.png"
          alt="RadManagement LLC — Elevating Radiology Operations & Clinical Imaging Workflow"
          className="w-full h-24 sm:h-40 md:h-44 object-contain sm:object-cover sm:object-left"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#0b2545]">
              RadManagement LLC &mdash; Platform Demo Hub
            </h1>
            <Badge variant="high">Synthetic Data Only</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Launch all 4 clinical imaging portals from one hub and reset synthetic patient data
            cleanly between walkthroughs.
          </p>
        </div>

        <Button
          id="reset-demo-data-btn"
          size="sm"
          variant="outline"
          disabled={resetting}
          onClick={() => void handleResetDemo()}
        >
          <RotateCcw className={`h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
          {resetting ? "Resetting Demo Data..." : "Reset Synthetic Demo Data"}
        </Button>
      </div>

      {statusMsg && (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs text-teal-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-teal-700" />
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {portals.map((portal) => {
          const Icon = portal.icon;
          return (
            <Card key={portal.title}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-md bg-accent text-primary flex items-center justify-center">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">{portal.title}</CardTitle>
                      <CardDescription className="mt-0.5">{portal.subtitle}</CardDescription>
                    </div>
                  </div>
                  <a
                    href={portal.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-secondary shrink-0"
                  >
                    Open
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground leading-relaxed">{portal.steps}</p>
                <p className="font-mono text-[11px] text-primary truncate">{portal.href}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-[#127080]/40 bg-[#e4f4f7]/45">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-[#0b2545] text-white flex items-center justify-center shrink-0">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-sm text-[#0b2545]">
                  Walkthrough Guides, How-To Manuals &amp; HIPAA Security Reviews
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Clinician, Patient &amp; Admin how-to manuals, IT architecture walkthrough, live
                  Demo Security Assessment, and exact HIPAA Production Deployment Plan &amp; Security
                  Review (printable to PDF).
                </CardDescription>
              </div>
            </div>
            <Link
              href="/docs"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b2545] px-4 py-2 text-xs font-semibold text-white hover:bg-[#133b66] transition-colors shrink-0"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Open Guides &amp; Security Hub
            </Link>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
