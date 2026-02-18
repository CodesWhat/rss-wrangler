import type { PoolClient } from "pg";

export const ACCOUNT_DELETION_GRACE_WINDOW_DAYS = 7;
export const ACCOUNT_DELETION_BATCH_SIZE = 50;

interface ProcessAccountDeletionOptions {
  accountId: string;
  batchSize?: number;
  graceWindowDays?: number;
}

export interface ProcessAccountDeletionResult {
  processed: number;
  deletedUsers: number;
  tenantPurged: boolean;
  requestIds: string[];
}

export async function processDueAccountDeletions(
  client: PoolClient,
  options: ProcessAccountDeletionOptions,
): Promise<ProcessAccountDeletionResult> {
  const batchSize = options.batchSize ?? ACCOUNT_DELETION_BATCH_SIZE;
  const graceWindowDays = options.graceWindowDays ?? ACCOUNT_DELETION_GRACE_WINDOW_DAYS;
  const graceInterval = `${graceWindowDays} days`;

  await client.query("BEGIN");
  try {
    const completed = await client.query<{
      request_id: string;
      user_id: string | null;
      user_deleted: boolean;
    }>(
      `WITH due AS (
         SELECT id, user_id
         FROM account_deletion_request
         WHERE tenant_id = $1
           AND status = 'pending'
           AND requested_at <= NOW() - $3::interval
         ORDER BY requested_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       ),
       completed AS (
         UPDATE account_deletion_request request
         SET status = 'completed',
             completed_at = NOW()
         FROM due
         WHERE request.id = due.id
           AND request.status = 'pending'
         RETURNING request.id, due.user_id
       ),
       deleted_users AS (
         DELETE FROM user_account account
         USING completed
         WHERE account.id = completed.user_id
           AND account.tenant_id = $1
         RETURNING account.id
       ),
       audit_events AS (
         INSERT INTO event (tenant_id, idempotency_key, ts, type, payload_json)
         SELECT
           $1,
           'account_deletion_completed:' || completed.id::text,
           NOW(),
           'account.deletion.completed',
           jsonb_build_object(
             'requestId', completed.id,
             'userId', completed.user_id,
             'graceWindowDays', $4
           )
         FROM completed
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING 1
       )
       SELECT
         completed.id AS request_id,
         completed.user_id,
         EXISTS (
           SELECT 1
           FROM deleted_users
           WHERE deleted_users.id = completed.user_id
         ) AS user_deleted
       FROM completed`,
      [options.accountId, batchSize, graceInterval, graceWindowDays],
    );

    let tenantPurged = false;
    if (completed.rows.length > 0) {
      const tenantDelete = await client.query<{ id: string }>(
        `DELETE FROM tenant
         WHERE id = $1
           AND NOT EXISTS (
             SELECT 1
             FROM user_account
             WHERE user_account.tenant_id = $1
           )
         RETURNING id`,
        [options.accountId],
      );
      tenantPurged = tenantDelete.rows.length > 0;
    }

    await client.query("COMMIT");
    return {
      processed: completed.rows.length,
      deletedUsers: completed.rows.filter((row) => row.user_deleted).length,
      tenantPurged,
      requestIds: completed.rows.map((row) => row.request_id),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
