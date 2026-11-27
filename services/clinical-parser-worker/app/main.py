"""FastAPI service for Component 2: Clinical Parser Worker (Python + Vertex AI Gemini)."""

from __future__ import annotations

import os
from typing import Any, Literal

import httpx
import psycopg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .db import fetch_active_question_registry, get_database_url, persist_parsed_document
from .extractor import ClinicalExtractor, get_default_extractor
from .pdf_reader import load_document_text
from .phi_redaction import HipaaLogger


class IngestDocumentRequest(BaseModel):
    patient_id: str
    document_id: str | None = None
    session_id: str | None = None
    source_type: Literal["HL7_ORU", "FHIR_DOC", "FOLDER_PDF", "CCDA"] = "FOLDER_PDF"
    document_category: Literal["LAB", "RADIOLOGY", "VISIT_NOTE", "ICD10_HISTORY"] = "VISIT_NOTE"
    gcs_uri: str = "gs://synthetic-dev-bucket/intake/document.pdf"
    raw_text: str | None = None
    pdf_base64: str | None = None
    trigger_evaluation: bool = False
    actor_id: str = Field(default="SYSTEM_PARSER", max_length=128)


def create_app(
    *,
    database_url: str | None = None,
    extractor: ClinicalExtractor | None = None,
    logger: HipaaLogger | None = None,
    rules_engine_api_url: str | None = None,
) -> FastAPI:
    app = FastAPI(
        title="Clinical Parser Worker (Component 2)",
        version="0.1.0",
    )
    resolved_logger = logger or HipaaLogger("clinical-parser-worker")
    resolved_extractor = extractor or get_default_extractor()
    resolved_rules_url = (
        rules_engine_api_url or os.getenv("RULES_ENGINE_API_URL") or "http://127.0.0.1:4001"
    ).rstrip("/")

    def open_conn() -> psycopg.Connection[Any]:
        return psycopg.connect(database_url or get_database_url())

    @app.get("/health")
    def health() -> dict[str, str]:
        with open_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return {"status": "ok", "service": "clinical-parser-worker"}

    @app.post("/api/v1/parser/ingest-document")
    def ingest_document(payload: IngestDocumentRequest) -> dict[str, Any]:
        try:
            text = load_document_text(
                raw_text=payload.raw_text,
                pdf_base64=payload.pdf_base64,
                gcs_uri=payload.gcs_uri if not payload.raw_text and not payload.pdf_base64 else None,
            )
        except Exception as exc:
            resolved_logger.warn(
                "Document text extraction failed",
                {"error_type": type(exc).__name__, "source_type": payload.source_type},
            )
            raise HTTPException(
                status_code=400, detail="Could not extract text from clinical document"
            ) from exc

        if not text:
            raise HTTPException(status_code=422, detail="Clinical document contained no readable text")

        try:
            with open_conn() as conn:
                registry = fetch_active_question_registry(conn)
                extractions = resolved_extractor.extract(text, registry)
                result = persist_parsed_document(
                    conn,
                    patient_id=payload.patient_id,
                    document_id=payload.document_id,
                    source_type=payload.source_type,
                    document_category=payload.document_category,
                    gcs_uri=payload.gcs_uri,
                    extracted_text=text,
                    extractions=extractions,
                    session_id=payload.session_id,
                    actor_id=payload.actor_id,
                )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        resolved_logger.info(
            "Parsed clinical document and saved AI_PARSED responses",
            {
                "document_id": result["document_id"],
                "session_id": result["session_id"],
                "source_type": payload.source_type,
                "extracted_count": result["extracted_count"],
            },
        )

        # Optional downstream evaluation chain against Component 1 rules-engine-api
        if payload.trigger_evaluation:
            try:
                eval_resp = httpx.post(
                    f"{resolved_rules_url}/api/v1/sessions/{result['session_id']}/evaluate",
                    json={"actor_id": payload.actor_id, "actor_role": "SYSTEM"},
                    timeout=10.0,
                )
                if eval_resp.is_success:
                    result["evaluation"] = eval_resp.json()
            except Exception as exc:
                resolved_logger.warn(
                    "Downstream rules evaluation call failed",
                    {"session_id": result["session_id"], "error_type": type(exc).__name__},
                )

        return result

    return app


app = create_app()
