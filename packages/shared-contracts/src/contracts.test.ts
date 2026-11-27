import { describe, expect, it } from "vitest";
import {
  AssessmentResponseInputSchema,
  CLINICAL_TOOL_REGISTRY,
  REDACTED_VALUE,
  acuityToWorkqueuePriority,
  createHipaaLogger,
  redactPhi,
} from "./index.js";

describe("@healthcare/shared-contracts", () => {
  it("contains all 54 canonical clinical tools (35 patient/gateway + 19 EHR/lab)", () => {
    expect(CLINICAL_TOOL_REGISTRY).toHaveLength(54);

    const patientReported = CLINICAL_TOOL_REGISTRY.filter(
      (t) => t.category === "PATIENT_REPORTED_GATEWAY",
    );
    const ehrDerived = CLINICAL_TOOL_REGISTRY.filter((t) => t.category === "EHR_LAB_DERIVED");
    expect(patientReported).toHaveLength(35);
    expect(ehrDerived).toHaveLength(19);

    const uniqueCodes = new Set(CLINICAL_TOOL_REGISTRY.map((t) => t.rule_code));
    expect(uniqueCodes.size).toBe(54);
  });

  it("recursively redacts all PHI keys while preserving non-PHI operational telemetry", () => {
    const sample = {
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      triggered_count: 3,
      patient: {
        first_name: "Synthetic",
        lastName: "Patient",
        dob: "1968-04-12",
        mrn: "SYN-MRN-0001",
        email: "synthetic@example.test",
        phone: "555-0100",
        sex_at_birth: "Female",
      },
      documents: [
        {
          id: "doc-1",
          source_excerpt: "Patient reports 30 pack-year smoking history.",
          clinical_notes: "Free-text visit summary.",
        },
      ],
    };

    const redacted = redactPhi(sample);
    expect(redacted.session_id).toBe(sample.session_id);
    expect(redacted.triggered_count).toBe(3);
    expect(redacted.patient.sex_at_birth).toBe("Female");
    expect(redacted.patient.first_name).toBe(REDACTED_VALUE);
    expect(redacted.patient.lastName).toBe(REDACTED_VALUE);
    expect(redacted.patient.dob).toBe(REDACTED_VALUE);
    expect(redacted.patient.mrn).toBe(REDACTED_VALUE);
    expect(redacted.patient.email).toBe(REDACTED_VALUE);
    expect(redacted.patient.phone).toBe(REDACTED_VALUE);
    expect(redacted.documents[0]!.source_excerpt).toBe(REDACTED_VALUE);
    expect(redacted.documents[0]!.clinical_notes).toBe(REDACTED_VALUE);
  });

  it("emits zero PHI through HipaaLogger", () => {
    const lines: string[] = [];
    const logger = createHipaaLogger("test-service", (line) => lines.push(line));
    logger.info("Evaluation finished", {
      session_id: "abc",
      first_name: "AliceSynthetic",
      dob: "1970-01-01",
      mrn: "MRN-999",
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("AliceSynthetic");
    expect(lines[0]).not.toContain("1970-01-01");
    expect(lines[0]).not.toContain("MRN-999");
    expect(lines[0]).toContain(REDACTED_VALUE);
  });

  it("enforces provenance guardrails on AI_PARSED assessment responses", () => {
    const invalidAi = AssessmentResponseInputSchema.safeParse({
      question_key: "smoking_status",
      answer_value: "former",
      provenance: "AI_PARSED",
    });
    expect(invalidAi.success).toBe(false);

    const validAi = AssessmentResponseInputSchema.safeParse({
      question_key: "smoking_status",
      answer_value: "former",
      provenance: "AI_PARSED",
      confidence_score: 0.94,
      source_excerpt: "Synthetic note: former smoker, quit 4 years ago.",
    });
    expect(validAi.success).toBe(true);
  });

  it("maps acuity levels to workqueue priority correctly", () => {
    expect(acuityToWorkqueuePriority("ACUTE_RED_FLAG")).toBe("STAT");
    expect(acuityToWorkqueuePriority("HIGH_RISK")).toBe("HIGH");
    expect(acuityToWorkqueuePriority("MODERATE_RISK")).toBe("STANDARD");
    expect(acuityToWorkqueuePriority("ROUTINE")).toBe("STANDARD");
  });
});
