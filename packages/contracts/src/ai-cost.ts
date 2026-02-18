/**
 * Shared AI model cost table — single source of truth for both API and worker.
 * Costs are [inputCostPerMillionTokens, outputCostPerMillionTokens].
 *
 * Ollama/local models are free ($0).
 */
export const MODEL_COST_TABLE: Record<string, [number, number]> = {
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4o": [2.5, 10.0],
  "claude-sonnet-4-5-20250929": [3.0, 15.0],
  "claude-sonnet": [3.0, 15.0],
  "claude-haiku-4-5-20251001": [0.8, 4.0],
  "claude-haiku": [0.8, 4.0],
};

/**
 * Estimate the USD cost of an AI completion.
 *
 * Recognises Ollama models by provider name in the model string or by
 * the absence of a match in the cost table combined with the provider
 * being "ollama".
 */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  provider?: string,
): number {
  // Exact model match in cost table
  const costs = MODEL_COST_TABLE[model];
  if (costs) {
    return (inputTokens * costs[0] + outputTokens * costs[1]) / 1_000_000;
  }

  // Ollama / local models are free — check both prefix convention and provider name
  if (model.startsWith("ollama/") || model.startsWith("local/") || provider === "ollama") {
    return 0;
  }

  // Unknown cloud model: use gpt-4o-mini pricing as a conservative default
  const fallback = MODEL_COST_TABLE["gpt-4o-mini"]!;
  return (inputTokens * fallback[0] + outputTokens * fallback[1]) / 1_000_000;
}
