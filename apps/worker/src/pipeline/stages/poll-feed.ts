import { parseFeed } from "feedsmith";
import type { Atom, DeepPartial, Json, Rdf, Rss } from "feedsmith/types";
import type { DueFeed } from "../../services/feed-service";

export type ParsedFeedFormat = "rss" | "atom" | "rdf" | "json";

export interface ParsedItem {
  guid: string | null;
  url: string;
  title: string;
  summary: string | null;
  publishedAt: Date;
  author: string | null;
  heroImageUrl: string | null;
}

export interface PollResult {
  items: ParsedItem[];
  feedTitle: string | null;
  format: ParsedFeedFormat | null;
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
}

/**
 * Validates that a feed URL is safe to fetch (SSRF protection).
 * Blocks non-HTTP(S) protocols and private/loopback addresses.
 */
export function validateFeedUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`[poll-feed] Invalid feed URL: ${rawUrl}`);
  }

  // Only allow http and https protocols
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`[poll-feed] Blocked non-HTTP(S) protocol: ${url.protocol}`);
  }

  const hostname = url.hostname.toLowerCase();

  // Block localhost variants
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname === "::1"
  ) {
    throw new Error(`[poll-feed] Blocked loopback address: ${hostname}`);
  }

  // Block private IPv4 ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match as [string, string, string, string, string];
    const first = parseInt(a, 10);
    const second = parseInt(b, 10);

    // 10.0.0.0/8
    if (first === 10) {
      throw new Error(`[poll-feed] Blocked private IP range (10.x): ${hostname}`);
    }
    // 172.16.0.0/12
    if (first === 172 && second >= 16 && second <= 31) {
      throw new Error(`[poll-feed] Blocked private IP range (172.16-31.x): ${hostname}`);
    }
    // 192.168.0.0/16
    if (first === 192 && second === 168) {
      throw new Error(`[poll-feed] Blocked private IP range (192.168.x): ${hostname}`);
    }
    // 169.254.0.0/16 (link-local)
    if (first === 169 && second === 254) {
      throw new Error(`[poll-feed] Blocked link-local IP range (169.254.x): ${hostname}`);
    }
  }

  // Block IPv6 private ranges (fc00::/7 and fe80::/10)
  // Hostnames with brackets like [fc00::1] or raw fc00::1
  const ipv6Host = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  const ipv6Lower = ipv6Host.toLowerCase();
  if (ipv6Lower.startsWith("fc") || ipv6Lower.startsWith("fd")) {
    throw new Error(`[poll-feed] Blocked IPv6 unique local address: ${hostname}`);
  }
  if (ipv6Lower.startsWith("fe80")) {
    throw new Error(`[poll-feed] Blocked IPv6 link-local address: ${hostname}`);
  }
  // Block IPv4-mapped IPv6 (::ffff:127.0.0.1, ::ffff:10.0.0.1, etc.)
  const v4mapped = ipv6Lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4mapped?.[1]) {
    const parts = v4mapped[1].split(".").map(Number);
    const first = parts[0]!;
    const second = parts[1]!;
    if (
      first === 10 ||
      first === 127 ||
      first === 0 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    ) {
      throw new Error(`[poll-feed] Blocked IPv4-mapped IPv6 private address: ${hostname}`);
    }
  }
}

