import { NextResponse, type NextRequest } from "next/server";
import { getCloudRunAuthHeaders } from "@healthcare/shared-contracts";
import { MAGIC_SESSION_COOKIE } from "@/lib/constants";

const RULES_ENGINE_API_URL =
  process.env.RULES_ENGINE_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4001";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(MAGIC_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Verification required" }, { status: 401 });
  }

  try {
    const authHeaders = await getCloudRunAuthHeaders(RULES_ENGINE_API_URL);
    const upstream = await fetch(`${RULES_ENGINE_API_URL}/api/v1/magic-link/session`, {
      method: "GET",
      headers: { ...authHeaders, authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Unable to load pre-populated review cards" }, { status: 502 });
  }
}
