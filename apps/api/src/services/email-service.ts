import type { FastifyBaseLogger } from "fastify";
import type { ApiEnv } from "../config/env";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export function createEmailService(env: ApiEnv, logger: FastifyBaseLogger) {
  const from = env.EMAIL_FROM ?? "RSS Wrangler <no-reply@rss-wrangler.local>";

  async function send(input: SendEmailInput): Promise<"sent" | "skipped"> {
    if (!env.RESEND_API_KEY) {
      logger.info(
        { to: input.to, subject: input.subject },
        "RESEND_API_KEY not configured; skipping transactional email delivery",
      );
      return "skipped";
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      logger.error(
        { status: response.status, details, to: input.to, subject: input.subject },
        "failed to send transactional email",
      );
      throw new Error("failed to send transactional email");
    }

    return "sent";
  }

  return { send };
}
