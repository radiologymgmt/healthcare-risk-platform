/**
 * Zero-dependency Google Cloud Run service-to-service OIDC ID token helper.
 *
 * Uses `X-Serverless-Authorization` (Google Cloud Run's official IAM auth header)
 * so application-level `Authorization` headers (e.g., Patient Mobile PWA magic-link
 * session tokens) pass through to the target container untouched.
 *
 * Returns `{}` in local development or non-Cloud-Run targets.
 */

const idTokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getCloudRunAuthHeaders(targetUrl: string): Promise<Record<string, string>> {
  let origin: string;
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".run.app")) {
      return {};
    }
    origin = parsed.origin;
  } catch {
    return {};
  }

  const now = Date.now();
  const cached = idTokenCache.get(origin);
  if (cached && cached.expiresAt > now) {
    return { "x-serverless-authorization": `Bearer ${cached.token}` };
  }

  try {
    const metadataUrl =
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity` +
      `?audience=${encodeURIComponent(origin)}`;
    const response = await fetch(metadataUrl, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return {};
    const token = (await response.text()).trim();
    if (!token) return {};

    // Google ID tokens are valid for 60 minutes; cache for 45 minutes
    idTokenCache.set(origin, { token, expiresAt: now + 45 * 60 * 1000 });
    return { "x-serverless-authorization": `Bearer ${token}` };
  } catch {
    return {};
  }
}
