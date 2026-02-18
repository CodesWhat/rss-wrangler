import type {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
} from "../ai-provider.js";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export function createAnthropicProvider(apiKey: string): AiProviderAdapter {
  return {
    name: "anthropic",

    isAvailable() {
      return apiKey.length > 0;
    },

    async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
      const model = req.model ?? DEFAULT_MODEL;
      const start = Date.now();

      const systemMessage = req.messages.find((m) => m.role === "system");
      const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

      const payload: Record<string, unknown> = {
        model,
        max_tokens: req.maxTokens ?? 1024,
        messages: nonSystemMessages,
      };

      if (systemMessage) {
        payload.system = systemMessage.content;
      }

      if (req.temperature !== undefined) {
        payload.temperature = req.temperature;
      }

      let res: Response;
      try {
        res = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": API_VERSION,
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        const durationMs = Date.now() - start;
        return {
          text: `[anthropic error] ${err instanceof Error ? err.message : "network error"}`,
          inputTokens: 0,
          outputTokens: 0,
          model,
          provider: "anthropic",
          durationMs,
        };
      }

      const durationMs = Date.now() - start;

      if (!res.ok) {
        let errorText: string;
        try {
          errorText = await res.text();
        } catch {
          errorText = `HTTP ${res.status}`;
        }
        return {
          text: `[anthropic error] ${errorText}`,
          inputTokens: 0,
          outputTokens: 0,
          model,
          provider: "anthropic",
          durationMs,
        };
      }

      const body = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
        model?: string;
      };

      const textBlock = body.content?.find((c) => c.type === "text");

      return {
        text: textBlock?.text ?? "",
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
        model: body.model ?? model,
        provider: "anthropic",
        durationMs,
      };
    },
  };
}
