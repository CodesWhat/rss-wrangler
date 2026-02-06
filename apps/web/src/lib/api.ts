import {
  authTokensSchema,
  clusterCardSchema,
  clusterDetailSchema,
  digestSchema,
  feedSchema,
  filterRuleSchema,
  folderSchema,
  listClustersQuerySchema,
  settingsSchema,
  type AuthTokens,
  type ClusterCard,
  type ClusterDetail,
  type ClusterFeedbackRequest,
  type CreateFilterRuleRequest,
  type Digest,
  type Feed,
  type Folder,
  type ListClustersQuery,
  type LoginRequest,
  type Settings,
  type UpdateFeedRequest,
  type UpdateFilterRuleRequest,
  type UpdateSettingsRequest,
  type FilterRule,
} from "@rss-wrangler/contracts";

const API_BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000")
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");

const LOGGED_IN_KEY = "rss_logged_in";

// ---------- In-memory token store ----------

let accessToken: string | null = null;
let refreshTokenValue: string | null = null;
let tokenExpiresAt = 0;

// ---------- Token helpers ----------

function getAccessToken(): string | null {
  return accessToken;
}

function getRefreshToken(): string | null {
  return refreshTokenValue;
}

function getTokenExpiresAt(): number {
  return tokenExpiresAt;
}

export function storeTokens(tokens: AuthTokens): void {
  accessToken = tokens.accessToken;
  refreshTokenValue = tokens.refreshToken;
  tokenExpiresAt = Date.now() + tokens.expiresInSeconds * 1000;
  if (typeof window !== "undefined") {
    localStorage.setItem(LOGGED_IN_KEY, "1");
  }
}

export function clearTokens(): void {
  accessToken = null;
  refreshTokenValue = null;
  tokenExpiresAt = 0;
  if (typeof window !== "undefined") {
    localStorage.removeItem(LOGGED_IN_KEY);
  }
}

export function isLoggedIn(): boolean {
  return !!accessToken;
}

export function isLoggedInFlag(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LOGGED_IN_KEY) === "1";
}

export function clearLoggedInFlag(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(LOGGED_IN_KEY);
  }
}

// ---------- Token refresh ----------

let refreshPromise: Promise<boolean> | null = null;

async function ensureValidToken(): Promise<string | null> {
  const token = getAccessToken();
  if (!token) return null;

  // Refresh if expiring within 60 seconds
  const expiresAt = getTokenExpiresAt();
  if (expiresAt && Date.now() > expiresAt - 60_000) {
    const ok = await refreshAccessToken();
    if (!ok) return null;
    return getAccessToken();
  }
  return token;
}

async function refreshAccessToken(): Promise<boolean> {
  // Deduplicate concurrent refresh calls
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const rt = getRefreshToken();
    if (!rt) {
      clearTokens();
      return false;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      const data = authTokensSchema.parse(await res.json());
      storeTokens(data);
      return true;
    } catch {
      clearTokens();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ---------- Core request helpers ----------

async function authedHeaders(): Promise<Headers> {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const token = await ensureValidToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  const headers = await authedHeaders();
  if (init?.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((v, k) => headers.set(k, v));
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });

    if (response.status === 401) {
      // Try refresh once
      const ok = await refreshAccessToken();
      if (ok) {
        const retryHeaders = await authedHeaders();
        if (init?.headers) {
          const extra = new Headers(init.headers);
          extra.forEach((v, k) => retryHeaders.set(k, v));
        }
        const retry = await fetch(`${API_BASE_URL}${path}`, {
          ...init,
          headers: retryHeaders,
          cache: "no-store",
        });
        if (!retry.ok) return null;
        const text = await retry.text();
        return text ? (JSON.parse(text) as T) : (null as T);
      }
      clearTokens();
      return null;
    }

    if (!response.ok) return null;

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : (null as T);
  } catch {
    return null;
  }
}

// ---------- Fallbacks ----------

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
    isSaved: false,
  },
];

const fallbackFolders: Folder[] = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Tech" },
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Other" },
];

const fallbackFeeds: Feed[] = [];
const fallbackDigests: Digest[] = [];
const fallbackFilters: FilterRule[] = [];
const fallbackSettings: Settings = {
  aiMode: "summaries_digest",
  aiProvider: "openai",
  monthlyAiCapUsd: 20,
  aiFallbackToLocal: false,
  digestAwayHours: 24,
  digestBacklogThreshold: 50,
  feedPollMinutes: 60,
};

// ---------- Auth ----------

export async function login(req: LoginRequest): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || "Login failed");
  }
  const tokens = authTokensSchema.parse(await res.json());
  storeTokens(tokens);
  return tokens;
}

export async function logout(): Promise<void> {
  const headers = await authedHeaders();
  try {
    await fetch(`${API_BASE_URL}/v1/auth/logout`, {
      method: "POST",
      headers,
    });
  } catch {
    // best-effort
  }
  clearTokens();
}

// ---------- Clusters ----------

