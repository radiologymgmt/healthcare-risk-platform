import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_SESSION_COOKIE_NAME,
  resolveDemoSessionSecret,
  verifyDemoSessionToken,
} from "@healthcare/shared-contracts";

const PUBLIC_PATHS = ["/demo-gate", "/api/auth/demo-gate", "/brand"];

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
  }

  const requiredCode = process.env.DEMO_ACCESS_CODE?.trim();
  if (isDemoMode && requiredCode) {
    if (request.cookies.get("hrp_demo_access")?.value !== requiredCode) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Demo access passcode required" }, { status: 401 });
      }
      const gate = request.nextUrl.clone();
      gate.pathname = "/demo-gate";
      gate.searchParams.set("next", pathname);
      return NextResponse.redirect(gate);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
