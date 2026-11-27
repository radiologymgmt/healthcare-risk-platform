import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { createPool } from "./client.js";
import { SEED_QUESTIONS } from "./seed/questions.js";
import { SEED_CLINICAL_RULES } from "./seed/clinical-rules.js";
import {
  SEED_ACCEPTED_PAYERS,
  SEED_PLATFORM_SETTINGS,
  SEED_USERS,
} from "./seed/governance.js";

export interface SeedResult {
  questionsUpserted: number;
  rulesUpserted: number;
}

/**
 * Idempotently seeds the shared `questions` registry, all 54 `clinical_rules`,
 * and default governance tables (users, accepted_payers, platform_settings, initial restore point).
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

    // Seed governance tables idempotently (only when migration 0002 tables exist)
    const govTablesRes = await client.query<{ exists: boolean }>(
      `SELECT to_regclass('public.users') IS NOT NULL AS exists`,
    );
    if (govTablesRes.rows[0]?.exists) {
      for (const u of SEED_USERS) {
        await client.query(
          `
          INSERT INTO users (email, full_name, role, npi_number, specialty, is_active, created_by)
          VALUES ($1, $2, $3, $4, $5, TRUE, 'system-seed')
          ON CONFLICT (email) DO NOTHING
          `,
          [u.email, u.full_name, u.role, u.npi_number, u.specialty],
        );
      }

      for (const p of SEED_ACCEPTED_PAYERS) {
        await client.query(
          `
          INSERT INTO accepted_payers (
            payer_code, stedi_trading_partner_id, payer_name, acceptance_status,
            accepted_plan_types, excluded_plan_keywords, requires_pcp_referral,
            prior_auth_modalities, self_pay_available, patient_guidance_note, sort_order
          )
          VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8::text[], $9, $10, $11)
          ON CONFLICT (payer_code) DO NOTHING
          `,
          [
            p.payer_code,
            p.stedi_trading_partner_id,
            p.payer_name,
            p.acceptance_status,
            p.accepted_plan_types,
            p.excluded_plan_keywords,
            p.requires_pcp_referral,
            p.prior_auth_modalities,
            p.self_pay_available,
            p.patient_guidance_note,
            p.sort_order,
          ],
        );
      }

      for (const s of SEED_PLATFORM_SETTINGS) {
        await client.query(
          `
          INSERT INTO platform_settings (setting_key, category, label, description, value_json, version, updated_by)
          VALUES ($1, $2, $3, $4, $5::jsonb, 1, 'system-seed')
          ON CONFLICT (setting_key) DO NOTHING
          `,
          [s.setting_key, s.category, s.label, s.description, JSON.stringify(s.value_json)],
        );
      }

      const snapCountRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM config_snapshots`,
      );
      if (Number(snapCountRes.rows[0]?.count ?? 0) === 0) {
        const [qRows, rRows, pRows, sRows] = await Promise.all([
          client.query("SELECT * FROM questions ORDER BY sort_order ASC"),
          client.query("SELECT * FROM clinical_rules ORDER BY rule_code ASC"),
          client.query("SELECT * FROM accepted_payers ORDER BY sort_order ASC"),
          client.query("SELECT * FROM platform_settings ORDER BY setting_key ASC"),
        ]);
        await client.query(
          `
          INSERT INTO config_snapshots (label, notes, trigger_type, created_by, payload)
          VALUES ($1, $2, 'AUTO_SEED', 'system-seed', $3::jsonb)
          `,
          [
            "Factory Baseline Snapshot (Initial Seed)",
            "Automatic baseline restore point created on initial platform seed (117 questions, 54 clinical rules, accepted payers, and platform settings).",
            JSON.stringify({
              questions: qRows.rows,
              clinical_rules: rRows.rows,
              accepted_payers: pRows.rows,
              platform_settings: sRows.rows,
            }),
          ],
        );
      }
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
