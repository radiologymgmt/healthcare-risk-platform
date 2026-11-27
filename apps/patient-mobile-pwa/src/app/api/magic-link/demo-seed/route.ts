import { NextResponse } from "next/server";

const RULES_ENGINE_API_URL =
  process.env.RULES_ENGINE_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4001";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
  }
  try {
    const upstream = await fetch(`${RULES_ENGINE_API_URL}/api/v1/magic-link/demo-seed`, {
      method: "POST",
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Rules Engine API unreachable" }, { status: 502 });
  }
}
