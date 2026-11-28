import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_SESSION_COOKIE_NAME,
  resolveDemoSessionSecret,
  verifyDemoSessionToken,
} from "@healthcare/shared-contracts";
import {
  DEV_ACTOR_COOKIE,
  DEV_ROLE_COOKIE,
  isAuthorizedForAdminPortal,
  resolvePortalIdentity,
} from "./lib/rbac";

const PUBLIC_PATHS = [
  "/unauthorized",
  "/demo-gate",
  "/brand",
  "/api/auth",
];
const VIEWER_ALLOWED_PATHS = ["/demo", "/docs"];
const DEMO_ACCESS_COOKIE = "hrp_demo_access";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  const isDemoMode = process.env.DEMO_MODE === "true";
  const demoAuthEnforced = process.env.DEMO_AUTH_ENFORCED === "true";

  // 1. Check signed cross-subdomain Demo Session cookie (Google Super-Admin or Admin-created User)
  const demoSecret = resolveDemoSessionSecret(process.env);
  const demoSession = await verifyDemoSessionToken(
    request.cookies.get(DEMO_SESSION_COOKIE_NAME)?.value,
    demoSecret,
  );

  if (isDemoMode && demoAuthEnforced) {
    if (!demoSession || (!demoSession.isSuperAdmin && !demoSession.agreementSigned)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Demo authentication and signed pre-demo agreement required." },
          { status: 401 },
        );
      }
      const gateUrl = request.nextUrl.clone();
      gateUrl.pathname = "/demo-gate";
      gateUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(gateUrl);
    }

    // Authenticated & signed Demo Session
    const isViewerRoute = VIEWER_ALLOWED_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );

    if (demoSession.role !== "ADMIN" && !demoSession.isSuperAdmin) {
      if (!isViewerRoute) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Forbidden: ADMIN role required for configuration endpoints." },
            { status: 403 },
          );
        }
        const demoUrl = request.nextUrl.clone();
        demoUrl.pathname = "/demo";
        return NextResponse.redirect(demoUrl);
      }

      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-verified-actor-id", demoSession.email);
      requestHeaders.set("x-verified-actor-role", demoSession.role);
      requestHeaders.set(
        "x-verified-auth-source",
        demoSession.authMethod === "google" ? "GOOGLE_OAUTH" : "DEMO_USER",
      );
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    // Authenticated ADMIN / Hardcoded Super-Admin (radiologymgmt@gmail.com)
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-verified-actor-id", demoSession.email);
    requestHeaders.set("x-verified-actor-role", "ADMIN");
    requestHeaders.set(
      "x-verified-auth-source",
      demoSession.isSuperAdmin
        ? demoSession.authMethod === "google"
          ? "GOOGLE_SUPER_ADMIN"
          : "HARDCODED_ADMIN"
        : "ADMIN_USER",
    );
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Legacy passcode gate when DEMO_ACCESS_CODE is explicitly set without DEMO_AUTH_ENFORCED
  const requiredDemoCode = process.env.DEMO_ACCESS_CODE?.trim();
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
