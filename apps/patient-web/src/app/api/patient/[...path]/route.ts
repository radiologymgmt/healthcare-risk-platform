import { NextResponse, type NextRequest } from "next/server";
import { getCloudRunAuthHeaders } from "@healthcare/shared-contracts";

const RULES_ENGINE_API_URL =
  process.env.RULES_ENGINE_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4001";

const ALLOWED_PREFIXES = [
  "questionnaire/config",
  "patients/sessions",
  "sessions/",
  "insurance/verify",
  "appointments",
  "public/release",
  "payers/accepted",
];

async function proxyPatientApi(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const joined = path.join("/");
  if (!ALLOWED_PREFIXES.some((prefix) => joined === prefix || joined.startsWith(prefix))) {
    return NextResponse.json({ error: "Endpoint not permitted on patient portal" }, { status: 403 });
  }

  const targetUrl = new URL(`${RULES_ENGINE_API_URL}/api/v1/${joined}`);
  request.nextUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v));

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();

  try {
    const authHeaders = await getCloudRunAuthHeaders(RULES_ENGINE_API_URL);
    const upstream = await fetch(targetUrl.toString(), {
      method,
      headers: { ...authHeaders, "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to reach clinical assessment service." },
      { status: 502 },
    );
  }
}

export const GET = proxyPatientApi;
export const POST = proxyPatientApi;
