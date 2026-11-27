import { z } from "zod";

export const SexAtBirthSchema = z.enum(["Female", "Male", "Intersex", "Unknown"]);
export type SexAtBirth = z.infer<typeof SexAtBirthSchema>;

export const DocumentSourceTypeSchema = z.enum(["HL7_ORU", "FHIR_DOC", "FOLDER_PDF", "CCDA"]);
export type DocumentSourceType = z.infer<typeof DocumentSourceTypeSchema>;

export const DocumentCategorySchema = z.enum(["LAB", "RADIOLOGY", "VISIT_NOTE", "ICD10_HISTORY"]);
export type DocumentCategory = z.infer<typeof DocumentCategorySchema>;

export const ParsedStatusSchema = z.enum(["PENDING", "PARSED", "FAILED"]);
export type ParsedStatus = z.infer<typeof ParsedStatusSchema>;

export const QuestionDomainSchema = z.enum([
  "Demographics",
  "Oncology",
  "Urology",
  "OBGYN",
  "Neurology",
  "Hematology",
  "Cardio",
  "Pulmonology",
  "Sleep",
  "Bone",
  "MSK",
  "Hepatology",
  "Acute",
]);
export type QuestionDomain = z.infer<typeof QuestionDomainSchema>;

export const QuestionInputTypeSchema = z.enum([
  "boolean",
  "number",
  "select",
  "date",
  "pedigree_array",
  "lab_numeric",
]);
export type QuestionInputType = z.infer<typeof QuestionInputTypeSchema>;

export const DataSourceSchema = z.enum(["PATIENT", "EHR_LAB", "HYBRID"]);
export type DataSource = z.infer<typeof DataSourceSchema>;

export const RuleSpecialtySchema = z.enum([
  "Oncology",
  "Urology",
  "OBGYN",
  "Neurology",
  "Hematology",
  "Cardiology",
  "Pulmonology",
  "MSK",
  "Hepatology",
  "Sleep",
  "Bone",
]);
export type RuleSpecialty = z.infer<typeof RuleSpecialtySchema>;

export const RuleTypeSchema = z.enum([
  "PATIENT_REPORTED",
  "EHR_LAB_DEPENDENT",
  "HYBRID",
]);
export type RuleType = z.infer<typeof RuleTypeSchema>;

export const AcuityLevelSchema = z.enum([
  "ACUTE_RED_FLAG",
  "HIGH_RISK",
  "MODERATE_RISK",
  "ROUTINE",
]);
export type AcuityLevel = z.infer<typeof AcuityLevelSchema>;

export const SessionChannelSchema = z.enum([
  "WEB_PORTAL",
  "MOBILE_MAGIC_LINK",
  "AUTO_EHR_EVAL",
]);
export type SessionChannel = z.infer<typeof SessionChannelSchema>;

export const SessionStatusSchema = z.enum([
  "PREPOPULATED",
  "IN_PROGRESS",
  "SUBMITTED",
  "REVIEWED",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const ProvenanceSchema = z.enum([
  "PATIENT_ENTERED",
  "AI_PARSED",
  "PATIENT_CONFIRMED_AI",
  "EHR_LAB_IMPORT",
]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const ClinicianDispositionSchema = z.enum([
  "PENDING",
  "APPROVED",
  "ORDERED",
  "DECLINED",
]);
export type ClinicianDisposition = z.infer<typeof ClinicianDispositionSchema>;

export const WorkqueuePrioritySchema = z.enum(["HIGH", "STANDARD"]);
export type WorkqueuePriority = z.infer<typeof WorkqueuePrioritySchema>;

export const WorkqueueStatusSchema = z.enum([
  "CONTACT_PENDING",
  "APPOINTMENT_SCHEDULED",
  "EXAMS_ORDERED",
  "PATIENT_COMPLETED",
]);
export type WorkqueueStatus = z.infer<typeof WorkqueueStatusSchema>;

export const WORKQUEUE_STATUS_LABELS: Record<WorkqueueStatus, string> = {
  CONTACT_PENDING: "Contact Pending",
  APPOINTMENT_SCHEDULED: "Appointment Scheduled",
  EXAMS_ORDERED: "Exams Ordered",
  PATIENT_COMPLETED: "Patient Completed",
};

export function normalizeWorkqueuePriority(raw: string | null | undefined): WorkqueuePriority {
  const upper = (raw ?? "").trim().toUpperCase();
  if (upper === "STAT" || upper === "HIGH" || upper === "ACUTE_RED_FLAG" || upper === "HIGH_RISK") {
    return "HIGH";
  }
  return "STANDARD";
}

export function normalizeWorkqueueStatus(raw: string | null | undefined): WorkqueueStatus {
  const upper = (raw ?? "").trim().toUpperCase();
  if (upper === "APPOINTMENT_SCHEDULED" || upper === "SCHEDULED") return "APPOINTMENT_SCHEDULED";
  if (upper === "EXAMS_ORDERED" || upper === "ORDERED") return "EXAMS_ORDERED";
  if (upper === "PATIENT_COMPLETED" || upper === "COMPLETED") return "PATIENT_COMPLETED";
  return "CONTACT_PENDING";
}

export const ActorRoleSchema = z.enum(["PATIENT", "PROVIDER", "ADMIN", "SYSTEM"]);
export type ActorRole = z.infer<typeof ActorRoleSchema>;

export const ACUITY_RANK: Record<AcuityLevel, number> = {
  ACUTE_RED_FLAG: 4,
  HIGH_RISK: 3,
  MODERATE_RISK: 2,
  ROUTINE: 1,
};

export function acuityToWorkqueuePriority(acuity: AcuityLevel): WorkqueuePriority {
  if (acuity === "ACUTE_RED_FLAG" || acuity === "HIGH_RISK") return "HIGH";
  return "STANDARD";
}
