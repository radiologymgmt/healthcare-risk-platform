import type { SexAtBirth } from "@healthcare/shared-contracts";
import { mapIcd10ToQuestionKey, mapObservationCodeToQuestionKey } from "./loinc-icd10-map.js";

export interface ParsedPatientIdentity {
  mrn?: string;
  fhir_patient_id?: string;
  first_name: string;
  last_name: string;
  dob: string; // YYYY-MM-DD
  sex_at_birth: SexAtBirth;
  email?: string;
  phone?: string;
  zip_code?: string;
}

export interface StructuredAnswerFact {
  question_key: string;
  answer_value: unknown;
  source_excerpt: string;
}

export interface ParsedHl7Message {
  messageType: string;
  controlId: string;
  patient: ParsedPatientIdentity;
  structuredAnswers: StructuredAnswerFact[];
  narrativeText: string;
  documentCategory: "LAB" | "VISIT_NOTE" | "ICD10_HISTORY";
}

function normalizeHl7Date(raw: string | undefined): string {
  if (!raw || raw.length < 8) return "1970-01-01";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return "1970-01-01";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function normalizeHl7Sex(raw: string | undefined): SexAtBirth {
  const s = (raw ?? "").trim().toUpperCase();
  if (s === "F" || s === "FEMALE") return "Female";
  if (s === "M" || s === "MALE") return "Male";
  if (s === "O" || s === "A" || s === "INTERSEX") return "Intersex";
  return "Unknown";
}

/**
 * Parses HL7 v2.x ORU^R01 (Labs & Clinical Notes) and ADT^A01/A04/A08 (Demographics & DG1 Diagnoses).
 */
export function parseHl7V2Message(rawMessage: string): ParsedHl7Message {
  const segments = rawMessage
    .split(/\r\n|\r|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0 || !segments[0]!.startsWith("MSH")) {
    throw new Error("Invalid HL7 v2 message: missing MSH header segment");
  }

  const fieldSep = segments[0]!.charAt(3) || "|";
  const compSep = segments[0]!.charAt(4) || "^";

  let messageType = "ORU^R01";
  let controlId = `HL7-${Date.now()}`;
  let patient: ParsedPatientIdentity | null = null;
  const structuredAnswers: StructuredAnswerFact[] = [];
  const narrativeChunks: string[] = [];
  let hasLabObx = false;
  let hasDg1 = false;

  for (const seg of segments) {
    const fields = seg.split(fieldSep);
    const segType = fields[0];

    if (segType === "MSH") {
      messageType = fields[8] || messageType;
      controlId = fields[9] || controlId;
    } else if (segType === "PID") {
      const mrnField = (fields[3] ?? "").split(compSep)[0]?.trim();
      const nameParts = (fields[5] ?? "").split(compSep);
      const lastName = nameParts[0]?.trim() || "Unknown";
      const firstName = nameParts[1]?.trim() || "Unknown";
      const dob = normalizeHl7Date(fields[7]);
      const sex = normalizeHl7Sex(fields[8]);
      const addrParts = (fields[11] ?? "").split(compSep);
      const zipCode = addrParts[4]?.trim() || undefined;
      const phone = (fields[13] ?? "").split(compSep)[0]?.trim() || undefined;

      patient = {
        mrn: mrnField || undefined,
        first_name: firstName,
        last_name: lastName,
        dob,
        sex_at_birth: sex,
        phone,
        zip_code: zipCode,
      };
    } else if (segType === "OBX") {
      const valueType = (fields[2] ?? "").trim().toUpperCase();
      const obxIdParts = (fields[3] ?? "").split(compSep);
      const code = obxIdParts[0]?.trim();
      const display = obxIdParts[1]?.trim();
      const rawValue = (fields[5] ?? "").trim();
      const units = (fields[6] ?? "").split(compSep)[0]?.trim() || "";

      if (valueType === "NM" || valueType === "SN") {
        const numericVal = Number(rawValue);
        const questionKey = mapObservationCodeToQuestionKey(code, display);
        if (questionKey && Number.isFinite(numericVal)) {
          hasLabObx = true;
          structuredAnswers.push({
            question_key: questionKey,
            answer_value: numericVal,
            source_excerpt: `HL7 OBX ${code ?? ""}${display ? ` (${display})` : ""}: ${rawValue}${units ? ` ${units}` : ""}`,
          });
        }
      } else if (rawValue) {
        narrativeChunks.push(rawValue);
      }
    } else if (segType === "NTE") {
      const comment = (fields[3] ?? "").trim();
      if (comment) narrativeChunks.push(comment);
    } else if (segType === "DG1") {
      hasDg1 = true;
      const diagParts = (fields[3] ?? "").split(compSep);
      const icdCode = diagParts[0]?.trim() ?? "";
      const diagText = diagParts[1]?.trim() ?? "";
      const qKey = mapIcd10ToQuestionKey(icdCode);
      if (qKey) {
        structuredAnswers.push({
          question_key: qKey,
          answer_value: true,
          source_excerpt: `HL7 DG1 ICD-10 ${icdCode}${diagText ? ` (${diagText})` : ""}`,
        });
      }
    }
  }

  if (!patient) {
    throw new Error("Invalid HL7 v2 message: missing PID patient identification segment");
  }

  const documentCategory: "LAB" | "VISIT_NOTE" | "ICD10_HISTORY" = hasLabObx
    ? "LAB"
    : hasDg1 && narrativeChunks.length === 0
      ? "ICD10_HISTORY"
      : "VISIT_NOTE";

  return {
    messageType,
    controlId,
    patient,
    structuredAnswers,
    narrativeText: narrativeChunks.join("\n"),
    documentCategory,
  };
}

/**
 * Generates an outbound HL7 v2.5.1 ORM^O01 order message from clinician-approved CPT & ICD-10 codes.
 */
export function buildHl7OrmOrderMessage(params: {
  orderId: string;
  mrn: string;
  lastName: string;
  firstName: string;
  dob: string;
  sexAtBirth: string;
  providerId: string;
  cptCodes: string[];
  icd10Codes: string[];
  intervention: string;
}): string {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const hl7Dob = params.dob.replace(/-/g, "");
  const sexChar = params.sexAtBirth === "Female" ? "F" : params.sexAtBirth === "Male" ? "M" : "U";
  const primaryCpt = params.cptCodes[0] ?? "99214";
  const primaryIcd = params.icd10Codes[0] ?? "Z13.9";

  return [
    `MSH|^~\\&|HEALTHCARE_RISK_PLATFORM|CLINICAL_ENGINE|EHR_ORDERS|HOSPITAL|${ts}||ORM^O01|${params.orderId}|P|2.5.1`,
    `PID|1||${params.mrn}^^^MRN||${params.lastName}^${params.firstName}||${hl7Dob}|${sexChar}`,
    `ORC|NW|${params.orderId}|||||||${ts}|||${params.providerId}`,
    `OBR|1|${params.orderId}||${primaryCpt}^${params.intervention}^CPT|||${ts}|||||||||${params.providerId}`,
    `DG1|1|I10|${primaryIcd}^^^ICD10|||F`,
  ].join("\r");
}
