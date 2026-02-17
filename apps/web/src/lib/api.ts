import {
  type AccountDataExportStatus,
  type AccountDeletionStatus,
  type AccountEntitlements,
  type AiUsageSummary,
  type Annotation,
  type AuthTokens,
  accountDataExportStatusSchema,
  accountDeletionStatusSchema,
  accountEntitlementsSchema,
  aiUsageSummarySchema,
  annotationSchema,
  authTokensSchema,
  type BillingInterval,
  type BillingOverview,
  type BillingSubscriptionAction,
  billingCheckoutResponseSchema,
  billingOverviewSchema,
  billingPortalResponseSchema,
  billingSubscriptionActionResponseSchema,
  type ChangePasswordRequest,
  type ClusterAiSummaryResponse,
  type ClusterCard,
  type ClusterDetail,
  type ClusterFeedbackRequest,
  type CreateAnnotationRequest,
  type CreateFilterRuleRequest,
  type CreateMemberInviteRequest,
  clusterAiSummaryResponseSchema,
  clusterCardSchema,
  clusterDetailSchema,
  type Digest,
  digestSchema,
  type Feed,
  type FeedRecommendation,
  type FeedTopic,
  type FilterRule,
  type Folder,
  type ForgotPasswordRequest,
  feedRecommendationsResponseSchema,
  feedSchema,
  feedTopicSchema,
  filterRuleSchema,
  folderSchema,
  type HostedPlanId,
  type JoinAccountRequest,
  type ListClustersQuery,
  type LoginRequest,
  listClustersQuerySchema,
  type MarkAllReadRequest,
  type Member,
  type MemberInvite,
  memberInviteSchema,
  memberSchema,
  type PollFeedNowRequest,
  type PrivacyConsent,
  privacyConsentSchema,
  type ReadingStats,
  type RequestAccountDeletion,
  type ResendVerificationRequest,
  type ResetPasswordRequest,
  readingStatsSchema,
  recordEventsResponseSchema,
  type Settings,
  type SponsoredCard,
  type StatsPeriod,
  searchQuerySchema,
  settingsSchema,
  sponsoredCardSchema,
  type Topic,
  topicSchema,
  type UpdateFeedRequest,
  type UpdateMemberRequest,
  type UpdatePrivacyConsentRequest,
  type UpdateSettingsRequest,
} from "@rss-wrangler/contracts";

export type SignupResult =
  | { status: "authenticated"; tokens: AuthTokens }
  | { status: "verification_required" };

const API_BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000")
    : (process.env.INTERNAL_API_BASE_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      "http://localhost:4000");

const LOGGED_IN_KEY = "rss_logged_in";
const REFRESH_TOKEN_KEY = "rss_refresh_token";

// ---------- In-memory token store ----------

let accessToken: string | null = null;
let refreshTokenValue: string | null = null;
let tokenExpiresAt = 0;

// ---------- Token helpers ----------

function getAccessToken(): string | null {
  return accessToken;
}

function getRefreshToken(): string | null {
  if (refreshTokenValue) return refreshTokenValue;
  if (typeof window !== "undefined") {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }
  return null;
}

function getTokenExpiresAt(): number {
  return tokenExpiresAt;
}

