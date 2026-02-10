import type { Pool } from "pg";
import type { UpsertedItem } from "./parse-and-upsert";
import type { AiMode, AiProviderAdapter } from "@rss-wrangler/contracts";

const OG_FETCH_TIMEOUT_MS = 10_000;
const AI_BATCH_SIZE = 5;

interface Settings {
  aiMode: AiMode;
  monthlyAiCapUsd: number;
}

interface EnrichableItem {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  heroImageUrl: string | null;
}

async function getSettings(pool: Pool, accountId: string): Promise<Settings> {
  const result = await pool.query<{ data: unknown }>(
    `SELECT data FROM app_settings WHERE tenant_id = $1 AND key = 'main' LIMIT 1`,
    [accountId]
  );
  const row = result.rows[0];
  if (!row || !row.data || typeof row.data !== "object") {
    return { aiMode: "off", monthlyAiCapUsd: 0 };
  }
  const data = row.data as Record<string, unknown>;
  return {
    aiMode: (data.aiMode as AiMode) ?? "off",
    monthlyAiCapUsd: (data.monthlyAiCapUsd as number) ?? 0,
  };
}

/**
 * Fetches the og:image meta tag from an article URL.
 * Works regardless of AI mode -- pure HTML scraping.
 */
async function fetchOgImage(articleUrl: string): Promise<string | null> {
  try {
    const url = new URL(articleUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const response = await fetch(articleUrl, {
      headers: {
        "User-Agent": "RSSWrangler/1.0",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(OG_FETCH_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!response.ok) return null;

    // Only read first 50KB to find og:image in <head>
    const reader = response.body?.getReader();
    if (!reader) return null;

    let html = "";
    const decoder = new TextDecoder();
    const MAX_BYTES = 50 * 1024;

    while (html.length < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      // Stop once we've passed </head>
      if (html.includes("</head>") || html.includes("</HEAD>")) break;
    }
    reader.cancel().catch(() => {
      // Ignore cancellation errors when stream is already closed.
    });

    return extractOgImageFromHtml(html);
  } catch {
    return null;
  }
}

function extractOgImageFromHtml(html: string): string | null {
  // Match <meta property="og:image" content="...">
  const ogMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  );
  if (ogMatch?.[1]) return ogMatch[1];

  // Also try reversed attribute order: content before property
  const ogMatchReverse = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
  );
  if (ogMatchReverse?.[1]) return ogMatchReverse[1];

  // Fall back to twitter:image
  const twitterMatch = html.match(
    /<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
  );
  if (twitterMatch?.[1]) return twitterMatch[1];

  const twitterMatchReverse = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i
  );
  if (twitterMatchReverse?.[1]) return twitterMatchReverse[1];

  return null;
}

async function generateSummary(
  provider: AiProviderAdapter,
  title: string,
  existingSummary: string | null
): Promise<string | null> {
  const content = existingSummary
    ? `Title: ${title}\n\nContent: ${existingSummary}`
    : `Title: ${title}`;

  try {
    const response = await provider.complete({
      messages: [
        {
          role: "system",
          content:
            "You are a concise news summarizer. Given an article title and optional content snippet, write a 1-2 sentence summary that captures the key point. Be factual and neutral. Return only the summary text, no labels or prefixes.",
        },
        { role: "user", content },
      ],
      maxTokens: 150,
      temperature: 0.3,
    });

    return response.text.trim() || null;
  } catch (err) {
    console.warn("[enrich-ai] summary generation failed", {
      title,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function updateItemEnrichment(
  pool: Pool,
  accountId: string,
  itemId: string,
  summary: string | null,
  heroImageUrl: string | null
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (summary !== null) {
    setClauses.push(`summary = $${paramIdx++}`);
    values.push(summary);
  }
  if (heroImageUrl !== null) {
    setClauses.push(`hero_image_url = $${paramIdx++}`);
    values.push(heroImageUrl);
  }

  if (setClauses.length === 0) return;

  values.push(itemId, accountId);
  await pool.query(
    `UPDATE item
     SET ${setClauses.join(", ")}
     WHERE id = $${paramIdx}
       AND tenant_id = $${paramIdx + 1}`,
    values
  );
}

async function updateClusterHeroImage(
  pool: Pool,
  accountId: string,
  itemId: string,
  _heroImageUrl: string
): Promise<void> {
  // Update hero_image_url on clusters where this item is the representative
  await pool.query(
    `UPDATE cluster SET updated_at = NOW()
     WHERE rep_item_id = $1
       AND tenant_id = $2`,
    [itemId, accountId]
  );
}

/**
 * Enriches new items with hero images (via og:image scraping) and
 * AI-generated summaries (via OpenAI). Respects the settings.aiMode:
 * - "off": only scrape og:image, no AI calls
 * - "summaries_digest": scrape og:image + generate summaries
 * - "full": scrape og:image + generate summaries
 */
export async function enrichWithAi(
  pool: Pool,
  accountId: string,
  items: UpsertedItem[],
  provider: AiProviderAdapter | null
): Promise<void> {
  if (items.length === 0) return;

  const settings = await getSettings(pool, accountId);

  // Find items that need enrichment
  const needsEnrichment: EnrichableItem[] = items
    .filter((i) => i.summary === null || i.heroImageUrl === null)
    .map((i) => ({
      id: i.id,
      url: i.url,
      title: i.title,
      summary: i.summary,
      heroImageUrl: i.heroImageUrl,
    }));

  if (needsEnrichment.length === 0) {
    console.info("[enrich-ai] all items already enriched, skipping");
    return;
  }

  console.info("[enrich-ai] enriching items", {
    total: needsEnrichment.length,
    aiMode: settings.aiMode,
  });

  // Phase 1: Fetch og:image for items missing hero images (always, even if AI is off)
  const itemsMissingImage = needsEnrichment.filter((i) => i.heroImageUrl === null);
  if (itemsMissingImage.length > 0) {
    console.info("[enrich-ai] fetching og:image", { count: itemsMissingImage.length });

    // Process in parallel batches to avoid overwhelming the network
    for (let i = 0; i < itemsMissingImage.length; i += AI_BATCH_SIZE) {
      const batch = itemsMissingImage.slice(i, i + AI_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const ogImage = await fetchOgImage(item.url);
          if (ogImage) {
            item.heroImageUrl = ogImage;
            await updateItemEnrichment(pool, accountId, item.id, null, ogImage);
            await updateClusterHeroImage(pool, accountId, item.id, ogImage);
          }
        })
      );

      for (const result of results) {
        if (result.status === "rejected") {
          console.warn("[enrich-ai] og:image fetch failed", {
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }
    }
  }

  // Phase 2: AI summaries (only if AI mode is enabled and provider is available)
  if (settings.aiMode === "off") {
    console.info("[enrich-ai] AI mode is off, skipping summary generation");
    return;
  }

  if (!provider) {
    console.warn("[enrich-ai] No AI provider configured, skipping AI enrichment");
    return;
  }

  const itemsMissingSummary = needsEnrichment.filter((i) => i.summary === null);
  if (itemsMissingSummary.length === 0) {
    console.info("[enrich-ai] all items already have summaries");
    return;
  }

  console.info("[enrich-ai] generating AI summaries", {
    count: itemsMissingSummary.length,
    provider: provider.name,
  });

  // Process in batches to respect rate limits
  for (let i = 0; i < itemsMissingSummary.length; i += AI_BATCH_SIZE) {
    const batch = itemsMissingSummary.slice(i, i + AI_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const summary = await generateSummary(provider, item.title, item.summary);
        if (summary) {
          item.summary = summary;
          await updateItemEnrichment(pool, accountId, item.id, summary, null);
        }
      })
    );

    for (const result of results) {
      if (result.status === "rejected") {
        console.warn("[enrich-ai] summary generation failed", {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  console.info("[enrich-ai] enrichment complete", {
    totalProcessed: needsEnrichment.length,
  });
}
