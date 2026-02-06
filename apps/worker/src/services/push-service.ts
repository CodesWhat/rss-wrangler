import type { Pool } from "pg";
import webpush from "web-push";

export interface PushConfig {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidContact: string;
}

export async function sendNewStoriesNotification(
  pool: Pool,
  config: PushConfig,
  newClusterCount: number,
  topHeadline: string
): Promise<{ sent: number; failed: number }> {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    return { sent: 0, failed: 0 };
  }

  webpush.setVapidDetails(
    config.vapidContact,
    config.vapidPublicKey,
    config.vapidPrivateKey
  );

  const { rows } = await pool.query("SELECT endpoint, p256dh, auth FROM push_subscription");

  if (rows.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const payload = JSON.stringify({
    title: `${newClusterCount} new ${newClusterCount === 1 ? "story" : "stories"}`,
    body: `Top: ${topHeadline}`,
    url: "/"
  });

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const sub = row as { endpoint: string; p256dh: string; auth: string };
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        payload
      );
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        // Subscription expired or invalid, remove it
        await pool.query("DELETE FROM push_subscription WHERE endpoint = $1", [sub.endpoint]);
      }
      failed++;
    }
  }

  return { sent, failed };
}
