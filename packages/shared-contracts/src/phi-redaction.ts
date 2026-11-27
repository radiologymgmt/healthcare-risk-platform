/**
 * HIPAA-by-Design PHI Log Redaction Utilities.
 * Zero PHI in logs: redacts dob, first_name, last_name, mrn, email, phone,
 * and free-text clinical notes recursively across structured log payloads.
 */

export const REDACTED_VALUE = "[REDACTED_PHI]" as const;

export const PHI_FIELD_NAMES = new Set<string>([
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
  "clinical_notes",
  "clinical_note",
  "free_text",
  "notes",
]);

function normalizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

export function isPhiKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (PHI_FIELD_NAMES.has(normalized)) return true;
  if (normalized.endsWith("_note") || normalized.endsWith("_notes")) return true;
  return false;
}

export function redactPhi<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  if (value instanceof Date) {
    return value.toISOString() as unknown as T;
  }

  if (seen.has(value as object)) {
    return "[CIRCULAR]" as unknown as T;
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactPhi(item, seen)) as unknown as T;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input)) {
    if (isPhiKey(key)) {
      output[key] = REDACTED_VALUE;
    } else {
      output[key] = redactPhi(val, seen);
    }
  }
  return output as T;
}

export interface HipaaLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

export function createHipaaLogger(
  service: string,
  sink: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): HipaaLogger {
  const emit = (level: "INFO" | "WARN" | "ERROR", message: string, meta?: Record<string, unknown>) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      ...(meta ? { meta: redactPhi(meta) } : {}),
    };
    sink(JSON.stringify(entry));
  };

  return {
    info: (message, meta) => emit("INFO", message, meta),
    warn: (message, meta) => emit("WARN", message, meta),
    error: (message, meta) => emit("ERROR", message, meta),
  };
}
