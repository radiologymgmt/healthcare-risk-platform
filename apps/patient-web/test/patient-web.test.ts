import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { QuestionDto } from "@healthcare/shared-contracts";
import { computeAgeFromDob, getVisibleQuestions } from "../src/lib/branching";

function walkSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkSourceFiles(full));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

describe("@healthcare/patient-web branching & HIPAA zero-storage guardrails", () => {
  it("enforces zero localStorage or sessionStorage anywhere in apps/patient-web/src", () => {
    const srcDir = path.resolve(__dirname, "../src");
    const files = walkSourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toMatch(/\blocalStorage\b/);
      expect(content).not.toMatch(/\bsessionStorage\b/);
    }
  });

  it("evaluates knockout branching and demographic conditions dynamically", () => {
    const questions: QuestionDto[] = [
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        question_key: "smoking_status",
        domain: "Demographics",
        label_plain_english: "Smoking status?",
        helper_tooltip: "Tooltip",
        input_type: "select",
        options_json: [],
        data_source: "HYBRID",
        is_knockout_gate: true,
        display_conditions: {},
        sort_order: 10,
        is_active: true,
        version: 1,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        question_key: "pack_years",
        domain: "Demographics",
        label_plain_english: "Pack years?",
        helper_tooltip: "Tooltip",
        input_type: "number",
        options_json: [],
        data_source: "HYBRID",
        is_knockout_gate: false,
        display_conditions: { depends_on: { smoking_status: ["current", "former"] } },
        sort_order: 20,
        is_active: true,
        version: 1,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440003",
        question_key: "is_postmenopausal",
        domain: "OBGYN",
        label_plain_english: "Postmenopausal?",
        helper_tooltip: "Tooltip",
        input_type: "boolean",
        options_json: [],
        data_source: "HYBRID",
        is_knockout_gate: false,
        display_conditions: { sex_at_birth: "Female" },
        sort_order: 30,
        is_active: true,
        version: 1,
      },
    ];

    // Never smoker Male -> only smoking_status visible
    const visible1 = getVisibleQuestions(
      questions,
      { smoking_status: "never" },
      { sex_at_birth: "Male", age: 55 },
    );
    expect(visible1.map((q) => q.question_key)).toEqual(["smoking_status"]);

    // Current smoker Female -> all 3 visible
    const visible2 = getVisibleQuestions(
      questions,
      { smoking_status: "current" },
      { sex_at_birth: "Female", age: 55 },
    );
    expect(visible2.map((q) => q.question_key)).toEqual([
      "smoking_status",
      "pack_years",
      "is_postmenopausal",
    ]);

    expect(computeAgeFromDob("1960-05-14", new Date("2026-06-01T00:00:00Z"))).toBe(66);
  });
});