export async function pollFeed(feed: DueFeed): Promise<PollResult> {
  validateFeedUrl(feed.url);

  const headers: Record<string, string> = {};
  if (feed.etag) {
    headers["If-None-Match"] = feed.etag;
  }
  if (feed.lastModified) {
    headers["If-Modified-Since"] = feed.lastModified;
  }

  let response: Response;
  try {
    response = await fetch(feed.url, {
      headers: {
        ...headers,
        "User-Agent": "RSSWrangler/1.0",
        Accept:
          "application/rss+xml, application/atom+xml, application/feed+json, application/json, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.error("[poll-feed] fetch failed", { feedId: feed.id, error: err });
    throw err;
  }

  if (response.status === 304) {
    console.info("[poll-feed] not modified", { feedId: feed.id });
    return {
      items: [],
      feedTitle: null,
      format: null,
      etag: feed.etag,
      lastModified: feed.lastModified,
      notModified: true,
    };
  }

  if (!response.ok) {
    throw new Error(`[poll-feed] HTTP ${response.status} for feed ${feed.id}`);
  }

  const payload = await response.text();
  let format: ParsedFeedFormat;
  let items: ParsedItem[];
  let feedTitle: string | null;
  try {
    const parsed = parseFeed(payload);
    format = parsed.format;
    items = normalizeParsedItems(parsed);
    feedTitle = extractFeedTitle(parsed);
  } catch (err) {
    throw new Error(
      `[poll-feed] failed to parse feed ${feed.id}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return {
    items,
    feedTitle,
    format,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    notModified: false,
  };
}

type ParsedFeedsmith = ReturnType<typeof parseFeed>;

type RssItem = DeepPartial<Rss.Item<string>>;
type AtomItem = DeepPartial<Atom.Entry<string>>;
type RdfItem = DeepPartial<Rdf.Item<string>>;
type JsonItem = DeepPartial<Json.Item<string>>;

interface MediaLike {
  thumbnails?: Array<{ url?: string }>;
  contents?: Array<{ url?: string; type?: string; medium?: string }>;
}

function extractFeedTitle(parsed: ParsedFeedsmith): string | null {
  if (parsed.format === "rss") {
    return firstNonEmpty(parsed.feed.title);
  }
  if (parsed.format === "atom") {
    return firstNonEmpty(parsed.feed.title);
  }
  if (parsed.format === "rdf") {
    return firstNonEmpty(parsed.feed.title);
  }
  // JSON Feed
  return firstNonEmpty(parsed.feed.title);
}

function normalizeParsedItems(parsed: ParsedFeedsmith): ParsedItem[] {
  if (parsed.format === "rss") {
    return (parsed.feed.items ?? []).map((item) => normalizeRssItem(item));
  }

  if (parsed.format === "atom") {
    return (parsed.feed.entries ?? []).map((entry) => normalizeAtomItem(entry));
  }

  if (parsed.format === "rdf") {
    return (parsed.feed.items ?? []).map((item) => normalizeRdfItem(item));
  }

  return (parsed.feed.items ?? []).map((item) => normalizeJsonItem(item));
}

function normalizeRssItem(item: RssItem): ParsedItem {
  const summary = firstNonEmpty(item.description, item.content?.encoded);
  const guid = firstNonEmpty(item.guid?.value);
  const url = firstNonEmpty(item.link, item.guid?.isPermaLink === false ? null : item.guid?.value);

  return {
    guid,
    url: url ?? "",
    title: firstNonEmpty(item.title) ?? "(untitled)",
    summary,
    publishedAt:
      firstDate(
        item.pubDate,
        item.dc?.date,
        item.dc?.dates?.[0],
        item.dcterms?.issued,
        item.dcterms?.created,
        item.dcterms?.date,
      ) ?? new Date(),
    author: firstNonEmpty(
      firstAuthorName(item.authors),
      item.dc?.creator,
      item.dc?.creators?.[0],
      item.dcterms?.creator,
      item.dcterms?.creators?.[0],
    ),
    heroImageUrl: firstNonEmpty(
      extractHeroImageFromMedia(item.media),
      extractHeroImageFromEnclosures(item.enclosures),
      extractImageFromHtml(summary),
    ),
  };
}

function normalizeAtomItem(entry: AtomItem): ParsedItem {
  const summary = firstNonEmpty(entry.summary, entry.content);
  const url = firstNonEmpty(selectAtomLink(entry.links), asValidUrl(entry.id));

  return {
    guid: firstNonEmpty(entry.id),
    url: url ?? "",
    title: firstNonEmpty(entry.title) ?? "(untitled)",
    summary,
    publishedAt:
      firstDate(
        entry.published,
        entry.updated,
        entry.dc?.date,
        entry.dc?.dates?.[0],
        entry.dcterms?.issued,
        entry.dcterms?.created,
        entry.dcterms?.date,
      ) ?? new Date(),
    author: firstNonEmpty(
      firstPersonName(entry.authors),
      entry.dc?.creator,
      entry.dc?.creators?.[0],
      entry.dcterms?.creator,
      entry.dcterms?.creators?.[0],
    ),
    heroImageUrl: firstNonEmpty(
      extractHeroImageFromMedia(entry.media),
      extractImageFromHtml(summary),
    ),
  };
}

function normalizeRdfItem(item: RdfItem): ParsedItem {
  const summary = firstNonEmpty(item.description, item.content?.encoded);
  const url = firstNonEmpty(item.link, item.rdf?.about);

  return {
    guid: firstNonEmpty(item.rdf?.about),
    url: url ?? "",
    title: firstNonEmpty(item.title) ?? "(untitled)",
    summary,
    publishedAt:
      firstDate(
        item.dc?.date,
        item.dc?.dates?.[0],
        item.dcterms?.issued,
        item.dcterms?.created,
        item.dcterms?.date,
      ) ?? new Date(),
    author: firstNonEmpty(
      item.dc?.creator,
      item.dc?.creators?.[0],
      item.dcterms?.creator,
      item.dcterms?.creators?.[0],
    ),
    heroImageUrl: firstNonEmpty(
      extractHeroImageFromMedia(item.media),
      extractImageFromHtml(summary),
    ),
  };
}

function normalizeJsonItem(item: JsonItem): ParsedItem {
  const summary = firstNonEmpty(item.summary, item.content_text, item.content_html);
  const url = firstNonEmpty(item.url, item.external_url);

  return {
    guid: firstNonEmpty(item.id),
    url: url ?? "",
    title: firstNonEmpty(item.title) ?? "(untitled)",
    summary,
    publishedAt: firstDate(item.date_published, item.date_modified) ?? new Date(),
    author: firstNonEmpty(firstAuthorName(item.authors)),
    heroImageUrl: firstNonEmpty(
      item.image,
      item.banner_image,
      extractImageFromHtml(item.content_html),
      extractImageFromHtml(summary),
    ),
  };
}

function extractHeroImageFromMedia(media: MediaLike | undefined): string | null {
  if (!media) return null;

  for (const thumbnail of media.thumbnails ?? []) {
    const url = firstNonEmpty(thumbnail.url);
    if (url) return url;
  }

  for (const content of media.contents ?? []) {
    const url = firstNonEmpty(content.url);
    if (!url) continue;
    const type = content.type?.toLowerCase() ?? "";
    const medium = content.medium?.toLowerCase() ?? "";
    if (type.startsWith("image/") || medium === "image") {
      return url;
    }
  }

  for (const content of media.contents ?? []) {
    const url = firstNonEmpty(content.url);
    if (url) return url;
  }

  return null;
}

function extractHeroImageFromEnclosures(
  enclosures: Array<DeepPartial<Rss.Enclosure>> | undefined,
): string | null {
  for (const enclosure of enclosures ?? []) {
    const url = firstNonEmpty(enclosure.url);
    if (!url) continue;
    const type = enclosure.type?.toLowerCase() ?? "";
    if (type.startsWith("image/")) {
      return url;
    }
  }
  return null;
}

function extractImageFromHtml(content: string | null | undefined): string | null {
  if (!content) return null;
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  return imgMatch?.[1] ?? null;
}

function selectAtomLink(links: Array<DeepPartial<Atom.Link<string>>> | undefined): string | null {
  if (!links || links.length === 0) return null;

  const alternate = links.find((link) => {
    const rel = link.rel?.toLowerCase();
    return rel === undefined || rel === "alternate";
  });

  return firstNonEmpty(alternate?.href, links[0]?.href);
}

function firstDate(...values: Array<string | null | undefined>): Date | null {
  for (const value of values) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

function firstAuthorName(
  authors: Array<string | { name?: string } | null | undefined> | undefined,
): string | null {
  if (!authors || authors.length === 0) return null;
  for (const author of authors) {
    if (typeof author === "string") {
      const trimmed = author.trim();
      if (trimmed.length > 0) return trimmed;
      continue;
    }
    if (author && typeof author.name === "string") {
      const trimmed = author.name.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

function firstPersonName(people: Array<DeepPartial<Atom.Person>> | undefined): string | null {
  if (!people || people.length === 0) return null;
  for (const person of people) {
    if (typeof person.name === "string") {
      const trimmed = person.name.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

function asValidUrl(value: string | null | undefined): string | null {
  const candidate = firstNonEmpty(value);
  if (!candidate) return null;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    return null;
  }
}
