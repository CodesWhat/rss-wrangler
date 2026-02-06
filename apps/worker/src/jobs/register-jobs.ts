import PgBoss from "pg-boss";
import type { WorkerEnv } from "../config/env";
import { JOBS } from "./job-names";
import { FeedService } from "../services/feed-service";
import { runFeedPipeline } from "../pipeline/run-feed-pipeline";

interface Dependencies {
  env: WorkerEnv;
}

export async function registerJobs(boss: PgBoss, dependencies: Dependencies): Promise<void> {
  const { env } = dependencies;
  const feedService = new FeedService();

  await boss.createQueue(JOBS.pollFeeds);
  await boss.createQueue(JOBS.processFeed);
  await boss.createQueue(JOBS.generateDigest);

  await boss.schedule(JOBS.pollFeeds, toCron(env.WORKER_POLL_MINUTES), {}, {
    tz: "UTC"
  });

  await boss.work(JOBS.pollFeeds, async () => {
    const dueFeeds = await feedService.fetchDueFeeds(env.WORKER_BATCH_SIZE);
    for (const feed of dueFeeds) {
      await boss.send(JOBS.processFeed, feed);
    }

    return { sent: dueFeeds.length };
  });

  await boss.work(JOBS.processFeed, async (jobs) => {
    const job = jobs[0];
    if (!job) {
      return;
    }

    if (!job.data || typeof job.data !== "object") {
      return;
    }

    const feed = job.data as { id: string; url: string; title: string };
    await runFeedPipeline({ feed });
  });

  await boss.work(JOBS.generateDigest, async () => {
    console.info("[worker] digest generation placeholder");
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
