/**
 * Determines whether synthetic demo conveniences (demo-seed, demo-reset,
 * non-IAP demo RBAC switcher) are enabled.
 * Strictly FALSE in production unless DEMO_MODE=true is explicitly set.
 */
export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE === "true" || process.env.NODE_ENV !== "production";
}
