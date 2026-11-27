import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RadManagement LLC | Mobile Preventive Health Review",
  description:
    "Secure magic-link verification and plain-English preventive imaging review from RadManagement LLC.",
  manifest: "/manifest.json",
  icons: {
    icon: "/brand/radmanagement-mark.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b2545",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
