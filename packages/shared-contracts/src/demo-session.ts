import { HARDCODED_SUPER_ADMIN_EMAIL } from "./legal-contracts.js";

export const DEMO_SESSION_COOKIE_NAME = "hrp_demo_session";
export const DEMO_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

export interface DemoSessionPayload {
  email: string;
  fullName: string;
  role: "ADMIN" | "PROVIDER" | "COORDINATOR" | "AUDITOR" | "VIEWER";
  organization?: string | null;
  isSuperAdmin: boolean;
  agreementSigned: boolean;
  authMethod: "google" | "password";
  exp: number; // Unix epoch seconds
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret: string) {
  const enc = new TextEncoder();
  return globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Resolves the shared HMAC signing secret for Demo Hub session cookies.
 * In Cloud Run this is injected via Secret Manager (`DEMO_SESSION_SECRET` or `MAGIC_LINK_SESSION_SECRET`).
 */
export function resolveDemoSessionSecret(env: Record<string, string | undefined>): string {
  const configured =
    env.DEMO_SESSION_SECRET?.trim() || env.MAGIC_LINK_SESSION_SECRET?.trim();
  if (configured && configured.length >= 16) return configured;
  return "synthetic-demo-session-signing-secret-radmgmt-dev-only";
}

/**
 * Signs a DemoSessionPayload into a compact `<payloadB64Url>.<sigB64Url>` token
 * using Web Crypto HMAC-SHA256 (compatible with both Node.js 22 and Next.js Edge Middleware).
 */
export async function signDemoSessionToken(
  payload: Omit<DemoSessionPayload, "exp" | "isSuperAdmin"> & {
    isSuperAdmin?: boolean;
    exp?: number;
  },
  secret: string,
): Promise<string> {
  const normalizedEmail = payload.email.trim().toLowerCase();
  const isSuperAdmin =
    Boolean(payload.isSuperAdmin) || normalizedEmail === HARDCODED_SUPER_ADMIN_EMAIL;
  const fullPayload: DemoSessionPayload = {
    email: normalizedEmail,
    fullName: payload.fullName.trim() || normalizedEmail,
    role: isSuperAdmin ? "ADMIN" : payload.role,
    organization: payload.organization ?? null,
    isSuperAdmin,
    agreementSigned: isSuperAdmin ? true : Boolean(payload.agreementSigned),
    authMethod: payload.authMethod,
    exp: payload.exp ?? Math.floor(Date.now() / 1000) + DEMO_SESSION_MAX_AGE_SECONDS,
  };

  const enc = new TextEncoder();
  const payloadB64 = toBase64Url(enc.encode(JSON.stringify(fullPayload)));
  const key = await importHmacKey(secret);
  const sigBuf = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(sigBuf));
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verifies an HMAC-SHA256 signed DemoSessionPayload token and checks expiration.
 * Returns null if invalid, tampered, or expired.
 */
export async function verifyDemoSessionToken(
  token: string | null | undefined,
  secret: string,
): Promise<DemoSessionPayload | null> {
  if (!token || !token.includes(".")) return null;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;

  try {
    const enc = new TextEncoder();
    const key = await importHmacKey(secret);
    const sigBytes = fromBase64Url(sigB64);
    const valid = await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer,
      enc.encode(payloadB64),
    );
    if (!valid) return null;

    const json = new TextDecoder().decode(fromBase64Url(payloadB64));
    const parsed = JSON.parse(json) as DemoSessionPayload;
    if (!parsed || typeof parsed.email !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    // Re-enforce hardcoded super-admin immunity on verification
    if (parsed.email.toLowerCase() === HARDCODED_SUPER_ADMIN_EMAIL) {
      parsed.isSuperAdmin = true;
      parsed.role = "ADMIN";
      parsed.agreementSigned = true;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Computes the shared parent cookie domain for multi-subdomain portals
 * (e.g., `.demo.risk.radmgmt.org`) so a single Demo Hub login + agreement
 * unlocks all 4 subdomains seamlessly. Returns undefined on localhost / raw IPs.
 */
export function resolveSharedCookieDomain(hostname: string | null | undefined): string | undefined {
  if (!hostname) return undefined;
  const host = hostname.split(":")[0]!.toLowerCase();
  if (host.endsWith(".demo.risk.radmgmt.org")) return ".demo.risk.radmgmt.org";
  if (host.endsWith(".risk.radmgmt.org")) return ".risk.radmgmt.org";
  return undefined;
}