function storeTokens(tokens: AuthTokens): void {
  accessToken = tokens.accessToken;
  refreshTokenValue = tokens.refreshToken;
  tokenExpiresAt = Date.now() + tokens.expiresInSeconds * 1000;
  if (typeof window !== "undefined") {
    localStorage.setItem(LOGGED_IN_KEY, "1");
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
}

function clearTokens(): void {
  accessToken = null;
  refreshTokenValue = null;
  tokenExpiresAt = 0;
  if (typeof window !== "undefined") {
    localStorage.removeItem(LOGGED_IN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function isLoggedIn(): boolean {
  if (accessToken) return true;
  if (typeof window !== "undefined" && localStorage.getItem(REFRESH_TOKEN_KEY)) return true;
  return false;
}

/** Returns true only if an access token is currently held in memory. */
export function hasAccessToken(): boolean {
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

  // No access token in memory but refresh token available (e.g. after page reload)
  if (!token) {
    const rt = getRefreshToken();
    if (rt) {
      const ok = await refreshAccessToken();
      if (!ok) return null;
      return getAccessToken();
    }
    return null;
  }

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

/**
 * Attempt to restore a session from a persisted refresh token.
 * Returns true if the session was restored successfully.
 */
export async function tryRestoreSession(): Promise<boolean> {
  if (accessToken) return true;
  const rt = getRefreshToken();
  if (!rt) return false;
  return refreshAccessToken();
}

// ---------- JWT helpers ----------

/** Extract the current user ID from the in-memory access token (JWT sub claim). */
export function getCurrentUserId(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const parts = token.split(".");
    const encoded = parts[1];
    if (!encoded) return null;
    const payload = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

// ---------- Core request helpers ----------

async function authedHeaders(includeContentType = true): Promise<Headers> {
  const headers = new Headers();
  if (includeContentType) {
    headers.set("Content-Type", "application/json");
  }
  const token = await ensureValidToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  const hasBody = init?.body != null;
  const headers = await authedHeaders(hasBody);
  if (init?.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((v, k) => {
      headers.set(k, v);
    });
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
        const retryHeaders = await authedHeaders(hasBody);
        if (init?.headers) {
          const extra = new Headers(init.headers);
          extra.forEach((v, k) => {
            retryHeaders.set(k, v);
          });
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
    primaryFeedId: "00000000-0000-0000-0000-000000000000",
    primarySource: "Local seed",
    primarySourcePublishedAt: new Date().toISOString(),
    outletCount: 3,
    folderId: "11111111-1111-1111-1111-111111111111",
    folderName: "Tech",
    topicId: null,
    topicName: null,
    summary: "API not reachable yet. Start api/worker containers and refresh.",
    mutedBreakoutReason: null,
    displayMode: "full",
    rankingExplainability: null,
    dedupeReason: "3 articles merged by URL similarity",
    hiddenSignals: [{ label: "Muted keyword", reason: '"crypto" matched filter #3' }],
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
  openaiApiKey: "",
  monthlyAiCapUsd: 20,
  aiFallbackToLocal: false,
  digestAwayHours: 24,
  digestBacklogThreshold: 50,
  feedPollMinutes: 60,
  markReadOnScroll: "off",
  markReadOnScrollListDelayMs: 1500,
  markReadOnScrollCompactDelayMs: 1500,
  markReadOnScrollCardDelayMs: 1500,
  markReadOnScrollListThreshold: 0.6,
  markReadOnScrollCompactThreshold: 0.6,
  markReadOnScrollCardThreshold: 0.6,
  markReadOnScrollFeedOverrides: {},
  unreadMaxAgeDays: null,
  readPurgeDays: null,
  savedSearches: [],
  wallabagUrl: "",
  progressiveSummarizationEnabled: true,
  progressiveFreshHours: 6,
  progressiveAgingDays: 3,
};

// ---------- Auth ----------

export async function login(req: LoginRequest): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        "Email not verified. Check your inbox or request another verification email.",
      );
    }
    throw new Error(res.status === 401 ? "Invalid username or password" : "Login failed");
  }
  const tokens = authTokensSchema.parse(await res.json());
  storeTokens(tokens);
  return tokens;
}

export async function joinAccount(req: JoinAccountRequest): Promise<SignupResult> {
  const res = await fetch(`${API_BASE_URL}/v1/auth/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Signup is currently unavailable");
    }
    if (res.status === 403) {
      throw new Error("Invite code required");
    }
    if (res.status === 400) {
      const message = await res.text();
      throw new Error(message || "Invalid invite code");
    }
    if (res.status === 409) {
      const message = await res.text();
      throw new Error(message || "Account already exists");
    }
    throw new Error("Join failed");
  }

  if (res.status === 202) {
    return { status: "verification_required" };
  }

  const tokens = authTokensSchema.parse(await res.json());
  storeTokens(tokens);
  return { status: "authenticated", tokens };
}

export async function resendVerification(
  req: ResendVerificationRequest,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const message = await res.text();
      return { ok: false, error: message || "Request failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Request failed" };
  }
}

export async function requestPasswordReset(
  req: ForgotPasswordRequest,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const message = await res.text();
      return { ok: false, error: message || "Request failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Request failed" };
  }
}

export async function resetPassword(
  req: ResetPasswordRequest,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const message = await res.text();
      return { ok: false, error: message || "Reset failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Reset failed" };
  }
}

export async function verifyEmail(
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const url = new URL(`${API_BASE_URL}/v1/auth/verify-email`);
    url.searchParams.set("token", token);
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) {
      const message = await res.text();
      return { ok: false, error: message || "Verification failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Verification failed" };
  }
}

export async function changePassword(
  req: ChangePasswordRequest,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const attempt = async (): Promise<Response> => {
    const headers = await authedHeaders(true);
    return fetch(`${API_BASE_URL}/v1/account/password`, {
      method: "POST",
      headers,
      body: JSON.stringify(req),
    });
  };

  try {
    let response = await attempt();
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        response = await attempt();
      }
    }

    if (!response.ok) {
      const message = await response.text();
      return { ok: false, error: message || "Password update failed" };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Password update failed" };
  }
}

export async function getAccountDeletionStatus(): Promise<AccountDeletionStatus | null> {
  const payload = await requestJson<unknown>("/v1/account/deletion");
  if (!payload) return null;
  return accountDeletionStatusSchema.parse(payload);
}

export async function getAccountDataExportStatus(): Promise<AccountDataExportStatus | null> {
  const payload = await requestJson<unknown>("/v1/account/data-export");
  if (!payload) return null;
  return accountDataExportStatusSchema.parse(payload);
}

export async function listMemberInvites(): Promise<MemberInvite[]> {
  const payload = await requestJson<unknown>("/v1/account/invites");
  if (!payload || !Array.isArray(payload)) {
    return [];
  }
  return payload.map((entry) => memberInviteSchema.parse(entry));
}

export async function createMemberInvite(
  req: CreateMemberInviteRequest,
): Promise<{ ok: true; invite: MemberInvite } | { ok: false; error: string }> {
  const attempt = async (): Promise<Response> => {
    const headers = await authedHeaders(true);
    return fetch(`${API_BASE_URL}/v1/account/invites`, {
      method: "POST",
      headers,
      body: JSON.stringify(req),
    });
  };

  try {
    let response = await attempt();
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        response = await attempt();
      }
    }

    if (!response.ok) {
      const message = await response.text();
      return { ok: false, error: message || "Invite creation failed" };
    }

    const invite = memberInviteSchema.parse(await response.json());
    return { ok: true, invite };
  } catch {
    return { ok: false, error: "Invite creation failed" };
  }
}

export async function revokeMemberInvite(
  inviteId: string,
): Promise<{ ok: true; invite: MemberInvite } | { ok: false; error: string }> {
  const attempt = async (): Promise<Response> => {
    const headers = await authedHeaders(true);
    return fetch(`${API_BASE_URL}/v1/account/invites/${encodeURIComponent(inviteId)}/revoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
  };

  try {
    let response = await attempt();
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        response = await attempt();
      }
    }

    if (!response.ok) {
      const message = await response.text();
      return { ok: false, error: message || "Invite revoke failed" };
    }

    const invite = memberInviteSchema.parse(await response.json());
    return { ok: true, invite };
  } catch {
    return { ok: false, error: "Invite revoke failed" };
  }
}

export async function requestAccountDeletion(
  req: RequestAccountDeletion,
): Promise<{ ok: true; status: AccountDeletionStatus } | { ok: false; error: string }> {
  const attempt = async (): Promise<Response> => {
    const headers = await authedHeaders(true);
    return fetch(`${API_BASE_URL}/v1/account/deletion/request`, {
      method: "POST",
      headers,
      body: JSON.stringify(req),
    });
  };

  try {
    let response = await attempt();
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        response = await attempt();
      }
    }

    if (!response.ok) {
      const message = await response.text();
      return { ok: false, error: message || "Request failed" };
    }

    const status = accountDeletionStatusSchema.parse(await response.json());
    return { ok: true, status };
  } catch {
    return { ok: false, error: "Request failed" };
  }
}

