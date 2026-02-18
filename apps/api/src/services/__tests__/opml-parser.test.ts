import { describe, expect, it } from "vitest";
import type { OpmlFeed } from "../opml-parser.js";
import { parseOpml } from "../opml-parser.js";

describe("parseOpml", () => {
  it("parses a simple flat feed list", () => {
    const xml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Hacker News" xmlUrl="https://news.ycombinator.com/rss" htmlUrl="https://news.ycombinator.com"/>
    <outline text="Lobsters" xmlUrl="https://lobste.rs/rss" htmlUrl="https://lobste.rs"/>
  </body>
</opml>`;

    const feeds = parseOpml(xml);
    expect(feeds).toHaveLength(2);
    expect(feeds[0]).toEqual<OpmlFeed>({
      xmlUrl: "https://news.ycombinator.com/rss",
      title: "Hacker News",
      htmlUrl: "https://news.ycombinator.com",
      category: null,
    });
    expect(feeds[1]!.xmlUrl).toBe("https://lobste.rs/rss");
  });

  it("parses nested categories", () => {
    const xml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline text="Ars Technica" xmlUrl="https://arstechnica.com/feed/" htmlUrl="https://arstechnica.com"/>
      <outline text="The Verge" xmlUrl="https://theverge.com/rss/index.xml"/>
    </outline>
    <outline text="News">
      <outline text="Reuters" xmlUrl="https://reuters.com/rss"/>
    </outline>
  </body>
</opml>`;

    const feeds = parseOpml(xml);
    expect(feeds).toHaveLength(3);
    expect(feeds[0]!.category).toBe("Tech");
    expect(feeds[1]!.category).toBe("Tech");
    expect(feeds[2]!.category).toBe("News");
  });

  it("handles self-closing outline tags", () => {
    const xml = `<opml><body>
    <outline text="Feed" xmlUrl="https://example.com/rss" />
  </body></opml>`;

    const feeds = parseOpml(xml);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]!.xmlUrl).toBe("https://example.com/rss");
  });

  it("decodes XML entities in attributes", () => {
    const xml = `<opml><body>
    <outline text="Tom &amp; Jerry&apos;s Feed" xmlUrl="https://example.com/rss?a=1&amp;b=2"/>
  </body></opml>`;

    const feeds = parseOpml(xml);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]!.title).toBe("Tom & Jerry's Feed");
    expect(feeds[0]!.xmlUrl).toBe("https://example.com/rss?a=1&b=2");
  });

  it("skips folder nodes that have no xmlUrl", () => {
    const xml = `<opml><body>
    <outline text="Category Only">
      <outline text="Child Feed" xmlUrl="https://example.com/feed"/>
    </outline>
  </body></opml>`;

    const feeds = parseOpml(xml);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]!.title).toBe("Child Feed");
    expect(feeds[0]!.category).toBe("Category Only");
  });

  it("returns empty array for missing body", () => {
    const xml = `<opml><head><title>My Feeds</title></head></opml>`;
    expect(parseOpml(xml)).toEqual([]);
  });

  it("returns empty array for empty body", () => {
    const xml = `<opml><body></body></opml>`;
    expect(parseOpml(xml)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseOpml("")).toEqual([]);
  });

  it("uses text attribute as fallback when title is missing", () => {
    const xml = `<opml><body>
    <outline text="Text Title" xmlUrl="https://example.com/rss"/>
  </body></opml>`;

    const feeds = parseOpml(xml);
    expect(feeds[0]!.title).toBe("Text Title");
  });

  it("uses xmlUrl as title fallback when both title and text are missing", () => {
    const xml = `<opml><body>
    <outline xmlUrl="https://example.com/rss"/>
  </body></opml>`;

    const feeds = parseOpml(xml);
    expect(feeds[0]!.title).toBe("https://example.com/rss");
  });

  it("sets htmlUrl to null when not present", () => {
    const xml = `<opml><body>
    <outline text="Feed" xmlUrl="https://example.com/rss"/>
  </body></opml>`;

    const feeds = parseOpml(xml);
    expect(feeds[0]!.htmlUrl).toBeNull();
  });

  it("handles single-quoted attributes", () => {
    const xml = `<opml><body>
    <outline text='Single Quoted' xmlUrl='https://example.com/rss'/>
  </body></opml>`;

    const feeds = parseOpml(xml);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]!.title).toBe("Single Quoted");
  });
});
