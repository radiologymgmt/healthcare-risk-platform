import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Preventive Health Risk Assessment | Patient Portal",
  description:
    "HIPAA-compliant preventive clinical risk assessment, real-time insurance eligibility verification, and risk review scheduling.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
