import {
  clusterCardSchema,
  digestSchema,
  feedSchema,
  folderSchema,
  listClustersQuerySchema,
  settingsSchema,
  type ClusterCard,
  type Digest,
  type Feed,
  type Folder,
  type ListClustersQuery,
  type Settings
} from "@rss-wrangler/contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const DEV_BEARER_TOKEN = process.env.NEXT_PUBLIC_DEV_BEARER_TOKEN;

interface ListClustersResponse {
  data: ClusterCard[];
  nextCursor: string | null;
}

const fallbackClusters: ClusterCard[] = [
  {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    headline: "Welcome to RSS Wrangler",
    heroImageUrl: null,
    primarySource: "Local seed",
    primarySourcePublishedAt: new Date().toISOString(),
    outletCount: 1,
    folderId: "11111111-1111-1111-1111-111111111111",
    folderName: "Tech",
    summary: "API not reachable yet. Start api/worker containers and refresh.",
    mutedBreakoutReason: null,
    isRead: false,
    isSaved: false
  }
];

const fallbackFolders: Folder[] = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Tech" },
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Other" }
];

const fallbackFeeds: Feed[] = [];
const fallbackDigests: Digest[] = [];
const fallbackSettings: Settings = {
  aiMode: "summaries_digest",
  aiProvider: "openai",
  monthlyAiCapUsd: 20,
  aiFallbackToLocal: false,
  digestAwayHours: 24,
  digestBacklogThreshold: 50,
  feedPollMinutes: 60
};

export async function listClusters(query: Partial<ListClustersQuery> = {}): Promise<ListClustersResponse> {
  const parsed = listClustersQuerySchema.parse(query);
  const search = new URLSearchParams({
    limit: String(parsed.limit),
    state: parsed.state,
    sort: parsed.sort
  });

  if (parsed.folder_id) {
    search.set("folder_id", parsed.folder_id);
  }
  if (parsed.cursor) {
    search.set("cursor", parsed.cursor);
  }

  const payload = await requestJson<unknown>(`/v1/clusters?${search.toString()}`);
  if (!payload) {
    return { data: fallbackClusters, nextCursor: null };
  }

  const data = Array.isArray((payload as { data?: unknown }).data)
    ? (payload as { data: unknown[] }).data.map((entry) => clusterCardSchema.parse(entry))
    : [];

  const nextCursor =
    typeof (payload as { nextCursor?: unknown }).nextCursor === "string"
      ? (payload as { nextCursor: string }).nextCursor
      : null;

  return { data, nextCursor };
}

export async function listFolders(): Promise<Folder[]> {
  const payload = await requestJson<unknown>("/v1/folders");
  if (!payload || !Array.isArray(payload)) {
    return fallbackFolders;
  }
  return payload.map((entry) => folderSchema.parse(entry));
}

export async function listFeeds(): Promise<Feed[]> {
  const payload = await requestJson<unknown>("/v1/feeds");
  if (!payload || !Array.isArray(payload)) {
    return fallbackFeeds;
  }
  return payload.map((entry) => feedSchema.parse(entry));
}

export async function listDigests(): Promise<Digest[]> {
  const payload = await requestJson<unknown>("/v1/digests");
  if (!payload || !Array.isArray(payload)) {
    return fallbackDigests;
  }
  return payload.map((entry) => digestSchema.parse(entry));
}

export async function getSettings(): Promise<Settings> {
  const payload = await requestJson<unknown>("/v1/settings");
  if (!payload) {
    return fallbackSettings;
  }
  return settingsSchema.parse(payload);
}

async function requestJson<T>(path: string): Promise<T | null> {
  const headers = new Headers();

  if (DEV_BEARER_TOKEN) {
    headers.set("Authorization", `Bearer ${DEV_BEARER_TOKEN}`);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      cache: "no-store",
      headers
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}
