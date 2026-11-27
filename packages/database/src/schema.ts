import {
  bigserial,
  boolean,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 1. PATIENTS
export const patients = pgTable("patients", {
  id: uuid("id").defaultRandom().primaryKey(),
  mrn: varchar("mrn", { length: 100 }).unique(),
  fhirPatientId: varchar("fhir_patient_id", { length: 128 }).unique(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  dob: date("dob").notNull(),
  sexAtBirth: varchar("sex_at_birth", { length: 20 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 30 }),
  zipCode: varchar("zip_code", { length: 15 }),
  insurancePayerId: varchar("insurance_payer_id", { length: 100 }),
  insuranceMemberId: varchar("insurance_member_id", { length: 100 }),
  insuranceStatus: jsonb("insurance_status").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 2. CLINICAL DOCUMENTS
export const clinicalDocuments = pgTable("clinical_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id, { onDelete: "cascade" }),
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  documentCategory: varchar("document_category", { length: 50 }).notNull(),
  gcsUri: text("gcs_uri").notNull(),
  extractedText: text("extracted_text"),
  parsedStatus: varchar("parsed_status", { length: 30 }).default("PENDING"),
  documentDate: timestamp("document_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 3. SHARED QUESTIONS DATASET
export const questions = pgTable("questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  questionKey: varchar("question_key", { length: 100 }).unique().notNull(),
  domain: varchar("domain", { length: 50 }).notNull(),
  labelPlainEnglish: text("label_plain_english").notNull(),
  helperTooltip: text("helper_tooltip"),
  inputType: varchar("input_type", { length: 30 }).notNull(),
  optionsJson: jsonb("options_json").default(sql`'[]'::jsonb`),
  dataSource: varchar("data_source", { length: 30 }).default("HYBRID"),
  isKnockoutGate: boolean("is_knockout_gate").default(false),
  displayConditions: jsonb("display_conditions").default(sql`'{}'::jsonb`),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  version: integer("version").default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 4. CLINICAL RULES ENGINE
export const clinicalRules = pgTable("clinical_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  ruleCode: varchar("rule_code", { length: 50 }).unique().notNull(),
  displayName: varchar("display_name", { length: 150 }).notNull(),
  specialty: varchar("specialty", { length: 50 }).notNull(),
  ruleType: varchar("rule_type", { length: 30 }).notNull(),
  acuityLevel: varchar("acuity_level", { length: 20 }).notNull(),
  logicExpression: jsonb("logic_expression").notNull(),
  recommendedIntervention: text("recommended_intervention").notNull(),
  cptCodes: text("cpt_codes").array().notNull(),
  icd10Codes: text("icd10_codes").array().notNull(),
  priorAuthRationaleTemplate: text("prior_auth_rationale_template"),
  isActive: boolean("is_active").default(true),
  version: integer("version").default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 5. ASSESSMENT SESSIONS
export const assessmentSessions = pgTable("assessment_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id, { onDelete: "cascade" }),
  channel: varchar("channel", { length: 30 }).notNull(),
  selectedModules: text("selected_modules")
    .array()
    .default(sql`ARRAY['all']`),
  status: varchar("status", { length: 30 }).default("IN_PROGRESS"),
  rulesVersionSnapshot: integer("rules_version_snapshot").notNull().default(1),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// 6. ASSESSMENT RESPONSES
export const assessmentResponses = pgTable(
  "assessment_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    questionKey: varchar("question_key", { length: 100 })
      .notNull()
      .references(() => questions.questionKey),
    answerValue: jsonb("answer_value").notNull(),
    provenance: varchar("provenance", { length: 30 }).notNull(),
    confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }),
    sourceDocumentId: uuid("source_document_id").references(() => clinicalDocuments.id),
    sourceExcerpt: text("source_excerpt"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("assessment_responses_session_question_uniq").on(
      table.sessionId,
      table.questionKey,
    ),
    index("idx_responses_session").on(table.sessionId),
  ],
);

// 7. TRIGGERED PATHWAYS
export const triggeredPathways = pgTable(
  "triggered_pathways",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    ruleCode: varchar("rule_code", { length: 50 })
      .notNull()
      .references(() => clinicalRules.ruleCode),
    calculatedScore: numeric("calculated_score", { precision: 10, scale: 3 }),
    acuityLevel: varchar("acuity_level", { length: 20 }).notNull(),
    recommendedIntervention: text("recommended_intervention").notNull(),
    cptCodes: text("cpt_codes").array().notNull(),
    icd10Codes: text("icd10_codes").array().notNull(),
    clinicianDisposition: varchar("clinician_disposition", { length: 30 }).default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_pathways_patient").on(table.patientId)],
);

// 8. PROVIDER WORKQUEUE
export const workqueueItems = pgTable(
  "workqueue_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id, { onDelete: "cascade" }),
    assignedProviderId: varchar("assigned_provider_id", { length: 128 }),
    priority: varchar("priority", { length: 20 }).notNull(),
    status: varchar("status", { length: 40 }).default("NEW"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_workqueue_status_priority").on(table.status, table.priority)],
);

// 9. APPOINTMENTS
export const appointments = pgTable("appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id, { onDelete: "cascade" }),
  workqueueItemId: uuid("workqueue_item_id").references(() => workqueueItems.id),
  ehrAppointmentId: varchar("ehr_appointment_id", { length: 128 }),
  scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
  scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
  visitType: varchar("visit_type", { length: 50 }).default("RISK_REVIEW_CONSULT"),
  status: varchar("status", { length: 30 }).default("BOOKED"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 10. TOKENIZED MAGIC LINKS
export const magicLinks = pgTable("magic_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => assessmentSessions.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 128 }).unique().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 11. IMMUTABLE HIPAA AUDIT LOGS
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: varchar("actor_id", { length: 128 }).notNull(),
    actorRole: varchar("actor_role", { length: 30 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    resourceType: varchar("resource_type", { length: 50 }).notNull(),
    resourceId: varchar("resource_id", { length: 128 }),
    ipAddress: inet("ip_address"),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_audit_created_at").on(table.createdAt)],
);
