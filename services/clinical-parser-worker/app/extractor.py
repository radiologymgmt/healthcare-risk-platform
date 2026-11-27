"""Vertex AI Gemini Structured Clinical Extractor & Deterministic Local Extractor.

Maps unstructured clinical notes and lab PDFs to the unified `questions` registry
(`question_key` + `answer_value` + `confidence_score` + verbatim `source_excerpt`).
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Protocol

from pydantic import BaseModel, Field


class ExtractedAnswer(BaseModel):
    question_key: str
    answer_value: Any
    confidence_score: float = Field(ge=0.0, le=1.0)
    source_excerpt: str = Field(min_length=1)


class QuestionRegistryItem(BaseModel):
    question_key: str
    domain: str
    label_plain_english: str
    input_type: str


class ClinicalExtractor(Protocol):
    def extract(
        self,
        document_text: str,
        registry: list[QuestionRegistryItem],
    ) -> list[ExtractedAnswer]: ...


def _split_sentences(text: str) -> list[str]:
    """Splits clinical notes/lab lines into clean sentence/line excerpts."""
    raw_lines = [line.strip() for line in text.splitlines() if line.strip()]
    sentences: list[str] = []
    for line in raw_lines:
        parts = re.split(r"(?<=[.!?])\s+", line)
        for p in parts:
            cleaned = p.strip()
            if cleaned:
                sentences.append(cleaned)
    return sentences


class VertexGeminiExtractor:
    """Production Vertex AI Gemini structured JSON extractor (Zero Data Retention)."""

    def __init__(
        self,
        project_id: str | None = None,
        location: str | None = None,
        model_name: str | None = None,
    ) -> None:
        self.project_id = project_id or os.getenv("VERTEX_AI_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
        self.location = location or os.getenv("VERTEX_AI_LOCATION", "us-central1")
        self.model_name = model_name or os.getenv("VERTEX_AI_MODEL", "gemini-2.5-flash")

    def extract(
        self,
        document_text: str,
        registry: list[QuestionRegistryItem],
    ) -> list[ExtractedAnswer]:
        from google import genai  # type: ignore[import-not-found]
        from google.genai import types  # type: ignore[import-not-found]

        allowed_keys = {item.question_key for item in registry}
        registry_brief = [
            {
                "question_key": q.question_key,
                "input_type": q.input_type,
                "meaning": q.label_plain_english,
            }
            for q in registry
        ]

        system_instruction = (
            "You are a HIPAA-compliant clinical NLP extraction engine. "
            "Extract ONLY facts explicitly stated in the clinical document and map them to the "
            "provided `question_key` registry. For every extracted answer, provide:\n"
            "1. `question_key` (must exactly match one key from the registry)\n"
            "2. `answer_value` (typed to match input_type: boolean, number, or string)\n"
            "3. `confidence_score` (float between 0.000 and 1.000)\n"
            "4. `source_excerpt` (exact verbatim sentence or lab line copied from the document)\n"
            "Never hallucinate or infer unstated facts."
        )

        prompt = (
            f"QUESTION REGISTRY:\n{json.dumps(registry_brief)}\n\n"
            f"CLINICAL DOCUMENT:\n{document_text}\n\n"
            "Return JSON matching: {\"extractions\": [{\"question_key\": str, \"answer_value\": any, "
            "\"confidence_score\": float, \"source_excerpt\": str}]}"
        )

        client = genai.Client(
            vertexai=True,
            project=self.project_id,
            location=self.location,
        )
        response = client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.0,
                response_mime_type="application/json",
            ),
        )

        payload = json.loads(response.text or "{}")
        raw_items = payload.get("extractions", [])
        validated: list[ExtractedAnswer] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            key = item.get("question_key")
            if key not in allowed_keys:
                continue
            validated.append(
                ExtractedAnswer(
                    question_key=str(key),
                    answer_value=item.get("answer_value"),
                    confidence_score=round(float(item.get("confidence_score", 0.85)), 3),
                    source_excerpt=str(item.get("source_excerpt", "")).strip()[:500],
                )
            )
        return validated


class DeterministicSyntheticExtractor:
    """High-precision deterministic clinical note & lab extractor for local dev/testing.

    Guarantees verbatim `source_excerpt` provenance and calibrated `confidence_score`
    without external API calls or credentials.
    """

    def extract(
        self,
        document_text: str,
        registry: list[QuestionRegistryItem],
    ) -> list[ExtractedAnswer]:
        allowed_keys = {item.question_key for item in registry}
        sentences = _split_sentences(document_text)
        found: dict[str, ExtractedAnswer] = {}

        def record(key: str, value: Any, confidence: float, excerpt: str) -> None:
            if key not in allowed_keys:
                return
            existing = found.get(key)
            if existing is None or confidence > existing.confidence_score:
                found[key] = ExtractedAnswer(
                    question_key=key,
                    answer_value=value,
                    confidence_score=round(confidence, 3),
                    source_excerpt=excerpt[:500],
                )

        # Numeric clinical lab / vital patterns
        numeric_rules: list[tuple[str, re.Pattern[str], float]] = [
            ("pack_years", re.compile(r"(\d+(?:\.\d+)?)\s*[- ]?pack[- ]?years?", re.I), 0.96),
            ("years_since_quit_smoking", re.compile(r"quit\s+(?:smoking\s+)?(\d+(?:\.\d+)?)\s+years?\s+ago", re.I), 0.93),
            ("height_cm", re.compile(r"\bheight\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)\s*cm\b", re.I), 0.96),
            ("weight_kg", re.compile(r"\bweight\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)\s*kg\b", re.I), 0.96),
            ("systolic_bp_mmhg", re.compile(r"\b(?:BP|blood pressure|systolic(?:\s+bp)?)\s*[:=]?\s*(\d{2,3})(?:/\d{2,3})?\s*(?:mmhg)?", re.I), 0.95),
            ("heart_rate_bpm", re.compile(r"\b(?:HR|heart rate|pulse)\s*[:=]?\s*(\d{2,3})\s*(?:bpm|/min)?", re.I), 0.95),
            ("lab_ast_u_l", re.compile(r"\bAST(?:\s*\(SGOT\))?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:U/L)?", re.I), 0.98),
            ("lab_alt_u_l", re.compile(r"\bALT(?:\s*\(SGPT\))?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:U/L)?", re.I), 0.98),
            ("lab_platelets_10e9_l", re.compile(r"\b(?:platelets?|PLT)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:x?10\^?9/L|K/uL|k/ul)?", re.I), 0.98),
            ("lab_albumin_g_dl", re.compile(r"\balbumin\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:g/dL)?", re.I), 0.97),
            ("lab_psa_ng_ml", re.compile(r"\b(?:serum\s+)?PSA\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:ng/mL)?", re.I), 0.98),
            ("lab_ca125_u_ml", re.compile(r"\bCA[- ]?125\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:U/mL)?", re.I), 0.98),
            ("lab_he4_pmol_l", re.compile(r"\bHE4\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:pmol/L)?", re.I), 0.98),
            ("lab_total_cholesterol_mg_dl", re.compile(r"\btotal\s+cholesterol\s*[:=]?\s*(\d+(?:\.\d+)?)", re.I), 0.97),
            ("lab_hdl_mg_dl", re.compile(r"\bHDL(?:\s+cholesterol)?\s*[:=]?\s*(\d+(?:\.\d+)?)", re.I), 0.97),
            ("lab_egfr_ml_min", re.compile(r"\beGFR\s*[:=]?\s*(\d+(?:\.\d+)?)", re.I), 0.97),
            ("coronary_calcium_agatston_score", re.compile(r"\b(?:CAC|coronary\s+(?:artery\s+)?calcium(?:\s+score)?|Agatston)\s*[:=]?\s*(\d+(?:\.\d+)?)", re.I), 0.96),
            ("cognitive_moca_score", re.compile(r"\bMoCA(?:\s+score)?\s*[:=]?\s*(\d{1,2})(?:/30)?", re.I), 0.96),
            ("cognitive_cdr_score", re.compile(r"\bCDR(?:\s+global)?(?:\s+score)?\s*[:=]?\s*(\d(?:\.\d)?)", re.I), 0.95),
            ("dexa_femoral_neck_t_score", re.compile(r"\b(?:DEXA|femoral\s+neck)\s+T[- ]?score\s*[:=]?\s*(-?\d+(?:\.\d+)?)", re.I), 0.96),
            ("koos_hoos_symptom_score", re.compile(r"\b(?:KOOS|HOOS)(?:\s+score)?\s*[:=]?\s*(\d{1,3})", re.I), 0.94),
            ("colon_polyp_lifetime_count", re.compile(r"(\d+)\s+(?:lifetime\s+|cumulative\s+)?(?:adenomatous\s+)?(?:colon\s+)?polyps?", re.I), 0.91),
            ("asbestos_exposure_years", re.compile(r"(\d+)\s+years?\s+of\s+(?:occupational\s+)?asbestos\s+exposure", re.I), 0.92),
        ]

        # Boolean & categorical clinical condition patterns
        negation_re = re.compile(r"\b(?:no|denies|negative\s+for|without|absent|ruled\s+out)\b", re.I)

        boolean_rules: list[tuple[str, re.Pattern[str], float]] = [
            ("copd_history", re.compile(r"\b(?:COPD|emphysema|chronic\s+obstructive\s+pulmonary)\b", re.I), 0.94),
            ("has_hypertension", re.compile(r"\b(?:hypertension|HTN|high\s+blood\s+pressure)\b", re.I), 0.94),
            ("has_diabetes", re.compile(r"\b(?:type\s*[12]\s+)?diabetes(?:\s+mellitus)?|\bT2DM\b", re.I), 0.95),
            ("has_atrial_fibrillation", re.compile(r"\b(?:atrial\s+fibrillation|AFib|A-?fib)\b", re.I), 0.96),
            ("has_heart_failure", re.compile(r"\b(?:congestive\s+heart\s+failure|CHF|HFrEF|HFpEF)\b", re.I), 0.95),
            ("has_prior_stroke_or_tia", re.compile(r"\b(?:prior\s+stroke|history\s+of\s+(?:CVA|stroke|TIA))\b", re.I), 0.93),
            ("has_chronic_hbv_or_cirrhosis", re.compile(r"\b(?:cirrhosis|chronic\s+hepatitis\s+B|chronic\s+HBV)\b", re.I), 0.95),
            ("has_atypical_hyperplasia_or_lcis", re.compile(r"\b(?:atypical\s+(?:ductal\s+|lobular\s+)?hyperplasia|ADH|ALH|LCIS)\b", re.I), 0.95),
            ("tumor_msi_high_or_ihc_loss", re.compile(r"\b(?:MSI-?High|MSI-H|loss\s+of\s+(?:MLH1|MSH2|MSH6|PMS2))\b", re.I), 0.97),
            ("known_brca_or_lynch_family_mutation", re.compile(r"\b(?:known\s+(?:BRCA1|BRCA2|PALB2|Lynch)\s+mutation|BRCA[12]\s+positive\s+family)\b", re.I), 0.94),
            ("dre_abnormal", re.compile(r"\b(?:abnormal\s+DRE|prostate\s+nodule\s+on\s+DRE|indurated\s+prostate)\b", re.I), 0.93),
            ("has_adnexal_mass", re.compile(r"\b(?:adnexal\s+mass|complex\s+ovarian\s+(?:cyst|mass))\b", re.I), 0.94),
            ("is_postmenopausal", re.compile(r"\bpost-?menopausal\b", re.I), 0.94),
            ("has_thunderclap_headache", re.compile(r"\b(?:thunderclap\s+headache|sudden\s+worst[- ]ever\s+headache)\b", re.I), 0.95),
            ("has_clinical_signs_dvt", re.compile(r"\b(?:unilateral\s+calf\s+swelling|clinical\s+signs\s+of\s+DVT|pitting\s+edema\s+with\s+calf\s+tenderness)\b", re.I), 0.92),
            ("has_prior_dvt_or_pe", re.compile(r"\b(?:prior\s+(?:DVT|PE|deep\s+vein\s+thrombosis|pulmonary\s+embolism)|history\s+of\s+(?:DVT|PE))\b", re.I), 0.93),
            ("has_prior_major_bleeding", re.compile(r"\b(?:prior\s+major\s+bleed(?:ing)?|GI\s+bleed\s+requiring\s+transfusion)\b", re.I), 0.92),
            ("has_prior_fragility_fracture", re.compile(r"\b(?:fragility\s+fracture|low-trauma\s+(?:hip|vertebral|wrist)\s+fracture)\b", re.I), 0.92),
            ("uses_nsaid_or_antiplatelet", re.compile(r"\b(?:daily\s+aspirin|clopidogrel|chronic\s+NSAID)\b", re.I), 0.90),
            ("snoring_loud", re.compile(r"\b(?:loud\s+snoring|heavy\s+snoring)\b", re.I), 0.89),
            ("observed_apnea", re.compile(r"\b(?:witnessed\s+apneas?|observed\s+apnea|gasping\s+during\s+sleep)\b", re.I), 0.92),
        ]

        birads_re = re.compile(r"\bBI-?RADS\s+(?:breast\s+)?density\s*(?:category\s*)?([ABCD])\b", re.I)

        for sentence in sentences:
            # Smoking status
            if re.search(r"\b(?:current\s+(?:everyday\s+)?smoker|actively\s+smokes|continues\s+to\s+smoke)\b", sentence, re.I):
                record("smoking_status", "current", 0.96, sentence)
            elif re.search(r"\b(?:former\s+smoker|ex-?smoker|quit\s+smoking)\b", sentence, re.I):
                record("smoking_status", "former", 0.95, sentence)
            elif re.search(r"\b(?:never\s+smoker|lifetime\s+non-?smoker|no\s+history\s+of\s+smoking)\b", sentence, re.I):
                record("smoking_status", "never", 0.95, sentence)

            # BI-RADS breast density
            m_birads = birads_re.search(sentence)
            if m_birads:
                record("breast_density_birads", m_birads.group(1).upper(), 0.97, sentence)

            # Family breast/colorectal cancer count hints
            if re.search(r"\bmother\b.*\bbreast\s+cancer\b|\bsister\b.*\bbreast\s+cancer\b", sentence, re.I):
                relatives = len(re.findall(r"\b(?:mother|sister|daughter)\b", sentence, re.I))
                record("first_degree_breast_cancer_count", max(1, relatives), 0.90, sentence)
                age_m = re.search(r"(?:at\s+age|diagnosed\s+at)\s+(\d{2})\b", sentence, re.I)
                if age_m:
                    record("youngest_family_breast_cancer_age", int(age_m.group(1)), 0.89, sentence)

            if re.search(r"\b(?:mother|father|sister|brother)\b.*\b(?:colon|colorectal)\s+cancer\b", sentence, re.I):
                relatives = len(re.findall(r"\b(?:mother|father|sister|brother)\b", sentence, re.I))
                record("first_degree_crc_count", max(1, relatives), 0.90, sentence)

            # Numeric labs & vitals
            for key, pattern, conf in numeric_rules:
                m = pattern.search(sentence)
                if m:
                    raw_num = m.group(1)
                    val: int | float = float(raw_num) if "." in raw_num else int(raw_num)
                    record(key, val, conf, sentence)

            # Boolean clinical findings (skip negated phrases like "denies hypertension")
            for key, pattern, conf in boolean_rules:
                m = pattern.search(sentence)
                if m:
                    prefix = sentence[max(0, m.start() - 35) : m.start()]
                    is_negated = bool(negation_re.search(prefix))
                    record(key, not is_negated, conf if not is_negated else conf - 0.05, sentence)

        return list(found.values())


def get_default_extractor() -> ClinicalExtractor:
    mode = os.getenv("PARSER_MODE", "auto").lower()
    if mode == "vertex" or (
        mode == "auto"
        and (os.getenv("VERTEX_AI_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT"))
        and os.getenv("USE_VERTEX_AI", "false").lower() == "true"
    ):
        return VertexGeminiExtractor()
    return DeterministicSyntheticExtractor()