interface ListClustersResponse {
  data: ClusterCard[];
  nextCursor: string | null;
}

export async function listClusters(
  query: Partial<ListClustersQuery> = {}
): Promise<ListClustersResponse> {
  const parsed = listClustersQuerySchema.parse(query);
  const search = new URLSearchParams({
    limit: String(parsed.limit),
    state: parsed.state,
    sort: parsed.sort,
  });
  if (parsed.folder_id) search.set("folder_id", parsed.folder_id);
  if (parsed.cursor) search.set("cursor", parsed.cursor);

  const payload = await requestJson<unknown>(`/v1/clusters?${search.toString()}`);
  if (!payload) return { data: fallbackClusters, nextCursor: null };

  const data = Array.isArray((payload as { data?: unknown }).data)
    ? (payload as { data: unknown[] }).data.map((entry) => clusterCardSchema.parse(entry))
    : [];

  const nextCursor =
    typeof (payload as { nextCursor?: unknown }).nextCursor === "string"
      ? (payload as { nextCursor: string }).nextCursor
      : null;

  return { data, nextCursor };
}

export async function getClusterDetail(id: string): Promise<ClusterDetail | null> {
  const payload = await requestJson<unknown>(`/v1/clusters/${encodeURIComponent(id)}`);
  if (!payload) return null;
  return clusterDetailSchema.parse(payload);
}

export async function markClusterRead(id: string): Promise<boolean> {
  const res = await requestJson<unknown>(`/v1/clusters/${encodeURIComponent(id)}/read`, {
    method: "POST",
  });
  return res !== null;
}

export async function saveCluster(id: string): Promise<boolean> {
  const res = await requestJson<unknown>(`/v1/clusters/${encodeURIComponent(id)}/save`, {
    method: "POST",
  });
  return res !== null;
}

export async function clusterFeedback(
  id: string,
  body: ClusterFeedbackRequest
): Promise<boolean> {
  const res = await requestJson<unknown>(`/v1/clusters/${encodeURIComponent(id)}/feedback`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res !== null;
}

// ---------- Folders ----------

export async function listFolders(): Promise<Folder[]> {
  const payload = await requestJson<unknown>("/v1/folders");
  if (!payload || !Array.isArray(payload)) return fallbackFolders;
  return payload.map((entry) => folderSchema.parse(entry));
}

// ---------- Feeds ----------

export async function listFeeds(): Promise<Feed[]> {
  const payload = await requestJson<unknown>("/v1/feeds");
  if (!payload || !Array.isArray(payload)) return fallbackFeeds;
  return payload.map((entry) => feedSchema.parse(entry));
}

export async function addFeed(url: string): Promise<Feed | null> {
  const payload = await requestJson<unknown>("/v1/feeds", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  if (!payload) return null;
  return feedSchema.parse(payload);
}

export async function updateFeed(
  id: string,
  body: UpdateFeedRequest
): Promise<Feed | null> {
  const payload = await requestJson<unknown>(`/v1/feeds/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!payload) return null;
  return feedSchema.parse(payload);
}

export async function importOpml(file: File): Promise<{ imported: number } | null> {
  const formData = new FormData();
  formData.append("file", file);

  const token = await ensureValidToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    const res = await fetch(`${API_BASE_URL}/v1/opml/import`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) return null;
    return (await res.json()) as { imported: number };
  } catch {
    return null;
  }
}

// ---------- Filters ----------

export async function listFilters(): Promise<FilterRule[]> {
  const payload = await requestJson<unknown>("/v1/filters");
  if (!payload || !Array.isArray(payload)) return fallbackFilters;
  return payload.map((entry) => filterRuleSchema.parse(entry));
}

export async function createFilter(body: CreateFilterRuleRequest): Promise<FilterRule | null> {
  const payload = await requestJson<unknown>("/v1/filters", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!payload) return null;
  return filterRuleSchema.parse(payload);
}

export async function updateFilter(
  id: string,
  body: UpdateFilterRuleRequest
): Promise<FilterRule | null> {
  const payload = await requestJson<unknown>(`/v1/filters/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!payload) return null;
  return filterRuleSchema.parse(payload);
}

export async function deleteFilter(id: string): Promise<boolean> {
  const res = await requestJson<unknown>(`/v1/filters/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return res !== null;
}

// ---------- Digests ----------

export async function listDigests(): Promise<Digest[]> {
  const payload = await requestJson<unknown>("/v1/digests");
  if (!payload || !Array.isArray(payload)) return fallbackDigests;
  return payload.map((entry) => digestSchema.parse(entry));
}

// ---------- Settings ----------

export async function getSettings(): Promise<Settings> {
  const payload = await requestJson<unknown>("/v1/settings");
  if (!payload) return fallbackSettings;
  return settingsSchema.parse(payload);
}

export async function updateSettings(body: UpdateSettingsRequest): Promise<Settings | null> {
  const payload = await requestJson<unknown>("/v1/settings", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!payload) return null;
  return settingsSchema.parse(payload);
}
