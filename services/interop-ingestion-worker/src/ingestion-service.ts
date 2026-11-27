import type { Pool, PoolClient } from "pg";
import { getCloudRunAuthHeaders, redactPhi, type HipaaLogger } from "@healthcare/shared-contracts";
import { parseHl7V2Message, type ParsedPatientIdentity, type StructuredAnswerFact } from "./hl7-parser.js";
import { parseFhirR4Bundle } from "./fhir-parser.js";

export interface ParserDispatchPayload {
  patient_id: string;
  document_id?: string;
  session_id?: string;
  source_type: "HL7_ORU" | "FHIR_DOC" | "FOLDER_PDF" | "CCDA";
  document_category: "LAB" | "RADIOLOGY" | "VISIT_NOTE" | "ICD10_HISTORY";
  gcs_uri: string;
  raw_text?: string;
  pdf_base64?: string;
  trigger_evaluation?: boolean;
}

export interface ParserDispatchResult {
  dispatched: boolean;
  extracted_count?: number;
  status_code?: number;
}

export type ParserDispatcher = (payload: ParserDispatchPayload) => Promise<ParserDispatchResult>;

export function createHttpParserDispatcher(
  parserBaseUrl: string = process.env.CLINICAL_PARSER_URL ?? "http://127.0.0.1:4003",
): ParserDispatcher {
  const base = parserBaseUrl.replace(/\/$/, "");
  return async (payload) => {
    const authHeaders = await getCloudRunAuthHeaders(base);
    const res = await fetch(`${base}/api/v1/parser/ingest-document`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as { extracted_count?: number };
    return {
      dispatched: res.ok,
      extracted_count: body.extracted_count,
      status_code: res.status,
    };
  };
}

async function upsertPatient(client: PoolClient, p: ParsedPatientIdentity): Promise<string> {
  if (p.fhir_patient_id) {
    const byFhir = await client.query<{ id: string }>(
      `SELECT id FROM patients WHERE fhir_patient_id = $1`,
      [p.fhir_patient_id],
    );
    if (byFhir.rowCount && byFhir.rowCount > 0) {
      return byFhir.rows[0]!.id;
    }
  }
  if (p.mrn) {
    const byMrn = await client.query<{ id: string }>(`SELECT id FROM patients WHERE mrn = $1`, [
      p.mrn,
    ]);
    if (byMrn.rowCount && byMrn.rowCount > 0) {
      if (p.fhir_patient_id) {
        await client.query(
          `UPDATE patients SET fhir_patient_id = COALESCE(fhir_patient_id, $1), updated_at = NOW() WHERE id = $2`,
          [p.fhir_patient_id, byMrn.rows[0]!.id],
        );
      }
      return byMrn.rows[0]!.id;
    }
  }

  const inserted = await client.query<{ id: string }>(
    `
    INSERT INTO patients (mrn, fhir_patient_id, first_name, last_name, dob, sex_at_birth, email, phone, zip_code)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
    `,
    [
      p.mrn ?? null,
      p.fhir_patient_id ?? null,
      p.first_name,
      p.last_name,
      p.dob,
      p.sex_at_birth,
      p.email ?? null,
      p.phone ?? null,
      p.zip_code ?? null,
    ],
  );
  return inserted.rows[0]!.id;
}

async function ensureAutoEhrSession(client: PoolClient, patientId: string): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `
    SELECT id FROM assessment_sessions
    WHERE patient_id = $1 AND channel = 'AUTO_EHR_EVAL' AND status IN ('PREPOPULATED', 'IN_PROGRESS')
    ORDER BY started_at DESC
    LIMIT 1
    `,
    [patientId],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    return existing.rows[0]!.id;
  }

  const created = await client.query<{ id: string }>(
    `
    INSERT INTO assessment_sessions (patient_id, channel, status)
    VALUES ($1, 'AUTO_EHR_EVAL', 'PREPOPULATED')
    RETURNING id
    `,
    [patientId],
  );
  return created.rows[0]!.id;
}

async function saveStructuredAnswers(
  client: PoolClient,
  sessionId: string,
  patientId: string,
  documentId: string,
  facts: StructuredAnswerFact[],
): Promise<number> {
  let saved = 0;
  for (const fact of facts) {
    await client.query(
      `
      INSERT INTO assessment_responses (
        session_id,
        patient_id,
        question_key,
        answer_value,
        provenance,
        confidence_score,
        source_document_id,
        source_excerpt,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, 'EHR_LAB_IMPORT', 1.000, $5, $6, NOW())
      ON CONFLICT (session_id, question_key) DO UPDATE SET
        answer_value = EXCLUDED.answer_value,
        provenance = EXCLUDED.provenance,
        confidence_score = EXCLUDED.confidence_score,
        source_document_id = EXCLUDED.source_document_id,
        source_excerpt = EXCLUDED.source_excerpt,
        updated_at = NOW()
      `,
      [
        sessionId,
        patientId,
        fact.question_key,
        JSON.stringify(fact.answer_value),
        documentId,
        fact.source_excerpt,
      ],
    );
    saved += 1;
  }
  return saved;
}

