"""Unit & PostgreSQL 16 Integration Tests for Component 2 (clinical-parser-worker)."""

from __future__ import annotations

import base64
import os
import tempfile
from pathlib import Path
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.phi_redaction import REDACTED_VALUE, HipaaLogger, redact_phi


def _build_minimal_pdf(lines: list[str]) -> bytes:
    """Builds a valid, minimal PDF 1.4 document containing readable text lines (zero external deps)."""
    escaped = [
        line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        for line in lines
    ]
    text_ops = ["BT", "/F1 12 Tf", "50 750 Td", "16 TL"]
    for i, line in enumerate(escaped):
        if i == 0:
            text_ops.append(f"({line}) Tj")
        else:
            text_ops.append(f"T* ({line}) Tj")
    text_ops.append("ET")
    stream = "\n".join(text_ops).encode("latin-1")

    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
        f"4 0 obj << /Length {len(stream)} >> stream\n".encode("latin-1")
        + stream
        + b"\nendstream endobj\n",
        b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    ]

    header = b"%PDF-1.4\n"
    offsets: list[int] = []
    body = bytearray(header)
    for obj in objects:
        offsets.append(len(body))
        body.extend(obj)

    xref_pos = len(body)
    body.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    body.extend(b"0000000000 65535 f \n")
    for off in offsets:
        body.extend(f"{off:010d} 00000 n \n".encode("latin-1"))
    body.extend(
        f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode(
            "latin-1"
        )
    )
    return bytes(body)


TEST_DB_URL = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")


@pytest.fixture()
def db_conn():
    assert TEST_DB_URL, "TEST_DATABASE_URL or DATABASE_URL must be set"
    with psycopg.connect(TEST_DB_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                TRUNCATE TABLE audit_logs, workqueue_items, triggered_pathways,
                               assessment_responses, assessment_sessions,
                               clinical_documents, patients
                RESTART IDENTITY CASCADE
                """
            )
        conn.commit()
        yield conn


def _insert_synthetic_patient(conn: psycopg.Connection[Any]) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO patients (mrn, first_name, last_name, dob, sex_at_birth, email, phone, zip_code)
            VALUES ('SYN-PARSER-001', 'Synthetic', 'ParserTest', '1961-07-12', 'Female',
                    'parser.syn@example.test', '555-0144', '94107')
            RETURNING id
            """
        )
        patient_id = str(cur.fetchone()[0])
    conn.commit()
    return patient_id


def test_phi_redaction_strips_all_sensitive_fields():
    lines: list[str] = []
    logger = HipaaLogger("parser-test", sink=lines.append)
    logger.info(
        "Parsed document",
        {
            "document_id": "doc-123",
            "first_name": "SyntheticName",
            "dob": "1961-07-12",
            "mrn": "SYN-MRN-1",
            "source_excerpt": "Patient reports 35 pack-years smoking.",
            "nested": {"clinical_notes": "Secret clinical note", "count": 4},
        },
    )
    assert len(lines) == 1
    assert "SyntheticName" not in lines[0]
    assert "1961-07-12" not in lines[0]
    assert "SYN-MRN-1" not in lines[0]
    assert "Secret clinical note" not in lines[0]
    assert REDACTED_VALUE in lines[0]
    assert redact_phi({"count": 4, "mrn": "X"}) == {"count": 4, "mrn": REDACTED_VALUE}


