import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clinical Configuration Portal | Enterprise Healthcare Risk Platform",
  description:
    "HIPAA-compliant no-code Question Registry and JsonLogic Clinical Rule & CPT/ICD-10 configuration portal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
