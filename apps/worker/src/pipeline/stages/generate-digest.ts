import type { Pool } from "pg";

interface DigestEntry {
  clusterId: string;
  headline: string;
  section: "top_picks" | "big_stories" | "quick_scan";
  oneLiner: string | null;
}

interface DigestClusterRow {
  cluster_id: string;
  title: string;
  summary: string | null;
  hero_image_url: string | null;
  size: number;
  feed_weight: string;
  folder_name: string;
  published_at: Date;
}

const TOP_PICKS_COUNT = 5;
const BIG_STORIES_COUNT = 5;
const QUICK_SCAN_COUNT = 10;
const DIGEST_WINDOW_HOURS = 24;
const BACKLOG_THRESHOLD = 50;

/**
 * Check whether digest generation should run and, if so, generate one.
 * Triggers per spec: away >= 24h OR unread backlog >= 50 clusters.
 *
 * This is a lightweight check; the actual scheduling is handled by the
 * pg-boss cron job. When called from the pipeline, it only generates
 * if no digest exists covering the current window.
 */
export async function maybeGenerateDigest(pool: Pool): Promise<void> {
  const shouldGenerate = await checkDigestTriggers(pool);
  if (!shouldGenerate) return;

  await generateDigest(pool);
}

/**
 * Generate a digest unconditionally. Used by the scheduled job.
 */
export async function generateDigest(pool: Pool): Promise<void> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - DIGEST_WINDOW_HOURS * 60 * 60 * 1000);

  // Check if a digest already exists for this window (avoid duplicates)
  const existing = await pool.query(
    `SELECT id FROM digest WHERE start_ts >= $1 AND end_ts <= $2 LIMIT 1`,
    [windowStart.toISOString(), windowEnd.toISOString()]
  );
  if (existing.rows.length > 0) {
    console.info("[digest] digest already exists for this window, skipping");
    return;
  }

  // Fetch unread clusters from the window, ranked by size and source weight
  const clusters = await pool.query<DigestClusterRow>(
    `SELECT
       c.id AS cluster_id,
       i.title,
       i.summary,
       i.hero_image_url,
       c.size,
       f.weight AS feed_weight,
       fo.name AS folder_name,
       i.published_at
     FROM cluster c
     JOIN item i ON i.id = c.rep_item_id
     JOIN feed f ON f.id = i.feed_id
     JOIN folder fo ON fo.id = c.folder_id
     LEFT JOIN read_state rs ON rs.cluster_id = c.id
     WHERE c.updated_at >= $1
       AND rs.read_at IS NULL
     ORDER BY
       CASE f.weight WHEN 'prefer' THEN 3 WHEN 'neutral' THEN 2 ELSE 1 END DESC,
       c.size DESC,
       i.published_at DESC
     LIMIT $2`,
    [windowStart.toISOString(), TOP_PICKS_COUNT + BIG_STORIES_COUNT + QUICK_SCAN_COUNT]
  );

  if (clusters.rows.length === 0) {
    console.info("[digest] no unread clusters in window, skipping digest");
    return;
  }

  // Partition into sections
  const entries: DigestEntry[] = [];
  const rows = clusters.rows;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx]!;
    let section: DigestEntry["section"];

    if (idx < TOP_PICKS_COUNT) {
      section = "top_picks";
    } else if (idx < TOP_PICKS_COUNT + BIG_STORIES_COUNT) {
      section = "big_stories";
    } else {
      section = "quick_scan";
    }

    entries.push({
      clusterId: row.cluster_id,
      headline: row.title,
      section,
      oneLiner: row.summary ? truncate(row.summary, 120) : null,
    });
  }

  const title = `Digest for ${windowStart.toLocaleDateString()} - ${windowEnd.toLocaleDateString()}`;
  const body = buildDigestBody(entries);

  await pool.query(
    `INSERT INTO digest (start_ts, end_ts, title, body, entries_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      windowStart.toISOString(),
      windowEnd.toISOString(),
      title,
      body,
      JSON.stringify(entries),
    ]
  );

  console.info("[digest] generated", { entries: entries.length, window: `${windowStart.toISOString()} - ${windowEnd.toISOString()}` });
}

async function checkDigestTriggers(pool: Pool): Promise<boolean> {
  // Trigger 1: unread backlog >= threshold
  const backlogResult = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM cluster c
     LEFT JOIN read_state rs ON rs.cluster_id = c.id
     WHERE rs.read_at IS NULL`
  );
  const backlog = parseInt(backlogResult.rows[0]?.cnt || "0", 10);
  if (backlog >= BACKLOG_THRESHOLD) {
    console.info("[digest] backlog trigger", { backlog });
    return true;
  }

  // Trigger 2: no recent digest in the last 24h
  const recentDigest = await pool.query(
    `SELECT id FROM digest WHERE created_at >= NOW() - INTERVAL '24 hours' LIMIT 1`
  );
  if (recentDigest.rows.length === 0 && backlog > 0) {
    console.info("[digest] time trigger (no digest in 24h)");
    return true;
  }

  return false;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

function buildDigestBody(entries: DigestEntry[]): string {
  const sections: Record<string, DigestEntry[]> = {
    top_picks: [],
    big_stories: [],
    quick_scan: [],
  };

  for (const entry of entries) {
    sections[entry.section]?.push(entry);
  }

  const lines: string[] = [];

  if (sections.top_picks!.length > 0) {
    lines.push("## Top Picks");
    for (const e of sections.top_picks!) {
      lines.push(`- ${e.headline}`);
    }
    lines.push("");
  }

  if (sections.big_stories!.length > 0) {
    lines.push("## Big Stories");
    for (const e of sections.big_stories!) {
      lines.push(`- ${e.headline}`);
    }
    lines.push("");
  }

  if (sections.quick_scan!.length > 0) {
    lines.push("## Quick Scan");
    for (const e of sections.quick_scan!) {
      const suffix = e.oneLiner ? ` — ${e.oneLiner}` : "";
      lines.push(`- ${e.headline}${suffix}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
