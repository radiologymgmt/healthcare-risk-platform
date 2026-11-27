import { createPool } from "@healthcare/database";
import { createHipaaLogger } from "@healthcare/shared-contracts";
import { createApp } from "./app.js";

const logger = createHipaaLogger("rules-engine-api");
const pool = createPool();
const app = createApp(pool, logger);

const port = Number(process.env.PORT ?? 4001);
const server = app.listen(port, () => {
  logger.info("Rules Engine API listening", { port });
});

async function shutdown(signal: string) {
  logger.info("Shutting down Rules Engine API", { signal });
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
