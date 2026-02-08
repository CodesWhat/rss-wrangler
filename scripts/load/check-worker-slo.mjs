import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import pg from "pg";

const DEFAULT_PROFILE_PATH = path.resolve("infra/load/profiles/phase0-worker-slo-baseline.json");
const DEFAULT_OUTPUT_PATH = path.resolve("infra/load/results/latest-worker-slo.json");

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

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `failed to read JSON file: ${filePath} (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

function validateProfile(profileRaw) {
  if (!profileRaw || typeof profileRaw !== "object") {
    throw new Error("worker SLO profile must be an object");
  }

  const queues = Array.isArray(profileRaw.queues)
    ? profileRaw.queues.filter((value) => typeof value === "string" && value.length > 0)
    : [];

  if (queues.length === 0) {
    throw new Error("worker SLO profile requires a non-empty queues array");
  }

  return {
    name: typeof profileRaw.name === "string" ? profileRaw.name : "unnamed-worker-profile",
    queues,
    windowMinutes: toNumber(profileRaw.windowMinutes, 60),
    globalSlo: profileRaw.globalSlo ?? {},
    queueSlo: profileRaw.queueSlo ?? {}
  };
}

async function tableExists(pool, relationName) {
  const { rows } = await pool.query("SELECT to_regclass($1) AS relation_name", [relationName]);
  return rows[0]?.relation_name !== null;
}

async function fetchQueueLag(pool, queues) {
  const { rows } = await pool.query(
    `SELECT
      name,
      COUNT(*)::int AS queued_jobs,
      percentile_cont(0.95) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (NOW() - createdon)) * 1000
      ) AS lag_p95_ms,
      MAX(EXTRACT(EPOCH FROM (NOW() - createdon)) * 1000) AS lag_max_ms
    FROM pgboss.job
    WHERE name = ANY($1)
      AND state IN ('created', 'retry')
    GROUP BY name`,
    [queues]
  );

  const perQueue = {};
  for (const queueName of queues) {
    perQueue[queueName] = {
      queuedJobs: 0,
      lagP95Ms: 0,
      lagMaxMs: 0
    };
  }

  for (const row of rows) {
    const name = String(row.name);
    perQueue[name] = {
      queuedJobs: Number(row.queued_jobs ?? 0),
      lagP95Ms: Number(row.lag_p95_ms ?? 0),
      lagMaxMs: Number(row.lag_max_ms ?? 0)
    };
  }

  const allLags = Object.values(perQueue).map((queue) => queue.lagP95Ms);
  const queuedJobs = Object.values(perQueue).reduce((sum, queue) => sum + queue.queuedJobs, 0);

  return {
    queuedJobs,
    lagP95Ms: allLags.length > 0 ? Math.max(...allLags) : 0,
    perQueue
  };
}

async function fetchTerminalStats(pool, queues, windowMinutes, hasArchiveTable) {
  const baseSelect = hasArchiveTable
    ? "SELECT name, state, completedon FROM pgboss.job UNION ALL SELECT name, state, completedon FROM pgboss.archive"
    : "SELECT name, state, completedon FROM pgboss.job";

  const { rows } = await pool.query(
    `SELECT
      name,
      COUNT(*) FILTER (WHERE state = 'completed')::int AS completed_jobs,
      COUNT(*) FILTER (WHERE state = 'failed')::int AS failed_jobs
    FROM (${baseSelect}) AS history
    WHERE name = ANY($1)
      AND completedon IS NOT NULL
      AND completedon >= NOW() - ($2::int * INTERVAL '1 minute')
      AND state IN ('completed', 'failed')
    GROUP BY name`,
    [queues, windowMinutes]
  );

  const perQueue = {};
  for (const queueName of queues) {
    perQueue[queueName] = {
      completedJobs: 0,
      failedJobs: 0,
      successRate: null
    };
  }

  for (const row of rows) {
    const completed = Number(row.completed_jobs ?? 0);
    const failed = Number(row.failed_jobs ?? 0);
    const total = completed + failed;

    perQueue[String(row.name)] = {
      completedJobs: completed,
      failedJobs: failed,
      successRate: total > 0 ? completed / total : null
    };
  }

  const completedTotal = Object.values(perQueue).reduce((sum, queue) => sum + queue.completedJobs, 0);
  const failedTotal = Object.values(perQueue).reduce((sum, queue) => sum + queue.failedJobs, 0);
  const terminalTotal = completedTotal + failedTotal;

  return {
    completedJobs: completedTotal,
    failedJobs: failedTotal,
    terminalJobs: terminalTotal,
    successRate: terminalTotal > 0 ? completedTotal / terminalTotal : null,
    perQueue
  };
}

function evaluateSlo(result, profile) {
  const checks = [];

  const addCheck = (name, passed, actual, target) => {
    checks.push({ name, passed, actual, target });
  };

  const globalSlo = profile.globalSlo ?? {};

  if (typeof globalSlo.queueLagP95Ms === "number") {
    addCheck(
      "global.queueLagP95Ms",
      result.queueLag.lagP95Ms <= globalSlo.queueLagP95Ms,
      result.queueLag.lagP95Ms,
      `<= ${globalSlo.queueLagP95Ms}`
    );
  }

  if (typeof globalSlo.maxQueuedJobs === "number") {
    addCheck(
      "global.maxQueuedJobs",
      result.queueLag.queuedJobs <= globalSlo.maxQueuedJobs,
      result.queueLag.queuedJobs,
      `<= ${globalSlo.maxQueuedJobs}`
    );
  }

  if (typeof globalSlo.minTerminalJobs === "number") {
    addCheck(
      "global.minTerminalJobs",
      result.terminal.terminalJobs >= globalSlo.minTerminalJobs,
      result.terminal.terminalJobs,
      `>= ${globalSlo.minTerminalJobs}`
    );
  }

  if (typeof globalSlo.successRateMin === "number") {
    addCheck(
      "global.successRateMin",
      (result.terminal.successRate ?? 0) >= globalSlo.successRateMin,
      result.terminal.successRate,
      `>= ${globalSlo.successRateMin}`
    );
  }

  for (const queueName of profile.queues) {
    const queueSlo = profile.queueSlo?.[queueName];
    if (!queueSlo || typeof queueSlo !== "object") {
      continue;
    }

    if (typeof queueSlo.queueLagP95Ms === "number") {
      addCheck(
        `${queueName}.queueLagP95Ms`,
        result.queueLag.perQueue[queueName].lagP95Ms <= queueSlo.queueLagP95Ms,
        result.queueLag.perQueue[queueName].lagP95Ms,
        `<= ${queueSlo.queueLagP95Ms}`
      );
    }

    if (typeof queueSlo.maxQueuedJobs === "number") {
      addCheck(
        `${queueName}.maxQueuedJobs`,
        result.queueLag.perQueue[queueName].queuedJobs <= queueSlo.maxQueuedJobs,
        result.queueLag.perQueue[queueName].queuedJobs,
        `<= ${queueSlo.maxQueuedJobs}`
      );
    }

    if (typeof queueSlo.successRateMin === "number") {
      addCheck(
        `${queueName}.successRateMin`,
        (result.terminal.perQueue[queueName].successRate ?? 0) >= queueSlo.successRateMin,
        result.terminal.perQueue[queueName].successRate,
        `>= ${queueSlo.successRateMin}`
      );
    }
  }

  return {
    passed: checks.every((check) => check.passed),
    checks
  };
}

export async function checkWorkerSlo(options = {}) {
  const profilePath = options.profilePath ? path.resolve(options.profilePath) : DEFAULT_PROFILE_PATH;
  const outputPath = options.outputPath ? path.resolve(options.outputPath) : DEFAULT_OUTPUT_PATH;
  const databaseUrl =
    (options.databaseUrl || process.env.DATABASE_URL || "").trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for worker SLO checks (pass --database-url or env var)");
  }

  const profile = validateProfile(readJsonFile(profilePath));

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const startedAt = Date.now();

  try {
    const hasJobTable = await tableExists(pool, "pgboss.job");
    if (!hasJobTable) {
      throw new Error("pgboss.job table not found; worker queue metrics unavailable");
    }

    const hasArchiveTable = await tableExists(pool, "pgboss.archive");

    const queueLag = await fetchQueueLag(pool, profile.queues);
    const terminal = await fetchTerminalStats(
      pool,
      profile.queues,
      profile.windowMinutes,
      hasArchiveTable
    );

    const result = {
      profile: profile.name,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      windowMinutes: profile.windowMinutes,
      queueLag,
      terminal,
      metadata: {
        hasArchiveTable
      }
    };

    const slo = evaluateSlo(result, profile);
    result.slo = slo;

    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

    console.log(`[worker-slo] profile: ${profile.name}`);
    console.log(`[worker-slo] queues: ${profile.queues.join(", ")}`);
    console.log(`[worker-slo] queuedJobs: ${result.queueLag.queuedJobs}`);
    console.log(`[worker-slo] queueLagP95Ms: ${result.queueLag.lagP95Ms.toFixed(2)}`);
    console.log(`[worker-slo] terminalJobs: ${result.terminal.terminalJobs}`);
    console.log(
      `[worker-slo] successRate: ${result.terminal.successRate === null ? "n/a" : (result.terminal.successRate * 100).toFixed(2) + "%"}`
    );
    console.log(`[worker-slo] slo: ${slo.passed ? "PASS" : "FAIL"}`);
    console.log(`[worker-slo] wrote report: ${outputPath}`);

    return result;
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await checkWorkerSlo({
    profilePath: args.profile,
    outputPath: args.out,
    databaseUrl: args["database-url"]
  });

  process.exit(result.slo?.passed ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[worker-slo] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
