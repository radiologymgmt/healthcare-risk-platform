import { headers } from "next/headers";
import { AdminShell } from "@/components/admin-shell";
import { DemoHub } from "@/components/demo-hub";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const hdrs = await headers();
  const actorId = hdrs.get("x-verified-actor-id") ?? "dev-clinical-admin-01";
  const actorRole = hdrs.get("x-verified-actor-role") ?? "ADMIN";
  const authSource = hdrs.get("x-verified-auth-source") ?? "DEV_DEFAULT";
  const isDemoMode = process.env.DEMO_MODE === "true";

  const urls = {
    patientWeb: process.env.DEMO_PATIENT_WEB_URL ?? "http://localhost:3003",
    mobilePwa: process.env.DEMO_MOBILE_PWA_URL ?? "http://localhost:3004",
    providerDashboard: process.env.DEMO_PROVIDER_URL ?? "http://localhost:3005",
    adminPortal: process.env.DEMO_ADMIN_URL ?? "/rules",
  };

  return (
    <AdminShell
      actorId={actorId}
      actorRole={actorRole}
      authSource={authSource}
      isProduction={process.env.NODE_ENV === "production"}
      isDemoMode={isDemoMode}
    >
      <DemoHub urls={urls} isAdmin={actorRole === "ADMIN"} />
    </AdminShell>
  );
}
