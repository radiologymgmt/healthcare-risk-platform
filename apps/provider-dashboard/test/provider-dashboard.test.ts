import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAuthorizedProvider, resolveProviderIdentity } from "../src/lib/rbac";

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("@healthcare/provider-dashboard RBAC & HIPAA zero-storage guardrails", () => {
  it("allows PROVIDER and ADMIN via IAP and blocks PATIENT or unauthenticated production access", () => {
    expect(isAuthorizedProvider(resolveProviderIdentity({ isProduction: true }))).toBe(false);

    const patient = resolveProviderIdentity({
      isProduction: false,
      headerRole: "PATIENT",
    });
    expect(isAuthorizedProvider(patient)).toBe(false);

    const provider = resolveProviderIdentity({
      isProduction: true,
      iapEmail: "accounts.google.com:dr.morales@hospital.test",
      iapUserId: "accounts.google.com:555",
    });
    expect(provider?.role).toBe("PROVIDER");
    expect(isAuthorizedProvider(provider)).toBe(true);
  });

  it("enforces zero localStorage or sessionStorage anywhere in apps/provider-dashboard/src", () => {
    const files = walkFiles(path.resolve(__dirname, "../src"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toMatch(/\blocalStorage\b/);
      expect(content).not.toMatch(/\bsessionStorage\b/);
    }
  });
});
