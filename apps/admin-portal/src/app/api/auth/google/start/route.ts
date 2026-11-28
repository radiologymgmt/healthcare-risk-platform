import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const OAUTH_STATE_COOKIE = "hrp_google_oauth_state";
const OAUTH_NEXT_COOKIE = "hrp_google_oauth_next";

function resolvePublicOrigin(request: NextRequest): string {
  const fwdHost = request.headers.get("x-forwarded-host");
  const fwdProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (fwdHost) return `${fwdProto}://${fwdHost}`;
  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const nextUrl = request.nextUrl.searchParams.get("next") || "/demo";
  const origin = resolvePublicOrigin(request);

  if (!clientId || !clientSecret) {
    const fallback = new URL("/demo-gate", origin);
    fallback.searchParams.set("google_setup", "1");
    fallback.searchParams.set("next", nextUrl);
    return NextResponse.redirect(fallback);
  }

  const state = crypto.randomBytes(24).toString("hex");
  const redirectUri = `${origin}/api/auth/google/callback`;

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("prompt", "select_account");
  googleAuthUrl.searchParams.set("state", state);

  const isHttps = origin.startsWith("https://");
  const response = NextResponse.redirect(googleAuthUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 600,
  });
  response.cookies.set(OAUTH_NEXT_COOKIE, nextUrl, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 600,
  });
  return response;
}
