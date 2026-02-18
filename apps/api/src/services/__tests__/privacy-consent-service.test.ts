import { describe, expect, it } from "vitest";
import {
  normalizeCountryCode,
  requiresExplicitConsent,
  resolveCountryCode,
} from "../privacy-consent-service";

describe("privacy-consent-service", () => {
  it("normalizes valid country codes", () => {
    expect(normalizeCountryCode(" us ")).toBe("US");
    expect(normalizeCountryCode("gb")).toBe("GB");
  });

  it("rejects invalid country values", () => {
    expect(normalizeCountryCode("USA")).toBeNull();
    expect(normalizeCountryCode("1")).toBeNull();
    expect(normalizeCountryCode(null)).toBeNull();
  });

  it("resolves the first available proxy country header", () => {
    const country = resolveCountryCode({
      "x-vercel-ip-country": "de",
      "cf-ipcountry": "us",
    });

    expect(country).toBe("DE");
  });

  it("flags explicit-consent regions", () => {
    expect(requiresExplicitConsent("DE")).toBe(true);
    expect(requiresExplicitConsent("GB")).toBe(true);
    expect(requiresExplicitConsent("US")).toBe(false);
    expect(requiresExplicitConsent(null)).toBe(false);
  });
});
