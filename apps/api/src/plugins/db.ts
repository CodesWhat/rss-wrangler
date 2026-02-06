import fp from "fastify-plugin";
import { Pool } from "pg";

export const dbPlugin = fp(async (app, opts: { databaseUrl: string }) => {
  const pool = new Pool({ connectionString: opts.databaseUrl });

  // Verify connectivity at startup
  const client = await pool.connect();
  client.release();

  app.decorate("pg", pool);

  app.addHook("onClose", async () => {
    await pool.end();
  });
});
