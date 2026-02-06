import pg from "pg";
import OpenAI from "openai";

const DB_URL = "postgres://claude-burner@localhost:5432/rss_wrangler";
const OG_FETCH_TIMEOUT_MS = 10_000;
const BATCH_SIZE = 5;
const AI_MODEL = "gpt-4o-mini";

interface Item {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  hero_image_url: string | null;
}

interface ScrapedMeta {
  ogImage: string | null;
  description: string | null;
}

// ── HTML scraping ──────────────────────────────────────────────────

function extractOgImageFromHtml(html: string): string | null {
  const ogMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  );
  if (ogMatch?.[1]) return ogMatch[1];

  const ogMatchReverse = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
  );
  if (ogMatchReverse?.[1]) return ogMatchReverse[1];

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

function extractDescriptionFromHtml(html: string): string | null {
  // Try og:description first
  const ogDesc = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
  );
  if (ogDesc?.[1]?.trim()) return ogDesc[1].trim();

  const ogDescReverse = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i
  );
  if (ogDescReverse?.[1]?.trim()) return ogDescReverse[1].trim();

  // Try meta description
  const metaDesc = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  );
  if (metaDesc?.[1]?.trim()) return metaDesc[1].trim();

  const metaDescReverse = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i
  );
  if (metaDescReverse?.[1]?.trim()) return metaDescReverse[1].trim();

  // Try twitter:description
  const twitterDesc = html.match(
    /<meta[^>]+(?:name|property)=["']twitter:description["'][^>]+content=["']([^"']+)["']/i
  );
  if (twitterDesc?.[1]?.trim()) return twitterDesc[1].trim();

  const twitterDescReverse = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:description["']/i
  );
  if (twitterDescReverse?.[1]?.trim()) return twitterDescReverse[1].trim();

  return null;
}

async function fetchPageMeta(articleUrl: string): Promise<ScrapedMeta> {
  try {
    const url = new URL(articleUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ogImage: null, description: null };
    }

    const response = await fetch(articleUrl, {
      headers: {
        "User-Agent": "RSSWrangler/1.0",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(OG_FETCH_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!response.ok) return { ogImage: null, description: null };

    const reader = response.body?.getReader();
    if (!reader) return { ogImage: null, description: null };

    let html = "";
    const decoder = new TextDecoder();
    const MAX_BYTES = 500 * 1024;

    while (html.length < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});

    return {
      ogImage: extractOgImageFromHtml(html),
      description: extractDescriptionFromHtml(html),
    };
  } catch {
    return { ogImage: null, description: null };
  }
}

// ── AI summary generation ──────────────────────────────────────────

async function generateSummary(
  client: OpenAI,
  title: string
): Promise<string | null> {
  try {
    const response = await client.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a concise news summarizer. Given an article title, write a 1-2 sentence summary that captures the key point. Be factual and neutral. Return only the summary text, no labels or prefixes.",
        },
        { role: "user", content: `Title: ${title}` },
      ],
      max_tokens: 150,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn(
      `  [WARN] OpenAI failed for "${title.slice(0, 50)}":`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

function needsNewSummary(summary: string | null): boolean {
  if (!summary) return true;
  return summary.includes("Article URL:") || summary.includes("Comments URL:");
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const pool = new pg.Pool({ connectionString: DB_URL });

  try {
    // Get OpenAI API key from DB
    const settingsResult = await pool.query<{ data: Record<string, unknown> }>(
      `SELECT data FROM app_settings WHERE key = 'main' LIMIT 1`
    );
    const settingsData = settingsResult.rows[0]?.data;
    const openaiApiKey = settingsData?.openaiApiKey as string | undefined;

    let openaiClient: OpenAI | null = null;
    if (openaiApiKey && !openaiApiKey.startsWith("sk-test-")) {
      openaiClient = new OpenAI({ apiKey: openaiApiKey });
      console.log("OpenAI client initialized with DB key");
    } else {
      console.log(
        "No valid OpenAI API key found. Will use scraped meta descriptions as summaries."
      );
    }

    // Get all items
    const itemsResult = await pool.query<Item>(
      `SELECT id, url, title, summary, hero_image_url FROM item`
    );
    const items = itemsResult.rows;
    console.log(`Found ${items.length} total items`);

    // Identify what needs work (images already backfilled in phase 1 run, but re-check)
    const needsImage = items.filter((i) => !i.hero_image_url);
    const needsSummary = items.filter((i) => needsNewSummary(i.summary));
    // Items that need any scraping at all
    const needsScrape = items.filter(
      (i) => !i.hero_image_url || needsNewSummary(i.summary)
    );

    console.log(`${needsImage.length} items missing hero images`);
    console.log(`${needsSummary.length} items need better summaries`);
    console.log(`${needsScrape.length} items need page scraping`);

    // ── Phase 1: Scrape pages for og:image + meta description ──
    console.log(`\n=== Phase 1: Scrape pages for images + descriptions ===`);

    const scrapedDescriptions = new Map<string, string>();
    let imagesFound = 0;
    let descriptionsFound = 0;

    for (let i = 0; i < needsScrape.length; i += BATCH_SIZE) {
      const batch = needsScrape.slice(i, i + BATCH_SIZE);
      console.log(
        `  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(needsScrape.length / BATCH_SIZE)} (${batch.length} items)`
      );

      await Promise.allSettled(
        batch.map(async (item) => {
          const meta = await fetchPageMeta(item.url);

          if (meta.ogImage && !item.hero_image_url) {
            await pool.query(
              `UPDATE item SET hero_image_url = $1 WHERE id = $2`,
              [meta.ogImage, item.id]
            );
            imagesFound++;
            console.log(`    [IMG] ${item.title.slice(0, 55)} -> found`);
          }

          if (meta.description && needsNewSummary(item.summary)) {
            scrapedDescriptions.set(item.id, meta.description);
            descriptionsFound++;
          }

          if (!meta.ogImage && !item.hero_image_url) {
            console.log(`    [--] ${item.title.slice(0, 55)} -> no image`);
          }
        })
      );
    }
    console.log(
      `Scraping done: ${imagesFound} new images, ${descriptionsFound} descriptions found`
    );

    // ── Phase 2: Update summaries ──
    console.log(`\n=== Phase 2: Update summaries ===`);

    let summariesUpdated = 0;

    if (openaiClient) {
      // Use OpenAI for all items needing summaries, fall back to scraped desc
      for (let i = 0; i < needsSummary.length; i += BATCH_SIZE) {
        const batch = needsSummary.slice(i, i + BATCH_SIZE);
        console.log(
          `  AI Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(needsSummary.length / BATCH_SIZE)}`
        );

        await Promise.allSettled(
          batch.map(async (item) => {
            const summary = await generateSummary(openaiClient!, item.title);
            if (summary) {
              await pool.query(
                `UPDATE item SET summary = $1 WHERE id = $2`,
                [summary, item.id]
              );
              summariesUpdated++;
              console.log(`    [AI] ${item.title.slice(0, 55)}`);
            } else {
              const desc = scrapedDescriptions.get(item.id);
              if (desc) {
                await pool.query(
                  `UPDATE item SET summary = $1 WHERE id = $2`,
                  [desc, item.id]
                );
                summariesUpdated++;
                console.log(`    [SCRAPED] ${item.title.slice(0, 55)}`);
              } else {
                console.log(
                  `    [--] ${item.title.slice(0, 55)} -> no summary source`
                );
              }
            }
          })
        );
      }
    } else {
      // No OpenAI - use scraped descriptions as summaries, fall back to title
      for (const item of needsSummary) {
        const desc = scrapedDescriptions.get(item.id);
        if (desc) {
          await pool.query(`UPDATE item SET summary = $1 WHERE id = $2`, [
            desc,
            item.id,
          ]);
          summariesUpdated++;
          console.log(`    [SCRAPED] ${item.title.slice(0, 55)}`);
        } else {
          // Use title as a clean summary when nothing else is available
          const titleSummary = item.title.replace(/\s*\[video\]\s*$/i, "").replace(/\s*\((\d{4})\)\s*$/, " ($1)");
          await pool.query(`UPDATE item SET summary = $1 WHERE id = $2`, [
            titleSummary,
            item.id,
          ]);
          summariesUpdated++;
          console.log(`    [TITLE] ${item.title.slice(0, 55)}`);
        }
      }
    }
    console.log(`Summaries updated: ${summariesUpdated}/${needsSummary.length}`);

    // ── Phase 3: Update cluster timestamps ──
    console.log(`\n=== Phase 3: Update clusters ===`);
    const clusterResult = await pool.query(
      `UPDATE cluster c SET updated_at = NOW() FROM item i WHERE i.id = c.rep_item_id AND i.hero_image_url IS NOT NULL`
    );
    console.log(`Updated ${clusterResult.rowCount} cluster(s)`);

    console.log(`\nBackfill complete!`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
