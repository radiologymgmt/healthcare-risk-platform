import { z } from "zod";
import {
  AcuityLevelSchema,
  DataSourceSchema,
  QuestionInputTypeSchema,
  RuleTypeSchema,
  SexAtBirthSchema,
} from "./enums.js";
import { DisplayConditionsSchema, QuestionOptionSchema } from "./api-contracts.js";

const CPT_CODE_REGEX = /^[A-Z0-9]{4,7}$/i;
const ICD10_CODE_REGEX = /^[A-TV-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/i;

export const JsonLogicExpressionSchema = z
  .record(z.unknown())
  .refine((val) => Object.keys(val).length > 0, {
    message: "JsonLogic expression must be a non-empty JSON object",
  });

export const AdminQuestionCreateSchema = z.object({
  question_key: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z][a-z0-9_]*$/, "question_key must be lowercase snake_case"),
  domain: z.string().min(2).max(50),
  label_plain_english: z.string().min(3).max(500),
  helper_tooltip: z.string().max(1000).nullable().optional(),
  input_type: QuestionInputTypeSchema,
  options_json: z.array(QuestionOptionSchema).default([]),
  data_source: DataSourceSchema.default("HYBRID"),
  is_knockout_gate: z.boolean().default(false),
  display_conditions: DisplayConditionsSchema.default({}),
  sort_order: z.number().int().min(0).max(10000).default(100),
  is_active: z.boolean().default(true),
});
export type AdminQuestionCreate = z.infer<typeof AdminQuestionCreateSchema>;

export const AdminQuestionUpdateSchema = z
  .object({
    domain: z.string().min(2).max(50).optional(),
    label_plain_english: z.string().min(3).max(500).optional(),
    helper_tooltip: z.string().max(1000).nullable().optional(),
    input_type: QuestionInputTypeSchema.optional(),
    options_json: z.array(QuestionOptionSchema).optional(),
    data_source: DataSourceSchema.optional(),
    is_knockout_gate: z.boolean().optional(),
    display_conditions: DisplayConditionsSchema.optional(),
    sort_order: z.number().int().min(0).max(10000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });
export type AdminQuestionUpdate = z.infer<typeof AdminQuestionUpdateSchema>;

export const AdminRuleCreateSchema = z.object({
  rule_code: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[A-Z][A-Z0-9_]*$/, "rule_code must be UPPER_SNAKE_CASE"),
  display_name: z.string().min(2).max(150),
  specialty: z.string().min(2).max(50),
  rule_type: RuleTypeSchema,
  acuity_level: AcuityLevelSchema,
  logic_expression: JsonLogicExpressionSchema,
  recommended_intervention: z.string().min(3).max(1000),
  cpt_codes: z
    .array(z.string().trim().regex(CPT_CODE_REGEX, "Invalid CPT/HCPCS code format"))
    .min(1, "At least one CPT code is required"),
  icd10_codes: z
    .array(z.string().trim().regex(ICD10_CODE_REGEX, "Invalid ICD-10 code format"))
    .min(1, "At least one ICD-10 code is required"),
  prior_auth_rationale_template: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().default(true),
});
export type AdminRuleCreate = z.infer<typeof AdminRuleCreateSchema>;

export const AdminRuleUpdateSchema = z
  .object({
    display_name: z.string().min(2).max(150).optional(),
    specialty: z.string().min(2).max(50).optional(),
    rule_type: RuleTypeSchema.optional(),
    acuity_level: AcuityLevelSchema.optional(),
    logic_expression: JsonLogicExpressionSchema.optional(),
    recommended_intervention: z.string().min(3).max(1000).optional(),
    cpt_codes: z
      .array(z.string().trim().regex(CPT_CODE_REGEX, "Invalid CPT/HCPCS code format"))
      .min(1)
      .optional(),
    icd10_codes: z
      .array(z.string().trim().regex(ICD10_CODE_REGEX, "Invalid ICD-10 code format"))
      .min(1)
      .optional(),
    prior_auth_rationale_template: z.string().max(2000).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });
export type AdminRuleUpdate = z.infer<typeof AdminRuleUpdateSchema>;

export const AdminRuleDryRunRequestSchema = z.object({
  logic_expression: JsonLogicExpressionSchema,
  rule_code: z.string().optional(),
  synthetic_patient: z.object({
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be YYYY-MM-DD"),
    sex_at_birth: SexAtBirthSchema,
  }),
  answers: z.record(z.unknown()).default({}),
});
export type AdminRuleDryRunRequest = z.infer<typeof AdminRuleDryRunRequestSchema>;

export const AdminRuleDtoSchema = z.object({
  id: z.string().uuid(),
  rule_code: z.string(),
  display_name: z.string(),
  specialty: z.string(),
  rule_type: RuleTypeSchema,
  acuity_level: AcuityLevelSchema,
  logic_expression: z.record(z.unknown()),
  recommended_intervention: z.string(),
  cpt_codes: z.array(z.string()),
  icd10_codes: z.array(z.string()),
  prior_auth_rationale_template: z.string().nullable(),
  is_active: z.boolean(),
  version: z.number().int(),
  updated_at: z.string(),
});
export type AdminRuleDto = z.infer<typeof AdminRuleDtoSchema>;

export const AdminVersionHistoryEntrySchema = z.object({
  id: z.number().int(),
  actor_id: z.string(),
  action: z.string(),
  resource_id: z.string().nullable(),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
});
export type AdminVersionHistoryEntry = z.infer<typeof AdminVersionHistoryEntrySchema>;
