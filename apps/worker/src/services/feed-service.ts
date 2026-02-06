import type { Pool } from "pg";

export interface DueFeed {
  id: string;
  url: string;
  title: string;
  siteUrl: string | null;
  folderId: string;
  weight: "prefer" | "neutral" | "deprioritize";
  etag: string | null;
  lastModified: string | null;
  lastPolledAt: Date | null;
}

export class FeedService {
  constructor(private pool: Pool) {}

  async fetchDueFeeds(limit: number): Promise<DueFeed[]> {
    const result = await this.pool.query<{
      id: string;
      url: string;
      title: string;
      site_url: string | null;
      folder_id: string;
      weight: "prefer" | "neutral" | "deprioritize";
      etag: string | null;
      last_modified: string | null;
      last_polled_at: Date | null;
    }>(
      `SELECT id, url, title, site_url, folder_id, weight, etag, last_modified, last_polled_at
       FROM feed
       WHERE muted = FALSE
       ORDER BY last_polled_at ASC NULLS FIRST
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((r) => ({
      id: r.id,
      url: r.url,
      title: r.title,
      siteUrl: r.site_url,
      folderId: r.folder_id,
      weight: r.weight,
      etag: r.etag,
      lastModified: r.last_modified,
      lastPolledAt: r.last_polled_at,
    }));
  }

  async updateLastPolled(
    feedId: string,
    etag: string | null,
    lastModified: string | null
  ): Promise<void> {
    await this.pool.query(
      `UPDATE feed
       SET last_polled_at = NOW(), etag = $2, last_modified = $3
       WHERE id = $1`,
      [feedId, etag, lastModified]
    );
  }
}
