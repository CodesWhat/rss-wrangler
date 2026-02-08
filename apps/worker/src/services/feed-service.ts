import type { Pool } from "pg";

export interface DueFeed {
  id: string;
  tenantId: string;
  url: string;
  title: string;
  siteUrl: string | null;
  folderId: string;
  weight: "prefer" | "neutral" | "deprioritize";
  etag: string | null;
  lastModified: string | null;
  lastPolledAt: Date | null;
  classificationStatus: "pending_classification" | "classified" | "approved";
}

export class FeedService {
  constructor(private pool: Pool) {}

  async fetchDueFeeds(tenantId: string, limit: number): Promise<DueFeed[]> {
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
       ORDER BY last_polled_at ASC NULLS FIRST
       LIMIT $2`,
      [tenantId, limit]
    );

    return result.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      url: r.url,
      title: r.title,
      siteUrl: r.site_url,
      folderId: r.folder_id,
      weight: r.weight,
      etag: r.etag,
      lastModified: r.last_modified,
      lastPolledAt: r.last_polled_at,
      classificationStatus: r.classification_status,
    }));
  }

  async updateLastPolled(
    tenantId: string,
    feedId: string,
    etag: string | null,
    lastModified: string | null
  ): Promise<void> {
    await this.pool.query(
      `UPDATE feed
       SET last_polled_at = NOW(), etag = $2, last_modified = $3
       WHERE id = $1
         AND tenant_id = $4`,
      [feedId, etag, lastModified, tenantId]
    );
  }

  async listTenantIds(): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM tenant ORDER BY created_at ASC`
    );
    return result.rows.map((r) => r.id);
  }
}
