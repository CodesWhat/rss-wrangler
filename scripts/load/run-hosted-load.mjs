import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_PROFILE_PATH = path.resolve("infra/load/profiles/phase0-hosted-api-baseline.json");
const DEFAULT_OUTPUT_PATH = path.resolve("infra/load/results/latest-api-load.json");
const DEFAULT_TIMEOUT_MS = 10_000;

const OPERATION_CATALOG = {
  clusters_unread: {
    method: "GET",
    path: "/v1/clusters?limit=20&state=unread&sort=personal",
    expectedStatus: [200],
    requiresAuth: true
  },
  clusters_latest: {
    method: "GET",
    path: "/v1/clusters?limit=20&state=all&sort=latest",
    expectedStatus: [200],
    requiresAuth: true
  },
  settings_get: {
    method: "GET",
    path: "/v1/settings",
    expectedStatus: [200],
    requiresAuth: true
  },
  feeds_list: {
    method: "GET",
    path: "/v1/feeds",
    expectedStatus: [200],
    requiresAuth: true
  },
  folders_list: {
    method: "GET",
    path: "/v1/folders",
    expectedStatus: [200],
    requiresAuth: true
  },
  digests_list: {
    method: "GET",
    path: "/v1/digests",
    expectedStatus: [200],
    requiresAuth: true
  },
  stats_get: {
    method: "GET",
    path: "/v1/stats?period=7d",
    expectedStatus: [200],
    requiresAuth: true
  },
  events_post: {
    method: "POST",
    path: "/v1/events",
    expectedStatus: [200],
    requiresAuth: true
  },
  settings_patch: {
    method: "POST",
    path: "/v1/settings",
    expectedStatus: [200],
    requiresAuth: true
  },
  cluster_mark_read: {
    method: "POST",
    path: "/v1/clusters/{clusterId}/read",
    expectedStatus: [200],
    requiresAuth: true,
    needsClusterId: true
  },
  cluster_save: {
    method: "POST",
    path: "/v1/clusters/{clusterId}/save",
    expectedStatus: [200],
    requiresAuth: true,
    needsClusterId: true
  },
  feed_add: {
    method: "POST",
    path: "/v1/feeds",
    expectedStatus: [200],
    requiresAuth: true
  }
};

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const trimmed = token.slice(2);
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex >= 0) {
      const key = trimmed.slice(0, separatorIndex);
      const value = trimmed.slice(separatorIndex + 1);
      args[key] = value;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[trimmed] = next;
      i++;
    } else {
      args[trimmed] = "true";
    }
  }

  return args;
}

