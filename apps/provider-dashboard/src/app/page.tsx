import { headers } from "next/headers";
import { ProviderWorkqueue } from "@/components/provider-workqueue";

export const dynamic = "force-dynamic";

export default async function ProviderHomePage() {
  const hdrs = await headers();
  const providerId = hdrs.get("x-verified-actor-id") ?? "dr-elena-morales-md";
  const providerRole = hdrs.get("x-verified-actor-role") ?? "PROVIDER";
  return <ProviderWorkqueue providerId={providerId} providerRole={providerRole} />;
}
