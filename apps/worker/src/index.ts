import PgBoss from "pg-boss";
import { loadEnv } from "./config/env";
import { registerJobs } from "./jobs/register-jobs";

async function start() {
  const env = loadEnv();
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    application_name: "rss-wrangler-worker"
  });

  boss.on("error", (error) => {
    console.error("[worker] pg-boss error", error);
  });

  await boss.start();
  await registerJobs(boss, { env });

  console.info("[worker] started", {
    pollMinutes: env.WORKER_POLL_MINUTES
  });

  const shutdown = async () => {
    console.info("[worker] shutting down");
    await boss.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("[worker] failed to start", error);
  process.exit(1);
});
