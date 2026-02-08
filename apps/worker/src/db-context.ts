import type { Pool, PoolClient } from "pg";

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export async function withTenantDbClient<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
    return await fn(client);
  } finally {
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [DEFAULT_TENANT_ID]);
    } catch {
      // Best effort reset before returning connection to the pool.
    }
    client.release();
  }
}
