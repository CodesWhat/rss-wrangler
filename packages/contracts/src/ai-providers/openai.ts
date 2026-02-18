import type {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderAdapter,
} from "../ai-provider.js";

const DEFAULT_MODEL = "gpt-4o-mini";
const API_URL = "https://api.openai.com/v1/chat/completions";

export function createOpenAiProvider(apiKey: string): AiProviderAdapter {
  return {
    name: "openai",

    isAvailable() {
      return apiKey.length > 0;
    },

    async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
      const model = req.model ?? DEFAULT_MODEL;
      const start = Date.now();

      let res: Response;
      try {
        res = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: req.messages,
            max_tokens: req.maxTokens,
            temperature: req.temperature,
          }),
        });
      } catch (err) {
        const durationMs = Date.now() - start;
        return {
          text: `[openai error] ${err instanceof Error ? err.message : "network error"}`,
          inputTokens: 0,
          outputTokens: 0,
          model,
          provider: "openai",
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
          text: `[openai error] ${errorText}`,
          inputTokens: 0,
          outputTokens: 0,
          model,
          provider: "openai",
          durationMs,
        };
      }

      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        model?: string;
      };

      return {
        text: body.choices?.[0]?.message?.content ?? "",
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
        model: body.model ?? model,
        provider: "openai",
        durationMs,
      };
    },
  };
}
