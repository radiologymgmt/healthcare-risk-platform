import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { createPool } from "./client.js";
import { SEED_QUESTIONS } from "./seed/questions.js";
import { SEED_CLINICAL_RULES } from "./seed/clinical-rules.js";

export interface SeedResult {
  questionsUpserted: number;
  rulesUpserted: number;
}

/**
 * Idempotently seeds the shared `questions` registry and all 54 `clinical_rules`.
 */
export async function seedDatabase(pool: Pool): Promise<SeedResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const q of SEED_QUESTIONS) {
      await client.query(
        `
        INSERT INTO questions (
          question_key,
          domain,
          label_plain_english,
          helper_tooltip,
          input_type,
          options_json,
          data_source,
          is_knockout_gate,
          display_conditions,
          sort_order,
          is_active,
          version
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, TRUE, 1)
        ON CONFLICT (question_key) DO UPDATE SET
          domain = EXCLUDED.domain,
          label_plain_english = EXCLUDED.label_plain_english,
          helper_tooltip = EXCLUDED.helper_tooltip,
          input_type = EXCLUDED.input_type,
          options_json = EXCLUDED.options_json,
          data_source = EXCLUDED.data_source,
          is_knockout_gate = EXCLUDED.is_knockout_gate,
          display_conditions = EXCLUDED.display_conditions,
          sort_order = EXCLUDED.sort_order,
          is_active = EXCLUDED.is_active,
          updated_at = NOW();
        `,
        [
          q.question_key,
          q.domain,
          q.label_plain_english,
          q.helper_tooltip,
          q.input_type,
          JSON.stringify(q.options_json),
          q.data_source,
          q.is_knockout_gate,
          JSON.stringify(q.display_conditions),
          q.sort_order,
        ],
      );
    }

    for (const r of SEED_CLINICAL_RULES) {
      await client.query(
        `
        INSERT INTO clinical_rules (
          rule_code,
          display_name,
          specialty,
          rule_type,
          acuity_level,
          logic_expression,
          recommended_intervention,
          cpt_codes,
          icd10_codes,
          prior_auth_rationale_template,
          is_active,
          version
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::text[], $9::text[], $10, TRUE, 1)
        ON CONFLICT (rule_code) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          specialty = EXCLUDED.specialty,
          rule_type = EXCLUDED.rule_type,
          acuity_level = EXCLUDED.acuity_level,
          logic_expression = EXCLUDED.logic_expression,
          recommended_intervention = EXCLUDED.recommended_intervention,
          cpt_codes = EXCLUDED.cpt_codes,
          icd10_codes = EXCLUDED.icd10_codes,
          prior_auth_rationale_template = EXCLUDED.prior_auth_rationale_template,
          is_active = EXCLUDED.is_active,
          updated_at = NOW();
        `,
        [
          r.rule_code,
          r.display_name,
          r.specialty,
          r.rule_type,
          r.acuity_level,
          JSON.stringify(r.logic_expression),
          r.recommended_intervention,
          r.cpt_codes,
          r.icd10_codes,
          r.prior_auth_rationale_template,
        ],
      );
    }

    await client.query("COMMIT");
    return {
      questionsUpserted: SEED_QUESTIONS.length,
      rulesUpserted: SEED_CLINICAL_RULES.length,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const pool = createPool();
  seedDatabase(pool)
    .then((res) => {
      console.log(
        `Seed complete. Upserted ${res.questionsUpserted} questions and ${res.rulesUpserted} clinical rules.`,
      );
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
