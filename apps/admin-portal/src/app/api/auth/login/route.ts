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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };

    const authHeaders = await getCloudRunAuthHeaders(RULES_ENGINE_API_URL);
    const upstream = await fetch(`${RULES_ENGINE_API_URL}/api/v1/demo-auth/login`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
      },
      body: JSON.stringify({
        email: body.email ?? "",
        password: body.password ?? "",
      }),
      cache: "no-store",
    });

    const data = (await upstream.json()) as {
      error?: string;
      user?: {
        id: string;
        email: string;
        full_name: string;
        role: "ADMIN" | "PROVIDER" | "COORDINATOR" | "AUDITOR" | "VIEWER";
        organization?: string | null;
        is_hardcoded_admin: boolean;
      };
      requires_agreement?: boolean;
      agreement_signed?: boolean;
    };

    if (!upstream.ok || !data.user) {
      return NextResponse.json(
        { error: data.error ?? "Invalid email or password." },
        { status: upstream.status || 401 },
      );
    }

    const secret = resolveDemoSessionSecret(process.env);
    const token = await signDemoSessionToken(
      {
        email: data.user.email,
        fullName: data.user.full_name,
        role: data.user.role,
        organization: data.user.organization ?? null,
        isSuperAdmin: data.user.is_hardcoded_admin,
        agreementSigned: Boolean(data.agreement_signed),
        authMethod: "password",
      },
      secret,
    );

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const cookieDomain = resolveSharedCookieDomain(host);
    const isHttps =
      request.nextUrl.protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https";

    const response = NextResponse.json({
      user: data.user,
      requires_agreement: Boolean(data.requires_agreement),
      agreement_signed: Boolean(data.agreement_signed),
    });

    response.cookies.set(DEMO_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps,
      path: "/",
      domain: cookieDomain,
      maxAge: DEMO_SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify credentials right now. Please try again." },
      { status: 502 },
    );
  }
}
