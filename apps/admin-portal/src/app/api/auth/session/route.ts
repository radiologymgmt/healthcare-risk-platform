import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_SESSION_COOKIE_NAME,
  resolveDemoSessionSecret,
  verifyDemoSessionToken,
} from "@healthcare/shared-contracts";

export async function GET(request: NextRequest) {
  const secret = resolveDemoSessionSecret(process.env);
  const session = await verifyDemoSessionToken(
    request.cookies.get(DEMO_SESSION_COOKIE_NAME)?.value,
    secret,
  );
  const googleOAuthConfigured = Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
  );

  return NextResponse.json({
    authenticated: Boolean(session),
    session,
    googleOAuthConfigured,
  });
}
