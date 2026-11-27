import { NextResponse, type NextRequest } from "next/server";
import { MAGIC_SESSION_COOKIE } from "@/lib/constants";

const RULES_ENGINE_API_URL =
  process.env.RULES_ENGINE_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4001";

export async function POST(request: NextRequest) {
  const body = await request.text();
  try {
    const upstream = await fetch(`${RULES_ENGINE_API_URL}/api/v1/magic-link/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });

    const data = (await upstream.json().catch(() => ({}))) as {
      verified?: boolean;
      session_token?: string;
      expires_in_seconds?: number;
      session_id?: string;
      error?: string;
    };

    if (!upstream.ok || !data.session_token) {
      return NextResponse.json(
        { error: data.error ?? "Magic-link verification failed" },
        { status: upstream.status },
      );
    }

    // Issue short-lived HttpOnly cookie; never expose signed token or PHI to browser storage
    const response = NextResponse.json({
      verified: true,
      session_id: data.session_id,
    });
    response.cookies.set(MAGIC_SESSION_COOKIE, data.session_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: data.expires_in_seconds ?? 1800,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Unable to reach verification service" },
      { status: 502 },
    );
  }
}
