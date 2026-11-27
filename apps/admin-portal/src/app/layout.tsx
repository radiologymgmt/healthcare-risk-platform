import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RadManagement LLC | Clinical Configuration & Analytics Portal",
  description:
    "RadManagement LLC no-code Question Registry, JsonLogic Clinical Rules, CPT/ICD-10 Governance, and Executive Analytics Portal.",
  icons: {
    icon: "/brand/radmanagement-mark.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
