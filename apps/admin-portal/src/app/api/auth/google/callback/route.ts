import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_SESSION_COOKIE_NAME,
  DEMO_SESSION_MAX_AGE_SECONDS,
  getCloudRunAuthHeaders,
  resolveDemoSessionSecret,
  resolveSharedCookieDomain,
  signDemoSessionToken,
} from "@healthcare/shared-contracts";

const RULES_ENGINE_API_URL =
  process.env.RULES_ENGINE_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4001";
const OAUTH_STATE_COOKIE = "hrp_google_oauth_state";
const OAUTH_NEXT_COOKIE = "hrp_google_oauth_next";

function resolvePublicOrigin(request: NextRequest): string {
  const fwdHost = request.headers.get("x-forwarded-host");
  const fwdProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (fwdHost) return `${fwdProto}://${fwdHost}`;
  return request.nextUrl.origin;
}

function redirectError(origin: string, code: string) {
  const url = new URL("/demo-gate", origin);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const origin = resolvePublicOrigin(request);
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return redirectError(origin, "google_not_configured");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const nextTarget = request.cookies.get(OAUTH_NEXT_COOKIE)?.value || "/demo";

  if (!code || !state || !storedState || state !== storedState) {
    return redirectError(origin, "google_state_mismatch");
  }

  try {
    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });

    const tokenData = (await tokenRes.json()) as { id_token?: string; error?: string };
    if (!tokenRes.ok || !tokenData.id_token) {
      return redirectError(origin, "google_token_exchange_failed");
    }

    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`,
      { cache: "no-store" },
    );
    const info = (await infoRes.json()) as {
      aud?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
      sub?: string;
    };

    const verified = info.email_verified === true || info.email_verified === "true";
    if (!infoRes.ok || info.aud !== clientId || !info.email || !verified) {
      return redirectError(origin, "google_identity_unverified");
    }

    const authHeaders = await getCloudRunAuthHeaders(RULES_ENGINE_API_URL);
    const verifyRes = await fetch(`${RULES_ENGINE_API_URL}/api/v1/demo-auth/google-verify`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
      },
      body: JSON.stringify({
        email: info.email,
        full_name: info.name ?? info.email,
        google_sub: info.sub ?? "",
      }),
      cache: "no-store",
    });

    const verifyData = (await verifyRes.json()) as {
      error?: string;
      user?: {
        email: string;
        full_name: string;
        role: "ADMIN" | "PROVIDER" | "COORDINATOR" | "AUDITOR" | "VIEWER";
        organization?: string | null;
        is_hardcoded_admin: boolean;
      };
      agreement_signed?: boolean;
    };

    if (!verifyRes.ok || !verifyData.user) {
      return redirectError(origin, "google_account_not_authorized");
    }

    const secret = resolveDemoSessionSecret(process.env);
    const sessionToken = await signDemoSessionToken(
      {
        email: verifyData.user.email,
        fullName: verifyData.user.full_name,
        role: verifyData.user.role,
        organization: verifyData.user.organization ?? null,
        isSuperAdmin: verifyData.user.is_hardcoded_admin,
        agreementSigned: Boolean(verifyData.agreement_signed),
        authMethod: "google",
      },
      secret,
    );

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const cookieDomain = resolveSharedCookieDomain(host);
    const isHttps = origin.startsWith("https://");

    const destination = verifyData.agreement_signed
      ? nextTarget.startsWith("https://") && nextTarget.includes(".demo.risk.radmgmt.org")
        ? nextTarget
        : new URL(nextTarget.startsWith("/") ? nextTarget : "/demo", origin)
      : new URL(`/demo-gate?next=${encodeURIComponent(nextTarget)}`, origin);

    const response = NextResponse.redirect(destination);
    response.cookies.set(DEMO_SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps,
      path: "/",
      domain: cookieDomain,
      maxAge: DEMO_SESSION_MAX_AGE_SECONDS,
    });
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.delete(OAUTH_NEXT_COOKIE);
    return response;
  } catch {
    return redirectError(origin, "google_callback_error");
  }
}
