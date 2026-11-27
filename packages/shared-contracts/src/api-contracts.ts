import { z } from "zod";
import {
  AcuityLevelSchema,
  ActorRoleSchema,
  ClinicianDispositionSchema,
  DataSourceSchema,
  ProvenanceSchema,
  QuestionInputTypeSchema,
  RuleTypeSchema,
  SexAtBirthSchema,
  WorkqueuePrioritySchema,
} from "./enums.js";

export const QuestionOptionSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  label: z.string(),
});

export const DisplayConditionsSchema = z
  .object({
    sex_at_birth: z.union([SexAtBirthSchema, z.array(SexAtBirthSchema)]).optional(),
    min_age: z.number().int().min(0).max(130).optional(),
    max_age: z.number().int().min(0).max(130).optional(),
    depends_on: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const QuestionDtoSchema = z.object({
  id: z.string().uuid(),
  question_key: z.string().min(1).max(100),
  domain: z.string().min(1).max(50),
  label_plain_english: z.string().min(1),
  helper_tooltip: z.string().nullable(),
  input_type: QuestionInputTypeSchema,
  options_json: z.array(QuestionOptionSchema).default([]),
  data_source: DataSourceSchema,
  is_knockout_gate: z.boolean(),
  display_conditions: DisplayConditionsSchema.default({}),
  sort_order: z.number().int(),
  is_active: z.boolean(),
  version: z.number().int(),
});
export type QuestionDto = z.infer<typeof QuestionDtoSchema>;

export const QuestionnaireConfigQuerySchema = z.object({
  modules: z.string().optional(),
  sex_at_birth: SexAtBirthSchema.optional(),
  age: z.coerce.number().int().min(0).max(130).optional(),
  data_source: DataSourceSchema.optional(),
  include_ehr_only: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
export type QuestionnaireConfigQuery = z.infer<typeof QuestionnaireConfigQuerySchema>;

export const QuestionnaireConfigResponseSchema = z.object({
  rules_version_snapshot: z.number().int(),
  selected_modules: z.array(z.string()),
  total_questions: z.number().int(),
  knockout_gates: z.array(QuestionDtoSchema),
  questions: z.array(QuestionDtoSchema),
});
export type QuestionnaireConfigResponse = z.infer<typeof QuestionnaireConfigResponseSchema>;

export const AssessmentResponseInputSchema = z
  .object({
    question_key: z.string().min(1).max(100),
    answer_value: z.unknown(),
    provenance: ProvenanceSchema.default("PATIENT_ENTERED"),
    confidence_score: z.number().min(0).max(1).nullable().optional(),
    source_document_id: z.string().uuid().nullable().optional(),
    source_excerpt: z.string().nullable().optional(),
  })
  .superRefine((val, ctx) => {
    // HIPAA Provenance Guardrail: AI-parsed answers must include confidence_score and source provenance
    if (val.provenance === "AI_PARSED") {
      if (val.confidence_score === undefined || val.confidence_score === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confidence_score"],
          message: "AI_PARSED responses must include a confidence_score (0.000 to 1.000)",
        });
      }
      if (!val.source_excerpt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["source_excerpt"],
          message: "AI_PARSED responses must include a source_excerpt for clinician verification",
        });
      }
    }
  });
export type AssessmentResponseInput = z.infer<typeof AssessmentResponseInputSchema>;

export const EvaluateSessionRequestSchema = z.object({
  actor_id: z.string().min(1).max(128).default("SYSTEM_RULES_ENGINE"),
  actor_role: ActorRoleSchema.default("SYSTEM"),
  responses: z.array(AssessmentResponseInputSchema).optional(),
});
export type EvaluateSessionRequest = z.infer<typeof EvaluateSessionRequestSchema>;

export const TriggeredPathwayDtoSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  rule_code: z.string(),
  display_name: z.string().optional(),
  specialty: z.string().optional(),
  rule_type: RuleTypeSchema.optional(),
  calculated_score: z.number().nullable(),
  acuity_level: AcuityLevelSchema,
  recommended_intervention: z.string(),
  cpt_codes: z.array(z.string()),
  icd10_codes: z.array(z.string()),
  clinician_disposition: ClinicianDispositionSchema,
});
export type TriggeredPathwayDto = z.infer<typeof TriggeredPathwayDtoSchema>;

export const EvaluateSessionResponseSchema = z.object({
  session_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  rules_version_snapshot: z.number().int(),
  evaluated_rule_count: z.number().int(),
  triggered_count: z.number().int(),
  highest_acuity: AcuityLevelSchema.nullable(),
  workqueue_priority: WorkqueuePrioritySchema.nullable(),
  workqueue_item_id: z.string().uuid().nullable(),
  derived_metrics: z.record(z.unknown()),
  triggered_pathways: z.array(TriggeredPathwayDtoSchema),
});
export type EvaluateSessionResponse = z.infer<typeof EvaluateSessionResponseSchema>;
