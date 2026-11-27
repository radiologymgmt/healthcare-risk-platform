import { describe, expect, it } from "vitest";
import { isAuthorizedForAdminPortal, resolvePortalIdentity } from "../src/lib/rbac";
import { parseToVisualModel, serializeVisualModel } from "../src/lib/jsonlogic-builder";

describe("@healthcare/admin-portal RBAC & JsonLogic Builder", () => {
  it("enforces strict GCP IAP authentication in production", () => {
    const unauthProd = resolvePortalIdentity({
      isProduction: true,
      cookieRole: "ADMIN", // ignored in production
    });
    expect(unauthProd).toBeNull();
    expect(isAuthorizedForAdminPortal(unauthProd)).toBe(false);

    const nonAllowlistedIap = resolvePortalIdentity({
      isProduction: true,
      iapEmail: "accounts.google.com:clinician@hospital.test",
      iapUserId: "accounts.google.com:12345",
      adminEmailAllowlist: "cmo@hospital.test",
    });
    expect(nonAllowlistedIap?.role).toBe("PROVIDER");
    expect(isAuthorizedForAdminPortal(nonAllowlistedIap)).toBe(false);

    const allowlistedIap = resolvePortalIdentity({
      isProduction: true,
      iapEmail: "accounts.google.com:cmo@hospital.test",
      iapUserId: "accounts.google.com:99999",
      adminEmailAllowlist: "cmo@hospital.test,admin@hospital.test",
    });
    expect(allowlistedIap?.role).toBe("ADMIN");
    expect(allowlistedIap?.authSource).toBe("GCP_IAP");
    expect(isAuthorizedForAdminPortal(allowlistedIap)).toBe(true);
  });

  it("blocks non-ADMIN roles via HttpOnly dev cookie in non-production environments", () => {
    const provider = resolvePortalIdentity({
      isProduction: false,
      cookieRole: "PROVIDER",
    });
    expect(provider?.role).toBe("PROVIDER");
    expect(isAuthorizedForAdminPortal(provider)).toBe(false);

    const patient = resolvePortalIdentity({
      isProduction: false,
      cookieRole: "PATIENT",
    });
    expect(patient?.role).toBe("PATIENT");
    expect(isAuthorizedForAdminPortal(patient)).toBe(false);

    const admin = resolvePortalIdentity({
      isProduction: false,
      cookieRole: "ADMIN",
    });
    expect(admin?.role).toBe("ADMIN");
    expect(isAuthorizedForAdminPortal(admin)).toBe(true);
  });

  it("round-trips flat JsonLogic rules between Visual Builder and AST cleanly", () => {
    const original = {
      and: [
        { ">=": [{ var: "derived.age" }, 50] },
        { "<=": [{ var: "derived.age" }, 80] },
        { ">=": [{ var: "answers.pack_years" }, 20] },
        { in: [{ var: "answers.smoking_status" }, ["current", "former"]] },
      ],
    };

    const visual = parseToVisualModel(original);
    expect(visual).not.toBeNull();
    expect(visual!.combinator).toBe("and");
    expect(visual!.conditions).toHaveLength(4);
    expect(visual!.conditions[3]!.value).toBe("current, former");

    const serialized = serializeVisualModel(visual!);
    expect(serialized).toEqual(original);
  });

  it("returns null for nested compound JsonLogic so users safely edit in Raw AST mode", () => {
    const nested = {
      and: [
        { "==": [{ var: "patient.sex_at_birth" }, "Female"] },
        {
          or: [
            { ">=": [{ var: "derived.tyrer_cuzick_lifetime_risk" }, 20] },
            { "==": [{ var: "answers.has_atypical_hyperplasia_or_lcis" }, true] },
          ],
        },
      ],
    };
    expect(parseToVisualModel(nested)).toBeNull();
  });
});
