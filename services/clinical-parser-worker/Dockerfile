# syntax=docker/dockerfile:1
# Component 2: Clinical Parser Worker (Python 3.12 + FastAPI + Vertex AI Gemini + Document AI)
# Build from monorepo root: docker build -f services/clinical-parser-worker/Dockerfile .

FROM python:3.12-slim AS runner

ARG INSTALL_GCP_EXTRAS=false

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

RUN apt-get update -qq \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
     poppler-utils \
     libpq5 \
     ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --shell /bin/bash appuser

COPY services/clinical-parser-worker/pyproject.toml ./
COPY services/clinical-parser-worker/app ./app

RUN pip install --no-cache-dir --upgrade pip \
  && if [ "$INSTALL_GCP_EXTRAS" = "true" ]; then \
       pip install --no-cache-dir ".[gcp]"; \
     else \
       pip install --no-cache-dir "."; \
     fi \
  && chown -R appuser:appuser /app

USER appuser
EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
