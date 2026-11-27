import { NextResponse, type NextRequest } from "next/server";
import {
  DEV_ACTOR_COOKIE,
  DEV_ROLE_COOKIE,
  isAuthorizedForAdminPortal,
  resolvePortalIdentity,
} from "./lib/rbac";

const PUBLIC_PATHS = ["/unauthorized", "/demo-gate", "/api/auth/dev-session", "/api/auth/demo-gate"];
const DEMO_ACCESS_COOKIE = "hrp_demo_access";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  const isDemoMode = process.env.DEMO_MODE === "true";
  const requiredDemoCode = process.env.DEMO_ACCESS_CODE?.trim();

  // Optional passcode gate when hosting a public demo site
  if (isDemoMode && requiredDemoCode) {
    const granted = request.cookies.get(DEMO_ACCESS_COOKIE)?.value === requiredDemoCode;
    if (!granted) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Demo access passcode required" }, { status: 401 });
      }
      const gateUrl = request.nextUrl.clone();
      gateUrl.pathname = "/demo-gate";
      gateUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(gateUrl);
    }
  }

  const identity = resolvePortalIdentity({
    iapEmail: request.headers.get("x-goog-authenticated-user-email"),
    iapUserId: request.headers.get("x-goog-authenticated-user-id"),
    headerRole: request.headers.get("x-actor-role"),
    headerActorId: request.headers.get("x-actor-id"),
    cookieRole: request.cookies.get(DEV_ROLE_COOKIE)?.value ?? null,
    cookieActorId: request.cookies.get(DEV_ACTOR_COOKIE)?.value ?? null,
    isProduction: process.env.NODE_ENV === "production",
    isDemoMode,
    adminEmailAllowlist: process.env.ADMIN_EMAIL_ALLOWLIST,
  });

  if (!isAuthorizedForAdminPortal(identity)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: identity ? "Forbidden: ADMIN role required" : "Authentication required",
          role: identity?.role ?? null,
        },
        { status: identity ? 403 : 401 },
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/unauthorized";
    url.searchParams.set("role", identity?.role ?? "UNAUTHENTICATED");
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-verified-actor-id", identity!.actorId);
  requestHeaders.set("x-verified-actor-role", identity!.role);
  requestHeaders.set("x-verified-auth-source", identity!.authSource);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
