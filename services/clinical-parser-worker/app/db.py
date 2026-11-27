"""PostgreSQL 16 repository for Component 2 (clinical-parser-worker)."""

from __future__ import annotations

import json
import os
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .extractor import ExtractedAnswer, QuestionRegistryItem
from .phi_redaction import redact_phi


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return url


def fetch_active_question_registry(conn: psycopg.Connection[Any]) -> list[QuestionRegistryItem]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT question_key, domain, label_plain_english, input_type
            FROM questions
            WHERE is_active = TRUE
            ORDER BY sort_order ASC, question_key ASC
            """
        )
        rows = cur.fetchall()
    return [QuestionRegistryItem(**row) for row in rows]


def persist_parsed_document(
    conn: psycopg.Connection[Any],
    *,
    patient_id: str,
    document_id: str | None,
    source_type: str,
    document_category: str,
    gcs_uri: str,
    extracted_text: str,
    extractions: list[ExtractedAnswer],
    session_id: str | None = None,
    actor_id: str = "SYSTEM_PARSER",
) -> dict[str, Any]:
    """Atomically stores/updates clinical_documents, assessment_sessions,
    AI_PARSED assessment_responses (with confidence_score & source_excerpt),
    and an immutable HIPAA audit_logs entry.
    """
    with conn.transaction():
        with conn.cursor(row_factory=dict_row) as cur:
            # 1. Verify patient exists
            cur.execute("SELECT id FROM patients WHERE id = %s", (patient_id,))
            if cur.fetchone() is None:
                raise LookupError("Patient not found")

            # 2. Upsert or update clinical_documents record
            if document_id:
                cur.execute(
                    """
                    UPDATE clinical_documents
                    SET extracted_text = %s, parsed_status = 'PARSED'
                    WHERE id = %s AND patient_id = %s
                    RETURNING id
                    """,
                    (extracted_text, document_id, patient_id),
                )
                doc_row = cur.fetchone()
                if doc_row is None:
                    raise LookupError("Clinical document not found for patient")
                resolved_doc_id = str(doc_row["id"])
            else:
                cur.execute(
                    """
                    INSERT INTO clinical_documents (
                      patient_id, source_type, document_category, gcs_uri,
                      extracted_text, parsed_status, document_date
                    )
                    VALUES (%s, %s, %s, %s, %s, 'PARSED', NOW())
                    RETURNING id
                    """,
                    (patient_id, source_type, document_category, gcs_uri, extracted_text),
                )
                resolved_doc_id = str(cur.fetchone()["id"])  # type: ignore[index]

            # 3. Ensure an assessment session exists (default AUTO_EHR_EVAL / PREPOPULATED)
            if session_id:
                cur.execute(
                    "SELECT id FROM assessment_sessions WHERE id = %s AND patient_id = %s",
                    (session_id, patient_id),
                )
                sess_row = cur.fetchone()
                if sess_row is None:
                    raise LookupError("Assessment session not found for patient")
                resolved_session_id = str(sess_row["id"])
            else:
                cur.execute(
                    """
                    SELECT id FROM assessment_sessions
                    WHERE patient_id = %s AND status IN ('PREPOPULATED', 'IN_PROGRESS')
                    ORDER BY started_at DESC
                    LIMIT 1
                    """,
                    (patient_id,),
                )
                existing_sess = cur.fetchone()
                if existing_sess:
                    resolved_session_id = str(existing_sess["id"])
                else:
                    cur.execute(
                        """
                        INSERT INTO assessment_sessions (patient_id, channel, status)
                        VALUES (%s, 'AUTO_EHR_EVAL', 'PREPOPULATED')
                        RETURNING id
                        """,
                        (patient_id,),
                    )
                    resolved_session_id = str(cur.fetchone()["id"])  # type: ignore[index]

            # 4. Save extracted answers with full HIPAA provenance tracking
            saved_responses: list[dict[str, Any]] = []
            for item in extractions:
                cur.execute(
                    """
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
                    VALUES (%s, %s, %s, %s::jsonb, 'AI_PARSED', %s, %s, %s, NOW())
                    ON CONFLICT (session_id, question_key) DO UPDATE SET
                      answer_value = EXCLUDED.answer_value,
                      provenance = EXCLUDED.provenance,
                      confidence_score = EXCLUDED.confidence_score,
                      source_document_id = EXCLUDED.source_document_id,
                      source_excerpt = EXCLUDED.source_excerpt,
                      updated_at = NOW()
                    RETURNING id, question_key, answer_value, provenance,
                              confidence_score, source_document_id, source_excerpt
                    """,
                    (
                        resolved_session_id,
                        patient_id,
                        item.question_key,
                        json.dumps(item.answer_value),
                        item.confidence_score,
                        resolved_doc_id,
                        item.source_excerpt,
                    ),
                )
                row = dict(cur.fetchone())  # type: ignore[arg-type]
                row["id"] = str(row["id"])
                row["source_document_id"] = str(row["source_document_id"])
                row["confidence_score"] = float(row["confidence_score"])
                saved_responses.append(row)

            # 5. Write immutable HIPAA audit log (zero PHI in metadata)
            safe_meta = redact_phi(
                {
                    "patient_id": patient_id,
                    "session_id": resolved_session_id,
                    "source_type": source_type,
                    "document_category": document_category,
                    "extracted_question_count": len(saved_responses),
                    "extracted_question_keys": [r["question_key"] for r in saved_responses],
                }
            )
            cur.execute(
                """
                INSERT INTO audit_logs (
                  actor_id, actor_role, action, resource_type, resource_id, metadata
                )
                VALUES (%s, 'SYSTEM', 'PARSE_CLINICAL_DOCUMENT', 'clinical_document', %s, %s::jsonb)
                """,
                (actor_id, resolved_doc_id, json.dumps(safe_meta)),
            )

    return {
        "document_id": resolved_doc_id,
        "session_id": resolved_session_id,
        "patient_id": patient_id,
        "parsed_status": "PARSED",
        "extracted_count": len(saved_responses),
        "responses": saved_responses,
    }
