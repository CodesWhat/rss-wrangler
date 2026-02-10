export const JOBS = {
  pollFeeds: "poll-feeds",
  processFeed: "process-feed",
  backfillFullText: "backfill-fulltext",
  generateDigest: "generate-digest",
  generateDigestForAccount: "generate-digest-for-account",
  processAccountDeletions: "process-account-deletions",
  retentionCleanup: "retention-cleanup"
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];
