import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export function createPool(connectionString?: string): Pool {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required to connect to PostgreSQL.");
  }

  try {
    const parsed = new URL(url);
    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode === "require" || sslMode === "no-verify") {
      parsed.searchParams.delete("sslmode");
      return new Pool({
        connectionString: parsed.toString(),
        ssl: { rejectUnauthorized: false },
      });
    }
  } catch {
    // Fallback to raw connectionString if URL parsing fails
  }

  return new Pool({ connectionString: url });
}

export function createDb(pool: Pool): Database {
  return drizzle(pool, { schema });
}
