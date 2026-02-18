import { afterEach, describe, expect, it, vi } from "vitest";
import type { DueFeed } from "../../../services/feed-service.js";
import { pollFeed, validateFeedUrl } from "../poll-feed.js";

function makeFeed(overrides: Partial<DueFeed> = {}): DueFeed {
  return {
    id: "feed-1",
    accountId: "account-1",
    url: "https://example.com/feed.xml",
    title: "Example",
    siteUrl: "https://example.com",
    folderId: "folder-1",
    weight: "neutral",
    etag: null,
    lastModified: null,
    lastPolledAt: null,
    backfillSince: null,
    classificationStatus: "classified",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("validateFeedUrl", () => {
  it("allows normal https URLs", () => {
    expect(() => validateFeedUrl("https://example.com/feed.xml")).not.toThrow();
  });

  it("blocks loopback/private addresses", () => {
    expect(() => validateFeedUrl("http://127.0.0.1/feed.xml")).toThrow("Blocked loopback address");
    expect(() => validateFeedUrl("http://10.0.0.4/feed.xml")).toThrow("Blocked private IP range");
  });
});

describe("pollFeed", () => {
  it("returns not-modified response for HTTP 304", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await pollFeed(
      makeFeed({
        etag: 'W/"123"',
        lastModified: "Mon, 10 Feb 2025 12:00:00 GMT",
      }),
    );

    expect(result).toEqual({
      items: [],
      format: null,
      etag: 'W/"123"',
      lastModified: "Mon, 10 Feb 2025 12:00:00 GMT",
      notModified: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/feed.xml",
      expect.objectContaining({
        headers: expect.objectContaining({
          "If-None-Match": 'W/"123"',
          "If-Modified-Since": "Mon, 10 Feb 2025 12:00:00 GMT",
        }),
      }),
    );
  });

  it("parses RSS with guid, author, publish date, and media image", async () => {
    const rss = `<?xml version="1.0"?>
      <rss version="2.0"
           xmlns:media="http://search.yahoo.com/mrss/"
           xmlns:dc="http://purl.org/dc/elements/1.1/"
           xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>Feed</title>
          <description>Desc</description>
          <item>
            <title>RSS Headline</title>
            <link>https://example.com/rss-story</link>
            <description><![CDATA[<p>Summary</p><img src="https://example.com/fallback.jpg"/>]]></description>
            <content:encoded><![CDATA[<p>Longer content</p>]]></content:encoded>
            <guid isPermaLink="false">rss-guid-1</guid>
            <pubDate>Mon, 10 Feb 2025 12:00:00 GMT</pubDate>
            <dc:creator>Alice</dc:creator>
            <media:content url="https://example.com/media.jpg" type="image/jpeg" />
          </item>
        </channel>
      </rss>`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(rss, {
          status: 200,
          headers: {
            etag: '"rss-etag"',
            "last-modified": "Mon, 10 Feb 2025 12:00:00 GMT",
          },
        }),
      ),
    );

    const result = await pollFeed(makeFeed());
    expect(result.notModified).toBe(false);
    expect(result.format).toBe("rss");
    expect(result.etag).toBe('"rss-etag"');
    expect(result.lastModified).toBe("Mon, 10 Feb 2025 12:00:00 GMT");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      guid: "rss-guid-1",
      url: "https://example.com/rss-story",
      title: "RSS Headline",
      author: "Alice",
      heroImageUrl: "https://example.com/media.jpg",
    });
    expect(result.items[0]?.summary).toContain("Summary");
    expect(result.items[0]?.publishedAt.toISOString()).toBe("2025-02-10T12:00:00.000Z");
  });

  it("parses Atom entries and prefers alternate/non-rel links", async () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom"
            xmlns:media="http://search.yahoo.com/mrss/">
        <id>tag:example.com,2025:feed</id>
        <title>Atom Feed</title>
        <updated>2025-02-10T12:00:00Z</updated>
        <entry>
          <id>tag:example.com,2025:entry-1</id>
          <title>Atom Headline</title>
          <updated>2025-02-10T09:30:00Z</updated>
          <link rel="related" href="https://example.com/related-link"/>
          <link href="https://example.com/atom-story"/>
          <summary>Atom summary text</summary>
          <author><name>Bob</name></author>
          <media:thumbnail url="https://example.com/atom-thumb.jpg"/>
        </entry>
      </feed>`;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(atom, { status: 200 })));

    const result = await pollFeed(makeFeed({ url: "https://example.com/atom.xml" }));
    expect(result.format).toBe("atom");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      guid: "tag:example.com,2025:entry-1",
      url: "https://example.com/atom-story",
      title: "Atom Headline",
      summary: "Atom summary text",
      author: "Bob",
      heroImageUrl: "https://example.com/atom-thumb.jpg",
    });
    expect(result.items[0]?.publishedAt.toISOString()).toBe("2025-02-10T09:30:00.000Z");
  });

  it("parses JSON Feed content and image fields", async () => {
    const jsonFeed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "JSON Feed",
      items: [
        {
          id: "json-1",
          url: "https://example.com/json-story",
          title: "JSON Headline",
          content_text: "JSON content body",
          date_published: "2025-02-11T01:02:03Z",
          image: "https://example.com/json-image.jpg",
          authors: [{ name: "Dana" }],
        },
      ],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(jsonFeed, {
          status: 200,
          headers: {
            etag: '"json-etag"',
          },
        }),
      ),
    );

    const result = await pollFeed(makeFeed({ url: "https://example.com/feed.json" }));
    expect(result.format).toBe("json");
    expect(result.etag).toBe('"json-etag"');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      guid: "json-1",
      url: "https://example.com/json-story",
      title: "JSON Headline",
      summary: "JSON content body",
      author: "Dana",
      heroImageUrl: "https://example.com/json-image.jpg",
    });
    expect(result.items[0]?.publishedAt.toISOString()).toBe("2025-02-11T01:02:03.000Z");
  });

  it("parses RDF feeds and maps dc date/creator", async () => {
    const rdf = `<?xml version="1.0"?>
      <rdf:RDF
        xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        xmlns="http://purl.org/rss/1.0/"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:media="http://search.yahoo.com/mrss/">
        <channel rdf:about="https://example.com/">
          <title>RDF Feed</title>
          <link>https://example.com/</link>
          <description>Desc</description>
        </channel>
        <item rdf:about="https://example.com/rdf-story">
          <title>RDF Headline</title>
          <link>https://example.com/rdf-story</link>
          <description><![CDATA[<p>RDF summary</p>]]></description>
          <dc:creator>Carol</dc:creator>
          <dc:date>2025-02-09T10:00:00Z</dc:date>
          <media:thumbnail url="https://example.com/rdf-thumb.jpg" />
        </item>
      </rdf:RDF>`;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rdf, { status: 200 })));

    const result = await pollFeed(makeFeed({ url: "https://example.com/rdf.xml" }));
    expect(result.format).toBe("rdf");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      guid: "https://example.com/rdf-story",
      url: "https://example.com/rdf-story",
      title: "RDF Headline",
      summary: "<p>RDF summary</p>",
      author: "Carol",
      heroImageUrl: "https://example.com/rdf-thumb.jpg",
    });
    expect(result.items[0]?.publishedAt.toISOString()).toBe("2025-02-09T10:00:00.000Z");
  });
});
