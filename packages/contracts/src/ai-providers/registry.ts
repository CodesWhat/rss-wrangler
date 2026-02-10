import type { AiProviderAdapter } from "../ai-provider.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createOllamaProvider } from "./ollama.js";
import { createOpenAiProvider } from "./openai.js";

export interface AiRegistry {
  getProvider(name?: string): AiProviderAdapter | null;
  listAvailable(): string[];
}

export function createAiRegistry(env: {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  AI_PROVIDER?: string;
  OLLAMA_BASE_URL?: string;
}): AiRegistry {
  const providers = new Map<string, AiProviderAdapter>();

  if (env.OPENAI_API_KEY) {
    const p = createOpenAiProvider(env.OPENAI_API_KEY);
    if (p.isAvailable()) {
      providers.set(p.name, p);
    }
  }

  if (env.ANTHROPIC_API_KEY) {
    const p = createAnthropicProvider(env.ANTHROPIC_API_KEY);
    if (p.isAvailable()) {
      providers.set(p.name, p);
    }
  }

  if (env.OLLAMA_BASE_URL) {
    const p = createOllamaProvider(env.OLLAMA_BASE_URL);
    providers.set(p.name, p);
  }

  const defaultName = env.AI_PROVIDER ?? null;

  return {
    getProvider(name?: string): AiProviderAdapter | null {
      if (name) {
        return providers.get(name) ?? null;
      }
      if (defaultName && providers.has(defaultName)) {
        return providers.get(defaultName)!;
      }
      const first = providers.values().next();
      return first.done ? null : first.value;
    },

    listAvailable(): string[] {
      return [...providers.keys()];
    },
  };
}
