import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_SESSION_COOKIE_NAME,
  DEMO_SESSION_MAX_AGE_SECONDS,
  getCloudRunAuthHeaders,
  resolveDemoSessionSecret,
  resolveSharedCookieDomain,
  signDemoSessionToken,
  verifyDemoSessionToken,
} from "@healthcare/shared-contracts";

const RULES_ENGINE_API_URL =
  process.env.RULES_ENGINE_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4001";

export async function POST(request: NextRequest) {
  try {
    const secret = resolveDemoSessionSecret(process.env);
    const current = await verifyDemoSessionToken(
      request.cookies.get(DEMO_SESSION_COOKIE_NAME)?.value,
      secret,
    );
    if (!current) {
      return NextResponse.json(
        { error: "Please sign in with your authorized account before signing agreements." },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      full_name?: string;
      organization?: string;
      signed_date?: string;
      accepted_mnda?: boolean;
      accepted_sandbox?: boolean;
      accepted_non_phi?: boolean;
      accepted_pre_prod_notice?: boolean;
    };

    const enteredEmail = (body.email ?? "").trim().toLowerCase();
    if (enteredEmail !== current.email.toLowerCase()) {
      return NextResponse.json(
        { error: `Email must match your signed-in account (${current.email}).` },
        { status: 400 },
      );
    }

    const authHeaders = await getCloudRunAuthHeaders(RULES_ENGINE_API_URL);
    const upstream = await fetch(`${RULES_ENGINE_API_URL}/api/v1/demo-auth/sign-agreement`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      body: JSON.stringify({
        email: current.email,
        full_name: body.full_name,
        organization: body.organization ?? current.organization ?? undefined,
        signed_date: body.signed_date,
        accepted_mnda: body.accepted_mnda,
        accepted_sandbox: body.accepted_sandbox,
        accepted_non_phi: body.accepted_non_phi,
        accepted_pre_prod_notice: body.accepted_pre_prod_notice,
      }),
      cache: "no-store",
    });

    const data = (await upstream.json()) as { error?: string; agreement?: unknown };
    if (!upstream.ok) {
      return NextResponse.json(
        { error: data.error ?? "Unable to record agreement signature." },
        { status: upstream.status },
      );
    }

    const upgradedToken = await signDemoSessionToken(
      {
        email: current.email,
        fullName: body.full_name?.trim() || current.fullName,
        role: current.role,
        organization: body.organization?.trim() || current.organization || null,
        isSuperAdmin: current.isSuperAdmin,
        agreementSigned: true,
        authMethod: current.authMethod,
      },
      secret,
    );

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const cookieDomain = resolveSharedCookieDomain(host);
    const isHttps =
      request.nextUrl.protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https";

    const response = NextResponse.json({
      ok: true,
      agreement: data.agreement,
    });
    response.cookies.set(DEMO_SESSION_COOKIE_NAME, upgradedToken, {
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
      { error: "Unable to record electronic signature right now." },
      { status: 502 },
    );
  }
}