async function writeInteropAudit(
  client: PoolClient,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `
    INSERT INTO audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
    VALUES ('SYSTEM_INTEROP', 'SYSTEM', $1, $2, $3, $4::jsonb)
    `,
    [action, resourceType, resourceId, JSON.stringify(redactPhi(metadata))],
  );
}

export async function ingestHl7Message(
  pool: Pool,
  rawMessage: string,
  logger: HipaaLogger,
  dispatchToParser?: ParserDispatcher,
) {
  const parsed = parseHl7V2Message(rawMessage);
  const client = await pool.connect();

  let patientId: string;
  let sessionId: string;
  let documentId: string;
  let savedStructuredCount: number;

  try {
    await client.query("BEGIN");
    patientId = await upsertPatient(client, parsed.patient);
    sessionId = await ensureAutoEhrSession(client, patientId);

    const gcsUri = `gs://hl7-ingestion-store/${parsed.messageType.replace("^", "_")}/${parsed.controlId}.hl7`;
    const initialStatus = parsed.narrativeText ? "PENDING" : "PARSED";
    const docRes = await client.query<{ id: string }>(
      `
      INSERT INTO clinical_documents (
        patient_id, source_type, document_category, gcs_uri, extracted_text, parsed_status, document_date
      )
      VALUES ($1, 'HL7_ORU', $2, $3, $4, $5, NOW())
      RETURNING id
      `,
      [patientId, parsed.documentCategory, gcsUri, parsed.narrativeText || null, initialStatus],
    );
    documentId = docRes.rows[0]!.id;

    savedStructuredCount = await saveStructuredAnswers(
      client,
      sessionId,
      patientId,
      documentId,
      parsed.structuredAnswers,
    );

    await writeInteropAudit(client, "INGEST_HL7_MESSAGE", "clinical_document", documentId, {
      patient_id: patientId,
      session_id: sessionId,
      message_type: parsed.messageType,
      structured_answers_count: savedStructuredCount,
      has_narrative: Boolean(parsed.narrativeText),
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  let parserResult: ParserDispatchResult | null = null;
  if (parsed.narrativeText && dispatchToParser) {
    parserResult = await dispatchToParser({
      patient_id: patientId,
      document_id: documentId,
      session_id: sessionId,
      source_type: "HL7_ORU",
      document_category: parsed.documentCategory,
      gcs_uri: `gs://hl7-ingestion-store/${parsed.controlId}.hl7`,
      raw_text: parsed.narrativeText,
    });
  }

  logger.info("Ingested HL7 v2 message", {
    document_id: documentId,
    session_id: sessionId,
    message_type: parsed.messageType,
    structured_answers_count: savedStructuredCount,
    dispatched_to_parser: Boolean(parserResult?.dispatched),
  });

  return {
    source_type: "HL7_ORU",
    message_type: parsed.messageType,
    patient_id: patientId,
    session_id: sessionId,
    document_id: documentId,
    structured_answers_saved: savedStructuredCount,
    parser_dispatch: parserResult,
  };
}

export async function ingestFhirBundle(
  pool: Pool,
  payload: Record<string, unknown>,
  logger: HipaaLogger,
  dispatchToParser?: ParserDispatcher,
) {
  const parsed = parseFhirR4Bundle(payload);
  const client = await pool.connect();

  let patientId: string;
  let sessionId: string;
  let primaryDocId: string;
  let savedStructuredCount = 0;
  const pendingDocs: Array<{
    documentId: string;
    gcsUri: string;
    category: "LAB" | "RADIOLOGY" | "VISIT_NOTE" | "ICD10_HISTORY";
    rawText?: string;
    pdfBase64?: string;
  }> = [];

  try {
    await client.query("BEGIN");
    patientId = await upsertPatient(client, parsed.patient);
    sessionId = await ensureAutoEhrSession(client, patientId);

    // Record structured FHIR bundle ingestion document
    const bundleDocRes = await client.query<{ id: string }>(
      `
      INSERT INTO clinical_documents (
        patient_id, source_type, document_category, gcs_uri, parsed_status, document_date
      )
      VALUES ($1, 'FHIR_DOC', 'LAB', $2, 'PARSED', NOW())
      RETURNING id
      `,
      [patientId, `gs://fhir-r4-store/Bundle/${patientId}/${Date.now()}.json`],
    );
    primaryDocId = bundleDocRes.rows[0]!.id;

    savedStructuredCount = await saveStructuredAnswers(
      client,
      sessionId,
      patientId,
      primaryDocId,
      parsed.structuredAnswers,
    );

    // Record attached DocumentReferences for Component 2 AI parsing
    for (const doc of parsed.documents) {
      const refDocRes = await client.query<{ id: string }>(
        `
        INSERT INTO clinical_documents (
          patient_id, source_type, document_category, gcs_uri, extracted_text, parsed_status, document_date
        )
        VALUES ($1, 'FHIR_DOC', $2, $3, $4, 'PENDING', NOW())
        RETURNING id
        `,
        [patientId, doc.category, doc.gcsUri, doc.rawText ?? null],
      );
      pendingDocs.push({
        documentId: refDocRes.rows[0]!.id,
        gcsUri: doc.gcsUri,
        category: doc.category,
        rawText: doc.rawText,
        pdfBase64: doc.pdfBase64,
      });
    }

    await writeInteropAudit(client, "INGEST_FHIR_BUNDLE", "clinical_document", primaryDocId, {
      patient_id: patientId,
      session_id: sessionId,
      structured_answers_count: savedStructuredCount,
      attached_documents_count: pendingDocs.length,
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const parserDispatches: ParserDispatchResult[] = [];
  if (dispatchToParser) {
    for (const doc of pendingDocs) {
      const res = await dispatchToParser({
        patient_id: patientId,
        document_id: doc.documentId,
        session_id: sessionId,
        source_type: "FHIR_DOC",
        document_category: doc.category,
        gcs_uri: doc.gcsUri,
        raw_text: doc.rawText,
        pdf_base64: doc.pdfBase64,
      });
      parserDispatches.push(res);
    }
  }

  logger.info("Ingested FHIR R4 bundle", {
    document_id: primaryDocId,
    session_id: sessionId,
    structured_answers_count: savedStructuredCount,
    dispatched_documents: parserDispatches.length,
  });

  return {
    source_type: "FHIR_DOC",
    patient_id: patientId,
    session_id: sessionId,
    document_id: primaryDocId,
    structured_answers_saved: savedStructuredCount,
    attached_documents_dispatched: parserDispatches.length,
    parser_dispatches: parserDispatches,
  };
}

export interface GcsDropEventInput {
  bucket: string;
  name: string;
  patient_id?: string;
  mrn?: string;
  document_category?: "LAB" | "RADIOLOGY" | "VISIT_NOTE" | "ICD10_HISTORY";
  raw_text?: string;
  pdf_base64?: string;
}

/**
 * Handles GCP Eventarc GCS folder-drop events (`google.cloud.storage.object.v1.finalized`).
 * Resolves patient by patient_id, metadata MRN, or filename prefix (<MRN>_*.pdf).
 */
export async function ingestGcsFolderDrop(
  pool: Pool,
  event: GcsDropEventInput,
  logger: HipaaLogger,
  dispatchToParser?: ParserDispatcher,
) {
  const gcsUri = `gs://${event.bucket}/${event.name}`;
  const fileBase = event.name.split("/").pop() ?? event.name;
  const inferredMrn = event.mrn ?? (fileBase.includes("_") ? fileBase.split("_")[0] : undefined);

  const client = await pool.connect();
  let patientId: string;
  let sessionId: string;
  let documentId: string;

  try {
    await client.query("BEGIN");

    if (event.patient_id) {
      const pRes = await client.query<{ id: string }>(`SELECT id FROM patients WHERE id = $1`, [
        event.patient_id,
      ]);
      if (pRes.rowCount === 0) throw new Error("Patient not found for GCS drop");
      patientId = pRes.rows[0]!.id;
    } else if (inferredMrn) {
      const pRes = await client.query<{ id: string }>(`SELECT id FROM patients WHERE mrn = $1`, [
        inferredMrn,
      ]);
      if (pRes.rowCount === 0) throw new Error("Patient MRN not found for GCS drop");
      patientId = pRes.rows[0]!.id;
    } else {
      throw new Error("GCS folder-drop event must provide patient_id, mrn, or <MRN>_filename");
    }

    sessionId = await ensureAutoEhrSession(client, patientId);
    const category =
      event.document_category ??
      (fileBase.toLowerCase().includes("lab")
        ? "LAB"
        : fileBase.toLowerCase().includes("rad")
          ? "RADIOLOGY"
          : "VISIT_NOTE");

    const docRes = await client.query<{ id: string }>(
      `
      INSERT INTO clinical_documents (
        patient_id, source_type, document_category, gcs_uri, parsed_status, document_date
      )
      VALUES ($1, 'FOLDER_PDF', $2, $3, 'PENDING', NOW())
      RETURNING id
      `,
      [patientId, category, gcsUri],
    );
    documentId = docRes.rows[0]!.id;

    await writeInteropAudit(client, "INGEST_GCS_FOLDER_DROP", "clinical_document", documentId, {
      patient_id: patientId,
      session_id: sessionId,
      bucket: event.bucket,
      document_category: category,
    });

    await client.query("COMMIT");

    let parserResult: ParserDispatchResult | null = null;
    if (dispatchToParser) {
      parserResult = await dispatchToParser({
        patient_id: patientId,
        document_id: documentId,
        session_id: sessionId,
        source_type: "FOLDER_PDF",
        document_category: category,
        gcs_uri: gcsUri,
        raw_text: event.raw_text,
        pdf_base64: event.pdf_base64,
      });
    }

    logger.info("Ingested GCS folder-drop clinical document", {
      document_id: documentId,
      session_id: sessionId,
      document_category: category,
      dispatched_to_parser: Boolean(parserResult?.dispatched),
    });

    return {
      source_type: "FOLDER_PDF",
      patient_id: patientId,
      session_id: sessionId,
      document_id: documentId,
      gcs_uri: gcsUri,
      parser_dispatch: parserResult,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