export async function requestAccountDataExport(): Promise<
  { ok: true; status: AccountDataExportStatus } | { ok: false; error: string }
> {
  const attempt = async (): Promise<Response> => {
    const headers = await authedHeaders(true);
    return fetch(`${API_BASE_URL}/v1/account/data-export/request`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
  };

  try {
    let response = await attempt();
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        response = await attempt();
      }
    }

    if (!response.ok) {
      const message = await response.text();
      return { ok: false, error: message || "Export request failed" };
    }

    const status = accountDataExportStatusSchema.parse(await response.json());
    return { ok: true, status };
  } catch {
    return { ok: false, error: "Export request failed" };
  }
}

export async function downloadAccountDataExport(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const attempt = async (): Promise<Response> => {
    const headers = await authedHeaders(false);
    return fetch(`${API_BASE_URL}/v1/account/data-export/download`, {
      method: "GET",
      headers,
      cache: "no-store",
    });
  };

  try {
    let response = await attempt();
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        response = await attempt();
      }
    }

    if (!response.ok) {
      const message = await response.text();
      return { ok: false, error: message || "Download failed" };
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const disposition = response.headers.get("content-disposition");
    const filename = parseDownloadFilename(disposition) ?? "rss-wrangler-account-export.json";

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);

    return { ok: true };
  } catch {
    return { ok: false, error: "Download failed" };
  }
}

