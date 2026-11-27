import { createPool } from "@healthcare/database";
import { createHipaaLogger } from "@healthcare/shared-contracts";
import { createInteropApp } from "./app.js";

const logger = createHipaaLogger("interop-ingestion-worker");
const pool = createPool();
const app = createInteropApp(pool, { logger });

const port = Number(process.env.PORT ?? 4002);
const server = app.listen(port, () => {
  logger.info("Interop Ingestion Worker listening", { port });
});

function shutdown(signal: string) {
  logger.info("Shutting down Interop Ingestion Worker", { signal });
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
