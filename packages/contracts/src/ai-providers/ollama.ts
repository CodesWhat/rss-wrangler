import type { AiCompletionRequest, AiCompletionResponse, AiProviderAdapter } from "../ai-provider.js";

const DEFAULT_MODEL = "llama3.2";
const DEFAULT_BASE_URL = "http://localhost:11434";

export function createOllamaProvider(baseUrl?: string): AiProviderAdapter {
  const url = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

  return {
    name: "ollama",

    isAvailable() {
      return true;
    },

    async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
      const model = req.model ?? DEFAULT_MODEL;
      const start = Date.now();

      let res: Response;
      try {
        res = await fetch(`${url}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: req.messages,
            stream: false,
            options: {
              num_predict: req.maxTokens,
              temperature: req.temperature,
            },
          }),
        });
      } catch (err) {
        const durationMs = Date.now() - start;
        return {
          text: `[ollama error] ${err instanceof Error ? err.message : "network error"}`,
          inputTokens: 0,
          outputTokens: 0,
          model,
          provider: "ollama",
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
          text: `[ollama error] ${errorText}`,
          inputTokens: 0,
          outputTokens: 0,
          model,
          provider: "ollama",
          durationMs,
        };
      }

      const body = (await res.json()) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
        model?: string;
      };

      return {
        text: body.message?.content ?? "",
        inputTokens: body.prompt_eval_count ?? 0,
        outputTokens: body.eval_count ?? 0,
        model: body.model ?? model,
        provider: "ollama",
        durationMs,
      };
    },
  };
}