export async function cancelAccountDeletion(): Promise<
  { ok: true; status: AccountDeletionStatus } | { ok: false; error: string }
> {
  const attempt = async (): Promise<Response> => {
    const headers = await authedHeaders(true);
    return fetch(`${API_BASE_URL}/v1/account/deletion/cancel`, {
      method: "POST",
      headers,
    });
  };

  try {
    let response = await attempt();
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        response = await attempt();
      }
    }

    if (!response.ok) {
      const message = await response.text();
      return { ok: false, error: message || "Cancel failed" };
    }

    const status = accountDeletionStatusSchema.parse(await response.json());
    return { ok: true, status };
  } catch {
    return { ok: false, error: "Cancel failed" };
  }
}

export async function logout(): Promise<void> {
  const headers = await authedHeaders(false);
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

function parseDownloadFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }
  const match = /filename="([^"]+)"/i.exec(contentDisposition);
  return match?.[1] ?? null;
}

// ---------- Clusters ----------

interface ListClustersResponse {
  data: ClusterCard[];
  nextCursor: string | null;
}

export async function listClusters(
  query: Partial<ListClustersQuery> = {},
): Promise<ListClustersResponse> {
  const parsed = listClustersQuerySchema.parse(query);
  const search = new URLSearchParams({
    limit: String(parsed.limit),
    state: parsed.state,
    sort: parsed.sort,
  });
  if (parsed.folder_id) search.set("folder_id", parsed.folder_id);
  if (parsed.topic_id) search.set("topic_id", parsed.topic_id);
  if (parsed.feed_id) search.set("feed_id", parsed.feed_id);
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

  try {
    return clusterDetailSchema.parse(payload);
  } catch {
    return null;
  }
}

