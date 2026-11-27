import { NextResponse, type NextRequest } from "next/server";
import { getCloudRunAuthHeaders } from "@healthcare/shared-contracts";
import { MAGIC_SESSION_COOKIE } from "@/lib/constants";

const RULES_ENGINE_API_URL =
  process.env.RULES_ENGINE_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4001";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(MAGIC_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Verification session expired" }, { status: 401 });
  }

  const body = await request.text();
  try {
    const authHeaders = await getCloudRunAuthHeaders(RULES_ENGINE_API_URL);
    const upstream = await fetch(`${RULES_ENGINE_API_URL}/api/v1/magic-link/confirm`, {
      method: "POST",
      headers: {
        ...authHeaders,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    const response = new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });

    if (upstream.ok) {
      // Clear short-lived session cookie once single-use review is completed
      response.cookies.set(MAGIC_SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to submit confirmations" }, { status: 502 });
  }
}
