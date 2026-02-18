import type { Pool } from "pg";

export interface DueFeed {
  id: string;
  accountId: string;
  url: string;
  title: string;
  siteUrl: string | null;
  folderId: string;
  weight: "prefer" | "neutral" | "deprioritize";
  etag: string | null;
  lastModified: string | null;
  lastPolledAt: Date | null;
  backfillSince: Date | null;
  classificationStatus: "pending_classification" | "classified" | "approved";
}

export class FeedService {
  constructor(private pool: Pool) {}

  async fetchDueFeeds(accountId: string, limit: number): Promise<DueFeed[]> {
    const result = await this.pool.query<{
      id: string;
      tenant_id: string;
      url: string;
      title: string;
      site_url: string | null;
      folder_id: string;
      weight: "prefer" | "neutral" | "deprioritize";
      etag: string | null;
      last_modified: string | null;
      last_polled_at: Date | null;
      classification_status: "pending_classification" | "classified" | "approved";
    }>(
      `SELECT id, tenant_id, url, title, site_url, folder_id, weight, etag, last_modified, last_polled_at, classification_status
       FROM feed
       WHERE tenant_id = $1
         AND muted = FALSE
         AND (circuit_open_until IS NULL OR circuit_open_until <= NOW())
       ORDER BY last_polled_at ASC NULLS FIRST
       LIMIT $2`,
      [accountId, limit],
    );

    return result.rows.map((r) => ({
      id: r.id,
      accountId: r.tenant_id,
      url: r.url,
      title: r.title,
      siteUrl: r.site_url,
      folderId: r.folder_id,
      weight: r.weight,
      etag: r.etag,
      lastModified: r.last_modified,
      lastPolledAt: r.last_polled_at,
      backfillSince: null,
      classificationStatus: r.classification_status,
    }));
  }

  async updateFeedTitle(accountId: string, feedId: string, title: string): Promise<void> {
    await this.pool.query(
      `UPDATE feed SET title = $3
       WHERE id = $1 AND tenant_id = $2`,
      [feedId, accountId, title],
    );
  }

  async updateLastPolled(
    accountId: string,
    feedId: string,
    etag: string | null,
    lastModified: string | null,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE feed
       SET last_polled_at = NOW(), etag = $2, last_modified = $3
       WHERE id = $1
         AND tenant_id = $4`,
      [feedId, etag, lastModified, accountId],
    );
  }

  async recordFeedSuccess(accountId: string, feedId: string): Promise<void> {
    await this.pool.query(
      `UPDATE feed
       SET consecutive_failures = 0,
           circuit_open_until = NULL,
           last_failure_reason = NULL
       WHERE id = $1
         AND tenant_id = $2`,
      [feedId, accountId],
    );
  }

  async recordFeedFailure(accountId: string, feedId: string, reason: string): Promise<void> {
    const result = await this.pool.query<{ consecutive_failures: number }>(
      `UPDATE feed
       SET consecutive_failures = consecutive_failures + 1,
           last_failure_reason = $3
       WHERE id = $1
         AND tenant_id = $2
       RETURNING consecutive_failures`,
      [feedId, accountId, reason],
    );

    const failures = result.rows[0]?.consecutive_failures ?? 0;
    const cooldownHours = getCircuitCooldownHours(failures);

    if (cooldownHours > 0) {
      await this.pool.query(
        `UPDATE feed
         SET circuit_open_until = NOW() + make_interval(hours => $3)
         WHERE id = $1
           AND tenant_id = $2`,
        [feedId, accountId, cooldownHours],
      );
    }
  }

  async resetCircuitBreaker(accountId: string, feedId: string): Promise<void> {
    await this.pool.query(
      `UPDATE feed
       SET consecutive_failures = 0,
           circuit_open_until = NULL,
           last_failure_reason = NULL
       WHERE id = $1
         AND tenant_id = $2`,
      [feedId, accountId],
    );
  }

  async listAccountIds(): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM tenant ORDER BY created_at ASC`,
    );
    return result.rows.map((r) => r.id);
  }
}

/**
 * Calculate circuit breaker cooldown hours based on consecutive failure count.
 *
 * - 1-2 failures: 0 (no circuit break, normal retries)
 * - 3 failures: 1 hour
 * - 4 failures: 4 hours
 * - 5 failures: 12 hours
 * - 6+ failures: 24 hours (cap)
 */
export function getCircuitCooldownHours(consecutiveFailures: number): number {
  if (consecutiveFailures < 3) return 0;
  if (consecutiveFailures === 3) return 1;
  if (consecutiveFailures === 4) return 4;
  if (consecutiveFailures === 5) return 12;
  return 24;
}
