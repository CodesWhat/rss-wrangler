import { PgBoss } from "pg-boss";
import { loadEnv } from "./config/env";
import { registerJobs } from "./jobs/register-jobs";
import { getPool, closePool } from "./db";

async function start() {
  const env = loadEnv();
  const pool = getPool(env.DATABASE_URL);

  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    application_name: "rss-wrangler-worker"
  });

  boss.on("error", (error) => {
    console.error("[worker] pg-boss error", error);
  });

  await boss.start();
  await registerJobs(boss, { env, pool });

  console.info("[worker] started", {
    pollMinutes: env.WORKER_POLL_MINUTES
  });

  const shutdown = async () => {
    console.info("[worker] shutting down");
    await boss.stop();
    await closePool();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("[worker] failed to start", error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exit(1);
});
