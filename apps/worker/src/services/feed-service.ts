import { randomUUID } from "node:crypto";

export interface DueFeed {
  id: string;
  url: string;
  title: string;
}

export class FeedService {
  async fetchDueFeeds(limit: number): Promise<DueFeed[]> {
    return [
      {
        id: randomUUID(),
        url: "https://example.com/feed.xml",
        title: "Example Feed"
      }
    ].slice(0, limit);
  }
}
