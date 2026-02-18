import type { Pool, PoolClient } from "pg";

const DEFAULT_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

export async function withAccountDbClient<T>(
  pool: Pool,
  accountId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [accountId]);
    return await fn(client);
  } finally {
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [DEFAULT_ACCOUNT_ID]);
    } catch {
      // Best effort reset before returning connection to the pool.
    }
    client.release();
  }
}
