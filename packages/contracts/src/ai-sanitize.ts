/**
 * Sanitize user-sourced text before inserting into LLM prompts.
 *
 * Defenses (layered per OWASP LLM Top 10 2025):
 * 1. Hard truncation to prevent token-budget abuse
 * 2. Strip common prompt-injection markers
 * 3. Callers should wrap sanitized text in XML delimiters for structural separation
 */

const INJECTION_LINE_PREFIXES = [
  "ignore previous",
  "ignore all",
  "disregard",
  "system:",
  "assistant:",
  "instructions:",
  "forget everything",
  "new instructions",
  "override",
];

/**
 * Sanitize a user-sourced string for safe inclusion in an LLM prompt.
 *
 * @param text - Raw user/feed content
 * @param maxLen - Hard character limit (default 500 for titles, use 2000 for bodies)
 * @returns Sanitized string safe for prompt interpolation
 */
export function sanitizeForPrompt(text: string, maxLen = 500): string {
  let cleaned = text.slice(0, maxLen);

  // Strip lines that look like injection attempts
  cleaned = cleaned
    .split("\n")
    .filter((line) => {
      const lower = line.trim().toLowerCase();
      return !INJECTION_LINE_PREFIXES.some((prefix) => lower.startsWith(prefix));
    })
    .join("\n");

  // Strip XML-like delimiter tags that could confuse structured prompts
  cleaned = cleaned.replace(/<\/?(?:system|user|assistant|instructions?|prompt)[^>]*>/gi, "");

  return cleaned.trim();
}
