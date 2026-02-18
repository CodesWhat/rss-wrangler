import type { Pool } from "pg";
import { canonicalizeUrl } from "./canonicalize-url";
import type { ParsedItem } from "./poll-feed";

export interface UpsertedItem {
  id: string;
  feedId: string;
  url: string;
  canonicalUrl: string;
  title: string;
  summary: string | null;
  author: string | null;
  publishedAt: Date;
  heroImageUrl: string | null;
  isNew: boolean;
}

export interface UpsertResult {
  succeeded: UpsertedItem[];
  failed: { item: ParsedItem; error: Error }[];
}

export async function parseAndUpsert(
  pool: Pool,
  accountId: string,
  feedId: string,
  items: ParsedItem[],
): Promise<UpsertResult> {
  if (items.length === 0) return { succeeded: [], failed: [] };

  // Split items into two groups by dedup strategy
  const guidItems: ParsedItem[] = [];
  const noGuidItems: ParsedItem[] = [];
  for (const item of items) {
    if (item.guid) {
      guidItems.push(item);
    } else {
      noGuidItems.push(item);
    }
  }

  const succeeded: UpsertedItem[] = [];
  const failed: { item: ParsedItem; error: Error }[] = [];

  // Batch upsert guid-based items (chunk to stay under PG's 65535 param limit)
  const GUID_CHUNK_SIZE = 6000; // 10 params per row → 60000 params max
  if (guidItems.length > 0) {
    try {
      for (let i = 0; i < guidItems.length; i += GUID_CHUNK_SIZE) {
        const chunk = guidItems.slice(i, i + GUID_CHUNK_SIZE);
        const result = await batchUpsertByGuid(pool, accountId, feedId, chunk);
        succeeded.push(...result);
      }
    } catch (err) {
      console.error("[parse-upsert] batch guid upsert failed, falling back to individual", {
        feedId,
        count: guidItems.length,
        error: err,
      });
      // Fall back to individual inserts so partial success is possible
      for (const item of guidItems) {
        try {
          const result = await singleUpsertByGuid(pool, accountId, feedId, item);
          if (result) succeeded.push(result);
        } catch (innerErr) {
          failed.push({
            item,
            error: innerErr instanceof Error ? innerErr : new Error(String(innerErr)),
          });
        }
      }
    }
  }

  // Batch upsert canonical-url-based items (chunk to stay under PG's 65535 param limit)
  const CANONICAL_CHUNK_SIZE = 6000; // 10 params per row → 60000 params max
  if (noGuidItems.length > 0) {
    try {
      for (let i = 0; i < noGuidItems.length; i += CANONICAL_CHUNK_SIZE) {
        const chunk = noGuidItems.slice(i, i + CANONICAL_CHUNK_SIZE);
        const result = await batchUpsertByCanonical(pool, accountId, feedId, chunk);
        succeeded.push(...result);
      }
    } catch (err) {
      console.error("[parse-upsert] batch canonical upsert failed, falling back to individual", {
        feedId,
        count: noGuidItems.length,
        error: err,
      });
      for (const item of noGuidItems) {
        try {
          const result = await singleUpsertByCanonical(pool, accountId, feedId, item);
          if (result) succeeded.push(result);
        } catch (innerErr) {
          failed.push({
            item,
            error: innerErr instanceof Error ? innerErr : new Error(String(innerErr)),
          });
        }
      }
    }
  }

  if (failed.length > 0) {
    console.error("[parse-upsert] some items failed", {
      feedId,
      failedCount: failed.length,
      succeededCount: succeeded.length,
    });
  }

  return { succeeded, failed };
}

