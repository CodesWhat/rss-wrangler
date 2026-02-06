import type { Pool } from "pg";
import type {
  AddFeedRequest,
  Annotation,
  ClusterCard,
  ClusterDetail,
  ClusterDetailMember,
  ClusterFeedbackRequest,
  CreateAnnotationRequest,
  CreateFilterRuleRequest,
  Digest,
  Event,
  Feed,
  FilterRule,
  Folder,
  ListClustersQuery,
  ReadingStats,
  SearchQuery,
  Settings,
  StatsPeriod,
  UpdateFeedRequest,
  UpdateFilterRuleRequest,
  UpdateSettingsRequest
} from "@rss-wrangler/contracts";
import { settingsSchema } from "@rss-wrangler/contracts";

const DEFAULT_SETTINGS: Settings = settingsSchema.parse({
  aiMode: "summaries_digest",
  aiProvider: "openai",
  openaiApiKey: "",
  monthlyAiCapUsd: 20,
  aiFallbackToLocal: false,
  digestAwayHours: 24,
  digestBacklogThreshold: 50,
  feedPollMinutes: 60
});

export class PostgresStore {
  constructor(private readonly pool: Pool) {}

  async listClusters(query: ListClustersQuery): Promise<{ data: ClusterCard[]; nextCursor: string | null }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.folder_id) {
      conditions.push(`c.folder_id = $${paramIndex}`);
      params.push(query.folder_id);
      paramIndex++;
    }

    if (query.state === "unread") {
      conditions.push(`(rs.read_at IS NULL)`);
    } else if (query.state === "saved") {
      conditions.push(`(rs.saved_at IS NOT NULL)`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Defense-in-depth: only allow known sort values even though Zod validates upstream
    const SORT_CLAUSES: Record<string, string> = {
      latest: "ORDER BY i.published_at DESC NULLS LAST, c.created_at DESC",
      personal: `ORDER BY (
        1.0 / GREATEST(1, EXTRACT(EPOCH FROM (NOW() - COALESCE(i.published_at, c.created_at))) / 3600)
        + CASE WHEN rs.saved_at IS NOT NULL THEN 0.5 ELSE 0 END
        + LEAST(c.size / 10.0, 1)
      ) DESC`
    };
    const orderClause = SORT_CLAUSES[query.sort] ?? SORT_CLAUSES.personal;

    const offset = query.cursor ? parseInt(query.cursor, 10) || 0 : 0;
    const limit = query.limit;

    const sql = `
      SELECT
        c.id,
        COALESCE(i.title, 'Untitled') AS headline,
        i.hero_image_url,
        COALESCE(f.title, 'Unknown') AS primary_source,
        COALESCE(i.published_at, c.created_at) AS primary_source_published_at,
        c.size AS outlet_count,
        c.folder_id,
        COALESCE(fo.name, 'Other') AS folder_name,
        i.summary,
        rs.read_at,
        rs.saved_at
      FROM cluster c
      LEFT JOIN item i ON i.id = c.rep_item_id
      LEFT JOIN feed f ON i.feed_id = f.id
      LEFT JOIN folder fo ON c.folder_id = fo.id
      LEFT JOIN read_state rs ON rs.cluster_id = c.id
      ${whereClause}
      ${orderClause}
      OFFSET $${paramIndex} LIMIT $${paramIndex + 1}
    `;
    params.push(offset, limit + 1);

    const { rows } = await this.pool.query(sql, params);

    const hasMore = rows.length > limit;
    const data: ClusterCard[] = rows.slice(0, limit).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      headline: r.headline as string,
      heroImageUrl: (r.hero_image_url as string) ?? null,
      primarySource: r.primary_source as string,
      primarySourcePublishedAt: (r.primary_source_published_at as Date).toISOString(),
      outletCount: Number(r.outlet_count),
      folderId: r.folder_id as string,
      folderName: r.folder_name as string,
      summary: (r.summary as string) ?? null,
      mutedBreakoutReason: null,
      isRead: r.read_at != null,
      isSaved: r.saved_at != null
    }));

    const nextCursor = hasMore ? String(offset + limit) : null;
    return { data, nextCursor };
  }

  async getCluster(clusterId: string): Promise<ClusterDetail | null> {
    const clusterSql = `
      SELECT
        c.id,
        COALESCE(i.title, 'Untitled') AS headline,
        i.hero_image_url,
        COALESCE(f.title, 'Unknown') AS primary_source,
        COALESCE(i.published_at, c.created_at) AS primary_source_published_at,
        c.size AS outlet_count,
        c.folder_id,
        COALESCE(fo.name, 'Other') AS folder_name,
        i.summary,
        i.extracted_text,
        rs.read_at,
        rs.saved_at
      FROM cluster c
      LEFT JOIN item i ON i.id = c.rep_item_id
      LEFT JOIN feed f ON i.feed_id = f.id
      LEFT JOIN folder fo ON c.folder_id = fo.id
      LEFT JOIN read_state rs ON rs.cluster_id = c.id
      WHERE c.id = $1
    `;
    const { rows: clusterRows } = await this.pool.query(clusterSql, [clusterId]);
    if (clusterRows.length === 0) {
      return null;
    }

    const r = clusterRows[0] as Record<string, unknown>;

    const membersSql = `
      SELECT
        cm.item_id,
        COALESCE(i.title, 'Untitled') AS title,
        COALESCE(f.title, 'Unknown') AS source_name,
        i.url,
        COALESCE(i.published_at, i.created_at) AS published_at
      FROM cluster_member cm
      JOIN item i ON i.id = cm.item_id
      LEFT JOIN feed f ON f.id = i.feed_id
      WHERE cm.cluster_id = $1
      ORDER BY i.published_at DESC
    `;
    const { rows: memberRows } = await this.pool.query(membersSql, [clusterId]);

    const card: ClusterCard = {
      id: r.id as string,
      headline: r.headline as string,
      heroImageUrl: (r.hero_image_url as string) ?? null,
      primarySource: r.primary_source as string,
      primarySourcePublishedAt: (r.primary_source_published_at as Date).toISOString(),
      outletCount: Number(r.outlet_count),
      folderId: r.folder_id as string,
      folderName: r.folder_name as string,
      summary: (r.summary as string) ?? null,
      mutedBreakoutReason: null,
      isRead: r.read_at != null,
      isSaved: r.saved_at != null
    };

    const members: ClusterDetailMember[] = memberRows.map((m: Record<string, unknown>) => ({
      itemId: m.item_id as string,
      title: m.title as string,
      sourceName: m.source_name as string,
      url: m.url as string,
      publishedAt: (m.published_at as Date).toISOString()
    }));

    const storySoFar = (r.extracted_text as string) ?? null;

    return { cluster: card, storySoFar, members };
  }

  async markRead(clusterId: string): Promise<boolean> {
    const check = await this.pool.query("SELECT id FROM cluster WHERE id = $1", [clusterId]);
    if (check.rows.length === 0) {
      return false;
    }

    await this.pool.query(
      `INSERT INTO read_state (cluster_id, read_at)
       VALUES ($1, NOW())
       ON CONFLICT (cluster_id) DO UPDATE SET read_at = NOW()`,
      [clusterId]
    );
    return true;
  }

  async saveCluster(clusterId: string): Promise<boolean> {
    const check = await this.pool.query("SELECT id FROM cluster WHERE id = $1", [clusterId]);
    if (check.rows.length === 0) {
      return false;
    }

    await this.pool.query(
      `INSERT INTO read_state (cluster_id, saved_at)
       VALUES ($1, NOW())
       ON CONFLICT (cluster_id) DO UPDATE SET saved_at = NOW()`,
      [clusterId]
    );
    return true;
  }

  async splitCluster(clusterId: string): Promise<boolean> {
    const check = await this.pool.query("SELECT id FROM cluster WHERE id = $1", [clusterId]);
    return check.rows.length > 0;
  }

  async submitFeedback(clusterId: string, _feedback: ClusterFeedbackRequest): Promise<boolean> {
    const check = await this.pool.query("SELECT id FROM cluster WHERE id = $1", [clusterId]);
    if (check.rows.length === 0) {
      return false;
    }

    if (_feedback.type === "not_interested") {
      await this.pool.query(
        `INSERT INTO read_state (cluster_id, not_interested_at)
         VALUES ($1, NOW())
         ON CONFLICT (cluster_id) DO UPDATE SET not_interested_at = NOW()`,
        [clusterId]
      );
    }

    return true;
  }

  async listFolders(): Promise<Folder[]> {
    const { rows } = await this.pool.query("SELECT id, name FROM folder ORDER BY name");
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string
    }));
  }

  async listFeeds(): Promise<Feed[]> {
    const { rows } = await this.pool.query(`
      SELECT id, url, title, site_url, folder_id, folder_confidence,
             weight, muted, trial, created_at, last_polled_at
      FROM feed
      ORDER BY created_at DESC
    `);
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      url: r.url as string,
      title: r.title as string,
      siteUrl: (r.site_url as string) ?? null,
      folderId: r.folder_id as string,
      folderConfidence: Number(r.folder_confidence),
      weight: r.weight as Feed["weight"],
      muted: r.muted as boolean,
      trial: r.trial as boolean,
      createdAt: (r.created_at as Date).toISOString(),
      lastPolledAt: r.last_polled_at ? (r.last_polled_at as Date).toISOString() : null
    }));
  }

  async addFeed(payload: AddFeedRequest): Promise<Feed> {
    const urlNormalized = normalizeUrl(payload.url);

    // Assign to "Other" folder by default
    const otherFolder = await this.pool.query("SELECT id FROM folder WHERE name = 'Other' LIMIT 1");
    const folderId = otherFolder.rows.length > 0 ? (otherFolder.rows[0] as Record<string, unknown>).id as string : "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

    const { rows } = await this.pool.query(
      `INSERT INTO feed (url, url_normalized, title, folder_id, folder_confidence, weight, muted, trial)
       VALUES ($1, $2, $1, $3, 0.4, 'neutral', false, false)
       RETURNING id, url, title, site_url, folder_id, folder_confidence, weight, muted, trial, created_at, last_polled_at`,
      [payload.url, urlNormalized, folderId]
    );

    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      url: r.url as string,
      title: r.title as string,
      siteUrl: (r.site_url as string) ?? null,
      folderId: r.folder_id as string,
      folderConfidence: Number(r.folder_confidence),
      weight: r.weight as Feed["weight"],
      muted: r.muted as boolean,
      trial: r.trial as boolean,
      createdAt: (r.created_at as Date).toISOString(),
      lastPolledAt: r.last_polled_at ? (r.last_polled_at as Date).toISOString() : null
    };
  }

  async updateFeed(feedId: string, patch: UpdateFeedRequest): Promise<Feed | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (patch.folderId) {
      setClauses.push(`folder_id = $${paramIndex}`);
      params.push(patch.folderId);
      paramIndex++;
    }
    if (patch.weight) {
      setClauses.push(`weight = $${paramIndex}`);
      params.push(patch.weight);
      paramIndex++;
    }
    if (typeof patch.muted === "boolean") {
      setClauses.push(`muted = $${paramIndex}`);
      params.push(patch.muted);
      paramIndex++;
    }
    if (typeof patch.trial === "boolean") {
      setClauses.push(`trial = $${paramIndex}`);
      params.push(patch.trial);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      // Nothing to update; return current feed
      const { rows } = await this.pool.query(
        `SELECT id, url, title, site_url, folder_id, folder_confidence, weight, muted, trial, created_at, last_polled_at
         FROM feed WHERE id = $1`,
        [feedId]
      );
      if (rows.length === 0) return null;
      return this.mapFeedRow(rows[0] as Record<string, unknown>);
    }

    params.push(feedId);
    const sql = `
      UPDATE feed SET ${setClauses.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING id, url, title, site_url, folder_id, folder_confidence, weight, muted, trial, created_at, last_polled_at
    `;

    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) return null;
    return this.mapFeedRow(rows[0] as Record<string, unknown>);
  }

  async listFilters(): Promise<FilterRule[]> {
    const { rows } = await this.pool.query(
      "SELECT id, pattern, type, mode, breakout_enabled, created_at FROM filter_rule ORDER BY created_at DESC"
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      pattern: r.pattern as string,
      type: r.type as FilterRule["type"],
      mode: r.mode as FilterRule["mode"],
      breakoutEnabled: r.breakout_enabled as boolean,
      createdAt: (r.created_at as Date).toISOString()
    }));
  }

  async createFilter(payload: CreateFilterRuleRequest): Promise<FilterRule> {
    const { rows } = await this.pool.query(
      `INSERT INTO filter_rule (pattern, type, mode, breakout_enabled)
       VALUES ($1, $2, $3, $4)
       RETURNING id, pattern, type, mode, breakout_enabled, created_at`,
      [payload.pattern, payload.type, payload.mode, payload.breakoutEnabled]
    );

    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      pattern: r.pattern as string,
      type: r.type as FilterRule["type"],
      mode: r.mode as FilterRule["mode"],
      breakoutEnabled: r.breakout_enabled as boolean,
      createdAt: (r.created_at as Date).toISOString()
    };
  }

  async updateFilter(filterId: string, patch: UpdateFilterRuleRequest): Promise<FilterRule | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (patch.pattern) {
      setClauses.push(`pattern = $${paramIndex}`);
      params.push(patch.pattern);
      paramIndex++;
    }
    if (patch.type) {
      setClauses.push(`type = $${paramIndex}`);
      params.push(patch.type);
      paramIndex++;
    }
    if (patch.mode) {
      setClauses.push(`mode = $${paramIndex}`);
      params.push(patch.mode);
      paramIndex++;
    }
    if (typeof patch.breakoutEnabled === "boolean") {
      setClauses.push(`breakout_enabled = $${paramIndex}`);
      params.push(patch.breakoutEnabled);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      const { rows } = await this.pool.query(
        "SELECT id, pattern, type, mode, breakout_enabled, created_at FROM filter_rule WHERE id = $1",
        [filterId]
      );
      if (rows.length === 0) return null;
      const r = rows[0] as Record<string, unknown>;
      return {
        id: r.id as string,
        pattern: r.pattern as string,
        type: r.type as FilterRule["type"],
        mode: r.mode as FilterRule["mode"],
        breakoutEnabled: r.breakout_enabled as boolean,
        createdAt: (r.created_at as Date).toISOString()
      };
    }

    params.push(filterId);
    const sql = `
      UPDATE filter_rule SET ${setClauses.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING id, pattern, type, mode, breakout_enabled, created_at
    `;

    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      pattern: r.pattern as string,
      type: r.type as FilterRule["type"],
      mode: r.mode as FilterRule["mode"],
      breakoutEnabled: r.breakout_enabled as boolean,
      createdAt: (r.created_at as Date).toISOString()
    };
  }

  async deleteFilter(filterId: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM filter_rule WHERE id = $1", [filterId]);
    return (result.rowCount ?? 0) > 0;
  }

  async listDigests(): Promise<Digest[]> {
    const { rows } = await this.pool.query(
      "SELECT id, created_at, start_ts, end_ts, title, body, entries_json FROM digest ORDER BY created_at DESC"
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      createdAt: (r.created_at as Date).toISOString(),
      startTs: (r.start_ts as Date).toISOString(),
      endTs: (r.end_ts as Date).toISOString(),
      title: r.title as string,
      body: r.body as string,
      entries: r.entries_json as Digest["entries"]
    }));
  }

  async recordEvents(events: Event[]): Promise<{ accepted: number; deduped: number }> {
    let accepted = 0;
    let deduped = 0;

    for (const event of events) {
      try {
        await this.pool.query(
          `INSERT INTO event (idempotency_key, ts, type, payload_json)
           VALUES ($1, $2, $3, $4)`,
          [event.idempotencyKey, event.ts, event.type, JSON.stringify(event.payload)]
        );
        accepted++;
      } catch (err: unknown) {
        const pgErr = err as { code?: string };
        if (pgErr.code === "23505") {
          // Unique violation = duplicate idempotency key
          deduped++;
        } else {
          throw err;
        }
      }
    }

    return { accepted, deduped };
  }

  async getSettings(): Promise<Settings> {
    const { rows } = await this.pool.query("SELECT data FROM app_settings WHERE key = 'main' LIMIT 1");
    if (rows.length === 0) {
      return DEFAULT_SETTINGS;
    }
    return settingsSchema.parse((rows[0] as Record<string, unknown>).data);
  }

  async updateSettings(patch: UpdateSettingsRequest): Promise<Settings> {
    const current = await this.getSettings();
    const updated = settingsSchema.parse({ ...current, ...patch });
    await this.pool.query(
      `INSERT INTO app_settings (key, data) VALUES ('main', $1)
       ON CONFLICT (key) DO UPDATE SET data = $1`,
      [JSON.stringify(updated)]
    );
    return updated;
  }

  async importOpml(feeds: { xmlUrl: string; title: string; htmlUrl: string | null; category: string | null }[]): Promise<{ imported: number; skipped: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Pre-load all folders for category matching
      const { rows: folderRows } = await client.query("SELECT id, name FROM folder");
      const foldersByName = new Map<string, string>();
      let otherFolderId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      for (const row of folderRows) {
        const r = row as { id: string; name: string };
        foldersByName.set(r.name.toLowerCase(), r.id);
        if (r.name === "Other") {
          otherFolderId = r.id;
        }
      }

      let imported = 0;
      let skipped = 0;

      for (const feed of feeds) {
        const urlNormalized = normalizeUrl(feed.xmlUrl);
        let folderId = otherFolderId;
        if (feed.category) {
          const matched = foldersByName.get(feed.category.toLowerCase());
          if (matched) {
            folderId = matched;
          }
        }

        const result = await client.query(
          `INSERT INTO feed (url, url_normalized, title, site_url, folder_id, folder_confidence, weight, muted, trial)
           VALUES ($1, $2, $3, $4, $5, 0.5, 'neutral', false, false)
           ON CONFLICT ON CONSTRAINT feed_url_normalized_uniq DO NOTHING`,
          [feed.xmlUrl, urlNormalized, feed.title, feed.htmlUrl, folderId]
        );

        if ((result.rowCount ?? 0) > 0) {
          imported++;
        } else {
          skipped++;
        }
      }

      await client.query("COMMIT");
      return { imported, skipped };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async searchClusters(query: SearchQuery): Promise<{ data: ClusterCard[]; nextCursor: string | null }> {
    const offset = query.cursor ? parseInt(query.cursor, 10) || 0 : 0;
    const limit = query.limit;

    const sql = `
      SELECT DISTINCT ON (c.id)
        c.id,
        COALESCE(rep_i.title, 'Untitled') AS headline,
        rep_i.hero_image_url,
        COALESCE(f.title, 'Unknown') AS primary_source,
        COALESCE(rep_i.published_at, c.created_at) AS primary_source_published_at,
        c.size AS outlet_count,
        c.folder_id,
        COALESCE(fo.name, 'Other') AS folder_name,
        rep_i.summary,
        rs.read_at,
        rs.saved_at,
        ts_rank(i.search_vector, plainto_tsquery('english', $1)) AS rank
      FROM item i
      JOIN cluster_member cm ON cm.item_id = i.id
      JOIN cluster c ON c.id = cm.cluster_id
      LEFT JOIN item rep_i ON rep_i.id = c.rep_item_id
      LEFT JOIN feed f ON rep_i.feed_id = f.id
      LEFT JOIN folder fo ON c.folder_id = fo.id
      LEFT JOIN read_state rs ON rs.cluster_id = c.id
      WHERE i.search_vector @@ plainto_tsquery('english', $1)
      ORDER BY c.id, rank DESC
    `;

    // Wrap to apply global ordering and pagination
    const wrappedSql = `
      SELECT * FROM (${sql}) sub
      ORDER BY sub.rank DESC
      OFFSET $2 LIMIT $3
    `;

    const { rows } = await this.pool.query(wrappedSql, [query.q, offset, limit + 1]);

    const hasMore = rows.length > limit;
    const data: ClusterCard[] = rows.slice(0, limit).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      headline: r.headline as string,
      heroImageUrl: (r.hero_image_url as string) ?? null,
      primarySource: r.primary_source as string,
      primarySourcePublishedAt: (r.primary_source_published_at as Date).toISOString(),
      outletCount: Number(r.outlet_count),
      folderId: r.folder_id as string,
      folderName: r.folder_name as string,
      summary: (r.summary as string) ?? null,
      mutedBreakoutReason: null,
      isRead: r.read_at != null,
      isSaved: r.saved_at != null
    }));

    const nextCursor = hasMore ? String(offset + limit) : null;
    return { data, nextCursor };
  }

  async exportOpml(): Promise<{ feeds: { xmlUrl: string; title: string; htmlUrl: string | null; folderName: string }[] }> {
    const { rows } = await this.pool.query(`
      SELECT f.url AS xml_url, f.title, f.site_url AS html_url, COALESCE(fo.name, 'Other') AS folder_name
      FROM feed f
      LEFT JOIN folder fo ON fo.id = f.folder_id
      ORDER BY fo.name, f.title
    `);

    return {
      feeds: rows.map((r: Record<string, unknown>) => ({
        xmlUrl: r.xml_url as string,
        title: r.title as string,
        htmlUrl: (r.html_url as string) ?? null,
        folderName: r.folder_name as string
      }))
    };
  }

  async createAnnotation(clusterId: string, payload: CreateAnnotationRequest): Promise<Annotation | null> {
    const check = await this.pool.query("SELECT id FROM cluster WHERE id = $1", [clusterId]);
    if (check.rows.length === 0) {
      return null;
    }

    const { rows } = await this.pool.query(
      `INSERT INTO annotation (cluster_id, highlighted_text, note, color)
       VALUES ($1, $2, $3, $4)
       RETURNING id, cluster_id, highlighted_text, note, color, created_at`,
      [clusterId, payload.highlightedText, payload.note ?? null, payload.color]
    );

    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      clusterId: r.cluster_id as string,
      highlightedText: r.highlighted_text as string,
      note: (r.note as string) ?? null,
      color: r.color as Annotation["color"],
      createdAt: (r.created_at as Date).toISOString()
    };
  }

  async listAnnotations(clusterId: string): Promise<Annotation[]> {
    const { rows } = await this.pool.query(
      `SELECT id, cluster_id, highlighted_text, note, color, created_at
       FROM annotation
       WHERE cluster_id = $1
       ORDER BY created_at DESC`,
      [clusterId]
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      clusterId: r.cluster_id as string,
      highlightedText: r.highlighted_text as string,
      note: (r.note as string) ?? null,
      color: r.color as Annotation["color"],
      createdAt: (r.created_at as Date).toISOString()
    }));
  }

  async deleteAnnotation(annotationId: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM annotation WHERE id = $1", [annotationId]);
    return (result.rowCount ?? 0) > 0;
  }

  // ---------- Push subscription methods ----------

  async savePushSubscription(endpoint: string, p256dh: string, auth: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO push_subscription (endpoint, p256dh, auth)
       VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = $2, auth = $3`,
      [endpoint, p256dh, auth]
    );
  }

  async deletePushSubscription(endpoint: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM push_subscription WHERE endpoint = $1", [endpoint]);
    return (result.rowCount ?? 0) > 0;
  }

  async getAllPushSubscriptions(): Promise<{ endpoint: string; p256dh: string; auth: string }[]> {
    const { rows } = await this.pool.query("SELECT endpoint, p256dh, auth FROM push_subscription");
    return rows.map((r: Record<string, unknown>) => ({
      endpoint: r.endpoint as string,
      p256dh: r.p256dh as string,
      auth: r.auth as string
    }));
  }

  // ---------- Dwell tracking ----------

  async recordDwell(clusterId: string, seconds: number): Promise<boolean> {
    const check = await this.pool.query("SELECT id FROM cluster WHERE id = $1", [clusterId]);
    if (check.rows.length === 0) {
      return false;
    }

    await this.pool.query(
      `INSERT INTO read_state (cluster_id, dwell_seconds, clicked_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (cluster_id) DO UPDATE SET
         dwell_seconds = read_state.dwell_seconds + $2,
         clicked_at = NOW()`,
      [clusterId, seconds]
    );
    return true;
  }

  // ---------- Reading stats ----------

  async getReadingStats(period: StatsPeriod): Promise<ReadingStats> {
    const periodCondition = period === "all"
      ? ""
      : period === "30d"
        ? "AND rs.read_at >= NOW() - INTERVAL '30 days'"
        : "AND rs.read_at >= NOW() - INTERVAL '7 days'";

    // Articles read today / week / month
    const countsSql = `
      SELECT
        COUNT(*) FILTER (WHERE rs.read_at >= CURRENT_DATE) AS today,
        COUNT(*) FILTER (WHERE rs.read_at >= NOW() - INTERVAL '7 days') AS week,
        COUNT(*) FILTER (WHERE rs.read_at >= NOW() - INTERVAL '30 days') AS month
      FROM read_state rs
      WHERE rs.read_at IS NOT NULL
    `;
    const countsResult = await this.pool.query(countsSql);
    const counts = countsResult.rows[0] as Record<string, unknown>;

    // Average dwell time
    const avgDwellSql = `
      SELECT COALESCE(AVG(rs.dwell_seconds), 0) AS avg_dwell
      FROM read_state rs
      WHERE rs.read_at IS NOT NULL AND rs.dwell_seconds > 0
      ${periodCondition}
    `;
    const avgDwellResult = await this.pool.query(avgDwellSql);
    const avgDwell = Number((avgDwellResult.rows[0] as Record<string, unknown>).avg_dwell);

    // Folder breakdown
    const folderSql = `
      SELECT COALESCE(fo.name, 'Other') AS folder_name, COUNT(*) AS cnt
      FROM read_state rs
      JOIN cluster c ON c.id = rs.cluster_id
      LEFT JOIN folder fo ON fo.id = c.folder_id
      WHERE rs.read_at IS NOT NULL ${periodCondition}
      GROUP BY fo.name
      ORDER BY cnt DESC
    `;
    const folderResult = await this.pool.query(folderSql);
    const folderBreakdown = folderResult.rows.map((r: Record<string, unknown>) => ({
      folderName: r.folder_name as string,
      count: Number(r.cnt)
    }));

    // Top sources
    const sourcesSql = `
      SELECT COALESCE(f.title, 'Unknown') AS feed_title, COUNT(*) AS cnt
      FROM read_state rs
      JOIN cluster c ON c.id = rs.cluster_id
      LEFT JOIN item i ON i.id = c.rep_item_id
      LEFT JOIN feed f ON f.id = i.feed_id
      WHERE rs.read_at IS NOT NULL ${periodCondition}
      GROUP BY f.title
      ORDER BY cnt DESC
      LIMIT 5
    `;
    const sourcesResult = await this.pool.query(sourcesSql);
    const topSources = sourcesResult.rows.map((r: Record<string, unknown>) => ({
      feedTitle: r.feed_title as string,
      count: Number(r.cnt)
    }));

    // Reading streak (consecutive days with at least 1 read)
    const streakSql = `
      WITH daily AS (
        SELECT DISTINCT DATE(rs.read_at AT TIME ZONE 'UTC') AS read_date
        FROM read_state rs
        WHERE rs.read_at IS NOT NULL
      ),
      numbered AS (
        SELECT read_date, read_date - (ROW_NUMBER() OVER (ORDER BY read_date))::int AS grp
        FROM daily
      ),
      streaks AS (
        SELECT grp, COUNT(*) AS streak_len, MAX(read_date) AS last_date
        FROM numbered
        GROUP BY grp
      )
      SELECT COALESCE(
        (SELECT streak_len FROM streaks WHERE last_date >= CURRENT_DATE - 1 ORDER BY last_date DESC LIMIT 1),
        0
      ) AS streak
    `;
    const streakResult = await this.pool.query(streakSql);
    const readingStreak = Number((streakResult.rows[0] as Record<string, unknown>).streak);

    // Peak reading hours
    const hoursSql = `
      SELECT EXTRACT(HOUR FROM rs.read_at AT TIME ZONE 'UTC')::int AS hour, COUNT(*) AS cnt
      FROM read_state rs
      WHERE rs.read_at IS NOT NULL ${periodCondition}
      GROUP BY hour
      ORDER BY hour
    `;
    const hoursResult = await this.pool.query(hoursSql);
    const peakHours = hoursResult.rows.map((r: Record<string, unknown>) => ({
      hour: Number(r.hour),
      count: Number(r.cnt)
    }));

    // Daily reads
    const dailySql = `
      SELECT DATE(rs.read_at AT TIME ZONE 'UTC') AS read_date, COUNT(*) AS cnt
      FROM read_state rs
      WHERE rs.read_at IS NOT NULL ${periodCondition}
      GROUP BY read_date
      ORDER BY read_date
    `;
    const dailyResult = await this.pool.query(dailySql);
    const dailyReads = dailyResult.rows.map((r: Record<string, unknown>) => ({
      date: (r.read_date as Date).toISOString().split("T")[0]!,
      count: Number(r.cnt)
    }));

    return {
      articlesReadToday: Number(counts.today),
      articlesReadWeek: Number(counts.week),
      articlesReadMonth: Number(counts.month),
      avgDwellSeconds: Math.round(avgDwell),
      folderBreakdown,
      topSources,
      readingStreak,
      peakHours,
      dailyReads
    };
  }

  async getFolderDistribution(): Promise<{ folderName: string; count: number }[]> {
    const { rows } = await this.pool.query(`
      SELECT COALESCE(fo.name, 'Other') AS folder_name, COUNT(*)::int AS cnt
      FROM cluster c
      LEFT JOIN folder fo ON fo.id = c.folder_id
      GROUP BY fo.name
      ORDER BY cnt DESC
    `);
    return rows.map((r: Record<string, unknown>) => ({
      folderName: r.folder_name as string,
      count: Number(r.cnt)
    }));
  }

  private mapFeedRow(r: Record<string, unknown>): Feed {
    return {
      id: r.id as string,
      url: r.url as string,
      title: r.title as string,
      siteUrl: (r.site_url as string) ?? null,
      folderId: r.folder_id as string,
      folderConfidence: Number(r.folder_confidence),
      weight: r.weight as Feed["weight"],
      muted: r.muted as boolean,
      trial: r.trial as boolean,
      createdAt: (r.created_at as Date).toISOString(),
      lastPolledAt: r.last_polled_at ? (r.last_polled_at as Date).toISOString() : null
    };
  }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Strip trailing slash, lowercase host
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return url.toLowerCase().trim();
  }
}
