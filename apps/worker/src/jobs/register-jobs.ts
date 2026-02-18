import { createAiRegistry } from "@rss-wrangler/contracts";
import type { Pool } from "pg";
import type { Job, PgBoss } from "pg-boss";
import type { WorkerEnv } from "../config/env";
import { withAccountDbClient } from "../db-context";
import { runFeedPipeline } from "../pipeline/run-feed-pipeline";
import { detectTopicDrift } from "../pipeline/stages/detect-topic-drift";
import { backfillMissingFullText } from "../pipeline/stages/extract-fulltext";
import { generateDigest } from "../pipeline/stages/generate-digest";
import { FeedService } from "../services/feed-service";
import {
  ACCOUNT_DELETION_BATCH_SIZE,
  ACCOUNT_DELETION_GRACE_WINDOW_DAYS,
  processDueAccountDeletions,
} from "./account-deletion-automation";
import { JOBS } from "./job-names";
import { runProgressiveSummary } from "./progressive-summary";
import { runRetentionCleanup } from "./retention-cleanup";

interface Dependencies {
  env: WorkerEnv;
  pool: Pool;
}

export async function registerJobs(boss: PgBoss, dependencies: Dependencies): Promise<void> {
  const { env, pool } = dependencies;
  const feedService = new FeedService(pool);
  const aiRegistry = createAiRegistry(env);
  const aiProvider = aiRegistry.getProvider();

  if (aiProvider) {
    console.info("[worker] AI provider configured", {
      provider: aiProvider.name,
      available: aiRegistry.listAvailable(),
    });
  } else {
    console.info("[worker] no AI provider configured, AI features will be skipped");
  }

  await boss.createQueue(JOBS.pollFeeds);
  await boss.createQueue(JOBS.processFeed);
  await boss.createQueue(JOBS.backfillFullText);
  await boss.createQueue(JOBS.generateDigest);
  await boss.createQueue(JOBS.generateDigestForAccount);
  await boss.createQueue(JOBS.processAccountDeletions);
  await boss.createQueue(JOBS.retentionCleanup);
  await boss.createQueue(JOBS.progressiveSummary);
  await boss.createQueue(JOBS.detectTopicDrift);

  await boss.schedule(
    JOBS.pollFeeds,
    toCron(env.WORKER_POLL_MINUTES),
    {},
    {
      tz: "UTC",
    },
  );

  await boss.work(JOBS.pollFeeds, async () => {
    const accountIds = await feedService.listAccountIds();
    let sent = 0;

    for (const accountId of accountIds) {
      const dueFeeds = await withAccountDbClient(pool, accountId, async (client) => {
        const accountFeedService = new FeedService(client as unknown as Pool);
        return accountFeedService.fetchDueFeeds(accountId, env.WORKER_BATCH_SIZE);
      });

      for (const feed of dueFeeds) {
        await boss.send(JOBS.processFeed, {
          id: feed.id,
          accountId: feed.accountId,
          url: feed.url,
          title: feed.title,
          siteUrl: feed.siteUrl,
          folderId: feed.folderId,
          weight: feed.weight,
          etag: feed.etag,
          lastModified: feed.lastModified,
          lastPolledAt: feed.lastPolledAt?.toISOString() || null,
          backfillSince: feed.backfillSince?.toISOString() || null,
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
      accountId: (data.accountId ?? data.tenantId) as string,
      url: data.url as string,
      title: data.title as string,
      siteUrl: (data.siteUrl as string) || null,
      folderId: data.folderId as string,
      weight: (data.weight as "prefer" | "neutral" | "deprioritize") || "neutral",
      etag: (data.etag as string) || null,
      lastModified: (data.lastModified as string) || null,
      lastPolledAt: data.lastPolledAt ? new Date(data.lastPolledAt as string) : null,
      backfillSince: data.backfillSince ? new Date(data.backfillSince as string) : null,
      classificationStatus:
        (data.classificationStatus as "pending_classification" | "classified" | "approved") ||
        "approved",
    };

    try {
      await withAccountDbClient(pool, feed.accountId, async (client) => {
        await runFeedPipeline({
          feed,
          pool: client as unknown as Pool,
          aiProvider,
          pushConfig: {
            vapidPublicKey: env.VAPID_PUBLIC_KEY,
            vapidPrivateKey: env.VAPID_PRIVATE_KEY,
            vapidContact: env.VAPID_CONTACT,
          },
        });
      });
    } catch (err) {
      console.error("[worker] pipeline failed", { feedId: feed.id, error: err });
      throw err; // pg-boss will handle retry
    }
  });

  await boss.schedule(
    JOBS.backfillFullText,
    toCron(env.WORKER_FULLTEXT_BACKFILL_MINUTES),
    {},
    {
      tz: "UTC",
    },
  );

  await boss.work(JOBS.backfillFullText, async () => {
    try {
      const accountIds = await feedService.listAccountIds();
      let accountsWithCandidates = 0;
      let totalCandidates = 0;
      let totalAttempted = 0;
      let totalExtracted = 0;
      let totalPersisted = 0;

      for (const accountId of accountIds) {
        const stats = await withAccountDbClient(pool, accountId, async (client) => {
          return backfillMissingFullText(
            client as unknown as Pool,
            accountId,
            env.WORKER_FULLTEXT_BACKFILL_BATCH_SIZE,
          );
        });

        totalCandidates += stats.candidates;
        totalAttempted += stats.attempted;
        totalExtracted += stats.extracted;
        totalPersisted += stats.persisted;
        if (stats.candidates > 0) {
          accountsWithCandidates += 1;
        }
      }

      if (totalCandidates > 0 || totalPersisted > 0) {
        console.info("[worker] full-text backfill processed", {
          accountsWithCandidates,
          totalCandidates,
          totalAttempted,
          totalExtracted,
          totalPersisted,
        });
      }

      return {
        accountsWithCandidates,
        totalCandidates,
        totalAttempted,
        totalExtracted,
        totalPersisted,
      };
    } catch (err) {
      console.error("[worker] full-text backfill failed", { error: err });
      throw err;
    }
  });

  // Schedule digest generation daily at 7:00 AM UTC
  await boss.schedule(
    JOBS.generateDigest,
    "0 7 * * *",
    {},
    {
      tz: "UTC",
    },
  );

  await boss.work(JOBS.generateDigest, async () => {
    try {
      const accountIds = await feedService.listAccountIds();
      for (const accountId of accountIds) {
        await withAccountDbClient(pool, accountId, async (client) => {
          await generateDigest(client as unknown as Pool, accountId, aiProvider);
        });
      }
    } catch (err) {
      console.error("[worker] digest generation failed", { error: err });
      throw err;
    }
  });

  // On-demand digest generation for a specific account (triggered by API)
  await boss.work(JOBS.generateDigestForAccount, async (jobs: Job<Record<string, unknown>>[]) => {
    const job = jobs[0];
    if (!job?.data || typeof job.data !== "object") return;
    const data = job.data as Record<string, unknown>;
    const accountId = data.accountId as string;
    if (!accountId) return;

    try {
      await withAccountDbClient(pool, accountId, async (client) => {
        await generateDigest(client as unknown as Pool, accountId, aiProvider);
      });
    } catch (err) {
      console.error("[worker] on-demand digest generation failed", { accountId, error: err });
      throw err;
    }
  });

  // Process account deletion requests every 30 minutes.
  await boss.schedule(
    JOBS.processAccountDeletions,
    "*/30 * * * *",
    {},
    {
      tz: "UTC",
    },
  );

  await boss.work(JOBS.processAccountDeletions, async () => {
    try {
      const accountIds = await feedService.listAccountIds();
      let processed = 0;
      let deletedUsers = 0;
      let purgedAccounts = 0;

      for (const accountId of accountIds) {
        const result = await withAccountDbClient(pool, accountId, async (client) => {
          return processDueAccountDeletions(client, {
            accountId,
            batchSize: ACCOUNT_DELETION_BATCH_SIZE,
            graceWindowDays: ACCOUNT_DELETION_GRACE_WINDOW_DAYS,
          });
        });

        processed += result.processed;
        deletedUsers += result.deletedUsers;
        if (result.tenantPurged) {
          purgedAccounts += 1;
        }
      }

      if (processed > 0 || purgedAccounts > 0) {
        console.info("[worker] account deletion automation processed", {
          processed,
          deletedUsers,
          purgedAccounts,
        });
      }

      return { processed, deletedUsers, purgedAccounts };
    } catch (err) {
      console.error("[worker] account deletion automation failed", { error: err });
      throw err;
    }
  });

  await boss.schedule(
    JOBS.retentionCleanup,
    toCron(env.WORKER_RETENTION_MINUTES),
    {},
    {
      tz: "UTC",
    },
  );

  await boss.work(JOBS.retentionCleanup, async () => {
    try {
      const accountIds = await feedService.listAccountIds();
      let appliedAccounts = 0;
      let totalAutoMarkedUnread = 0;
      let totalPurgedReadClusters = 0;
      let totalPurgedOrphanItems = 0;

      for (const accountId of accountIds) {
        const result = await withAccountDbClient(pool, accountId, async (client) => {
          return runRetentionCleanup(client as unknown as Pool, accountId);
        });
        if (!result.applied) {
          continue;
        }
        appliedAccounts += 1;
        totalAutoMarkedUnread += result.autoMarkedUnread;
        totalPurgedReadClusters += result.purgedReadClusters;
        totalPurgedOrphanItems += result.purgedOrphanItems;
      }

      if (appliedAccounts > 0) {
        console.info("[worker] retention cleanup processed", {
          appliedAccounts,
          totalAutoMarkedUnread,
          totalPurgedReadClusters,
          totalPurgedOrphanItems,
        });
      }

      return {
        appliedAccounts,
        totalAutoMarkedUnread,
        totalPurgedReadClusters,
        totalPurgedOrphanItems,
      };
    } catch (err) {
      console.error("[worker] retention cleanup failed", { error: err });
      throw err;
    }
  });

  // Progressive summarization: generate AI summaries for aging items every 2 hours
  await boss.schedule(
    JOBS.progressiveSummary,
    "0 */2 * * *",
    {},
    {
      tz: "UTC",
    },
  );

  await boss.work(JOBS.progressiveSummary, async () => {
    try {
      const accountIds = await feedService.listAccountIds();
      let totalCandidates = 0;
      let totalSummarized = 0;

      for (const accountId of accountIds) {
        const result = await withAccountDbClient(pool, accountId, async (client) => {
          return runProgressiveSummary(client as unknown as Pool, accountId, aiProvider);
        });
        totalCandidates += result.candidates;
        totalSummarized += result.summarized;
      }

      if (totalCandidates > 0 || totalSummarized > 0) {
        console.info("[worker] progressive summary processed", {
          totalCandidates,
          totalSummarized,
        });
      }

      return { totalCandidates, totalSummarized };
    } catch (err) {
      console.error("[worker] progressive summary failed", { error: err });
      throw err;
    }
  });

  // Weekly topic drift detection: every Sunday at 3:00 AM UTC
  await boss.schedule(
    JOBS.detectTopicDrift,
    "0 3 * * 0",
    {},
    {
      tz: "UTC",
    },
  );

  await boss.work(JOBS.detectTopicDrift, async () => {
    try {
      const accountIds = await feedService.listAccountIds();
      let totalFeeds = 0;
      let totalDrifted = 0;

      for (const accountId of accountIds) {
        await withAccountDbClient(pool, accountId, async (client) => {
          const accountPool = client as unknown as Pool;

          // Find classified/approved feeds that haven't been checked recently (7+ days)
          const feedsResult = await accountPool.query<{ id: string }>(
            `SELECT id FROM feed
             WHERE tenant_id = $1
               AND classification_status IN ('classified', 'approved')
               AND (classified_at IS NULL OR classified_at < NOW() - INTERVAL '7 days')
             ORDER BY classified_at ASC NULLS FIRST
             LIMIT 50`,
            [accountId],
          );

          for (const row of feedsResult.rows) {
            totalFeeds++;
            const result = await detectTopicDrift(accountPool, accountId, row.id, aiProvider);
            if (result?.driftDetected) {
              totalDrifted++;
            }
          }
        });
      }

      if (totalFeeds > 0) {
        console.info("[worker] topic drift detection processed", {
          totalFeeds,
          totalDrifted,
        });
      }

      return { totalFeeds, totalDrifted };
    } catch (err) {
      console.error("[worker] topic drift detection failed", { error: err });
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
    if (everyHours >= 24) {
      return "0 0 * * *";
    }
    return `0 */${everyHours} * * *`;
  }

  return "0 * * * *";
}
