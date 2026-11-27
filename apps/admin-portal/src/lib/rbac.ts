import type { ActorRole } from "@healthcare/shared-contracts";

export const DEV_ROLE_COOKIE = "hrp_admin_role";
export const DEV_ACTOR_COOKIE = "hrp_admin_actor";

export interface PortalIdentity {
  actorId: string;
  role: ActorRole;
  authSource: "GCP_IAP" | "DEV_COOKIE" | "DEV_DEFAULT";
}

export interface RbacInput {
  iapEmail?: string | null;
  iapUserId?: string | null;
  headerRole?: string | null;
  headerActorId?: string | null;
  cookieRole?: string | null;
  cookieActorId?: string | null;
  isProduction: boolean;
  adminEmailAllowlist?: string;
}

const VALID_ROLES = new Set<ActorRole>(["ADMIN", "PROVIDER", "PATIENT", "SYSTEM"]);

function parseIapPrincipal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.includes(":") ? raw.split(":").slice(1).join(":") : raw;
  return cleaned.trim() || null;
}

function parseRole(raw: string | null | undefined): ActorRole | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase() as ActorRole;
  return VALID_ROLES.has(upper) ? upper : null;
}

/**
 * Resolves the caller's RBAC identity from GCP Identity-Aware Proxy (IAP) headers,
 * or (in non-production environments) an HttpOnly dev-session cookie.
 * Never reads from browser localStorage/sessionStorage.
 */
export function resolvePortalIdentity(input: RbacInput): PortalIdentity | null {
  const iapEmail = parseIapPrincipal(input.iapEmail);
  const iapId = parseIapPrincipal(input.iapUserId);

  if (iapEmail || iapId) {
    const allowlist = (input.adminEmailAllowlist ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const role: ActorRole =
      iapEmail && allowlist.includes(iapEmail.toLowerCase())
        ? "ADMIN"
        : parseRole(input.headerRole) ?? "PROVIDER";

    return {
      actorId: iapId ?? `iap:${iapEmail ?? "unknown"}`,
      role,
      authSource: "GCP_IAP",
    };
  }

  // Production strictly requires GCP IAP identity
  if (input.isProduction) {
    return null;
  }

  // Non-production: respect explicit header or HttpOnly dev cookie
  const explicitRole = parseRole(input.headerRole) ?? parseRole(input.cookieRole);
  if (explicitRole) {
    return {
      actorId:
        input.headerActorId?.trim() ||
        input.cookieActorId?.trim() ||
        `dev-${explicitRole.toLowerCase()}-01`,
      role: explicitRole,
      authSource: "DEV_COOKIE",
    };
  }

  // Default synthetic local developer admin session when running locally without IAP
  return {
    actorId: "dev-clinical-admin-01",
    role: "ADMIN",
    authSource: "DEV_DEFAULT",
  };
}

export function isAuthorizedForAdminPortal(identity: PortalIdentity | null): boolean {
  return identity !== null && identity.role === "ADMIN";
}
