import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { runHostedLoad } from "./run-hosted-load.mjs";
import { checkWorkerSlo } from "./check-worker-slo.mjs";

const DEFAULT_API_PROFILE = path.resolve("infra/load/profiles/phase0-hosted-api-baseline.json");
const DEFAULT_WORKER_PROFILE = path.resolve("infra/load/profiles/phase0-worker-slo-baseline.json");
const DEFAULT_RESULTS_DIR = path.resolve("infra/load/results");

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

export async function runPhase0SloGate(options = {}) {
  const resultsDir = options.resultsDir ? path.resolve(options.resultsDir) : DEFAULT_RESULTS_DIR;
  mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const apiOut = path.resolve(resultsDir, `api-${timestamp}.json`);
  const workerOut = path.resolve(resultsDir, `worker-${timestamp}.json`);
  const gateOut = path.resolve(resultsDir, `gate-${timestamp}.json`);

  const apiResult = await runHostedLoad({
    baseUrl: options.baseUrl,
    usersPath: options.usersPath,
    profilePath: options.apiProfilePath ?? DEFAULT_API_PROFILE,
    outputPath: apiOut,
    timeoutMs: options.timeoutMs
  });

  let workerResult = null;
  let workerError = null;

  if (!options.skipWorker) {
    try {
      workerResult = await checkWorkerSlo({
        profilePath: options.workerProfilePath ?? DEFAULT_WORKER_PROFILE,
        outputPath: workerOut,
        databaseUrl: options.databaseUrl
      });
    } catch (error) {
      workerError = error instanceof Error ? error.message : String(error);
    }
  }

  const gateResult = {
    ranAt: new Date().toISOString(),
    config: {
      baseUrl: options.baseUrl ?? "http://localhost:4000",
      usersPath: options.usersPath,
      apiProfilePath: options.apiProfilePath ?? DEFAULT_API_PROFILE,
      workerProfilePath: options.workerProfilePath ?? DEFAULT_WORKER_PROFILE,
      skipWorker: Boolean(options.skipWorker)
    },
    artifacts: {
      apiOut,
      workerOut: options.skipWorker ? null : workerOut
    },
    api: {
      passed: Boolean(apiResult?.slo?.passed),
      requests: apiResult?.totals?.requests ?? 0,
      p95Ms: apiResult?.totals?.p95Ms ?? null,
      errorRate: apiResult?.totals?.errorRate ?? null
    },
    worker: options.skipWorker
      ? {
          skipped: true,
          passed: true,
          reason: "skipWorker=true"
        }
      : workerError
      ? {
          skipped: false,
          passed: false,
          error: workerError
        }
      : {
          skipped: false,
          passed: Boolean(workerResult?.slo?.passed),
          queueLagP95Ms: workerResult?.queueLag?.lagP95Ms ?? null,
          successRate: workerResult?.terminal?.successRate ?? null
        }
  };

  gateResult.passed = gateResult.api.passed && gateResult.worker.passed;

  writeFileSync(gateOut, `${JSON.stringify(gateResult, null, 2)}\n`, "utf8");

  console.log(`[phase0-slo-gate] API SLO: ${gateResult.api.passed ? "PASS" : "FAIL"}`);
  console.log(
    `[phase0-slo-gate] Worker SLO: ${gateResult.worker.passed ? "PASS" : "FAIL"}${gateResult.worker.skipped ? " (skipped)" : ""}`
  );
  if (workerError) {
    console.log(`[phase0-slo-gate] Worker error: ${workerError}`);
  }
  console.log(`[phase0-slo-gate] Overall: ${gateResult.passed ? "PASS" : "FAIL"}`);
  console.log(`[phase0-slo-gate] Wrote report: ${gateOut}`);

  return gateResult;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.users) {
    throw new Error("--users <path> is required");
  }

  const gateResult = await runPhase0SloGate({
    baseUrl: args["base-url"],
    usersPath: args.users,
    apiProfilePath: args["api-profile"],
    workerProfilePath: args["worker-profile"],
    resultsDir: args["results-dir"],
    timeoutMs: args["timeout-ms"],
    databaseUrl: args["database-url"],
    skipWorker: args["skip-worker"] === "true"
  });

  process.exit(gateResult.passed ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[phase0-slo-gate] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
