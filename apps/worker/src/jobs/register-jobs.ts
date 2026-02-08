import { type Job, type PgBoss } from "pg-boss";
import type { Pool } from "pg";
import type { WorkerEnv } from "../config/env";
import { withTenantDbClient } from "../db-context";
import { runFeedPipeline } from "../pipeline/run-feed-pipeline";
import { generateDigest } from "../pipeline/stages/generate-digest";
import { FeedService } from "../services/feed-service";
import {
  ACCOUNT_DELETION_BATCH_SIZE,
  ACCOUNT_DELETION_GRACE_WINDOW_DAYS,
  processDueAccountDeletions
} from "./account-deletion-automation";
import { JOBS } from "./job-names";

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
  await boss.createQueue(JOBS.processAccountDeletions);

  await boss.schedule(JOBS.pollFeeds, toCron(env.WORKER_POLL_MINUTES), {}, {
    tz: "UTC"
  });

  await boss.work(JOBS.pollFeeds, async () => {
    const tenantIds = await feedService.listTenantIds();
    let sent = 0;

    for (const tenantId of tenantIds) {
      const dueFeeds = await withTenantDbClient(pool, tenantId, async (client) => {
        const tenantFeedService = new FeedService(client as unknown as Pool);
        return tenantFeedService.fetchDueFeeds(tenantId, env.WORKER_BATCH_SIZE);
      });

      for (const feed of dueFeeds) {
        await boss.send(JOBS.processFeed, {
          id: feed.id,
          tenantId: feed.tenantId,
          url: feed.url,
          title: feed.title,
          siteUrl: feed.siteUrl,
          folderId: feed.folderId,
          weight: feed.weight,
          etag: feed.etag,
          lastModified: feed.lastModified,
          lastPolledAt: feed.lastPolledAt?.toISOString() || null,
          classificationStatus: feed.classificationStatus,
        });
        sent++;
      }
    }

    return { sent };
  });

  await boss.work(JOBS.processFeed, async (jobs: Job<Record<string, unknown>>[]) => {
    const job = jobs[0];
    if (!job?.data || typeof job.data !== "object") {
      return;
    }

    const data = job.data as Record<string, unknown>;
    const feed = {
      id: data.id as string,
      tenantId: data.tenantId as string,
      url: data.url as string,
      title: data.title as string,
      siteUrl: (data.siteUrl as string) || null,
      folderId: data.folderId as string,
      weight: (data.weight as "prefer" | "neutral" | "deprioritize") || "neutral",
      etag: (data.etag as string) || null,
      lastModified: (data.lastModified as string) || null,
      lastPolledAt: data.lastPolledAt ? new Date(data.lastPolledAt as string) : null,
      classificationStatus: (data.classificationStatus as "pending_classification" | "classified" | "approved") || "approved",
    };

    try {
      await withTenantDbClient(pool, feed.tenantId, async (client) => {
        await runFeedPipeline({
          feed,
          pool: client as unknown as Pool,
          openaiApiKey: env.OPENAI_API_KEY,
          pushConfig: {
            vapidPublicKey: env.VAPID_PUBLIC_KEY,
            vapidPrivateKey: env.VAPID_PRIVATE_KEY,
            vapidContact: env.VAPID_CONTACT,
          }
        });
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
      const tenantIds = await feedService.listTenantIds();
      for (const tenantId of tenantIds) {
        await withTenantDbClient(pool, tenantId, async (client) => {
          await generateDigest(client as unknown as Pool, tenantId);
        });
      }
    } catch (err) {
      console.error("[worker] digest generation failed", { error: err });
      throw err;
    }
  });

  // Process account deletion requests every 30 minutes.
  await boss.schedule(JOBS.processAccountDeletions, "*/30 * * * *", {}, {
    tz: "UTC"
  });

  await boss.work(JOBS.processAccountDeletions, async () => {
    try {
      const tenantIds = await feedService.listTenantIds();
      let processed = 0;
      let deletedUsers = 0;
      let purgedTenants = 0;

      for (const tenantId of tenantIds) {
        const result = await withTenantDbClient(pool, tenantId, async (client) => {
          return processDueAccountDeletions(client, {
            tenantId,
            batchSize: ACCOUNT_DELETION_BATCH_SIZE,
            graceWindowDays: ACCOUNT_DELETION_GRACE_WINDOW_DAYS
          });
        });

        processed += result.processed;
        deletedUsers += result.deletedUsers;
        if (result.tenantPurged) {
          purgedTenants += 1;
        }
      }

      if (processed > 0 || purgedTenants > 0) {
        console.info("[worker] account deletion automation processed", {
          processed,
          deletedUsers,
          purgedTenants
        });
      }

      return { processed, deletedUsers, purgedTenants };
    } catch (err) {
      console.error("[worker] account deletion automation failed", { error: err });
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
