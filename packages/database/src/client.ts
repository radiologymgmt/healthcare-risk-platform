import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export function createPool(connectionString?: string): Pool {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required to connect to PostgreSQL.");
  }
  return new Pool({ connectionString: url });
}

export function createDb(pool: Pool): Database {
  return drizzle(pool, { schema });
}
