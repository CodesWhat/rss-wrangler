import type { Pool } from "pg";
import type { UpsertedItem } from "./parse-and-upsert";
import type { AiMode, AiProviderAdapter } from "@rss-wrangler/contracts";
import { logAiUsage, isBudgetExceeded } from "../../services/ai-usage";

const OG_FETCH_TIMEOUT_MS = 10_000;
const AI_BATCH_SIZE = 5;

export type ArticleIntent =
  | "news"
  | "opinion"
  | "tutorial"
  | "announcement"
  | "release"
  | "analysis";

const VALID_INTENTS: ReadonlySet<string> = new Set<ArticleIntent>([
  "news",
  "opinion",
  "tutorial",
  "announcement",
  "release",
  "analysis",
]);

export interface ItemClassification {
  intent: ArticleIntent;
  confidence: number;
}

/**
 * Intent-specific system prompts for summary generation.
 * Falls back to the default prompt when no classification is available.
 */
const INTENT_SUMMARY_PROMPTS: Record<ArticleIntent, string> = {
  news: "You are a concise news summarizer. Given an article title and optional content snippet, write a 1-2 sentence factual summary that captures the key facts: who, what, when, where. Be neutral and objective. Return only the summary text, no labels or prefixes.",
  opinion:
    "You are a concise article summarizer. Given an opinion piece title and optional content snippet, write a 1-2 sentence balanced summary that captures the author's thesis and any key supporting arguments. Present the perspective without endorsing it. Return only the summary text, no labels or prefixes.",
  tutorial:
    "You are a concise article summarizer. Given a tutorial title and optional content snippet, write a 1-2 sentence summary that describes what the reader will learn and the key technologies or techniques covered. Return only the summary text, no labels or prefixes.",
  announcement:
    "You are a concise news summarizer. Given an announcement title and optional content snippet, write a 1-2 sentence summary that captures what is being announced and why it matters. Return only the summary text, no labels or prefixes.",
  release:
    "You are a concise news summarizer. Given a release note title and optional content snippet, write a 1-2 sentence summary highlighting the most significant changes or new capabilities. Return only the summary text, no labels or prefixes.",
  analysis:
    "You are a concise article summarizer. Given an analysis piece title and optional content snippet, write a 1-2 sentence summary that captures the central finding or argument and the evidence cited. Return only the summary text, no labels or prefixes.",
};

const DEFAULT_SUMMARY_PROMPT =
  "You are a concise news summarizer. Given an article title and optional content snippet, write a 1-2 sentence summary that captures the key point. Be factual and neutral. Return only the summary text, no labels or prefixes.";

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

/**
 * Parses a batch classification LLM response into a map of item index -> classification.
 * Exported for testing.
 */
export function parseClassificationResponse(
  raw: string,
  itemCount: number
): Map<number, ItemClassification> {
  const result = new Map<number, ItemClassification>();

  // Strip markdown fences (Ollama compatibility)
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return result;
  }

  // Accept { classifications: [...] } or raw array [...]
  const maybeArr = Array.isArray(parsed)
    ? parsed
    : (parsed as Record<string, unknown>)?.classifications;
  if (!Array.isArray(maybeArr)) return result;
  const arr: unknown[] = maybeArr;

  for (const entry of arr) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const idx = typeof e.index === "number" ? e.index : -1;
    const intent = typeof e.intent === "string" ? e.intent.toLowerCase() : "";
    const confidence = typeof e.confidence === "number" ? e.confidence : 0;

    if (idx < 0 || idx >= itemCount) continue;
    if (!VALID_INTENTS.has(intent)) continue;

    result.set(idx, {
      intent: intent as ArticleIntent,
      confidence: Math.max(0, Math.min(1, confidence)),
    });
  }

  return result;
}

/**
 * Batch-classify a list of items by intent using one LLM call.
 * Returns a map of item ID -> classification. Items that fail to classify
 * are omitted from the map (caller falls through to default prompt).
 */