function batchUpsertByGuid(
  pool: Pool,
  accountId: string,
  feedId: string,
  items: ParsedItem[],
): Promise<UpsertedItem[]> {
  // Build a multi-row VALUES clause
  // Each row needs: tenant_id, feed_id, url, canonical_url, title, summary, published_at, author, guid, hero_image_url
  const values: unknown[] = [];
  const rowPlaceholders: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const canonical = canonicalizeUrl(item.url || "");
    const url = item.url || canonical;
    const offset = i * 10;
    rowPlaceholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`,
    );
    values.push(
      accountId,
      feedId,
      url,
      canonical,
      item.title,
      item.summary,
      item.publishedAt.toISOString(),
      item.author,
      item.guid,
      item.heroImageUrl,
    );
  }

  const sql = `INSERT INTO item (tenant_id, feed_id, url, canonical_url, title, summary, published_at, author, guid, hero_image_url)
     VALUES ${rowPlaceholders.join(", ")}
     ON CONFLICT (tenant_id, feed_id, guid) WHERE guid IS NOT NULL
     DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary,
                  hero_image_url = COALESCE(EXCLUDED.hero_image_url, item.hero_image_url)
     RETURNING id, feed_id, url, canonical_url, title, summary, author, published_at, hero_image_url, (xmax = 0) AS is_new`;

  return pool
    .query<{
      id: string;
      feed_id: string;
      url: string;
      canonical_url: string;
      title: string;
      summary: string | null;
      author: string | null;
      published_at: Date;
      hero_image_url: string | null;
      is_new: boolean;
    }>(sql, values)
    .then((result) =>
      result.rows.map((row) => ({
        id: row.id,
        feedId: row.feed_id,
        url: row.url,
        canonicalUrl: row.canonical_url,
        title: row.title,
        summary: row.summary,
        author: row.author,
        publishedAt: new Date(row.published_at),
        heroImageUrl: row.hero_image_url,
        isNew: row.is_new,
      })),
    );
}

function batchUpsertByCanonical(
  pool: Pool,
  accountId: string,
  feedId: string,
  items: ParsedItem[],
): Promise<UpsertedItem[]> {
  const values: unknown[] = [];
  const rowPlaceholders: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const canonical = canonicalizeUrl(item.url || "");
    const url = item.url || canonical;
    // 10 params per row (guid is always NULL for this path)
    const offset = i * 10;
    rowPlaceholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`,
    );
    values.push(
      accountId,
      feedId,
      url,
      canonical,
      item.title,
      item.summary,
      item.publishedAt.toISOString(),
      item.author,
      null, // guid is always NULL for canonical-url dedup path
      item.heroImageUrl,
    );
  }

  const sql = `INSERT INTO item (tenant_id, feed_id, url, canonical_url, title, summary, published_at, author, guid, hero_image_url)
     VALUES ${rowPlaceholders.join(", ")}
     ON CONFLICT (tenant_id, feed_id, canonical_url, published_at) WHERE guid IS NULL
     DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary,
                  hero_image_url = COALESCE(EXCLUDED.hero_image_url, item.hero_image_url)
     RETURNING id, feed_id, url, canonical_url, title, summary, author, published_at, hero_image_url, (xmax = 0) AS is_new`;

  return pool
    .query<{
      id: string;
      feed_id: string;
      url: string;
      canonical_url: string;
      title: string;
      summary: string | null;
      author: string | null;
      published_at: Date;
      hero_image_url: string | null;
      is_new: boolean;
    }>(sql, values)
    .then((result) =>
      result.rows.map((row) => ({
        id: row.id,
        feedId: row.feed_id,
        url: row.url,
        canonicalUrl: row.canonical_url,
        title: row.title,
        summary: row.summary,
        author: row.author,
        publishedAt: new Date(row.published_at),
        heroImageUrl: row.hero_image_url,
        isNew: row.is_new,
      })),
    );
}

async function singleUpsertByGuid(
  pool: Pool,
  accountId: string,
  feedId: string,
  item: ParsedItem,
): Promise<UpsertedItem | null> {
  const canonical = canonicalizeUrl(item.url || "");
  const url = item.url || canonical;
  const result = await pool.query<{ id: string; is_new: boolean }>(
    `INSERT INTO item (tenant_id, feed_id, url, canonical_url, title, summary, published_at, author, guid, hero_image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (tenant_id, feed_id, guid) WHERE guid IS NOT NULL
     DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary,
                  hero_image_url = COALESCE(EXCLUDED.hero_image_url, item.hero_image_url)
     RETURNING id, (xmax = 0) AS is_new`,
    [
      accountId,
      feedId,
      url,
      canonical,
      item.title,
      item.summary,
      item.publishedAt.toISOString(),
      item.author,
      item.guid,
      item.heroImageUrl,
    ],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    feedId,
    url,
    canonicalUrl: canonical,
    title: item.title,
    summary: item.summary,
    author: item.author,
    publishedAt: item.publishedAt,
    heroImageUrl: item.heroImageUrl,
    isNew: row.is_new,
  };
}

async function singleUpsertByCanonical(
  pool: Pool,
  accountId: string,
  feedId: string,
  item: ParsedItem,
): Promise<UpsertedItem | null> {
  const canonical = canonicalizeUrl(item.url || "");
  const url = item.url || canonical;
  const result = await pool.query<{ id: string; is_new: boolean }>(
    `INSERT INTO item (tenant_id, feed_id, url, canonical_url, title, summary, published_at, author, guid, hero_image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9)
     ON CONFLICT (tenant_id, feed_id, canonical_url, published_at) WHERE guid IS NULL
     DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary,
                  hero_image_url = COALESCE(EXCLUDED.hero_image_url, item.hero_image_url)
     RETURNING id, (xmax = 0) AS is_new`,
    [
      accountId,
      feedId,
      url,
      canonical,
      item.title,
      item.summary,
      item.publishedAt.toISOString(),
      item.author,
      item.heroImageUrl,
    ],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    feedId,
    url,
    canonicalUrl: canonical,
    title: item.title,
    summary: item.summary,
    author: item.author,
    publishedAt: item.publishedAt,
    heroImageUrl: item.heroImageUrl,
    isNew: row.is_new,
  };
}