function toNumber(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeBaseUrl(rawBaseUrl) {
  const value = (rawBaseUrl || "").trim();
  if (!value) {
    throw new Error("baseUrl is required (example: http://localhost:4000)");
  }
  return value.replace(/\/+$/, "");
}

function readJsonFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `failed to read JSON file: ${filePath} (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

function validateUsers(usersFile) {
  const raw = readJsonFile(usersFile);
  const users = Array.isArray(raw) ? raw : raw?.users;

  if (!Array.isArray(users) || users.length === 0) {
    throw new Error(`users file must contain a non-empty users array: ${usersFile}`);
  }

  return users.map((user, index) => {
    const tenantSlug = typeof user?.tenantSlug === "string" ? user.tenantSlug.trim() : "";
    const username = typeof user?.username === "string" ? user.username.trim() : "";
    const password = typeof user?.password === "string" ? user.password : "";

    if (!tenantSlug || !username || !password) {
      throw new Error(
        `invalid user at index ${index}. Required keys: tenantSlug, username, password`
      );
    }

    return { tenantSlug, username, password };
  });
}

function validateProfile(profileRaw) {
  if (!profileRaw || typeof profileRaw !== "object") {
    throw new Error("profile JSON must be an object");
  }

  const durationSeconds = toNumber(profileRaw.durationSeconds, NaN);
  const virtualUsers = toNumber(profileRaw.virtualUsers, NaN);
  const warmupSeconds = toNumber(profileRaw.warmupSeconds, 0);

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("profile.durationSeconds must be > 0");
  }
  if (!Number.isFinite(virtualUsers) || virtualUsers <= 0) {
    throw new Error("profile.virtualUsers must be > 0");
  }

  const thinkTimeMs = profileRaw.thinkTimeMs ?? {};
  const thinkMin = toNumber(thinkTimeMs.min, 0);
  const thinkMax = toNumber(thinkTimeMs.max, thinkMin);

  const scenarios = Array.isArray(profileRaw.scenarios) ? profileRaw.scenarios : [];
  if (scenarios.length === 0) {
    throw new Error("profile.scenarios must contain at least one scenario");
  }

  const normalizedScenarios = scenarios.map((scenario, index) => {
    const op = typeof scenario?.op === "string" ? scenario.op : "";
    const catalogEntry = OPERATION_CATALOG[op];
    if (!catalogEntry) {
      throw new Error(`profile scenario[${index}] has unknown op: ${op}`);
    }

    const weight = toNumber(scenario.weight, NaN);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`profile scenario[${index}] weight must be > 0`);
    }

    return {
      op,
      weight,
      slo: scenario.slo ?? {},
      expectedStatus: Array.isArray(scenario.expectedStatus)
        ? scenario.expectedStatus
        : catalogEntry.expectedStatus
    };
  });

  return {
    name: typeof profileRaw.name === "string" ? profileRaw.name : "unnamed-profile",
    durationSeconds,
    warmupSeconds,
    virtualUsers,
    thinkTimeMs: {
      min: Math.max(0, thinkMin),
      max: Math.max(thinkMin, thinkMax)
    },
    scenarios: normalizedScenarios,
    globalSlo: profileRaw.globalSlo ?? {}
  };
}

function randomIntInclusive(min, max) {
  const low = Math.floor(min);
  const high = Math.floor(max);
  if (high <= low) return low;
  return low + Math.floor(Math.random() * (high - low + 1));
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))];
}

function createBucket() {
  return {
    selected: 0,
    requests: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    durationsMs: [],
    statusCounts: {},
    errorCounts: {}
  };
}

function getBucket(metrics, op) {
  if (!metrics.byScenario[op]) {
    metrics.byScenario[op] = createBucket();
  }
  return metrics.byScenario[op];
}

function incrementCounter(mapLike, key) {
  mapLike[key] = (mapLike[key] ?? 0) + 1;
}

function recordSelection(metrics, op, collecting) {
  if (!collecting) {
    return;
  }
  const bucket = getBucket(metrics, op);
  bucket.selected += 1;
}

function recordSkipped(metrics, op, reason, collecting) {
  if (!collecting) {
    return;
  }

  const bucket = getBucket(metrics, op);
  bucket.skipped += 1;
  incrementCounter(bucket.errorCounts, reason);

  metrics.totals.skipped += 1;
}

function recordResult(metrics, op, result, collecting) {
  if (!collecting) {
    return;
  }

  const bucket = getBucket(metrics, op);
  bucket.requests += 1;
  bucket.durationsMs.push(result.durationMs);

  metrics.totals.requests += 1;
  metrics.totals.durationsMs.push(result.durationMs);

  if (typeof result.statusCode === "number") {
    incrementCounter(bucket.statusCounts, String(result.statusCode));
    incrementCounter(metrics.totals.statusCounts, String(result.statusCode));
  }

  if (result.success) {
    bucket.success += 1;
    metrics.totals.success += 1;
    return;
  }

  bucket.failed += 1;
  metrics.totals.failed += 1;

  if (result.errorType) {
    incrementCounter(bucket.errorCounts, result.errorType);
    incrementCounter(metrics.totals.errorCounts, result.errorType);
  }
}

function chooseScenario(scenarios, totalWeight) {
  let remaining = Math.random() * totalWeight;

  for (const scenario of scenarios) {
    remaining -= scenario.weight;
    if (remaining <= 0) {
      return scenario;
    }
  }

  return scenarios[scenarios.length - 1];
}

async function requestWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loginSession(baseUrl, user, timeoutMs) {
  const startedAt = performance.now();

  try {
    const response = await requestWithTimeout(
      `${baseUrl}/v1/auth/login`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          username: user.username,
          password: user.password,
          tenantSlug: user.tenantSlug
        })
      },
      timeoutMs
    );

    const durationMs = performance.now() - startedAt;
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        durationMs,
        errorType: "login_http_error"
      };
    }

    if (!payload?.accessToken || !payload?.refreshToken) {
      return {
        ok: false,
        statusCode: response.status,
        durationMs,
        errorType: "login_invalid_payload"
      };
    }

    const expiresInSeconds = Number(payload?.expiresInSeconds) || 900;

    return {
      ok: true,
      statusCode: response.status,
      durationMs,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAtMs: Date.now() + expiresInSeconds * 1000
    };
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    const errorName = error instanceof Error ? error.name : "unknown_error";
    return {
      ok: false,
      statusCode: null,
      durationMs,
      errorType: errorName === "AbortError" ? "timeout" : "login_network_error"
    };
  }
}

async function ensureSessionAuth(context, state, collecting) {
  const expiresSoon = !state.accessToken || Date.now() + 5_000 >= state.expiresAtMs;
  if (!expiresSoon) {
    return true;
  }

  const result = await loginSession(context.baseUrl, state.user, context.timeoutMs);
  recordSelection(context.metrics, "auth_login", collecting);
  recordResult(
    context.metrics,
    "auth_login",
    {
      durationMs: result.durationMs,
      statusCode: result.statusCode,
      success: result.ok,
      errorType: result.errorType ?? null
    },
    collecting
  );

  if (!result.ok) {
    state.accessToken = null;
    state.refreshToken = null;
    state.expiresAtMs = 0;
    return false;
  }

  state.accessToken = result.accessToken;
  state.refreshToken = result.refreshToken;
  state.expiresAtMs = result.expiresAtMs;
  return true;
}

async function fetchClusterIds(context, state, collecting) {
  if (!(await ensureSessionAuth(context, state, collecting))) {
    return false;
  }

  const startedAt = performance.now();
  try {
    const response = await requestWithTimeout(
      `${context.baseUrl}/v1/clusters?limit=20&state=all&sort=latest`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${state.accessToken}`
        }
      },
      context.timeoutMs
    );
    const durationMs = performance.now() - startedAt;

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const success = response.status === 200 && Array.isArray(payload?.data);
    recordSelection(context.metrics, "clusters_prefetch", collecting);
    recordResult(
      context.metrics,
      "clusters_prefetch",
      {
        durationMs,
        statusCode: response.status,
        success,
        errorType: success ? null : "prefetch_http_error"
      },
      collecting
    );

    if (!success) {
      return false;
    }

    state.clusterIds = payload.data
      .map((row) => (typeof row?.id === "string" ? row.id : null))
      .filter(Boolean);
    state.clusterCursor = 0;
    return true;
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    const errorName = error instanceof Error ? error.name : "unknown_error";

    recordSelection(context.metrics, "clusters_prefetch", collecting);
    recordResult(
      context.metrics,
      "clusters_prefetch",
      {
        durationMs,
        statusCode: null,
        success: false,
        errorType: errorName === "AbortError" ? "timeout" : "prefetch_network_error"
      },
      collecting
    );
    return false;
  }
}

