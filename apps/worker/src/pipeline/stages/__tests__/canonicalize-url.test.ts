import { describe, it, expect } from "vitest";
import { canonicalizeUrl } from "../canonicalize-url.js";

describe("canonicalizeUrl", () => {
  // Protocol normalization
  it("upgrades http to https", () => {
    expect(canonicalizeUrl("http://example.com/article")).toBe(
      "https://example.com/article"
    );
  });

  it("keeps https as-is", () => {
    expect(canonicalizeUrl("https://example.com/article")).toBe(
      "https://example.com/article"
    );
  });

  // www stripping
  it("strips www prefix", () => {
    expect(canonicalizeUrl("https://www.example.com/page")).toBe(
      "https://example.com/page"
    );
  });

  it("does not strip www from subdomain like www2", () => {
    const result = canonicalizeUrl("https://www2.example.com/page");
    expect(result).toContain("www2.example.com");
  });

  // Trailing slash removal
  it("removes trailing slash from paths", () => {
    expect(canonicalizeUrl("https://example.com/article/")).toBe(
      "https://example.com/article"
    );
  });

  it("keeps root slash", () => {
    const result = canonicalizeUrl("https://example.com/");
    expect(result).toBe("https://example.com/");
  });

  // Tracking parameter removal
  it("removes utm_source param", () => {
    expect(
      canonicalizeUrl("https://example.com/page?utm_source=twitter&id=123")
    ).toBe("https://example.com/page?id=123");
  });

  it("removes fbclid param", () => {
    expect(
      canonicalizeUrl("https://example.com/page?fbclid=abc123")
    ).toBe("https://example.com/page");
  });

  it("removes multiple tracking params at once", () => {
    const url =
      "https://example.com/page?utm_source=x&utm_medium=y&utm_campaign=z&keep=1";
    const result = canonicalizeUrl(url);
    expect(result).toBe("https://example.com/page?keep=1");
  });

  // Query param sorting
  it("sorts remaining query params", () => {
    expect(
      canonicalizeUrl("https://example.com/page?z=1&a=2&m=3")
    ).toBe("https://example.com/page?a=2&m=3&z=1");
  });

  // Fragment removal
  it("removes URL fragment", () => {
    expect(
      canonicalizeUrl("https://example.com/page#section-2")
    ).toBe("https://example.com/page");
  });

  // Invalid URLs
  it("returns invalid URLs as-is", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
    expect(canonicalizeUrl("")).toBe("");
  });

  // Combined transformations
  it("applies all transformations together", () => {
    const raw =
      "http://www.Example.COM/blog/post/?utm_source=twitter&fbclid=abc&tag=news#comments";
    const result = canonicalizeUrl(raw);
    expect(result).toBe("https://example.com/blog/post?tag=news");
  });

  // Hostname lowercasing
  it("lowercases the hostname", () => {
    expect(canonicalizeUrl("https://EXAMPLE.COM/Page")).toBe(
      "https://example.com/Page"
    );
  });
});