export async function getClusterAiSummary(id: string): Promise<ClusterAiSummaryResponse | null> {
  const payload = await requestJson<unknown>(`/v1/clusters/${encodeURIComponent(id)}/summary`);
  if (!payload) return null;

  try {
    return clusterAiSummaryResponseSchema.parse(payload);
  } catch {
    return null;
  }
}

export async function markClusterRead(id: string): Promise<boolean> {
  const res = await requestJson<unknown>(`/v1/clusters/${encodeURIComponent(id)}/read`, {
    method: "POST",
  });
  return res !== null;
}

export async function markClusterUnread(id: string): Promise<boolean> {
  const res = await requestJson<unknown>(`/v1/clusters/${encodeURIComponent(id)}/unread`, {
    method: "POST",
  });
  return res !== null;
}

export async function markAllRead(
  body: MarkAllReadRequest = {},
): Promise<{ ok: boolean; marked: number; clusterIds: string[] }> {
  const payload = await requestJson<unknown>("/v1/clusters/mark-all-read", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!payload || typeof payload !== "object") {
    return { ok: false, marked: 0, clusterIds: [] };
  }

  const marked = Number((payload as { marked?: unknown }).marked ?? 0);
  const clusterIds = Array.isArray((payload as { clusterIds?: unknown }).clusterIds)
    ? (payload as { clusterIds: unknown[] }).clusterIds.filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  return {
    ok: !Number.isNaN(marked),
    marked: Number.isNaN(marked) ? 0 : marked,
    clusterIds,
  };
}

export async function saveCluster(id: string): Promise<boolean> {
  const res = await requestJson<unknown>(`/v1/clusters/${encodeURIComponent(id)}/save`, {
    method: "POST",
  });
  return res !== null;
}

