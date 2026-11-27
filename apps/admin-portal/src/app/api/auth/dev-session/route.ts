import { NextResponse, type NextRequest } from "next/server";
import { ActorRoleSchema } from "@healthcare/shared-contracts";
import { DEV_ACTOR_COOKIE, DEV_ROLE_COOKIE } from "@/lib/rbac";

/**
 * Development-only HttpOnly cookie switcher for verifying RBAC middleware behavior
 * (ADMIN vs PROVIDER vs PATIENT). Disabled in production where GCP IAP is mandatory.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
    return NextResponse.json(
      { error: "Dev role switching is disabled in production (GCP IAP required)." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { role?: string; actorId?: string };
  const parsed = ActorRoleSchema.safeParse(body.role?.toUpperCase());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const role = parsed.data;
  const actorId = body.actorId?.trim() || `dev-${role.toLowerCase()}-01`;

  const response = NextResponse.json({ ok: true, role, actorId });
  response.cookies.set(DEV_ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  response.cookies.set(DEV_ACTOR_COOKIE, actorId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
