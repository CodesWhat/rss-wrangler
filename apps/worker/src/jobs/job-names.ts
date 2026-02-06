export const JOBS = {
  pollFeeds: "poll-feeds",
  processFeed: "process-feed",
  generateDigest: "generate-digest"
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];
