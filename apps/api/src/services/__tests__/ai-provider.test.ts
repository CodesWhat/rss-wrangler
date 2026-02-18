import {
  createAiRegistry,
  createAnthropicProvider,
  createOllamaProvider,
  createOpenAiProvider,
} from "@rss-wrangler/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("createAiRegistry", () => {
  it("returns null when no providers configured", () => {
    const registry = createAiRegistry({});
    expect(registry.getProvider()).toBeNull();
    expect(registry.listAvailable()).toEqual([]);
  });

  it("returns OpenAI provider when OPENAI_API_KEY set", () => {
    const registry = createAiRegistry({ OPENAI_API_KEY: "sk-test" });
    const provider = registry.getProvider();
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe("openai");
    expect(registry.listAvailable()).toContain("openai");
  });

  it("returns Anthropic provider when ANTHROPIC_API_KEY set", () => {
    const registry = createAiRegistry({ ANTHROPIC_API_KEY: "sk-ant-test" });
    const provider = registry.getProvider();
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe("anthropic");
    expect(registry.listAvailable()).toContain("anthropic");
  });

  it("returns Ollama provider when OLLAMA_BASE_URL set", () => {
    const registry = createAiRegistry({ OLLAMA_BASE_URL: "http://localhost:11434" });
    const provider = registry.getProvider();
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe("ollama");
    expect(registry.listAvailable()).toContain("ollama");
  });

  it("respects AI_PROVIDER preference", () => {
    const registry = createAiRegistry({
      OPENAI_API_KEY: "sk-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
      AI_PROVIDER: "anthropic",
    });
    const provider = registry.getProvider();
    expect(provider!.name).toBe("anthropic");
  });

  it("falls back to first available when AI_PROVIDER not set", () => {
    const registry = createAiRegistry({
      OPENAI_API_KEY: "sk-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    const provider = registry.getProvider();
    expect(provider).not.toBeNull();
    expect(["openai", "anthropic"]).toContain(provider!.name);
  });

  it("returns specific provider by name", () => {
    const registry = createAiRegistry({
      OPENAI_API_KEY: "sk-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(registry.getProvider("anthropic")!.name).toBe("anthropic");
    expect(registry.getProvider("openai")!.name).toBe("openai");
  });

  it("returns null for unknown provider name", () => {
    const registry = createAiRegistry({ OPENAI_API_KEY: "sk-test" });
    expect(registry.getProvider("nonexistent")).toBeNull();
  });

  it("ignores AI_PROVIDER preference when that provider is not available", () => {
    const registry = createAiRegistry({
      OPENAI_API_KEY: "sk-test",
      AI_PROVIDER: "anthropic",
    });
    const provider = registry.getProvider();
    expect(provider!.name).toBe("openai");
  });

  it("lists all available providers", () => {
    const registry = createAiRegistry({
      OPENAI_API_KEY: "sk-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
      OLLAMA_BASE_URL: "http://localhost:11434",
    });
    const available = registry.listAvailable();
    expect(available).toContain("openai");
    expect(available).toContain("anthropic");
    expect(available).toContain("ollama");
    expect(available).toHaveLength(3);
  });
});

describe("provider isAvailable", () => {
  it("openai isAvailable returns true with key", () => {
    const p = createOpenAiProvider("sk-test");
    expect(p.isAvailable()).toBe(true);
  });

  it("openai isAvailable returns false with empty key", () => {
    const p = createOpenAiProvider("");
    expect(p.isAvailable()).toBe(false);
  });

  it("anthropic isAvailable returns true with key", () => {
    const p = createAnthropicProvider("sk-ant-test");
    expect(p.isAvailable()).toBe(true);
  });

  it("anthropic isAvailable returns false with empty key", () => {
    const p = createAnthropicProvider("");
    expect(p.isAvailable()).toBe(false);
  });

  it("ollama isAvailable always returns true", () => {
    const p = createOllamaProvider("http://localhost:11434");
    expect(p.isAvailable()).toBe(true);
  });
});

describe("OpenAI provider complete", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("parses successful response correctly", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello world" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model: "gpt-4o-mini",
      }),
    });

    const provider = createOpenAiProvider("sk-test");
    const result = await provider.complete({
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.text).toBe("Hello world");
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.provider).toBe("openai");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles API errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    const provider = createOpenAiProvider("sk-test");
    const result = await provider.complete({
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.text).toContain("[openai error]");
    expect(result.text).toContain("rate limited");
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.provider).toBe("openai");
  });

  it("handles network errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const provider = createOpenAiProvider("sk-test");
    const result = await provider.complete({
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.text).toContain("[openai error]");
    expect(result.text).toContain("ECONNREFUSED");
    expect(result.provider).toBe("openai");
  });

  it("sends correct headers", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    });
    globalThis.fetch = fetchMock;

    const provider = createOpenAiProvider("sk-my-key");
    await provider.complete({ messages: [{ role: "user", content: "test" }] });

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer sk-my-key");
  });
});

describe("Anthropic provider complete", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("parses successful response correctly", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Anthropic reply" }],
        usage: { input_tokens: 15, output_tokens: 8 },
        model: "claude-sonnet-4-5-20250929",
      }),
    });

    const provider = createAnthropicProvider("sk-ant-test");
    const result = await provider.complete({
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hi" },
      ],
    });

    expect(result.text).toBe("Anthropic reply");
    expect(result.inputTokens).toBe(15);
    expect(result.outputTokens).toBe(8);
    expect(result.model).toBe("claude-sonnet-4-5-20250929");
    expect(result.provider).toBe("anthropic");
  });

  it("sends system message separately", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });
    globalThis.fetch = fetchMock;

    const provider = createAnthropicProvider("sk-ant-test");
    await provider.complete({
      messages: [
        { role: "system", content: "Be brief" },
        { role: "user", content: "Hi" },
      ],
    });

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.system).toBe("Be brief");
    expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("sends correct headers", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });
    globalThis.fetch = fetchMock;

    const provider = createAnthropicProvider("sk-ant-key");
    await provider.complete({ messages: [{ role: "user", content: "test" }] });

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = opts.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("handles API errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "internal server error",
    });

    const provider = createAnthropicProvider("sk-ant-test");
    const result = await provider.complete({
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.text).toContain("[anthropic error]");
    expect(result.inputTokens).toBe(0);
  });
});

describe("Ollama provider complete", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("parses successful response correctly", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: { content: "Ollama reply" },
        prompt_eval_count: 20,
        eval_count: 12,
        model: "llama3.2",
      }),
    });

    const provider = createOllamaProvider("http://localhost:11434");
    const result = await provider.complete({
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.text).toBe("Ollama reply");
    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(12);
    expect(result.model).toBe("llama3.2");
    expect(result.provider).toBe("ollama");
  });

  it("uses correct endpoint URL", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: { content: "ok" },
      }),
    });
    globalThis.fetch = fetchMock;

    const provider = createOllamaProvider("http://myhost:11434");
    await provider.complete({ messages: [{ role: "user", content: "test" }] });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://myhost:11434/api/chat");
  });

  it("strips trailing slash from base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: { content: "ok" },
      }),
    });
    globalThis.fetch = fetchMock;

    const provider = createOllamaProvider("http://myhost:11434/");
    await provider.complete({ messages: [{ role: "user", content: "test" }] });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://myhost:11434/api/chat");
  });

  it("handles network errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const provider = createOllamaProvider("http://localhost:11434");
    const result = await provider.complete({
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.text).toContain("[ollama error]");
    expect(result.text).toContain("ECONNREFUSED");
    expect(result.provider).toBe("ollama");
  });
});
