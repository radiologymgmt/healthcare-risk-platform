import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedProvider, resolveProviderIdentity } from "./lib/rbac";

const PUBLIC_PATHS = ["/unauthorized", "/demo-gate", "/api/auth/demo-gate"];

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
