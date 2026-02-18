export interface AiCompletionRequest {
  model?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export interface AiCompletionResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  durationMs: number;
}

export interface AiProviderAdapter {
  readonly name: string;
  complete(req: AiCompletionRequest): Promise<AiCompletionResponse>;
  isAvailable(): boolean;
}