function resolveClusterId(state) {
  if (!Array.isArray(state.clusterIds) || state.clusterIds.length === 0) {
    return null;
  }

  const id = state.clusterIds[state.clusterCursor % state.clusterIds.length];
  state.clusterCursor = (state.clusterCursor + 1) % state.clusterIds.length;
  return id;
}

function buildOperationRequest(op, context, state) {
  const catalog = OPERATION_CATALOG[op];
  if (!catalog) {
    throw new Error(`unknown operation: ${op}`);
  }

  const request = {
    method: catalog.method,
    path: catalog.path,
    body: null,
    expectedStatus: catalog.expectedStatus,
    requiresAuth: catalog.requiresAuth,
    needsClusterId: Boolean(catalog.needsClusterId)
  };

  if (op === "events_post") {
    request.body = {
      events: [
        {
          idempotencyKey: `${state.user.tenantSlug}-${state.user.username}-${Date.now()}-${randomUUID()}`,
          ts: nowIso(),
          type: "loadtest.scroll",
          payload: {
            source: "phase0-load-test",
            vu: state.vuIndex
          }
        }
      ]
    };
  }

  if (op === "settings_patch") {
    request.body = {
      digestBacklogThreshold: 50
    };
  }

  if (op === "feed_add") {
    state.feedAddCounter += 1;
    const uniqueUrl = `https://loadtest.invalid/${state.user.tenantSlug}/vu-${state.vuIndex}/feed-${context.runId}-${state.feedAddCounter}.xml`;
    request.body = {
      url: uniqueUrl
    };
  }

  if (request.needsClusterId) {
    const clusterId = resolveClusterId(state);
    if (!clusterId) {
      return {
        skipReason: "missing_cluster_id"
      };
    }
    request.path = request.path.replace("{clusterId}", clusterId);
  }

  return request;
}

