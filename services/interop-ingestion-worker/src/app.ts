import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { createHipaaLogger, redactPhi, type HipaaLogger } from "@healthcare/shared-contracts";
import {
  createHttpParserDispatcher,
  ingestFhirBundle,
  ingestGcsFolderDrop,
  ingestHl7Message,
  type ParserDispatcher,
} from "./ingestion-service.js";
import { buildHl7OrmOrderMessage } from "./hl7-parser.js";
import { buildFhirServiceRequest } from "./fhir-parser.js";

const GcsEventSchema = z.object({
  bucket: z.string().min(1),
  name: z.string().min(1),
  patient_id: z.string().uuid().optional(),
  mrn: z.string().optional(),
  metadata: z.record(z.string()).optional(),
  document_category: z.enum(["LAB", "RADIOLOGY", "VISIT_NOTE", "ICD10_HISTORY"]).optional(),
  raw_text: z.string().optional(),
  pdf_base64: z.string().optional(),
});

const DispatchOrderSchema = z.object({
  format: z.enum(["FHIR_SERVICE_REQUEST", "HL7_ORM"]).default("FHIR_SERVICE_REQUEST"),
  order_id: z.string().min(1),
  patient_id: z.string().uuid(),
  provider_id: z.string().min(1),
  cpt_codes: z.array(z.string().min(1)).min(1),
  icd10_codes: z.array(z.string().min(1)).min(1),
  intervention: z.string().min(1),
  priority: z.enum(["stat", "urgent", "routine"]).default("routine"),
});

export function createInteropApp(
  pool: Pool,
  options?: {
    logger?: HipaaLogger;
    dispatchToParser?: ParserDispatcher;
  },
): Express {
  const logger = options?.logger ?? createHipaaLogger("interop-ingestion-worker");
  const dispatchToParser = options?.dispatchToParser ?? createHttpParserDispatcher();

  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use(express.text({ type: ["text/plain", "x-application/hl7-v2+er7"], limit: "5mb" }));

  app.get("/health", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", service: "interop-ingestion-worker" });
    } catch (err) {
      next(err);
    }
  });

  // 1. HL7 v2 ORU / ADT ingestion
  app.post("/api/v1/interop/hl7", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawMessage =
        typeof req.body === "string"
          ? req.body
          : typeof req.body?.raw_message === "string"
            ? req.body.raw_message
            : "";

      if (!rawMessage.trim()) {
        res.status(400).json({ error: "HL7 v2 raw message body is required" });
        return;
      }

      const result = await ingestHl7Message(pool, rawMessage, logger, dispatchToParser);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Invalid HL7")) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  // 2. FHIR R4 Bundle / Resource ingestion
  app.post("/api/v1/interop/fhir", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.body || typeof req.body !== "object") {
        res.status(400).json({ error: "Valid FHIR R4 JSON payload is required" });
        return;
      }

      const result = await ingestFhirBundle(
        pool,
        req.body as Record<string, unknown>,
        logger,
        dispatchToParser,
      );
      res.status(201).json(result);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.startsWith("Invalid FHIR") || err.message.startsWith("FHIR R4"))
      ) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  // 3. GCS Eventarc Folder-Drop Webhook (google.cloud.storage.object.v1.finalized)
  app.post("/api/v1/interop/gcs-event", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Unwrap CloudEvent `data` envelope if present
      const rawEvent =
        req.body && typeof req.body === "object" && "data" in req.body && req.body.data
          ? req.body.data
          : req.body;

      const parsed = GcsEventSchema.safeParse(rawEvent);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid GCS Eventarc payload", details: parsed.error.flatten() });
        return;
      }

      const d = parsed.data;
      const result = await ingestGcsFolderDrop(
        pool,
        {
          bucket: d.bucket,
          name: d.name,
          patient_id: d.patient_id ?? d.metadata?.patient_id,
          mrn: d.mrn ?? d.metadata?.mrn,
          document_category: d.document_category,
          raw_text: d.raw_text,
          pdf_base64: d.pdf_base64,
        },
        logger,
        dispatchToParser,
      );
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        res.status(404).json({ error: err.message });
        return;
      }
      next(err);
    }
  });

  // 4. Outbound FHIR ServiceRequest / HL7 ORM^O01 Order Dispatch
  app.post(
    "/api/v1/interop/dispatch-order",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = DispatchOrderSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "Invalid order dispatch payload", details: parsed.error.flatten() });
          return;
        }
        const d = parsed.data;

        const patRes = await pool.query<{
          id: string;
          mrn: string | null;
          fhir_patient_id: string | null;
          first_name: string;
          last_name: string;
          dob: Date | string;
          sex_at_birth: string | null;
        }>(
          `SELECT id, mrn, fhir_patient_id, first_name, last_name, dob, sex_at_birth FROM patients WHERE id = $1`,
          [d.patient_id],
        );

        if (patRes.rowCount === 0) {
          res.status(404).json({ error: "Patient not found" });
          return;
        }
        const pat = patRes.rows[0]!;
        const dobStr =
          pat.dob instanceof Date ? pat.dob.toISOString().slice(0, 10) : String(pat.dob).slice(0, 10);

        const outboundPayload =
          d.format === "HL7_ORM"
            ? buildHl7OrmOrderMessage({
                orderId: d.order_id,
                mrn: pat.mrn ?? pat.id,
                lastName: pat.last_name,
                firstName: pat.first_name,
                dob: dobStr,
                sexAtBirth: pat.sex_at_birth ?? "Unknown",
                providerId: d.provider_id,
                cptCodes: d.cpt_codes,
                icd10Codes: d.icd10_codes,
                intervention: d.intervention,
              })
            : buildFhirServiceRequest({
                orderId: d.order_id,
                fhirPatientId: pat.fhir_patient_id ?? pat.id,
                providerId: d.provider_id,
                cptCodes: d.cpt_codes,
                icd10Codes: d.icd10_codes,
                intervention: d.intervention,
                priority: d.priority,
              });

        await pool.query(
          `
          INSERT INTO audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
          VALUES ($1, 'PROVIDER', 'DISPATCH_ORDER', 'order', $2, $3::jsonb)
          `,
          [
            d.provider_id,
            d.order_id,
            JSON.stringify(
              redactPhi({
                patient_id: d.patient_id,
                format: d.format,
                cpt_codes: d.cpt_codes,
                icd10_codes: d.icd10_codes,
              }),
            ),
          ],
        );

        res.status(201).json({
          dispatched: true,
          format: d.format,
          order_id: d.order_id,
          payload: outboundPayload,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("Unhandled interop ingestion error", {
      error_name: err instanceof Error ? err.name : "UnknownError",
    });
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
