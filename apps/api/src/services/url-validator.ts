import { isIP } from "node:net";

/**
 * Validates a feed URL to prevent SSRF attacks.
 * Returns an error message string if the URL is invalid, or null if it's safe.
 */
export function validateFeedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid URL";
  }

  // Only allow http and https protocols
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "only http and https URLs are allowed";
  }

  // Block URLs with credentials
  if (parsed.username || parsed.password) {
    return "URLs with credentials are not allowed";
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and loopback
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  ) {
    return "localhost URLs are not allowed";
  }

  // Block private/reserved IP ranges
  // URL.hostname keeps brackets for IPv6 (e.g., "[fc00::1]"), strip them for checks
  const bareHost = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (isIP(bareHost) || bareHost.includes(":")) {
    if (isPrivateIp(bareHost)) {
      return "private IP addresses are not allowed";
    }
  }

  // Block common internal hostnames
  if (
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localhost")
  ) {
    return "internal hostnames are not allowed";
  }

  return null;
}

function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges
  const parts = ip.split(".").map(Number);
  if (parts.length === 4) {
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
  }

  // IPv6 - block link-local (fe80::) and loopback (::1)
  if (ip.startsWith("fe80:") || ip === "::1") return true;
  // IPv6 unique local (fc00::/7)
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  // IPv4-mapped IPv6 - dotted form (::ffff:127.0.0.1)
  const v4mappedDotted = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (v4mappedDotted?.[1]) return isPrivateIp(v4mappedDotted[1]);
  // IPv4-mapped IPv6 - hex form (::ffff:7f00:1) as normalized by URL parser
  const v4mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (v4mappedHex) {
    const hi = parseInt(v4mappedHex[1]!, 16);
    const lo = parseInt(v4mappedHex[2]!, 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    const c = (lo >> 8) & 0xff;
    const d = lo & 0xff;
    return isPrivateIp(`${a}.${b}.${c}.${d}`);
  }

  return false;
}
