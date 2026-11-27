import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RadManagement LLC | Provider Clinical Workqueue & Visits Calendar",
  description:
    "RadManagement LLC clinical imaging workqueue with HIGH/STANDARD priority triage, workflow status tracking, patient visits calendar, and one-click FHIR/HL7 order dispatch.",
  icons: {
    icon: "/brand/radmanagement-mark.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
