"""HIPAA-by-Design PHI Log Redaction Utilities for Python services.

Redacts dob, first_name, last_name, mrn, email, phone, and free-text clinical notes
recursively across structured log metadata so zero PHI reaches application logs.
"""

from __future__ import annotations

import json
import re
import sys
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

REDACTED_VALUE = "[REDACTED_PHI]"

PHI_FIELD_NAMES = frozenset(
    {
        "dob",
        "date_of_birth",
        "dateofbirth",
        "birthdate",
        "first_name",
        "firstname",
        "last_name",
        "lastname",
        "full_name",
        "fullname",
        "patient_name",
        "patientname",
        "mrn",
        "medical_record_number",
        "email",
        "email_address",
        "phone",
        "phone_number",
        "mobile",
        "zip_code",
        "zipcode",
        "ssn",
        "insurance_member_id",
        "extracted_text",
        "source_excerpt",
        "raw_text",
        "document_text",
        "clinical_notes",
        "clinical_note",
        "free_text",
        "notes",
    }
)

_CAMEL_RE = re.compile(r"([a-z])([A-Z])")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9_]")


def _normalize_key(key: str) -> str:
    snake = _CAMEL_RE.sub(r"\1_\2", key).lower()
    return _NON_ALNUM_RE.sub("", snake)


def is_phi_key(key: str) -> bool:
    norm = _normalize_key(key)
    return norm in PHI_FIELD_NAMES or norm.endswith("_note") or norm.endswith("_notes")


def redact_phi(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [redact_phi(item) for item in value]
    if isinstance(value, tuple):
        return [redact_phi(item) for item in value]
    if isinstance(value, dict):
        return {
            str(k): REDACTED_VALUE if is_phi_key(str(k)) else redact_phi(v)
            for k, v in value.items()
        }
    return str(value)


class HipaaLogger:
    def __init__(self, service: str, sink: Callable[[str], None] | None = None) -> None:
        self.service = service
        self._sink = sink or (lambda line: sys.stdout.write(f"{line}\n"))

    def _emit(self, level: str, message: str, meta: dict[str, Any] | None = None) -> None:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": level,
            "service": self.service,
            "message": message,
        }
        if meta is not None:
            payload["meta"] = redact_phi(meta)
        self._sink(json.dumps(payload, default=str))

    def info(self, message: str, meta: dict[str, Any] | None = None) -> None:
        self._emit("INFO", message, meta)

    def warn(self, message: str, meta: dict[str, Any] | None = None) -> None:
        self._emit("WARN", message, meta)

    def error(self, message: str, meta: dict[str, Any] | None = None) -> None:
        self._emit("ERROR", message, meta)
