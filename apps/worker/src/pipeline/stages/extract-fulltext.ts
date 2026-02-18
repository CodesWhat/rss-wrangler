import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { Pool } from "pg";
import { validateFeedUrl } from "./poll-feed";

const EXTRACTION_TIMEOUT_MS = 20_000;
const EXTRACTION_CONCURRENCY = 3;
const MAX_HTML_BYTES = 2_000_000;
const MIN_EXTRACTED_TEXT_CHARS = 200;
const MAX_EXTRACTED_TEXT_CHARS = 200_000;
const EXTRACTION_FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const BACKFILL_FETCH_MULTIPLIER = 6;
const BACKFILL_MAX_BATCH_SIZE = 250;
const FAILURE_COOLDOWN_PRUNE_THRESHOLD = 5_000;

const urlFailureCooldownUntil = new Map<string, number>();

export interface ExtractableItem {
  id: string;
  url: string;
}

export interface ExtractionStats {
  attempted: number;
  extracted: number;
  persisted: number;
}

export interface BackfillExtractionStats extends ExtractionStats {
  candidates: number;
}

export async function extractAndPersistFullText(
  pool: Pool,
  accountId: string,
  items: ExtractableItem[],
): Promise<ExtractionStats> {
  const candidates = items.filter(
    (item) => item.url.trim().length > 0 && !isUrlInFailureCooldown(item.url),
  );
  if (candidates.length === 0) {
    return { attempted: 0, extracted: 0, persisted: 0 };
  }

  let attempted = 0;
  const extracted: Array<{ itemId: string; text: string }> = [];

  await mapWithConcurrency(candidates, EXTRACTION_CONCURRENCY, async (item) => {
    attempted += 1;
    try {
      const text = await extractArticleText(item.url);
      if (!text) {
        rememberExtractionFailure(item.url);
        return;
      }
      extracted.push({ itemId: item.id, text });
      clearExtractionFailure(item.url);
    } catch (error) {
      rememberExtractionFailure(item.url);
      console.warn("[extract-fulltext] extraction failed", {
        itemId: item.id,
        url: item.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  let persisted = 0;
  for (const row of extracted) {
    const result = await pool.query(
      `UPDATE item
       SET extracted_text = $1,
           extracted_at = NOW()
       WHERE tenant_id = $2
         AND id = $3
         AND (extracted_text IS DISTINCT FROM $1 OR extracted_at IS NULL)`,
      [row.text, accountId, row.itemId],
    );
    persisted += result.rowCount ?? 0;
  }

  return {
    attempted,
    extracted: extracted.length,
    persisted,
  };
}

export async function backfillMissingFullText(
  pool: Pool,
  accountId: string,
  limit: number,
): Promise<BackfillExtractionStats> {
  const cappedLimit = Math.max(1, Math.min(limit, BACKFILL_MAX_BATCH_SIZE));
  const fetchLimit = Math.max(cappedLimit, cappedLimit * BACKFILL_FETCH_MULTIPLIER);
  const result = await pool.query<{ id: string; url: string }>(
    `SELECT id, url
     FROM item
     WHERE tenant_id = $1
       AND extracted_text IS NULL
       AND COALESCE(NULLIF(BTRIM(url), ''), '') <> ''
     ORDER BY published_at DESC NULLS LAST, created_at DESC
     LIMIT $2`,
    [accountId, fetchLimit],
  );

  if (result.rows.length === 0) {
    return { candidates: 0, attempted: 0, extracted: 0, persisted: 0 };
  }

  const deduped: ExtractableItem[] = [];
  const seenUrls = new Set<string>();

  for (const row of result.rows) {
    const normalizedUrl = normalizeUrlForCooldown(row.url);
    if (seenUrls.has(normalizedUrl)) {
      continue;
    }
    seenUrls.add(normalizedUrl);
    deduped.push({ id: row.id, url: row.url });
    if (deduped.length >= cappedLimit) {
      break;
    }
  }

  const extraction = await extractAndPersistFullText(pool, accountId, deduped);
  return {
    candidates: deduped.length,
    ...extraction,
  };
}

async function extractArticleText(url: string): Promise<string | null> {
  validateFeedUrl(url);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "RSSWrangler/1.0",
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type");
  if (!isLikelyHtml(contentType)) {
    return null;
  }

  const html = await readBodyWithLimit(response, MAX_HTML_BYTES);
  if (!html) {
    return null;
  }

  const document = new JSDOM(html, { url }).window.document;
  const parsed = new Readability(document).parse();
  const text = normalizeText(parsed?.textContent ?? "");

  if (text.length < MIN_EXTRACTED_TEXT_CHARS) {
    return null;
  }

  return text.slice(0, MAX_EXTRACTED_TEXT_CHARS);
}

function isLikelyHtml(contentType: string | null): boolean {
  if (!contentType) {
    return true;
  }
  const value = contentType.toLowerCase();
  return value.includes("text/html") || value.includes("application/xhtml+xml");
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    const fallbackText = await response.text();
    return Buffer.byteLength(fallbackText, "utf8") <= maxBytes ? fallbackText : null;
  }

  let totalBytes = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8").decode(buffer);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isUrlInFailureCooldown(url: string): boolean {
  const key = normalizeUrlForCooldown(url);
  const cooldownUntil = urlFailureCooldownUntil.get(key);
  if (!cooldownUntil) {
    return false;
  }
  if (cooldownUntil <= Date.now()) {
    urlFailureCooldownUntil.delete(key);
    return false;
  }
  return true;
}

function rememberExtractionFailure(url: string): void {
  if (urlFailureCooldownUntil.size > FAILURE_COOLDOWN_PRUNE_THRESHOLD) {
    pruneExpiredFailureCooldowns();
  }
  const key = normalizeUrlForCooldown(url);
  urlFailureCooldownUntil.set(key, Date.now() + EXTRACTION_FAILURE_COOLDOWN_MS);
}

function clearExtractionFailure(url: string): void {
  const key = normalizeUrlForCooldown(url);
  urlFailureCooldownUntil.delete(key);
}

function normalizeUrlForCooldown(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

function pruneExpiredFailureCooldowns(): void {
  const now = Date.now();
  for (const [key, cooldownUntil] of urlFailureCooldownUntil.entries()) {
    if (cooldownUntil <= now) {
      urlFailureCooldownUntil.delete(key);
    }
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const workers: Promise<void>[] = [];
  const slots = Math.max(1, Math.min(concurrency, items.length));

  for (let i = 0; i < slots; i += 1) {
    workers.push(
      (async () => {
        while (true) {
          const current = index;
          index += 1;
          if (current >= items.length) {
            return;
          }
          await worker(items[current] as T);
        }
      })(),
    );
  }

  await Promise.all(workers);
}
