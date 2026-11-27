import { NextResponse, type NextRequest } from "next/server";

const RULES_ENGINE_API_URL =
  process.env.RULES_ENGINE_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4001";

async function proxyToRulesApi(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const actorId = request.headers.get("x-verified-actor-id");
  const actorRole = request.headers.get("x-verified-actor-role");

  if (!actorId || actorRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden: ADMIN role required" }, { status: 403 });
  }

  const targetUrl = new URL(`${RULES_ENGINE_API_URL}/api/v1/admin/${path.join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const headers = new Headers();
  headers.set("x-actor-id", actorId);
  headers.set("x-actor-role", actorRole);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method,
      headers,
      body,
      cache: "no-store",
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to reach Rules Engine API service. Ensure rules-engine-api is running." },
      { status: 502 },
    );
  }
}

export const GET = proxyToRulesApi;
export const POST = proxyToRulesApi;
export const PUT = proxyToRulesApi;
export const DELETE = proxyToRulesApi;