export async function clusterFeedback(id: string, body: ClusterFeedbackRequest): Promise<boolean> {
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

export async function updateFeed(id: string, body: UpdateFeedRequest): Promise<Feed | null> {
  const payload = await requestJson<unknown>(`/v1/feeds/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!payload) return null;
  return feedSchema.parse(payload);
}

export async function pollFeedNow(id: string, body: PollFeedNowRequest = {}): Promise<boolean> {
  const payload = await requestJson<unknown>(`/v1/feeds/${encodeURIComponent(id)}/poll-now`, {
    method: "POST",
    ...(typeof body.lookbackDays === "number" ? { body: JSON.stringify(body) } : {}),
  });
  return Boolean(
    payload && typeof payload === "object" && (payload as { ok?: unknown }).ok === true,
  );
}

export async function importOpml(
  file: File,
): Promise<{ imported: number; skipped: number; total: number } | null> {
  const xml = await file.text();
  const payload = await requestJson<unknown>("/v1/opml/import", {
    method: "POST",
    body: JSON.stringify({ opml: xml }),
  });
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const imported = Number((payload as { imported?: unknown }).imported ?? 0);
  const skipped = Number((payload as { skipped?: unknown }).skipped ?? 0);
  const total = Number((payload as { total?: unknown }).total ?? imported + skipped);

  if (Number.isNaN(imported) || Number.isNaN(skipped) || Number.isNaN(total)) {
    return null;
  }

  return { imported, skipped, total };
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

// ---------- Search ----------

interface SearchClustersResponse {
  data: ClusterCard[];
  nextCursor: string | null;
}

interface SearchClustersOptions {
  cursor?: string;
  folderId?: string;
  feedId?: string;
}

export async function searchClusters(
  q: string,
  limit = 20,
  options: SearchClustersOptions = {},
): Promise<SearchClustersResponse> {
  const parsed = searchQuerySchema.parse({ q, limit, ...options });
  const search = new URLSearchParams({
    q: parsed.q,
    limit: String(parsed.limit),
  });
  if (parsed.cursor) search.set("cursor", parsed.cursor);
  if (parsed.folderId) search.set("folderId", parsed.folderId);
  if (parsed.feedId) search.set("feedId", parsed.feedId);

  const payload = await requestJson<unknown>(`/v1/search?${search.toString()}`);
  if (!payload) return { data: [], nextCursor: null };

  const data = Array.isArray((payload as { data?: unknown }).data)
    ? (payload as { data: unknown[] }).data.map((entry) => clusterCardSchema.parse(entry))
    : [];

  const nextCursor =
    typeof (payload as { nextCursor?: unknown }).nextCursor === "string"
      ? (payload as { nextCursor: string }).nextCursor
      : null;

  return { data, nextCursor };
}

// ---------- OPML Export ----------

export async function exportOpml(): Promise<void> {
  const token = await ensureValidToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    const res = await fetch(`${API_BASE_URL}/v1/opml/export`, { headers });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rss-wrangler-export.opml";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // best-effort
  }
}

// ---------- Annotations ----------

export async function createAnnotation(
  clusterId: string,
  body: CreateAnnotationRequest,
): Promise<Annotation | null> {
  const payload = await requestJson<unknown>(
    `/v1/clusters/${encodeURIComponent(clusterId)}/annotations`,
    { method: "POST", body: JSON.stringify(body) },
  );
  if (!payload) return null;
  return annotationSchema.parse(payload);
}

// ---------- Push Notifications ----------

export async function getVapidKey(): Promise<string | null> {
  const payload = await requestJson<unknown>("/v1/push/vapid-key");
  if (!payload) return null;
  return (payload as { publicKey: string }).publicKey || null;
}

export async function subscribePush(
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<boolean> {
  const res = await requestJson<unknown>("/v1/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint, keys: { p256dh, auth } }),
  });
  return res !== null;
}

export async function unsubscribePush(endpoint: string): Promise<boolean> {
  const res = await requestJson<unknown>("/v1/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
  return res !== null;
}

// ---------- Dwell Tracking ----------

export async function recordDwell(clusterId: string, seconds: number): Promise<boolean> {
  const res = await requestJson<unknown>(`/v1/clusters/${encodeURIComponent(clusterId)}/dwell`, {
    method: "POST",
    body: JSON.stringify({ seconds }),
  });
  return res !== null;
}

type AutoReadEventType = "auto_read_on_scroll" | "auto_read_on_open";
type AutoReadLayout = "list" | "compact" | "card";

function buildIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export async function recordAutoReadEvent(
  type: AutoReadEventType,
  payload: { clusterId: string; feedId: string; layout: AutoReadLayout },
): Promise<boolean> {
  const response = await requestJson<unknown>("/v1/events", {
    method: "POST",
    body: JSON.stringify({
      events: [
        {
          idempotencyKey: buildIdempotencyKey(type),
          ts: new Date().toISOString(),
          type,
          payload,
        },
      ],
    }),
  });

  if (!response) return false;
  try {
    recordEventsResponseSchema.parse(response);
    return true;
  } catch {
    return false;
  }
}

// ---------- Topics ----------

export async function listTopics(): Promise<Topic[]> {
  const payload = await requestJson<unknown>("/v1/topics");
  if (!payload || !Array.isArray(payload)) return [];
  return payload.map((entry) => topicSchema.parse(entry));
}

// ---------- Feed Topic Classifications ----------

interface PendingFeed extends Feed {
  pendingTopics?: FeedTopic[];
}

export async function getPendingClassifications(): Promise<PendingFeed[]> {
  const payload = await requestJson<unknown>("/v1/feeds/pending");
  if (!payload || !Array.isArray(payload)) return [];
  return payload as PendingFeed[];
}

export async function getFeedTopics(feedId: string): Promise<FeedTopic[]> {
  const payload = await requestJson<unknown>(`/v1/feeds/${encodeURIComponent(feedId)}/topics`);
  if (!payload || !Array.isArray(payload)) return [];
  return payload.map((entry) => feedTopicSchema.parse(entry));
}

export async function resolveFeedTopic(
  feedId: string,
  topicId: string,
  action: "approve" | "reject",
): Promise<boolean> {
  const res = await requestJson<unknown>(`/v1/feeds/${encodeURIComponent(feedId)}/topics/resolve`, {
    method: "POST",
    body: JSON.stringify({ topicId, action }),
  });
  return res !== null;
}

export async function approveAllFeedTopics(feedId: string): Promise<boolean> {
  const res = await requestJson<unknown>(
    `/v1/feeds/${encodeURIComponent(feedId)}/topics/approve-all`,
    { method: "POST" },
  );
  return res !== null;
}

// ---------- Stats ----------

export async function getReadingStats(period: StatsPeriod = "7d"): Promise<ReadingStats> {
  const payload = await requestJson<unknown>(`/v1/stats?period=${period}`);
  if (!payload) {
    return {
      articlesReadToday: 0,
      articlesReadWeek: 0,
      articlesReadMonth: 0,
      autoReadOnScrollCount: 0,
      autoReadOnOpenCount: 0,
      autoReadTotalCount: 0,
      feedParseSuccessCount: 0,
      feedParseFailureCount: 0,
      feedParseByFormat: {
        rss: 0,
        atom: 0,
        rdf: 0,
        json: 0,
      },
      avgDwellSeconds: 0,
      folderBreakdown: [],
      topSources: [],
      readingStreak: 0,
      peakHours: [],
      dailyReads: [],
    };
  }
  return readingStatsSchema.parse(payload);
}

// ---------- Members ----------

export async function listAccountMembers(): Promise<Member[]> {
  const payload = await requestJson<unknown>("/v1/account/members");
  if (!payload || !Array.isArray(payload)) return [];
  return payload.map((entry) => memberSchema.parse(entry));
}

export async function listMembers(): Promise<Member[]> {
  return listAccountMembers();
}

export async function removeMember(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = await authedHeaders(true);
    const res = await fetch(`${API_BASE_URL}/v1/account/members/${encodeURIComponent(id)}/remove`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const message = await res.text();
      return { ok: false, error: message || "Remove failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Remove failed" };
  }
}

export async function updateMemberRole(
  id: string,
  body: UpdateMemberRequest,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = await authedHeaders(true);
    const res = await fetch(`${API_BASE_URL}/v1/account/members/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const message = await res.text();
      return { ok: false, error: message || "Update failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Update failed" };
  }
}

// ---------- Billing ----------

export async function getAccountEntitlements(): Promise<AccountEntitlements | null> {
  const payload = await requestJson<unknown>("/v1/account/entitlements");
  if (!payload) return null;
  return accountEntitlementsSchema.parse(payload);
}

export async function getBillingOverview(): Promise<BillingOverview | null> {
  const payload = await requestJson<unknown>("/v1/billing");
  if (!payload) return null;
  return billingOverviewSchema.parse(payload);
}

export async function createBillingCheckout(
  planId: HostedPlanId,
  interval: BillingInterval = "monthly",
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const headers = await authedHeaders(true);
    const res = await fetch(`${API_BASE_URL}/v1/billing/checkout`, {
      method: "POST",
      headers,
      body: JSON.stringify({ planId, interval }),
    });

    if (!res.ok) {
      const message = await res.text();
      return { ok: false, error: message || "Checkout failed" };
    }

    const body = billingCheckoutResponseSchema.parse(await res.json());
    return { ok: true, url: body.url };
  } catch {
    return { ok: false, error: "Checkout failed" };
  }
}

