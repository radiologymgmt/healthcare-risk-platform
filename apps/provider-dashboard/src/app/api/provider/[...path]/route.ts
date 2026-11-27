import { NextResponse, type NextRequest } from "next/server";

const RULES_ENGINE_API_URL =
  process.env.RULES_ENGINE_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4001";

async function proxyProviderApi(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const actorId = request.headers.get("x-verified-actor-id");
  const actorRole = request.headers.get("x-verified-actor-role");

  if (!actorId || (actorRole !== "PROVIDER" && actorRole !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const suffix = path.join("/");
  const targetUrl = new URL(
    `${RULES_ENGINE_API_URL}/api/v1/workqueue${suffix ? `/${suffix}` : ""}`,
  );
  request.nextUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v));

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method,
      headers: {
        "x-actor-id": actorId,
        "x-actor-role": actorRole,
        "content-type": "application/json",
      },
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Unable to reach clinical workqueue API" }, { status: 502 });
  }
}

export const GET = proxyProviderApi;
export const POST = proxyProviderApi;
