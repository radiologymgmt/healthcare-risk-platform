import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function walkSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkSourceFiles(full));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

describe("@healthcare/patient-mobile-pwa HIPAA & PWA Guardrails", () => {
  it("enforces zero localStorage or sessionStorage anywhere in apps/patient-mobile-pwa/src", () => {
    const srcDir = path.resolve(__dirname, "../src");
    const files = walkSourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toMatch(/\blocalStorage\b/);
      expect(content).not.toMatch(/\bsessionStorage\b/);
    }
  });

  it("sets HttpOnly and SameSite=Lax flags on the short-lived magic-link session cookie", () => {
    const verifyRoute = fs.readFileSync(
      path.resolve(__dirname, "../src/app/api/magic-link/verify/route.ts"),
      "utf8",
    );
    expect(verifyRoute).toContain("httpOnly: true");
    expect(verifyRoute).toContain('sameSite: "lax"');
  });

  it("includes a valid standalone PWA web app manifest", () => {
    const manifestPath = path.resolve(__dirname, "../public/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      display: string;
      name: string;
      start_url: string;
    };
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.name.length).toBeGreaterThan(3);
  });
});
