import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_SESSION_COOKIE_NAME,
  resolveSharedCookieDomain,
} from "@healthcare/shared-contracts";

export async function POST(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const cookieDomain = resolveSharedCookieDomain(host);
  const isHttps =
    request.nextUrl.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 0,
  });
  if (cookieDomain) {
    response.cookies.set(DEMO_SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps,
      path: "/",
      domain: cookieDomain,
      maxAge: 0,
    });
  }
  return response;
}