async function executeOperation(context, state, scenario, collecting) {
  const op = scenario.op;

  if (!(await ensureSessionAuth(context, state, collecting))) {
    return {
      skipped: true,
      skipReason: "login_failed"
    };
  }

  if (
    (op === "cluster_mark_read" || op === "cluster_save") &&
    (!Array.isArray(state.clusterIds) || state.clusterIds.length === 0)
  ) {
    await fetchClusterIds(context, state, collecting);
  }

  const request = buildOperationRequest(op, context, state);
  if (request.skipReason) {
    return {
      skipped: true,
      skipReason: request.skipReason
    };
  }

  const headers = {};
  if (request.requiresAuth) {
    headers.authorization = `Bearer ${state.accessToken}`;
  }
  if (request.body !== null) {
    headers["content-type"] = "application/json";
  }

  const url = `${context.baseUrl}${request.path}`;

  const perform = async () => {
    const startedAt = performance.now();
    try {
      const response = await requestWithTimeout(
        url,
        {
          method: request.method,
          headers,
          body: request.body ? JSON.stringify(request.body) : undefined
        },
        context.timeoutMs
      );
      const durationMs = performance.now() - startedAt;

      let payload = null;
      if (op === "clusters_unread" || op === "clusters_latest") {
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
      }

      return {
        ok: true,
        statusCode: response.status,
        durationMs,
        payload
      };
    } catch (error) {
      const durationMs = performance.now() - startedAt;
      const errorName = error instanceof Error ? error.name : "unknown_error";
      return {
        ok: false,
        statusCode: null,
        durationMs,
        errorType: errorName === "AbortError" ? "timeout" : "network_error",
        payload: null
      };
    }
  };

  let result = await perform();

  if (result.ok && result.statusCode === 401) {
    state.accessToken = null;
    state.refreshToken = null;
    state.expiresAtMs = 0;

    if (!(await ensureSessionAuth(context, state, collecting))) {
      return {
        skipped: true,
        skipReason: "relogin_failed"
      };
    }

    result = await perform();
  }

  if (result.ok && (op === "clusters_unread" || op === "clusters_latest") && Array.isArray(result.payload?.data)) {
    state.clusterIds = result.payload.data
      .map((row) => (typeof row?.id === "string" ? row.id : null))
      .filter(Boolean);
    state.clusterCursor = 0;
  }

  const expectedStatus = Array.isArray(scenario.expectedStatus) && scenario.expectedStatus.length > 0
    ? scenario.expectedStatus
    : OPERATION_CATALOG[op].expectedStatus;

  const success = result.ok && expectedStatus.includes(result.statusCode);

  return {
    skipped: false,
    durationMs: result.durationMs,
    statusCode: result.statusCode,
    success,
    errorType: success ? null : result.errorType ?? "unexpected_status"
  };
}

