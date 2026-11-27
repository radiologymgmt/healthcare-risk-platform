import { headers } from "next/headers";
import { AdminShell } from "@/components/admin-shell";
import { RulesEditor } from "@/components/rules-editor";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const hdrs = await headers();
  const actorId = hdrs.get("x-verified-actor-id") ?? "dev-clinical-admin-01";
  const actorRole = hdrs.get("x-verified-actor-role") ?? "ADMIN";
  const authSource = hdrs.get("x-verified-auth-source") ?? "DEV_DEFAULT";

  return (
    <AdminShell
      actorId={actorId}
      actorRole={actorRole}
      authSource={authSource}
      isProduction={process.env.NODE_ENV === "production"}
    >
      <RulesEditor />
    </AdminShell>
  );
}
