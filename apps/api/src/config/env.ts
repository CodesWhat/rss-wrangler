import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  API_CORS_ORIGIN: z.string().default("*"),
  AUTH_JWT_SECRET: z.string().min(16).default("change-me-change-me"),
  AUTH_USERNAME: z.string().default("admin"),
  AUTH_PASSWORD: z.string().default("admin"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("30d")
});

export type ApiEnv = z.infer<typeof envSchema>;

export function loadEnv(): ApiEnv {
  return envSchema.parse(process.env);
}
