"""PDF and Document Text Extraction for Clinical Documents.

Supports:
- Direct raw text (visit notes / HL7 narrative / FHIR DocumentReference decoded text)
- PDF bytes (via pypdf, with poppler pdftotext fallback for complex PDFs)
- Optional GCP Document AI OCR hook for scanned/faxed PDFs when configured
- Local file or GCS URI loading
"""

from __future__ import annotations

import base64
import io
import os
import subprocess
import tempfile
from pathlib import Path

from pypdf import PdfReader


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """Extracts text from PDF bytes using pypdf, falling back to pdftotext if empty."""
    chunks: list[str] = []
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        for page in reader.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                chunks.append(page_text.strip())
    except Exception:
        chunks = []

    text = "\n".join(chunks).strip()
    if text:
        return text

    # Fallback to poppler pdftotext
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
        tmp.write(pdf_bytes)
        tmp.flush()
        proc = subprocess.run(
            ["pdftotext", "-layout", tmp.name, "-"],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return proc.stdout.strip()

    # Optional GCP Document AI OCR path when configured for scanned faxes
    processor_name = os.getenv("GCP_DOCUMENT_AI_PROCESSOR")
    if processor_name:
        return _extract_with_document_ai(pdf_bytes, processor_name)

    return ""


def _extract_with_document_ai(pdf_bytes: bytes, processor_name: str) -> str:
    from google.cloud import documentai  # type: ignore[import-not-found]

    client = documentai.DocumentProcessorServiceClient()
    raw_doc = documentai.RawDocument(content=pdf_bytes, mime_type="application/pdf")
    request = documentai.ProcessRequest(name=processor_name, raw_document=raw_doc)
    result = client.process_document(request=request)
    return (result.document.text or "").strip()


def load_document_text(
    *,
    raw_text: str | None = None,
    pdf_base64: str | None = None,
    gcs_uri: str | None = None,
) -> str:
    """Resolves clinical text from inline text, base64 PDF, local path, or GCS URI."""
    if raw_text and raw_text.strip():
        return raw_text.strip()

    if pdf_base64:
        pdf_bytes = base64.b64decode(pdf_base64)
        return extract_text_from_pdf_bytes(pdf_bytes)

    if gcs_uri:
        if gcs_uri.startswith("file://"):
            local_path = Path(gcs_uri.removeprefix("file://"))
            data = local_path.read_bytes()
            if local_path.suffix.lower() == ".pdf":
                return extract_text_from_pdf_bytes(data)
            return data.decode("utf-8", errors="replace").strip()

        if gcs_uri.startswith("gs://"):
            # Local staging mirror for offline dev/test when GCS_LOCAL_MIRROR_DIR is set
            mirror_dir = os.getenv("GCS_LOCAL_MIRROR_DIR")
            rel = gcs_uri.removeprefix("gs://")
            if mirror_dir:
                local_file = Path(mirror_dir) / rel
                if local_file.exists():
                    data = local_file.read_bytes()
                    if local_file.suffix.lower() == ".pdf":
                        return extract_text_from_pdf_bytes(data)
                    return data.decode("utf-8", errors="replace").strip()

            # Production GCP Cloud Storage download
            from google.cloud import storage  # type: ignore[import-not-found]

            bucket_name, _, blob_name = rel.partition("/")
            client = storage.Client()
            blob = client.bucket(bucket_name).blob(blob_name)
            data = blob.download_as_bytes()
            if blob_name.lower().endswith(".pdf"):
                return extract_text_from_pdf_bytes(data)
            return data.decode("utf-8", errors="replace").strip()

    raise ValueError("Unable to resolve clinical document text from provided payload")