function summarizeBucket(bucket, totalDurationSeconds) {
  const p50Ms = percentile(bucket.durationsMs, 50);
  const p95Ms = percentile(bucket.durationsMs, 95);
  const errorRate = bucket.requests > 0 ? bucket.failed / bucket.requests : 0;

  return {
    selected: bucket.selected,
    requests: bucket.requests,
    skipped: bucket.skipped,
    success: bucket.success,
    failed: bucket.failed,
    errorRate,
    rps: totalDurationSeconds > 0 ? bucket.requests / totalDurationSeconds : 0,
    p50Ms,
    p95Ms,
    statusCounts: bucket.statusCounts,
    errorCounts: bucket.errorCounts
  };
}

function evaluateSlo(report, profile) {
  const checks = [];

  const addCheck = (name, passed, actual, target) => {
    checks.push({ name, passed, actual, target });
  };

  const totals = report.totals;

  if (typeof profile.globalSlo?.minRequests === "number") {
    addCheck(
      "global.minRequests",
      totals.requests >= profile.globalSlo.minRequests,
      totals.requests,
      `>= ${profile.globalSlo.minRequests}`
    );
  }

  if (typeof profile.globalSlo?.p95Ms === "number") {
    addCheck(
      "global.p95Ms",
      (totals.p95Ms ?? Infinity) <= profile.globalSlo.p95Ms,
      totals.p95Ms,
      `<= ${profile.globalSlo.p95Ms}`
    );
  }

  if (typeof profile.globalSlo?.errorRateMax === "number") {
    addCheck(
      "global.errorRateMax",
      totals.errorRate <= profile.globalSlo.errorRateMax,
      totals.errorRate,
      `<= ${profile.globalSlo.errorRateMax}`
    );
  }

  for (const scenario of profile.scenarios) {
    const summary = report.scenarios[scenario.op];
    if (!summary) {
      continue;
    }

    if (typeof scenario.slo?.minRequests === "number") {
      addCheck(
        `${scenario.op}.minRequests`,
        summary.requests >= scenario.slo.minRequests,
        summary.requests,
        `>= ${scenario.slo.minRequests}`
      );
    }

    if (typeof scenario.slo?.p95Ms === "number") {
      addCheck(
        `${scenario.op}.p95Ms`,
        (summary.p95Ms ?? Infinity) <= scenario.slo.p95Ms,
        summary.p95Ms,
        `<= ${scenario.slo.p95Ms}`
      );
    }

    if (typeof scenario.slo?.errorRateMax === "number") {
      addCheck(
        `${scenario.op}.errorRateMax`,
        summary.errorRate <= scenario.slo.errorRateMax,
        summary.errorRate,
        `<= ${scenario.slo.errorRateMax}`
      );
    }
  }

  return {
    passed: checks.every((check) => check.passed),
    checks
  };
}

