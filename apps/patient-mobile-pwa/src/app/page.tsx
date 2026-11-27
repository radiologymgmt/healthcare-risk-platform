import { MobileLandingClient } from "@/components/mobile-landing-client";

export const dynamic = "force-dynamic";

export default function MobileLandingPage() {
  const isDemoMode = process.env.DEMO_MODE === "true" || process.env.NODE_ENV !== "production";
  return <MobileLandingClient isDemoMode={isDemoMode} />;
}
