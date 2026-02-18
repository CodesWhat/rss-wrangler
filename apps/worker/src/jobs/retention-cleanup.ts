import type { Pool } from "pg";
import { z } from "zod";

const retentionSettingsSchema = z.object({
  unreadMaxAgeDays: z.number().int().min(1).max(3650).nullable().optional(),
  readPurgeDays: z.number().int().min(1).max(3650).nullable().optional(),
});

export interface RetentionCleanupResult {
  applied: boolean;
  unreadMaxAgeDays: number | null;
  readPurgeDays: number | null;
  autoMarkedUnread: number;
  purgedReadClusters: number;
  purgedOrphanItems: number;
}

export async function runRetentionCleanup(
  pool: Pool,
  accountId: string,
): Promise<RetentionCleanupResult> {
  const settingsResult = await pool.query<{ data: unknown }>(
    "SELECT data FROM app_settings WHERE tenant_id = $1 AND key = 'main' LIMIT 1",
    [accountId],
  );
  const rawSettings = (settingsResult.rows[0]?.data ?? {}) as unknown;
  const parsed = retentionSettingsSchema.safeParse(rawSettings);
  const unreadMaxAgeDays = parsed.success ? (parsed.data.unreadMaxAgeDays ?? null) : null;
  const readPurgeDays = parsed.success ? (parsed.data.readPurgeDays ?? null) : null;

  if (unreadMaxAgeDays === null && readPurgeDays === null) {
    return {
      applied: false,
      unreadMaxAgeDays,
      readPurgeDays,
      autoMarkedUnread: 0,
      purgedReadClusters: 0,
      purgedOrphanItems: 0,
    };
  }

  let autoMarkedUnread = 0;
  let purgedReadClusters = 0;
  let purgedOrphanItems = 0;

  if (unreadMaxAgeDays !== null) {
    const markUnreadResult = await pool.query(
      `INSERT INTO read_state (tenant_id, cluster_id, read_at)
       SELECT
         c.tenant_id,
         c.id,
         NOW()
       FROM cluster c
       LEFT JOIN item rep_i
         ON rep_i.id = c.rep_item_id
        AND rep_i.tenant_id = c.tenant_id
       LEFT JOIN read_state rs
         ON rs.cluster_id = c.id
        AND rs.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1
         AND COALESCE(rep_i.published_at, c.created_at) < NOW() - make_interval(days => $2::int)
         AND rs.read_at IS NULL
         AND rs.not_interested_at IS NULL
       ON CONFLICT (cluster_id) DO UPDATE
       SET
         tenant_id = EXCLUDED.tenant_id,
         read_at = EXCLUDED.read_at
       WHERE read_state.read_at IS NULL
         AND read_state.not_interested_at IS NULL`,
      [accountId, unreadMaxAgeDays],
    );
    autoMarkedUnread = markUnreadResult.rowCount ?? 0;
  }

  if (readPurgeDays !== null) {
    const purgeClusterResult = await pool.query(
      `DELETE FROM cluster c
       USING read_state rs
       WHERE c.id = rs.cluster_id
         AND c.tenant_id = $1
         AND rs.tenant_id = $1
         AND rs.read_at IS NOT NULL
         AND rs.saved_at IS NULL
         AND rs.read_at < NOW() - make_interval(days => $2::int)`,
      [accountId, readPurgeDays],
    );
    purgedReadClusters = purgeClusterResult.rowCount ?? 0;

    const purgeOrphanItemsResult = await pool.query(
      `DELETE FROM item i
       WHERE i.tenant_id = $1
         AND COALESCE(i.published_at, i.created_at) < NOW() - make_interval(days => $2::int)
         AND NOT EXISTS (
           SELECT 1
           FROM cluster_member cm
           WHERE cm.tenant_id = i.tenant_id
             AND cm.item_id = i.id
         )
         AND NOT EXISTS (
           SELECT 1
           FROM cluster c
           WHERE c.tenant_id = i.tenant_id
             AND c.rep_item_id = i.id
         )`,
      [accountId, readPurgeDays],
    );
    purgedOrphanItems = purgeOrphanItemsResult.rowCount ?? 0;
  }

  return {
    applied: true,
    unreadMaxAgeDays,
    readPurgeDays,
    autoMarkedUnread,
    purgedReadClusters,
    purgedOrphanItems,
  };
}
