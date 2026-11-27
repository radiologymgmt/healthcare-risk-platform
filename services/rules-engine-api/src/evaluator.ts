import jsonLogic from "json-logic-js";
import {
  ACUITY_RANK,
  CLINICAL_TOOL_MAP,
  acuityToWorkqueuePriority,
  type AcuityLevel,
  type RuleType,
  type WorkqueuePriority,
} from "@healthcare/shared-contracts";
import {
  computeDerivedMetrics,
  enrichAnswersFromPedigree,
  type AnswerMap,
  type DerivedMetrics,
  type PatientDemographics,
} from "./derived-metrics.js";

export interface ClinicalRuleRecord {
  rule_code: string;
  display_name: string;
  specialty: string;
  rule_type: RuleType | string;
  acuity_level: AcuityLevel;
  logic_expression: unknown;
  recommended_intervention: string;
  cpt_codes: string[];
  icd10_codes: string[];
  version: number;
}

export interface EvaluatedPathway {
  rule_code: string;
  display_name: string;
  specialty: string;
  rule_type: string;
  calculated_score: number | null;
  acuity_level: AcuityLevel;
  recommended_intervention: string;
  cpt_codes: string[];
  icd10_codes: string[];
}

export interface EvaluationOutcome {
  derived_metrics: DerivedMetrics;
  evaluated_rule_count: number;
  triggered_pathways: EvaluatedPathway[];
  highest_acuity: AcuityLevel | null;
  workqueue_priority: WorkqueuePriority | null;
}

/**
 * Pure JsonLogic evaluation engine.
 * Evaluates every active clinical rule against the unified { patient, answers, derived } map.
 */
export function evaluateClinicalRules(
  patient: PatientDemographics,
  rawAnswers: AnswerMap,
  rules: readonly ClinicalRuleRecord[],
  referenceDate: Date = new Date(),
): EvaluationOutcome {
  const answers = enrichAnswersFromPedigree(rawAnswers);
  const derived_metrics = computeDerivedMetrics(patient, answers, referenceDate);

  const context = {
    patient: {
      sex_at_birth: patient.sex_at_birth ?? "Unknown",
    },
    answers,
    derived: derived_metrics,
  };

  const triggered_pathways: EvaluatedPathway[] = [];

  for (const rule of rules) {
    const matched = Boolean(jsonLogic.apply(rule.logic_expression, context));
    if (!matched) continue;

    const registryMeta = CLINICAL_TOOL_MAP.get(rule.rule_code);
    let calculated_score: number | null = null;
    if (registryMeta?.score_derived_key) {
      const val = derived_metrics[registryMeta.score_derived_key];
      if (typeof val === "number" && Number.isFinite(val)) {
        calculated_score = val;
      }
    }

    triggered_pathways.push({
      rule_code: rule.rule_code,
      display_name: rule.display_name,
      specialty: rule.specialty,
      rule_type: rule.rule_type,
      calculated_score,
      acuity_level: rule.acuity_level,
      recommended_intervention: rule.recommended_intervention,
      cpt_codes: rule.cpt_codes,
      icd10_codes: rule.icd10_codes,
    });
  }

  // Prioritize STAT acute red flags first, then HIGH_RISK, MODERATE_RISK, ROUTINE
  triggered_pathways.sort(
    (a, b) =>
      ACUITY_RANK[b.acuity_level] - ACUITY_RANK[a.acuity_level] ||
      a.rule_code.localeCompare(b.rule_code),
  );

  const highest_acuity: AcuityLevel | null =
    triggered_pathways.length > 0 ? triggered_pathways[0]!.acuity_level : null;
  const workqueue_priority: WorkqueuePriority | null = highest_acuity
    ? acuityToWorkqueuePriority(highest_acuity)
    : null;

  return {
    derived_metrics,
    evaluated_rule_count: rules.length,
    triggered_pathways,
    highest_acuity,
    workqueue_priority,
  };
}
