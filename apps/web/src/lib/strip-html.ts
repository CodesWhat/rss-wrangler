/**
 * Strip HTML tags and decode common HTML entities from a string.
 * Used to sanitize feed-provided summaries for plain-text display contexts.
 */
export function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
