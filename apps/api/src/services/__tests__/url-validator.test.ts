import { describe, it, expect } from "vitest";
import { validateFeedUrl } from "../url-validator";

describe("validateFeedUrl", () => {
  it("accepts valid http URLs", () => {
    expect(validateFeedUrl("http://example.com/feed.xml")).toBeNull();
  });

  it("accepts valid https URLs", () => {
    expect(validateFeedUrl("https://example.com/rss")).toBeNull();
  });

  it("rejects non-HTTP protocols", () => {
    expect(validateFeedUrl("ftp://example.com/feed")).not.toBeNull();
    expect(validateFeedUrl("file:///etc/passwd")).not.toBeNull();
    expect(validateFeedUrl("javascript:alert(1)")).not.toBeNull();
  });

  it("rejects invalid URLs", () => {
    expect(validateFeedUrl("not a url")).not.toBeNull();
  });

  it("rejects URLs with credentials", () => {
    expect(validateFeedUrl("https://user:pass@example.com/feed")).not.toBeNull();
  });

  it("rejects localhost", () => {
    expect(validateFeedUrl("http://localhost/feed")).not.toBeNull();
    expect(validateFeedUrl("http://localhost:3000/feed")).not.toBeNull();
  });

  it("rejects 127.0.0.1 loopback", () => {
    expect(validateFeedUrl("http://127.0.0.1/feed")).not.toBeNull();
    expect(validateFeedUrl("http://127.0.0.1:8080/feed")).not.toBeNull();
  });

  it("rejects 0.0.0.0", () => {
    expect(validateFeedUrl("http://0.0.0.0/feed")).not.toBeNull();
  });

  it("rejects 10.x.x.x private range", () => {
    expect(validateFeedUrl("http://10.0.0.1/feed")).not.toBeNull();
    expect(validateFeedUrl("http://10.255.255.255/feed")).not.toBeNull();
  });

  it("rejects 172.16-31.x.x private range", () => {
    expect(validateFeedUrl("http://172.16.0.1/feed")).not.toBeNull();
    expect(validateFeedUrl("http://172.31.255.255/feed")).not.toBeNull();
    // 172.15.x and 172.32.x are public
    expect(validateFeedUrl("http://172.15.0.1/feed")).toBeNull();
    expect(validateFeedUrl("http://172.32.0.1/feed")).toBeNull();
  });

  it("rejects 192.168.x.x private range", () => {
    expect(validateFeedUrl("http://192.168.1.1/feed")).not.toBeNull();
    expect(validateFeedUrl("http://192.168.0.100/feed")).not.toBeNull();
  });

  it("rejects 169.254.x.x link-local", () => {
    expect(validateFeedUrl("http://169.254.1.1/feed")).not.toBeNull();
  });

  it("rejects .local / .internal / .localhost hostnames", () => {
    expect(validateFeedUrl("http://myserver.local/feed")).not.toBeNull();
    expect(validateFeedUrl("http://api.internal/feed")).not.toBeNull();
    expect(validateFeedUrl("http://app.localhost/feed")).not.toBeNull();
  });

  it("rejects IPv6 loopback ::1", () => {
    expect(validateFeedUrl("http://[::1]/feed")).not.toBeNull();
  });

  it("rejects IPv6 unique local (fc/fd)", () => {
    expect(validateFeedUrl("http://[fc00::1]/feed")).not.toBeNull();
    expect(validateFeedUrl("http://[fd12::1]/feed")).not.toBeNull();
  });

  it("rejects IPv6 link-local (fe80)", () => {
    expect(validateFeedUrl("http://[fe80::1]/feed")).not.toBeNull();
  });

  it("rejects IPv4-mapped IPv6 private addresses", () => {
    expect(validateFeedUrl("http://[::ffff:127.0.0.1]/feed")).not.toBeNull();
    expect(validateFeedUrl("http://[::ffff:10.0.0.1]/feed")).not.toBeNull();
    expect(validateFeedUrl("http://[::ffff:192.168.1.1]/feed")).not.toBeNull();
  });
});