export async function getBillingPortalUrl(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  try {
    const headers = await authedHeaders(false);
    const res = await fetch(`${API_BASE_URL}/v1/billing/portal`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      const message = await res.text();
      return { ok: false, error: message || "Billing portal unavailable" };
    }

    const body = billingPortalResponseSchema.parse(await res.json());
    return { ok: true, url: body.url };
  } catch {
    return { ok: false, error: "Billing portal unavailable" };
  }
}

export async function updateBillingSubscription(action: BillingSubscriptionAction): Promise<
  | {
      ok: true;
      subscriptionStatus: BillingOverview["subscriptionStatus"];
      cancelAtPeriodEnd: boolean;
      currentPeriodEndsAt: string | null;
      customerPortalUrl: string | null;
    }
  | { ok: false; error: string }
> {
  try {
    const headers = await authedHeaders(true);
    const res = await fetch(`${API_BASE_URL}/v1/billing/subscription-action`, {
      method: "POST",
      headers,
      body: JSON.stringify({ action }),
    });

    if (!res.ok) {
      const message = await res.text();
      return { ok: false, error: message || "Subscription update failed" };
    }

    const body = billingSubscriptionActionResponseSchema.parse(await res.json());
    return {
      ok: true,
      subscriptionStatus: body.subscriptionStatus,
      cancelAtPeriodEnd: body.cancelAtPeriodEnd,
      currentPeriodEndsAt: body.currentPeriodEndsAt,
      customerPortalUrl: body.customerPortalUrl,
    };
  } catch {
    return { ok: false, error: "Subscription update failed" };
  }
}

