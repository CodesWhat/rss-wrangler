/**
 * Strip markdown code fences from LLM responses.
 *
 * Ollama and smaller models commonly wrap JSON responses in
 * ```json ... ``` fences. This utility removes them so
 * JSON.parse() can handle the content directly.
 */
export function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
}
