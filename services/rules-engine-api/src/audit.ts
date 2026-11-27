import type { Pool, PoolClient } from "pg";
import { redactPhi, type ActorRole } from "@healthcare/shared-contracts";

export interface AuditLogInput {
  actor_id: string;
  actor_role: ActorRole;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  ip_address?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Writes an immutable HIPAA audit trail entry to `audit_logs`.
 * Automatically redacts any PHI keys from `metadata` before persistence.
 */
export async function writeAuditLog(
  db: Pool | PoolClient,
  entry: AuditLogInput,
): Promise<void> {
  const safeMetadata = redactPhi(entry.metadata ?? {});
  const ip =
    entry.ip_address && /^[0-9a-fA-F:.]+$/.test(entry.ip_address)
      ? entry.ip_address
      : null;

  await db.query(
    `
    INSERT INTO audit_logs (
      actor_id,
      actor_role,
      action,
      resource_type,
      resource_id,
      ip_address,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6::inet, $7::jsonb)
    `,
    [
      entry.actor_id,
      entry.actor_role,
      entry.action,
      entry.resource_type,
      entry.resource_id ?? null,
      ip,
      JSON.stringify(safeMetadata),
    ],
  );
}
