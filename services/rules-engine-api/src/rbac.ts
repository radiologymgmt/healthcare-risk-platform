import type { NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import { ActorRoleSchema, type ActorRole, type HipaaLogger } from "@healthcare/shared-contracts";
import { writeAuditLog } from "./audit.js";

export interface AuthenticatedActor {
  actor_id: string;
  actor_role: ActorRole;
  auth_source: "GCP_IAP" | "INTERNAL_HEADER";
}

export interface AuthenticatedRequest extends Request {
  actor?: AuthenticatedActor;
}

function extractClientIp(req: Request): string | null {
  const raw = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!raw) return null;
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function parseIapPrincipal(headerVal: string | undefined): string | null {
  if (!headerVal) return null;
  // GCP IAP prefixes principals with "accounts.google.com:"
  const cleaned = headerVal.includes(":") ? headerVal.split(":").slice(1).join(":") : headerVal;
  return cleaned.trim() || null;
}

function resolveActor(req: Request): AuthenticatedActor | null {
  const iapEmail = parseIapPrincipal(req.header("x-goog-authenticated-user-email"));
  const iapId = parseIapPrincipal(req.header("x-goog-authenticated-user-id"));
  const headerRole = req.header("x-actor-role")?.toUpperCase();
  const headerActorId = req.header("x-actor-id")?.trim();

  // Prefer GCP Identity-Aware Proxy (IAP) identity when present
  if (iapEmail || iapId) {
    const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    let role: ActorRole = "PROVIDER";
    if (iapEmail && allowlist.includes(iapEmail.toLowerCase())) {
      role = "ADMIN";
    } else if (headerRole) {
      const parsed = ActorRoleSchema.safeParse(headerRole);
      if (parsed.success) role = parsed.data;
    }

    return {
      actor_id: iapId ?? `iap:${iapEmail ? Buffer.from(iapEmail).toString("base64url").slice(0, 24) : "unknown"}`,
      actor_role: role,
      auth_source: "GCP_IAP",
    };
  }

  // Internal VPC / development service headers
  if (headerActorId && headerRole) {
    const parsed = ActorRoleSchema.safeParse(headerRole);
    if (!parsed.success) return null;
    return {
      actor_id: headerActorId,
      actor_role: parsed.data,
      auth_source: "INTERNAL_HEADER",
    };
  }

  return null;
}

/**
 * Express RBAC Middleware enforcing role-based access control on protected routes.
 * - 401 when unauthenticated
 * - 403 + immutable HIPAA audit log when role is not permitted
 */
export function requireRole(
  allowedRoles: readonly ActorRole[],
  pool: Pool,
  logger: HipaaLogger,
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const actor = resolveActor(req);
    if (!actor) {
      logger.warn("Blocked unauthenticated request to protected route", {
        method: req.method,
        path: req.originalUrl,
      });
      res.status(401).json({
        error: "Authentication required (GCP IAP or verified actor headers missing)",
      });
      return;
    }

    if (!allowedRoles.includes(actor.actor_role)) {
      logger.warn("RBAC access denied", {
        actor_id: actor.actor_id,
        actor_role: actor.actor_role,
        required_roles: allowedRoles,
        method: req.method,
        path: req.originalUrl,
      });

      try {
        await writeAuditLog(pool, {
          actor_id: actor.actor_id,
          actor_role: actor.actor_role,
          action: "ACCESS_DENIED",
          resource_type: "admin_api",
          resource_id: req.originalUrl.slice(0, 128),
          ip_address: extractClientIp(req),
          metadata: {
            method: req.method,
            required_roles: allowedRoles,
            auth_source: actor.auth_source,
          },
        });
      } catch {
        // Do not mask 403 if audit insert fails
      }

      res.status(403).json({
        error: "Forbidden: insufficient role privileges",
        required_roles: allowedRoles,
      });
      return;
    }

    req.actor = actor;
    next();
  };
}
