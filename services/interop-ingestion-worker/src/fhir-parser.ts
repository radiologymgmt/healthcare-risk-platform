import type { SexAtBirth } from "@healthcare/shared-contracts";
import type { ParsedPatientIdentity, StructuredAnswerFact } from "./hl7-parser.js";
import { mapIcd10ToQuestionKey, mapObservationCodeToQuestionKey } from "./loinc-icd10-map.js";

export interface FhirDocumentPayload {
  gcsUri: string;
  category: "LAB" | "RADIOLOGY" | "VISIT_NOTE" | "ICD10_HISTORY";
  rawText?: string;
  pdfBase64?: string;
}

export interface ParsedFhirBundle {
  patient: ParsedPatientIdentity;
  structuredAnswers: StructuredAnswerFact[];
  documents: FhirDocumentPayload[];
}

function mapFhirGender(gender?: string): SexAtBirth {
  const g = (gender ?? "").toLowerCase();
  if (g === "female") return "Female";
  if (g === "male") return "Male";
  if (g === "other") return "Intersex";
  return "Unknown";
}

function extractPatientResource(res: Record<string, unknown>): ParsedPatientIdentity {
  const identifiers = Array.isArray(res.identifier)
    ? (res.identifier as Array<{ value?: string; system?: string }>)
    : [];
  const mrn = identifiers.find((id) => id.value)?.value;

  const names = Array.isArray(res.name)
    ? (res.name as Array<{ family?: string; given?: string[] }>)
    : [];
  const primaryName = names[0];

  const telecoms = Array.isArray(res.telecom)
    ? (res.telecom as Array<{ system?: string; value?: string }>)
    : [];
  const email = telecoms.find((t) => t.system === "email")?.value;
  const phone = telecoms.find((t) => t.system === "phone")?.value;

  const addresses = Array.isArray(res.address)
    ? (res.address as Array<{ postalCode?: string }>)
    : [];
  const zip = addresses[0]?.postalCode;

  return {
    fhir_patient_id: typeof res.id === "string" ? res.id : undefined,
    mrn: mrn ?? undefined,
    first_name: primaryName?.given?.[0] ?? "Unknown",
    last_name: primaryName?.family ?? "Unknown",
    dob: typeof res.birthDate === "string" ? res.birthDate : "1970-01-01",
    sex_at_birth: mapFhirGender(typeof res.gender === "string" ? res.gender : undefined),
    email,
    phone,
    zip_code: zip,
  };
}

/**
 * Parses a FHIR R4 Bundle containing Patient, Observation, Condition, and DocumentReference resources.
 */
export function parseFhirR4Bundle(payload: Record<string, unknown>): ParsedFhirBundle {
  const resources: Array<Record<string, unknown>> = [];

  if (payload.resourceType === "Bundle" && Array.isArray(payload.entry)) {
    for (const entry of payload.entry) {
      if (entry && typeof entry === "object" && "resource" in entry) {
        const res = (entry as { resource?: unknown }).resource;
        if (res && typeof res === "object") {
          resources.push(res as Record<string, unknown>);
        }
      }
    }
  } else if (typeof payload.resourceType === "string") {
    resources.push(payload);
  } else {
    throw new Error("Invalid FHIR R4 payload: expected Bundle or FHIR resource");
  }

  let patient: ParsedPatientIdentity | null = null;
  const structuredAnswers: StructuredAnswerFact[] = [];
  const documents: FhirDocumentPayload[] = [];

  for (const res of resources) {
    const rType = res.resourceType;

    if (rType === "Patient") {
      patient = extractPatientResource(res);
    } else if (rType === "Observation") {
      const codings =
        (res.code as { coding?: Array<{ code?: string; display?: string }> } | undefined)?.coding ??
        [];
      const qty = res.valueQuantity as { value?: number; unit?: string } | undefined;

      for (const coding of codings) {
        const qKey = mapObservationCodeToQuestionKey(coding.code, coding.display);
        if (qKey && typeof qty?.value === "number" && Number.isFinite(qty.value)) {
          structuredAnswers.push({
            question_key: qKey,
            answer_value: qty.value,
            source_excerpt: `FHIR Observation ${coding.code ?? ""}${coding.display ? ` (${coding.display})` : ""}: ${qty.value}${qty.unit ? ` ${qty.unit}` : ""}`,
          });
          break;
        }
      }
    } else if (rType === "Condition") {
      const codings =
        (res.code as { coding?: Array<{ code?: string; display?: string }> } | undefined)?.coding ??
        [];
      for (const coding of codings) {
        if (!coding.code) continue;
        const qKey = mapIcd10ToQuestionKey(coding.code);
        if (qKey) {
          structuredAnswers.push({
            question_key: qKey,
            answer_value: true,
            source_excerpt: `FHIR Condition ICD-10 ${coding.code}${coding.display ? ` (${coding.display})` : ""}`,
          });
          break;
        }
      }
    } else if (rType === "DocumentReference") {
      const content = Array.isArray(res.content)
        ? (res.content as Array<{
            attachment?: { contentType?: string; data?: string; url?: string };
          }>)
        : [];
      const attachment = content[0]?.attachment;
      if (!attachment) continue;

      const contentType = (attachment.contentType ?? "text/plain").toLowerCase();
      const docId = typeof res.id === "string" ? res.id : `doc-${Date.now()}`;
      const gcsUri = attachment.url ?? `gs://fhir-store/DocumentReference/${docId}`;

      if (contentType.includes("pdf") && attachment.data) {
        documents.push({ gcsUri, category: "VISIT_NOTE", pdfBase64: attachment.data });
      } else if (attachment.data) {
        const decoded = Buffer.from(attachment.data, "base64").toString("utf8");
        documents.push({ gcsUri, category: "VISIT_NOTE", rawText: decoded });
      } else if (attachment.url) {
        documents.push({ gcsUri: attachment.url, category: "VISIT_NOTE" });
      }
    }
  }

  if (!patient) {
    throw new Error("FHIR R4 payload must include a Patient resource");
  }

  return { patient, structuredAnswers, documents };
}

/**
 * Generates an outbound FHIR R4 ServiceRequest resource for clinician-approved orders.
 */
export function buildFhirServiceRequest(params: {
  orderId: string;
  fhirPatientId: string;
  providerId: string;
  cptCodes: string[];
  icd10Codes: string[];
  intervention: string;
  priority: "stat" | "urgent" | "routine";
}): Record<string, unknown> {
  return {
    resourceType: "ServiceRequest",
    id: params.orderId,
    status: "active",
    intent: "order",
    priority: params.priority,
    code: {
      coding: params.cptCodes.map((code) => ({
        system: "http://www.ama-assn.org/go/cpt",
        code,
        display: params.intervention,
      })),
      text: params.intervention,
    },
    subject: {
      reference: `Patient/${params.fhirPatientId}`,
    },
    requester: {
      reference: `Practitioner/${params.providerId}`,
    },
    reasonCode: params.icd10Codes.map((code) => ({
      coding: [
        {
          system: "http://hl7.org/fhir/sid/icd-10-cm",
          code,
        },
      ],
    })),
    authoredOn: new Date().toISOString(),
  };
}