// ---------- Privacy consent ----------

export async function getPrivacyConsent(): Promise<PrivacyConsent | null> {
  const payload = await requestJson<unknown>("/v1/privacy/consent");
  if (!payload) return null;
  return privacyConsentSchema.parse(payload);
}

export async function updatePrivacyConsent(
  body: UpdatePrivacyConsentRequest,
): Promise<{ ok: true; consent: PrivacyConsent } | { ok: false; error: string }> {
  try {
    const headers = await authedHeaders(true);
    const res = await fetch(`${API_BASE_URL}/v1/privacy/consent`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const message = await res.text();
      return { ok: false, error: message || "Privacy settings update failed" };
    }

    const consent = privacyConsentSchema.parse(await res.json());
    return { ok: true, consent };
  } catch {
    return { ok: false, error: "Privacy settings update failed" };
  }
}

// ---------- AI Usage ----------

export async function getAiUsage(month?: string): Promise<AiUsageSummary | null> {
  const params = month ? `?month=${encodeURIComponent(month)}` : "";
  const payload = await requestJson<unknown>(`/v1/ai/usage${params}`);
  if (!payload) return null;
  return aiUsageSummarySchema.parse(payload);
}

// ---------- Sponsored Placements ----------

export async function listSponsoredPlacements(): Promise<SponsoredCard[]> {
  const payload = await requestJson<unknown>("/v1/sponsored-placements");
  if (!payload || !Array.isArray(payload)) return [];
  return payload.map((entry) => sponsoredCardSchema.parse(entry));
}

export async function trackSponsoredImpression(id: string): Promise<void> {
  await requestJson<unknown>(`/v1/sponsored-placements/${encodeURIComponent(id)}/impression`, {
    method: "POST",
  });
}

export async function trackSponsoredClick(id: string): Promise<void> {
  await requestJson<unknown>(`/v1/sponsored-placements/${encodeURIComponent(id)}/click`, {
    method: "POST",
  });
}

// ---------- Feed Recommendations ----------

export async function getRecommendations(): Promise<FeedRecommendation[]> {
  const payload = await requestJson<unknown>("/v1/recommendations");
  if (!payload || typeof payload !== "object") return [];
  try {
    const parsed = feedRecommendationsResponseSchema.parse(payload);
    return parsed.recommendations;
  } catch {
    return [];
  }
}

export async function dismissRecommendation(id: string): Promise<boolean> {
  const res = await requestJson<unknown>(`/v1/recommendations/${encodeURIComponent(id)}/dismiss`, {
    method: "POST",
  });
  return res !== null;
}
