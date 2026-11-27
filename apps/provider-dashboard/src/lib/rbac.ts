import type { ActorRole } from "@healthcare/shared-contracts";

export interface ProviderIdentity {
  actorId: string;
  role: ActorRole;
  authSource: "GCP_IAP" | "DEV_HEADER" | "DEV_DEFAULT";
}

const VALID_ROLES = new Set<ActorRole>(["ADMIN", "PROVIDER", "PATIENT", "SYSTEM"]);

function parseIap(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.includes(":") ? raw.split(":").slice(1).join(":") : raw;
  return cleaned.trim() || null;
}

export function resolveProviderIdentity(input: {
  iapEmail?: string | null;
  iapUserId?: string | null;
  headerRole?: string | null;
  headerActorId?: string | null;
  isProduction: boolean;
}): ProviderIdentity | null {
  const iapEmail = parseIap(input.iapEmail);
  const iapId = parseIap(input.iapUserId);

  if (iapEmail || iapId) {
    const rawRole = input.headerRole?.trim().toUpperCase() as ActorRole | undefined;
    const role: ActorRole = rawRole && VALID_ROLES.has(rawRole) ? rawRole : "PROVIDER";
    return {
      actorId: iapId ?? `iap:${iapEmail ?? "clinician"}`,
      role,
      authSource: "GCP_IAP",
    };
  }

  if (input.isProduction) return null;

  const rawRole = input.headerRole?.trim().toUpperCase() as ActorRole | undefined;
  if (rawRole && VALID_ROLES.has(rawRole)) {
    return {
      actorId: input.headerActorId?.trim() || `dev-${rawRole.toLowerCase()}-01`,
      role: rawRole,
      authSource: "DEV_HEADER",
    };
  }

  return {
    actorId: "dr-elena-morales-md",
    role: "PROVIDER",
    authSource: "DEV_DEFAULT",
  };
}

export function isAuthorizedProvider(identity: ProviderIdentity | null): boolean {
  return identity !== null && (identity.role === "PROVIDER" || identity.role === "ADMIN");
}
