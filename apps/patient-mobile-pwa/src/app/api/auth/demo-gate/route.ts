import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const expected = process.env.DEMO_ACCESS_CODE?.trim();
  if (!expected) return NextResponse.json({ ok: true });
  const body = (await request.json().catch(() => ({}))) as { passcode?: string };
  if (!body.passcode || body.passcode.trim() !== expected) {
    return NextResponse.json({ error: "Invalid demo passcode" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("hrp_demo_access", expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