async function classifyItemIntents(
  pool: Pool,
  accountId: string,
  provider: AiProviderAdapter,
  items: EnrichableItem[]
): Promise<Map<string, ItemClassification>> {
  const classMap = new Map<string, ItemClassification>();
  if (items.length === 0) return classMap;

  const articleLines = items
    .map((item, i) => `${i}. ${item.title}`)
    .join("\n");

  const prompt = `Classify each article by intent. Valid intents: news, opinion, tutorial, announcement, release, analysis.

Articles:
${articleLines}

Respond ONLY with a JSON object: {"classifications": [{"index": 0, "intent": "news", "confidence": 0.9}, ...]}`;

  try {
    const response = await provider.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 150,
      temperature: 0.2,
    });

    logAiUsage(pool, accountId, response, "classification").catch((err) => {
      console.warn("[enrich-ai] failed to log classification usage", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    const parsed = parseClassificationResponse(response.text.trim(), items.length);
    for (const [idx, classification] of parsed) {
      const item = items[idx];
      if (item) classMap.set(item.id, classification);
    }

    console.info("[enrich-ai] classified items", {
      total: items.length,
      classified: classMap.size,
    });
  } catch (err) {
    console.warn("[enrich-ai] classification failed, falling through to default prompts", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return classMap;
}

async function generateSummary(
  pool: Pool,
  accountId: string,
  provider: AiProviderAdapter,
  title: string,
  existingSummary: string | null,
  classification?: ItemClassification
): Promise<string | null> {
  const content = existingSummary
    ? `Title: ${title}\n\nContent: ${existingSummary}`
    : `Title: ${title}`;

  const systemPrompt = classification
    ? INTENT_SUMMARY_PROMPTS[classification.intent]
    : DEFAULT_SUMMARY_PROMPT;

  try {
    const response = await provider.complete({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        { role: "user", content },
      ],
      maxTokens: 150,
      temperature: 0.3,
    });

    logAiUsage(pool, accountId, response, "summary").catch((err) => {
      console.warn("[enrich-ai] failed to log AI usage", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    const text = response.text.trim();
    if (!text || text.startsWith("[")) return null;
    return text;
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
 * AI-generated summaries (via configured AI provider). Respects the settings.aiMode:
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

  // Phase 2+3: AI classification & summaries (only if AI mode is enabled and provider is available)
  if (settings.aiMode === "off") {
    console.info("[enrich-ai] AI mode is off, skipping AI enrichment");
    return;
  }

  if (!provider) {
    console.warn("[enrich-ai] No AI provider configured, skipping AI enrichment");
    return;
  }

  // Check budget before making AI calls
  try {
    const overBudget = await isBudgetExceeded(pool, accountId);
    if (overBudget) {
      console.warn("[enrich-ai] AI budget exceeded, skipping AI enrichment", { accountId });
      return;
    }
  } catch (err) {
    console.warn("[enrich-ai] budget check failed, proceeding with caution", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const itemsMissingSummary = needsEnrichment.filter((i) => i.summary === null);
  if (itemsMissingSummary.length === 0) {
    console.info("[enrich-ai] all items already have summaries");
    return;
  }

  // Phase 2: Classify item intents (one batched LLM call per batch)
  let classificationMap = new Map<string, ItemClassification>();
  try {
    classificationMap = await classifyItemIntents(pool, accountId, provider, itemsMissingSummary);

    // Persist classifications to the database
    for (const [itemId, classification] of classificationMap) {
      await pool.query(
        `UPDATE item SET ai_classification = $1 WHERE id = $2 AND tenant_id = $3`,
        [JSON.stringify(classification), itemId, accountId]
      );
    }
  } catch (err) {
    console.warn("[enrich-ai] classification phase failed, continuing with default prompts", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Phase 3: Generate AI summaries (using intent-specific prompts when available)
  console.info("[enrich-ai] generating AI summaries", {
    count: itemsMissingSummary.length,
    classified: classificationMap.size,
    provider: provider.name,
  });

  // Process in batches to respect rate limits
  for (let i = 0; i < itemsMissingSummary.length; i += AI_BATCH_SIZE) {
    const batch = itemsMissingSummary.slice(i, i + AI_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const classification = classificationMap.get(item.id);
        const summary = await generateSummary(
          pool,
          accountId,
          provider,
          item.title,
          item.summary,
          classification
        );
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