def test_ingest_synthetic_visit_note_saves_provenance_and_audit_logs(db_conn):
    patient_id = _insert_synthetic_patient(db_conn)
    logs: list[str] = []
    app = create_app(database_url=TEST_DB_URL, logger=HipaaLogger("parser-test", sink=logs.append))
    client = TestClient(app)

    visit_note = (
        "SYNTHETIC PULMONOLOGY & ONCOLOGY VISIT NOTE.\n"
        "Patient is a current smoker with a 30 pack-year history and documented COPD.\n"
        "Mother had breast cancer diagnosed at age 44 and sister had breast cancer.\n"
        "Mammogram showed BI-RADS density D and prior biopsy showed atypical hyperplasia.\n"
        "Denies diabetes and denies atrial fibrillation.\n"
        "Vitals: Height 166 cm, Weight 68 kg, BP 146/88 mmHg, HR 78 bpm.\n"
    )

    resp = client.post(
        "/api/v1/parser/ingest-document",
        json={
            "patient_id": patient_id,
            "source_type": "FHIR_DOC",
            "document_category": "VISIT_NOTE",
            "gcs_uri": "gs://synthetic-clinic/notes/visit-001.txt",
            "raw_text": visit_note,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["parsed_status"] == "PARSED"
    assert body["extracted_count"] >= 9

    by_key = {item["question_key"]: item for item in body["responses"]}
    assert by_key["smoking_status"]["answer_value"] == "current"
    assert by_key["pack_years"]["answer_value"] == 30
    assert by_key["copd_history"]["answer_value"] is True
    assert by_key["breast_density_birads"]["answer_value"] == "D"
    assert by_key["has_atypical_hyperplasia_or_lcis"]["answer_value"] is True
    assert by_key["first_degree_breast_cancer_count"]["answer_value"] == 2
    assert by_key["youngest_family_breast_cancer_age"]["answer_value"] == 44
    # Negation handling
    assert by_key["has_diabetes"]["answer_value"] is False
    assert by_key["has_atrial_fibrillation"]["answer_value"] is False

    # Provenance verification on every extracted answer
    for item in body["responses"]:
        assert item["provenance"] == "AI_PARSED"
        assert 0.5 <= item["confidence_score"] <= 1.0
        assert item["source_document_id"] == body["document_id"]
        assert len(item["source_excerpt"]) > 5

    # Verify PostgreSQL persistence and immutable audit log (zero PHI)
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM assessment_responses WHERE session_id = %s AND provenance = 'AI_PARSED'",
            (body["session_id"],),
        )
        assert cur.fetchone()[0] == body["extracted_count"]

        cur.execute(
            "SELECT actor_id, action, resource_id, metadata::text FROM audit_logs WHERE resource_id = %s",
            (body["document_id"],),
        )
        audit = cur.fetchone()
        assert audit is not None
        assert audit[0] == "SYSTEM_PARSER"
        assert audit[1] == "PARSE_CLINICAL_DOCUMENT"
        assert "ParserTest" not in audit[3]
        assert "SYN-PARSER-001" not in audit[3]

    # Zero PHI in logs
    joined_logs = "\n".join(logs)
    assert "ParserTest" not in joined_logs
    assert "SYN-PARSER-001" not in joined_logs
    assert "30 pack-year" not in joined_logs


def test_ingest_synthetic_lab_pdf_base64_and_file_uri(db_conn):
    patient_id = _insert_synthetic_patient(db_conn)
    app = create_app(database_url=TEST_DB_URL, logger=HipaaLogger("parser-test", sink=lambda _: None))
    client = TestClient(app)

    pdf_bytes = _build_minimal_pdf(
        [
            "SYNTHETIC CLINICAL LABORATORY REPORT",
            "AST: 94 U/L (High)",
            "ALT: 51 U/L (High)",
            "Platelets: 112 x10^9/L (Low)",
            "Albumin: 3.1 g/dL",
            "CA-125: 195 U/mL",
            "HE4: 210 pmol/L",
            "Assessment: Post-menopausal patient with complex ovarian mass and cirrhosis.",
        ]
    )

    resp = client.post(
        "/api/v1/parser/ingest-document",
        json={
            "patient_id": patient_id,
            "source_type": "FOLDER_PDF",
            "document_category": "LAB",
            "gcs_uri": "gs://synthetic-clinic/folder-drop/SYN-PARSER-001_lab.pdf",
            "pdf_base64": base64.b64encode(pdf_bytes).decode("ascii"),
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    by_key = {item["question_key"]: item for item in body["responses"]}

    assert by_key["lab_ast_u_l"]["answer_value"] == 94
    assert by_key["lab_alt_u_l"]["answer_value"] == 51
    assert by_key["lab_platelets_10e9_l"]["answer_value"] == 112
    assert by_key["lab_albumin_g_dl"]["answer_value"] == 3.1
    assert by_key["lab_ca125_u_ml"]["answer_value"] == 195
    assert by_key["lab_he4_pmol_l"]["answer_value"] == 210
    assert by_key["has_adnexal_mass"]["answer_value"] is True
    assert by_key["is_postmenopausal"]["answer_value"] is True
    assert by_key["has_chronic_hbv_or_cirrhosis"]["answer_value"] is True
    assert "AST: 94" in by_key["lab_ast_u_l"]["source_excerpt"]

    # Also test reading a PDF via file:// URI
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = Path(tmp.name)
    try:
        file_resp = client.post(
            "/api/v1/parser/ingest-document",
            json={
                "patient_id": patient_id,
                "source_type": "FOLDER_PDF",
                "document_category": "LAB",
                "gcs_uri": f"file://{tmp_path}",
            },
        )
        assert file_resp.status_code == 200
        assert file_resp.json()["extracted_count"] >= 9
    finally:
        tmp_path.unlink(missing_ok=True)
