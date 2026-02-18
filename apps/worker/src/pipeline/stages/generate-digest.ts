import type { AiProviderAdapter } from "@rss-wrangler/contracts";
import type { Pool } from "pg";
import { isBudgetExceeded, logAiUsage } from "../../services/ai-usage";

interface DigestEntry {
  clusterId: string;
  headline: string;
  section: "top_picks" | "big_stories" | "quick_scan";
  oneLiner: string | null;
  sourceName: string;
}

interface DigestClusterRow {
  cluster_id: string;
  title: string;
  summary: string | null;
  hero_image_url: string | null;
  size: number;
  feed_weight: string;
  folder_name: string;
  feed_title: string;
  published_at: Date;
}

const TOP_PICKS_COUNT = 5;
const BIG_STORIES_COUNT = 5;
const QUICK_SCAN_COUNT = 10;
const DIGEST_WINDOW_HOURS = 24;
const BACKLOG_THRESHOLD = 50;
const AWAY_HOURS_THRESHOLD = 24;

/**
 * Check whether digest generation should run and, if so, generate one.
 * Triggers per spec: away >= 24h OR unread backlog >= 50 clusters.
 *
 * This is a lightweight check; the actual scheduling is handled by the
 * pg-boss cron job. When called from the pipeline, it only generates
 * if no digest exists covering the current window.
 */
export async function maybeGenerateDigest(
  pool: Pool,
  accountId: string,
  aiProvider?: AiProviderAdapter | null,
): Promise<void> {
  const shouldGenerate = await checkDigestTriggers(pool, accountId);
  if (!shouldGenerate) return;

  await generateDigest(pool, accountId, aiProvider);
}

/**
 * Generate a digest unconditionally. Used by the scheduled job and the
 * manual "generate now" API endpoint.
 *
 * When an AI provider is supplied, the digest body is generated as a
 * narrative summary via the LLM. Otherwise it falls back to the
 * bullet-list format.
 */
export async function generateDigest(
  pool: Pool,
  accountId: string,
  aiProvider?: AiProviderAdapter | null,
): Promise<void> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - DIGEST_WINDOW_HOURS * 60 * 60 * 1000);

  // Check if a digest already exists for this window (avoid duplicates)
  const existing = await pool.query(
    `SELECT id
     FROM digest
     WHERE tenant_id = $1
       AND start_ts >= $2
       AND end_ts <= $3
     LIMIT 1`,
    [accountId, windowStart.toISOString(), windowEnd.toISOString()],
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
       f.title AS feed_title,
       i.published_at
     FROM cluster c
     JOIN item i ON i.id = c.rep_item_id
     JOIN feed f ON f.id = i.feed_id
     JOIN folder fo ON fo.id = c.folder_id
     LEFT JOIN read_state rs ON rs.cluster_id = c.id AND rs.tenant_id = c.tenant_id
     WHERE c.updated_at >= $1
       AND c.tenant_id = $2
       AND rs.read_at IS NULL
     ORDER BY
       CASE f.weight WHEN 'prefer' THEN 3 WHEN 'neutral' THEN 2 ELSE 1 END DESC,
       c.size DESC,
       i.published_at DESC
     LIMIT $3`,
    [windowStart.toISOString(), accountId, TOP_PICKS_COUNT + BIG_STORIES_COUNT + QUICK_SCAN_COUNT],
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
      sourceName: row.feed_title,
    });
  }

  const title = `Digest for ${windowStart.toLocaleDateString()} - ${windowEnd.toLocaleDateString()}`;

  let body: string;
  if (aiProvider) {
    // Check budget before making AI calls
    let skipAi = false;
    try {
      const overBudget = await isBudgetExceeded(pool, accountId);
      if (overBudget) {
        console.warn("[digest] AI budget exceeded, falling back to bullet list", { accountId });
        skipAi = true;
      }
    } catch (err) {
      console.warn("[digest] budget check failed, proceeding with caution", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (skipAi) {
      body = buildDigestBody(entries);
    } else {
      const narrative = await generateNarrativeBody(pool, accountId, aiProvider, entries);
      body = narrative ?? buildDigestBody(entries);
    }
  } else {
    body = buildDigestBody(entries);
  }

  await pool.query(
    `INSERT INTO digest (tenant_id, start_ts, end_ts, title, body, entries_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      accountId,
      windowStart.toISOString(),
      windowEnd.toISOString(),
      title,
      body,
      JSON.stringify(entries),
    ],
  );

  console.info("[digest] generated", {
    entries: entries.length,
    aiNarrative: !!aiProvider,
    window: `${windowStart.toISOString()} - ${windowEnd.toISOString()}`,
  });
}

