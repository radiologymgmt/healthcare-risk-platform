import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_SESSION_COOKIE_NAME,
  resolveDemoSessionSecret,
  verifyDemoSessionToken,
} from "@healthcare/shared-contracts";
import { isAuthorizedProvider, resolveProviderIdentity } from "./lib/rbac";

const PUBLIC_PATHS = ["/unauthorized", "/demo-gate", "/api/auth/demo-gate", "/brand"];

function resolveDemoHubGateUrl(request: NextRequest): string {
  const adminBase = (
    process.env.DEMO_ADMIN_GATE_URL?.trim() || "https://admin.demo.risk.radmgmt.org/demo-gate"
  ).replace(/\/$/, "");
  const fwdHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const fwdProto = request.headers.get("x-forwarded-proto") ?? "https";
  const returnUrl = fwdHost
    ? `${fwdProto}://${fwdHost}${request.nextUrl.pathname}${request.nextUrl.search}`
    : request.nextUrl.href;
  return `${adminBase}?next=${encodeURIComponent(returnUrl)}`;
}

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

  if (isDemoMode && process.env.DEMO_AUTH_ENFORCED === "true") {
    const secret = resolveDemoSessionSecret(process.env);
    const session = await verifyDemoSessionToken(
      request.cookies.get(DEMO_SESSION_COOKIE_NAME)?.value,
      secret,
    );
    if (!session || (!session.isSuperAdmin && !session.agreementSigned)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Demo sign-in and agreement signature required." },
          { status: 401 },
        );
      }
      return NextResponse.redirect(resolveDemoHubGateUrl(request));
    }

    const reqHeaders = new Headers(request.headers);
    reqHeaders.set("x-verified-actor-id", session.email);
    // Invited Demo VIEWER users can explore the Provider Dashboard in demo mode
    reqHeaders.set(
      "x-verified-actor-role",
      session.isSuperAdmin || session.role === "ADMIN" ? "ADMIN" : "PROVIDER",
    );
    return NextResponse.next({ request: { headers: reqHeaders } });
  }

  const requiredDemoCode = process.env.DEMO_ACCESS_CODE?.trim();
  if (isDemoMode && requiredDemoCode) {
    if (request.cookies.get("hrp_demo_access")?.value !== requiredDemoCode) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Demo access passcode required" }, { status: 401 });
      }
      const gate = request.nextUrl.clone();
      gate.pathname = "/demo-gate";
      gate.searchParams.set("next", pathname);
      return NextResponse.redirect(gate);
    }
  }

  const identity = resolveProviderIdentity({
    iapEmail: request.headers.get("x-goog-authenticated-user-email"),
    iapUserId: request.headers.get("x-goog-authenticated-user-id"),
    headerRole: request.headers.get("x-actor-role"),
    headerActorId: request.headers.get("x-actor-id"),
    isProduction: process.env.NODE_ENV === "production",
    isDemoMode,
  });

  if (!isAuthorizedProvider(identity)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: identity ? "Forbidden: PROVIDER or ADMIN role required" : "Authentication required" },
        { status: identity ? 403 : 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/unauthorized";
    return NextResponse.redirect(url);
  }

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-verified-actor-id", identity!.actorId);
  reqHeaders.set("x-verified-actor-role", identity!.role);
  return NextResponse.next({ request: { headers: reqHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
