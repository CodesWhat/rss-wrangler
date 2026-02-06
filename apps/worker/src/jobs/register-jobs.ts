import PgBoss from "pg-boss";
import type { Pool } from "pg";
import type { WorkerEnv } from "../config/env";
import { JOBS } from "./job-names";
import { FeedService } from "../services/feed-service";
import { runFeedPipeline } from "../pipeline/run-feed-pipeline";
import { generateDigest } from "../pipeline/stages/generate-digest";

interface Dependencies {
  env: WorkerEnv;
  pool: Pool;
}

export async function registerJobs(boss: PgBoss, dependencies: Dependencies): Promise<void> {
  const { env, pool } = dependencies;
  const feedService = new FeedService(pool);

  await boss.createQueue(JOBS.pollFeeds);
  await boss.createQueue(JOBS.processFeed);
  await boss.createQueue(JOBS.generateDigest);

  await boss.schedule(JOBS.pollFeeds, toCron(env.WORKER_POLL_MINUTES), {}, {
    tz: "UTC"
  });

  await boss.work(JOBS.pollFeeds, async () => {
    const dueFeeds = await feedService.fetchDueFeeds(env.WORKER_BATCH_SIZE);
    for (const feed of dueFeeds) {
      await boss.send(JOBS.processFeed, {
        id: feed.id,
        url: feed.url,
        title: feed.title,
        siteUrl: feed.siteUrl,
        folderId: feed.folderId,
        weight: feed.weight,
        etag: feed.etag,
        lastModified: feed.lastModified,
        lastPolledAt: feed.lastPolledAt?.toISOString() || null,
      });
    }

    return { sent: dueFeeds.length };
  });

  await boss.work(JOBS.processFeed, async (jobs) => {
    const job = jobs[0];
    if (!job?.data || typeof job.data !== "object") {
      return;
    }

    const data = job.data as Record<string, unknown>;
    const feed = {
      id: data.id as string,
      url: data.url as string,
      title: data.title as string,
      siteUrl: (data.siteUrl as string) || null,
      folderId: data.folderId as string,
      weight: (data.weight as "prefer" | "neutral" | "deprioritize") || "neutral",
      etag: (data.etag as string) || null,
      lastModified: (data.lastModified as string) || null,
      lastPolledAt: data.lastPolledAt ? new Date(data.lastPolledAt as string) : null,
    };

    try {
      await runFeedPipeline({
        feed,
        pool,
        openaiApiKey: env.OPENAI_API_KEY,
        pushConfig: {
          vapidPublicKey: env.VAPID_PUBLIC_KEY,
          vapidPrivateKey: env.VAPID_PRIVATE_KEY,
          vapidContact: env.VAPID_CONTACT,
        }
      });
    } catch (err) {
      console.error("[worker] pipeline failed", { feedId: feed.id, error: err });
      throw err; // pg-boss will handle retry
    }
  });

  // Schedule digest generation daily at 7:00 AM UTC
  await boss.schedule(JOBS.generateDigest, "0 7 * * *", {}, {
    tz: "UTC"
  });

  await boss.work(JOBS.generateDigest, async () => {
    try {
      await generateDigest(pool);
    } catch (err) {
      console.error("[worker] digest generation failed", { error: err });
      throw err;
    }
  });
}

function toCron(minutes: number): string {
  if (minutes <= 59) {
    return `*/${minutes} * * * *`;
  }

  if (minutes % 60 === 0) {
    const everyHours = Math.max(1, Math.floor(minutes / 60));
    return `0 */${everyHours} * * *`;
  }

  return "0 * * * *";
}
