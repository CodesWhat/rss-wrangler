import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_HOST: z.string().default("0.0.0.0"),
    API_CORS_ORIGIN: z.string().default("*"),
    DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/rss_wrangler"),
    AUTH_JWT_SECRET: z.string().min(32),
    AUTH_USERNAME: z.string().min(1),
    AUTH_PASSWORD: z.string().min(8),
    APP_BASE_URL: z.string().url().default("http://localhost:3000"),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_TTL: z.string().default("30d"),
    PASSWORD_RESET_TOKEN_TTL: z.string().default("1h"),
    EMAIL_VERIFICATION_TOKEN_TTL: z.string().default("24h"),
    REQUIRE_EMAIL_VERIFICATION: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().min(3).optional(),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    LEMON_SQUEEZY_API_BASE_URL: z.string().url().default("https://api.lemonsqueezy.com/v1"),
    LEMON_SQUEEZY_API_KEY: z.string().optional(),
    LEMON_SQUEEZY_STORE_ID: z.string().optional(),
    LEMON_SQUEEZY_WEBHOOK_SECRET: z.string().optional(),
    LEMON_SQUEEZY_VARIANT_PRO: z.string().optional(),
    LEMON_SQUEEZY_VARIANT_PRO_AI: z.string().optional(),
    LEMON_SQUEEZY_VARIANT_PRO_ANNUAL: z.string().optional(),
    LEMON_SQUEEZY_VARIANT_PRO_AI_ANNUAL: z.string().optional(),
    BILLING_ALERT_WEBHOOK_URL: z.string().url().optional(),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_PROVIDER: z.string().optional(),
    OLLAMA_BASE_URL: z.string().optional(),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  })
  .refine((env) => env.AUTH_JWT_SECRET !== "change-me-change-me", {
    message: "AUTH_JWT_SECRET must not use the placeholder value",
    path: ["AUTH_JWT_SECRET"],
  });

export type ApiEnv = z.infer<typeof envSchema>;

export function loadEnv(): ApiEnv {
  return envSchema.parse(process.env);
}
