import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { CLINICAL_TOOL_REGISTRY } from "@healthcare/shared-contracts";
import {
  SEED_CLINICAL_RULES,
  SEED_QUESTIONS,
  createPool,
  runMigrations,
  seedDatabase,
} from "./index.js";

function extractVarPaths(expr: unknown, acc = new Set<string>()): Set<string> {
  if (!expr || typeof expr !== "object") return acc;
  if (Array.isArray(expr)) {
    for (const item of expr) extractVarPaths(item, acc);
    return acc;
  }
  const obj = expr as Record<string, unknown>;
  if (typeof obj.var === "string") {
    acc.add(obj.var);
  }
  for (const val of Object.values(obj)) {
    extractVarPaths(val, acc);
  }
  return acc;
}

describe("@healthcare/database seed integrity & PostgreSQL migrations", () => {
  const testDbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  let pool: Pool;

  beforeAll(() => {
    pool = createPool(testDbUrl);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("matches all 69 clinical tools from CLINICAL_TOOL_REGISTRY 1-to-1", () => {
    expect(SEED_CLINICAL_RULES).toHaveLength(69);
    const seededCodes = new Set(SEED_CLINICAL_RULES.map((r) => r.rule_code));
    const registryCodes = new Set(CLINICAL_TOOL_REGISTRY.map((t) => t.rule_code));
    expect(seededCodes).toEqual(registryCodes);

    for (const rule of SEED_CLINICAL_RULES) {
      expect(rule.cpt_codes.length).toBeGreaterThan(0);
      expect(rule.icd10_codes.length).toBeGreaterThan(0);
      expect(rule.recommended_intervention.length).toBeGreaterThan(5);
    }
  });

  it("ensures every answers.<question_key> referenced in all 69 JsonLogic rules exists in SEED_QUESTIONS", () => {
    const questionKeys = new Set(SEED_QUESTIONS.map((q) => q.question_key));
    expect(questionKeys.size).toBe(SEED_QUESTIONS.length);

    const missingKeys: string[] = [];
    for (const rule of SEED_CLINICAL_RULES) {
      const vars = extractVarPaths(rule.logic_expression);
      for (const v of vars) {
        if (v.startsWith("answers.")) {
          const key = v.slice("answers.".length);
          if (!questionKeys.has(key)) {
            missingKeys.push(`${rule.rule_code}:${key}`);
          }
        }
      }
    }
    expect(missingKeys).toEqual([]);
  });

  it("runs migrations and seed idempotently against PostgreSQL 16", async () => {
    await runMigrations(pool);
    const secondMigration = await runMigrations(pool);
    expect(secondMigration.applied).toEqual([]);
    expect(secondMigration.skipped).toContain("0001_initial_schema.sql");

    const seed1 = await seedDatabase(pool);
    const seed2 = await seedDatabase(pool);
    expect(seed1.rulesUpserted).toBe(69);
    expect(seed2.rulesUpserted).toBe(69);

    const tablesRes = await pool.query<{ table_name: string }>(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
      `,
    );
    const tables = tablesRes.rows.map((r) => r.table_name);
    for (const expectedTable of [
      "patients",
      "clinical_documents",
      "questions",
      "clinical_rules",
      "assessment_sessions",
      "assessment_responses",
      "triggered_pathways",
      "workqueue_items",
      "appointments",
      "magic_links",
      "audit_logs",
    ]) {
      expect(tables).toContain(expectedTable);
    }

    const rulesCount = await pool.query<{ count: string }>("SELECT COUNT(*) FROM clinical_rules");
    expect(Number(rulesCount.rows[0]!.count)).toBe(69);

    const questionsCount = await pool.query<{ count: string }>("SELECT COUNT(*) FROM questions");
    expect(Number(questionsCount.rows[0]!.count)).toBe(SEED_QUESTIONS.length);
  });
});
