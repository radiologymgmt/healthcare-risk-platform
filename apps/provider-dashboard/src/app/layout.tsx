import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Provider Triage Workqueue | Enterprise Healthcare Risk Platform",
  description:
    "STAT-first clinical risk workqueue with split-screen CPT/ICD-10 pathway verification, parsed document excerpts, and one-click order dispatch.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
