import RssParser from "rss-parser";
import type { DueFeed } from "../../services/feed-service";

const parser = new RssParser({
  timeout: 30_000,
  maxRedirects: 5,
  headers: {
    "User-Agent": "RSSWrangler/1.0",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
  },
});

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
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
}

/**
 * Validates that a feed URL is safe to fetch (SSRF protection).
 * Blocks non-HTTP(S) protocols and private/loopback addresses.
 */
function validateFeedUrl(rawUrl: string): void {
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
    if (first === 10 || first === 127 || first === 0 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 169 && second === 254)) {
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
      headers,
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
      etag: feed.etag,
      lastModified: feed.lastModified,
      notModified: true,
    };
  }

  if (!response.ok) {
    throw new Error(`[poll-feed] HTTP ${response.status} for feed ${feed.id}`);
  }

  const xml = await response.text();
  const parsed = await parser.parseString(xml);

  const items: ParsedItem[] = (parsed.items || []).map((entry) => ({
    guid: entry.guid || entry.id || null,
    url: entry.link || "",
    title: entry.title || "(untitled)",
    summary: entry.contentSnippet || entry.content || entry.summary || null,
    publishedAt: entry.isoDate ? new Date(entry.isoDate) : new Date(),
    author: entry.creator || entry.author || null,
    heroImageUrl: extractHeroImage(entry),
  }));

  return {
    items,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    notModified: false,
  };
}

function extractHeroImage(entry: RssParser.Item): string | null {
  // Check media:content / media:thumbnail via rss-parser's custom fields
  const media = (entry as Record<string, unknown>)["media:content"];
  if (media && typeof media === "object") {
    const url = (media as Record<string, unknown>)["$"]
      ? ((media as Record<string, unknown>)["$"] as Record<string, string>)?.url
      : undefined;
    if (url) return url;
  }

  const thumbnail = (entry as Record<string, unknown>)["media:thumbnail"];
  if (thumbnail && typeof thumbnail === "object") {
    const url = (thumbnail as Record<string, unknown>)["$"]
      ? ((thumbnail as Record<string, unknown>)["$"] as Record<string, string>)?.url
      : undefined;
    if (url) return url;
  }

  // Check enclosure
  const enclosures = entry.enclosure;
  if (enclosures && typeof enclosures === "object") {
    const enc = enclosures as unknown as Record<string, string>;
    if (enc.type?.startsWith("image/") && enc.url) {
      return enc.url;
    }
  }

  // Try to extract from content HTML
  const content = entry.content || "";
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1]) {
    return imgMatch[1];
  }

  return null;
}
