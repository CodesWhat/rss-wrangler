import type { IncomingHttpHeaders } from "node:http";

const EXPLICIT_CONSENT_COUNTRIES = new Set<string>([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "GB",
  "CH"
]);

function pickHeaderValue(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.find((entry) => entry.trim().length > 0)?.trim() ?? null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeCountryCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalized = input.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function resolveCountryCode(headers: IncomingHttpHeaders): string | null {
  const headerCandidates = [
    pickHeaderValue(headers["x-vercel-ip-country"]),
    pickHeaderValue(headers["cf-ipcountry"]),
    pickHeaderValue(headers["cloudfront-viewer-country"]),
    pickHeaderValue(headers["x-country-code"])
  ];

  for (const candidate of headerCandidates) {
    const normalized = normalizeCountryCode(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function requiresExplicitConsent(countryCode: string | null): boolean {
  if (!countryCode) {
    return false;
  }
  return EXPLICIT_CONSENT_COUNTRIES.has(countryCode);
}