export async function runHostedLoad(options = {}) {
  const profilePath = options.profilePath ? path.resolve(options.profilePath) : DEFAULT_PROFILE_PATH;
  const usersPath = options.usersPath ? path.resolve(options.usersPath) : "";
  const outputPath = options.outputPath ? path.resolve(options.outputPath) : DEFAULT_OUTPUT_PATH;

  if (!usersPath) {
    throw new Error("users file is required. Pass --users <path>");
  }

  const profile = validateProfile(readJsonFile(profilePath));
  const users = validateUsers(usersPath);
  const baseUrl = sanitizeBaseUrl(options.baseUrl ?? "http://localhost:4000");
  const timeoutMs = toNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS);

  const runId = `${Date.now()}`;
  const startedAt = Date.now();
  const warmupUntilMs = startedAt + profile.warmupSeconds * 1000;
  const stopAtMs = warmupUntilMs + profile.durationSeconds * 1000;
  const totalWeight = profile.scenarios.reduce((sum, scenario) => sum + scenario.weight, 0);

  const metrics = {
    byScenario: {},
    totals: {
      requests: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      durationsMs: [],
      statusCounts: {},
      errorCounts: {}
    }
  };

  const context = {
    runId,
    baseUrl,
    timeoutMs,
    profile,
    metrics
  };

  const vuTasks = [];

  for (let vuIndex = 0; vuIndex < profile.virtualUsers; vuIndex++) {
    const user = users[vuIndex % users.length];
    const state = {
      vuIndex,
      user,
      accessToken: null,
      refreshToken: null,
      expiresAtMs: 0,
      clusterIds: [],
      clusterCursor: 0,
      feedAddCounter: 0
    };

    const task = (async () => {
      while (Date.now() < stopAtMs) {
        const collecting = Date.now() >= warmupUntilMs;
        const scenario = chooseScenario(profile.scenarios, totalWeight);

        recordSelection(metrics, scenario.op, collecting);

        const result = await executeOperation(context, state, scenario, collecting);

        if (result.skipped) {
          recordSkipped(metrics, scenario.op, result.skipReason, collecting);
        } else {
          recordResult(metrics, scenario.op, result, collecting);
        }

        const sleepMs = randomIntInclusive(profile.thinkTimeMs.min, profile.thinkTimeMs.max);
        if (sleepMs > 0) {
          await sleep(sleepMs);
        }
      }
    })();

    vuTasks.push(task);
  }

  await Promise.all(vuTasks);

  const endedAt = Date.now();
  const measuredDurationSeconds = Math.max(1, Math.round((endedAt - warmupUntilMs) / 1000));

  const scenarioSummaries = {};
  for (const [op, bucket] of Object.entries(metrics.byScenario)) {
    scenarioSummaries[op] = summarizeBucket(bucket, measuredDurationSeconds);
  }

  const totalsSummary = summarizeBucket(
    {
      ...metrics.totals,
      selected: Object.values(metrics.byScenario).reduce((sum, bucket) => sum + bucket.selected, 0)
    },
    measuredDurationSeconds
  );

  const report = {
    runId,
    profile: profile.name,
    baseUrl,
    users: users.length,
    startedAt: new Date(startedAt).toISOString(),
    warmupUntil: new Date(warmupUntilMs).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    measuredDurationSeconds,
    config: {
      profilePath,
      usersPath,
      virtualUsers: profile.virtualUsers,
      durationSeconds: profile.durationSeconds,
      warmupSeconds: profile.warmupSeconds,
      thinkTimeMs: profile.thinkTimeMs,
      timeoutMs
    },
    totals: totalsSummary,
    scenarios: scenarioSummaries
  };

  const slo = evaluateSlo(report, profile);
  report.slo = slo;

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`[load] profile: ${profile.name}`);
  console.log(`[load] baseUrl: ${baseUrl}`);
  console.log(`[load] users: ${users.length}, virtualUsers: ${profile.virtualUsers}`);
  console.log(`[load] measured seconds: ${measuredDurationSeconds}`);
  console.log(
    `[load] totals: requests=${report.totals.requests}, errors=${report.totals.failed}, p95=${report.totals.p95Ms ?? "n/a"}ms, errorRate=${(report.totals.errorRate * 100).toFixed(2)}%`
  );
  console.log(`[load] slo: ${slo.passed ? "PASS" : "FAIL"}`);
  console.log(`[load] wrote report: ${outputPath}`);

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await runHostedLoad({
    baseUrl: args["base-url"],
    usersPath: args.users,
    profilePath: args.profile,
    outputPath: args.out,
    timeoutMs: args["timeout-ms"]
  });

  process.exit(report.slo?.passed ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[load] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
