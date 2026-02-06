import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5432/rss_wrangler"),
  WORKER_POLL_MINUTES: z.coerce.number().int().min(5).default(60),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  OPENAI_API_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_CONTACT: z.string().default("mailto:admin@localhost")
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadEnv(): WorkerEnv {
  return envSchema.parse(process.env);
}
