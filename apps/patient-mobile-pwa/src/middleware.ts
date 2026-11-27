import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/demo-gate", "/api/auth/demo-gate", "/manifest.json"];

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
