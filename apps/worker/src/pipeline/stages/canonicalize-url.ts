// Tracking parameters commonly appended by analytics/social platforms
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "twclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
  "s",
  "_hsenc",
  "_hsmi",
]);

export function canonicalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // If the URL is not valid, return as-is
    return rawUrl;
  }

  // Force https
  if (url.protocol === "http:") {
    url.protocol = "https:";
  }

  // Normalize www: strip www. prefix
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
  }

  // Lowercase hostname
  url.hostname = url.hostname.toLowerCase();

  // Remove trailing slash from path (unless root)
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  // Strip tracking params
  for (const param of TRACKING_PARAMS) {
    url.searchParams.delete(param);
  }

  // Sort remaining params for consistent ordering
  url.searchParams.sort();

  // Strip fragment
  url.hash = "";

  return url.toString();
}