async function generateNarrativeBody(
  pool: Pool,
  accountId: string,
  provider: AiProviderAdapter,
  entries: DigestEntry[],
): Promise<string | null> {
  const sectionLabels: Record<DigestEntry["section"], string> = {
    top_picks: "Top Picks",
    big_stories: "Big Stories",
    quick_scan: "Quick Scan",
  };

  const grouped: Record<string, DigestEntry[]> = {
    top_picks: [],
    big_stories: [],
    quick_scan: [],
  };

  for (const entry of entries) {
    grouped[entry.section]?.push(entry);
  }

  // Build structured data for the LLM prompt
  const sectionLines: string[] = [];
  for (const section of ["top_picks", "big_stories", "quick_scan"] as const) {
    const items = grouped[section];
    if (!items || items.length === 0) continue;
    sectionLines.push(`## ${sectionLabels[section]}`);
    for (const item of items) {
      const summary = item.oneLiner ? ` — ${item.oneLiner}` : "";
      sectionLines.push(`- "${item.headline}" (${item.sourceName})${summary}`);
    }
    sectionLines.push("");
  }

  const userContent = sectionLines.join("\n");

  try {
    const response = await provider.complete({
      messages: [
        {
          role: "system",
          content: [
            "You are a concise newsletter editor for an RSS reader.",
            "Given the grouped stories below, write a brief digest newsletter in markdown.",
            "Keep the section headings (## Top Picks, ## Big Stories, ## Quick Scan).",
            "For each story, write a compelling one-liner (not just the headline).",
            "Open with a 1-sentence summary of the day's themes.",
            "Be factual and neutral. Do not invent details not present in the input.",
            "Return only the markdown body — no subject line, no sign-off.",
          ].join(" "),
        },
        { role: "user", content: userContent },
      ],
      maxTokens: 1024,
      temperature: 0.4,
    });

    const text = response.text.trim();
    if (text.length === 0) {
      console.warn("[digest] AI returned empty narrative, falling back to bullet list");
      return null;
    }

    logAiUsage(pool, accountId, response, "digest").catch((err) => {
      console.warn("[digest] failed to log AI usage", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    console.info("[digest] AI narrative generated", {
      provider: response.provider,
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      durationMs: response.durationMs,
    });

    return text;
  } catch (err) {
    console.error("[digest] AI narrative generation failed, falling back to bullet list", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function checkDigestTriggers(pool: Pool, accountId: string): Promise<boolean> {
  // Trigger 1: unread backlog >= threshold
  const backlogResult = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM cluster c
     LEFT JOIN read_state rs ON rs.cluster_id = c.id AND rs.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1
       AND rs.read_at IS NULL`,
    [accountId],
  );
  const backlog = parseInt(backlogResult.rows[0]?.cnt || "0", 10);
  if (backlog >= BACKLOG_THRESHOLD) {
    console.info("[digest] backlog trigger", { backlog });
    return true;
  }

  // Trigger 2: no recent digest in the last 24h
  const recentDigest = await pool.query(
    `SELECT id
     FROM digest
     WHERE tenant_id = $1
       AND created_at >= NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [accountId],
  );
  if (recentDigest.rows.length === 0 && backlog > 0) {
    console.info("[digest] time trigger (no digest in 24h)");
    return true;
  }

  // Trigger 3: user has been away >= 24h and there are unread items
  if (backlog > 0) {
    const awayResult = await pool.query<{ last_active_at: Date | null }>(
      `SELECT last_active_at FROM tenant WHERE id = $1`,
      [accountId],
    );
    const lastActiveAt = awayResult.rows[0]?.last_active_at;
    if (lastActiveAt) {
      const hoursAway = (Date.now() - lastActiveAt.getTime()) / (1000 * 60 * 60);
      if (hoursAway >= AWAY_HOURS_THRESHOLD) {
        console.info("[digest] away trigger", { hoursAway: Math.round(hoursAway), backlog });
        return true;
      }
    }
  }

  return false;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
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

  if ((sections.top_picks?.length ?? 0) > 0) {
    lines.push("## Top Picks");
    for (const e of sections.top_picks!) {
      lines.push(`- ${e.headline}`);
    }
    lines.push("");
  }

  if ((sections.big_stories?.length ?? 0) > 0) {
    lines.push("## Big Stories");
    for (const e of sections.big_stories!) {
      lines.push(`- ${e.headline}`);
    }
    lines.push("");
  }

  if ((sections.quick_scan?.length ?? 0) > 0) {
    lines.push("## Quick Scan");
    for (const e of sections.quick_scan!) {
      const suffix = e.oneLiner ? ` — ${e.oneLiner}` : "";
      lines.push(`- ${e.headline}${suffix}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
