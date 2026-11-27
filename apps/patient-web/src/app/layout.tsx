import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RadManagement LLC | Preventive Health & Imaging Risk Assessment",
  description:
    "Personalized preventive imaging risk assessment from RadManagement LLC — plain-English guidance, real-time benefits check, and compassionate care scheduling.",
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
