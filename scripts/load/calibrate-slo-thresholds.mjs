import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_RESULTS_DIR = path.resolve("infra/load/results");
const DEFAULT_API_PROFILE_PATH = path.resolve("infra/load/profiles/phase0-hosted-api-baseline.json");
const DEFAULT_WORKER_PROFILE_PATH = path.resolve("infra/load/profiles/phase0-worker-slo-baseline.json");

const CALIBRATION_POLICY = {
  minRuns: 3,
  maxRuns: 10,
  latencyHeadroomFactor: 1.15,
  errorRateHeadroomFactor: 1.25,
  errorRatePadding: 0.001,
  maxErrorRateCap: 0.05,
  minRequestsFloorFactor: 0.85,
  queueLagHeadroomFactor: 1.2,
  queuedJobsHeadroomFactor: 1.2,
  successRateSafetyDelta: 0.005,
  minSuccessRateFloor: 0.9
};

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
  const content = readFileSync(filePath, "utf8");
  return JSON.parse(content);
}

function writeJsonFile(filePath, payload) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function percentile(values, percentileValue) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index];
}

function quantile(values, percentileValue) {
  return percentile(values, percentileValue);
}

function roundMs(value) {
  return Math.max(1, Math.ceil(value));
}

function roundRate(value) {
  return Number(value.toFixed(4));
}

function withHeadroom(value, factor) {
  return value * factor;
}

function readGateReports(resultsDir) {
  if (!existsSync(resultsDir)) {
    throw new Error(`results directory does not exist: ${resultsDir}`);
  }

  const gateFiles = readdirSync(resultsDir)
    .filter((fileName) => fileName.startsWith("gate-") && fileName.endsWith(".json"))
    .sort();

  const reports = [];

  for (const fileName of gateFiles) {
    const fullPath = path.resolve(resultsDir, fileName);
    try {
      const payload = readJsonFile(fullPath);
      reports.push({ path: fullPath, payload });
    } catch (error) {
      throw new Error(
        `failed to parse gate report ${fullPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return reports;
}

function readApiReport(gatePayload, resultsDir) {
  const apiPath = gatePayload?.artifacts?.apiOut;
  if (!apiPath || typeof apiPath !== "string") {
    return null;
  }

  const resolved = path.isAbsolute(apiPath)
    ? apiPath
    : path.resolve(resultsDir, apiPath);

  if (!existsSync(resolved)) {
    return null;
  }

  return readJsonFile(resolved);
}

function readWorkerReport(gatePayload, resultsDir) {
  const workerPath = gatePayload?.artifacts?.workerOut;
  if (!workerPath || typeof workerPath !== "string") {
    return null;
  }

  const resolved = path.isAbsolute(workerPath)
    ? workerPath
    : path.resolve(resultsDir, workerPath);

  if (!existsSync(resolved)) {
    return null;
  }

  return readJsonFile(resolved);
}

function ensureNonEmptyRunValues(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`insufficient calibration data for ${label}`);
  }
}

function calibrateApiThresholds(apiReports, policy) {
  const totalP95 = apiReports
    .map((report) => Number(report?.totals?.p95Ms))
    .filter((value) => Number.isFinite(value) && value > 0);
  const totalErrorRate = apiReports
    .map((report) => Number(report?.totals?.errorRate))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const totalRequests = apiReports
    .map((report) => Number(report?.totals?.requests))
    .filter((value) => Number.isFinite(value) && value > 0);

  ensureNonEmptyRunValues(totalP95, "api.total.p95Ms");
  ensureNonEmptyRunValues(totalErrorRate, "api.total.errorRate");
  ensureNonEmptyRunValues(totalRequests, "api.total.requests");

  const global = {
    p95Ms: roundMs(withHeadroom(quantile(totalP95, 95), policy.latencyHeadroomFactor)),
    errorRateMax: roundRate(
      Math.min(
        policy.maxErrorRateCap,
        withHeadroom(quantile(totalErrorRate, 95), policy.errorRateHeadroomFactor) + policy.errorRatePadding
      )
    ),
    minRequests: Math.max(1, Math.floor(quantile(totalRequests, 50) * policy.minRequestsFloorFactor))
  };

  const scenarioMap = new Map();

  for (const report of apiReports) {
    const scenarios = report?.scenarios ?? {};
    for (const [scenarioName, stats] of Object.entries(scenarios)) {
      const scenario = scenarioMap.get(scenarioName) ?? {
        p95Ms: [],
        errorRate: [],
        requests: []
      };

      const p95Ms = Number(stats?.p95Ms);
      if (Number.isFinite(p95Ms) && p95Ms > 0) {
        scenario.p95Ms.push(p95Ms);
      }

      const errorRate = Number(stats?.errorRate);
      if (Number.isFinite(errorRate) && errorRate >= 0) {
        scenario.errorRate.push(errorRate);
      }

      const requests = Number(stats?.requests);
      if (Number.isFinite(requests) && requests >= 0) {
        scenario.requests.push(requests);
      }

      scenarioMap.set(scenarioName, scenario);
    }
  }

  const scenarios = {};

  for (const [scenarioName, values] of scenarioMap.entries()) {
    if (values.p95Ms.length === 0 || values.errorRate.length === 0 || values.requests.length === 0) {
      continue;
    }

    scenarios[scenarioName] = {
      p95Ms: roundMs(withHeadroom(quantile(values.p95Ms, 95), policy.latencyHeadroomFactor)),
      errorRateMax: roundRate(
        Math.min(
          policy.maxErrorRateCap,
          withHeadroom(quantile(values.errorRate, 95), policy.errorRateHeadroomFactor) + policy.errorRatePadding
        )
      ),
      minRequests: Math.max(1, Math.floor(quantile(values.requests, 50) * policy.minRequestsFloorFactor))
    };
  }

  return { global, scenarios };
}

function calibrateWorkerThresholds(workerReports, policy) {
  const lagP95Values = workerReports
    .map((report) => Number(report?.queueLag?.lagP95Ms))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const queuedJobsValues = workerReports
    .map((report) => Number(report?.queueLag?.queuedJobs))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const successRates = workerReports
    .map((report) => Number(report?.terminal?.successRate))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1);
  const terminalJobs = workerReports
    .map((report) => Number(report?.terminal?.terminalJobs))
    .filter((value) => Number.isFinite(value) && value >= 0);

  ensureNonEmptyRunValues(lagP95Values, "worker.queueLag.lagP95Ms");
  ensureNonEmptyRunValues(queuedJobsValues, "worker.queueLag.queuedJobs");
  ensureNonEmptyRunValues(successRates, "worker.terminal.successRate");
  ensureNonEmptyRunValues(terminalJobs, "worker.terminal.terminalJobs");

  const global = {
    queueLagP95Ms: roundMs(withHeadroom(quantile(lagP95Values, 95), policy.queueLagHeadroomFactor)),
    maxQueuedJobs: Math.max(1, Math.ceil(withHeadroom(quantile(queuedJobsValues, 95), policy.queuedJobsHeadroomFactor))),
    successRateMin: roundRate(
      Math.max(policy.minSuccessRateFloor, quantile(successRates, 5) - policy.successRateSafetyDelta)
    ),
    minTerminalJobs: Math.max(1, Math.floor(quantile(terminalJobs, 50) * policy.minRequestsFloorFactor))
  };

  const queueNames = new Set();
  for (const report of workerReports) {
    const perQueue = report?.queueLag?.perQueue ?? {};
    for (const queueName of Object.keys(perQueue)) {
      queueNames.add(queueName);
    }
  }

  const queueSlo = {};

  for (const queueName of queueNames) {
    const queueLag = [];
    const queueDepth = [];
    const queueSuccess = [];

    for (const report of workerReports) {
      const lagEntry = report?.queueLag?.perQueue?.[queueName];
      const terminalEntry = report?.terminal?.perQueue?.[queueName];

      const lagP95 = Number(lagEntry?.lagP95Ms);
      if (Number.isFinite(lagP95) && lagP95 >= 0) {
        queueLag.push(lagP95);
      }

      const queuedJobs = Number(lagEntry?.queuedJobs);
      if (Number.isFinite(queuedJobs) && queuedJobs >= 0) {
        queueDepth.push(queuedJobs);
      }

      const success = Number(terminalEntry?.successRate);
      if (Number.isFinite(success) && success >= 0 && success <= 1) {
        queueSuccess.push(success);
      }
    }

    if (queueLag.length === 0 || queueDepth.length === 0 || queueSuccess.length === 0) {
      continue;
    }

    queueSlo[queueName] = {
      queueLagP95Ms: roundMs(withHeadroom(quantile(queueLag, 95), policy.queueLagHeadroomFactor)),
      maxQueuedJobs: Math.max(1, Math.ceil(withHeadroom(quantile(queueDepth, 95), policy.queuedJobsHeadroomFactor))),
      successRateMin: roundRate(
        Math.max(policy.minSuccessRateFloor, quantile(queueSuccess, 5) - policy.successRateSafetyDelta)
      )
    };
  }

  return { global, queueSlo };
}

function updateApiProfile(profile, calibratedApi) {
  const nextProfile = {
    ...profile,
    globalSlo: {
      ...(profile.globalSlo ?? {}),
      minRequests: calibratedApi.global.minRequests,
      p95Ms: calibratedApi.global.p95Ms,
      errorRateMax: calibratedApi.global.errorRateMax
    }
  };

  if (Array.isArray(nextProfile.scenarios)) {
    nextProfile.scenarios = nextProfile.scenarios.map((scenario) => {
      const calibrated = calibratedApi.scenarios[scenario.op];
      if (!calibrated) {
        return scenario;
      }

      return {
        ...scenario,
        slo: {
          ...(scenario.slo ?? {}),
          minRequests: calibrated.minRequests,
          p95Ms: calibrated.p95Ms,
          errorRateMax: calibrated.errorRateMax
        }
      };
    });
  }

  return nextProfile;
}

function updateWorkerProfile(profile, calibratedWorker) {
  return {
    ...profile,
    globalSlo: {
      ...(profile.globalSlo ?? {}),
      queueLagP95Ms: calibratedWorker.global.queueLagP95Ms,
      maxQueuedJobs: calibratedWorker.global.maxQueuedJobs,
      successRateMin: calibratedWorker.global.successRateMin,
      minTerminalJobs: calibratedWorker.global.minTerminalJobs
    },
    queueSlo: {
      ...(profile.queueSlo ?? {}),
      ...calibratedWorker.queueSlo
    }
  };
}

function createCalibrationReport(input) {
  return {
    generatedAt: new Date().toISOString(),
    policy: CALIBRATION_POLICY,
    sample: {
      gateReportsAnalyzed: input.gateReportsAnalyzed,
      apiReportsAnalyzed: input.apiReportsAnalyzed,
      workerReportsAnalyzed: input.workerReportsAnalyzed,
      selectedGateFiles: input.selectedGateFiles
    },
    calibrated: {
      api: input.calibratedApi,
      worker: input.calibratedWorker
    }
  };
}

export async function calibrateSloThresholds(options = {}) {
  const resultsDir = options.resultsDir ? path.resolve(options.resultsDir) : DEFAULT_RESULTS_DIR;
  const minRuns = toNumber(options.minRuns, CALIBRATION_POLICY.minRuns);
  const maxRuns = toNumber(options.maxRuns, CALIBRATION_POLICY.maxRuns);
  const writeProfiles = Boolean(options.writeProfiles);

  const gateReports = readGateReports(resultsDir);
  if (gateReports.length === 0) {
    throw new Error(`no gate reports found in ${resultsDir}`);
  }

  const successful = gateReports
    .filter((entry) => Boolean(entry.payload?.passed))
    .sort((a, b) => {
      const aRanAt = Date.parse(String(a.payload?.ranAt ?? "")) || 0;
      const bRanAt = Date.parse(String(b.payload?.ranAt ?? "")) || 0;
      return bRanAt - aRanAt;
    })
    .slice(0, maxRuns);

  if (successful.length < minRuns) {
    throw new Error(
      `need at least ${minRuns} successful gate runs for calibration; found ${successful.length}`
    );
  }

  const apiReports = [];
  const workerReports = [];

  for (const entry of successful) {
    const apiReport = readApiReport(entry.payload, resultsDir);
    if (apiReport) {
      apiReports.push(apiReport);
    }

    const workerReport = readWorkerReport(entry.payload, resultsDir);
    if (workerReport) {
      workerReports.push(workerReport);
    }
  }

  if (apiReports.length < minRuns) {
    throw new Error(`need at least ${minRuns} API run reports; found ${apiReports.length}`);
  }
  if (workerReports.length < minRuns) {
    throw new Error(`need at least ${minRuns} worker run reports; found ${workerReports.length}`);
  }

  const calibratedApi = calibrateApiThresholds(apiReports, CALIBRATION_POLICY);
  const calibratedWorker = calibrateWorkerThresholds(workerReports, CALIBRATION_POLICY);

  const selectedGateFiles = successful.map((entry) => path.basename(entry.path));
  const report = createCalibrationReport({
    gateReportsAnalyzed: successful.length,
    apiReportsAnalyzed: apiReports.length,
    workerReportsAnalyzed: workerReports.length,
    selectedGateFiles,
    calibratedApi,
    calibratedWorker
  });

  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const reportPath = path.resolve(resultsDir, `calibration-summary-${timestamp}.json`);
  writeJsonFile(reportPath, report);

  const outputs = {
    reportPath,
    apiProfilePath: null,
    workerProfilePath: null,
    report
  };

  if (writeProfiles) {
    const apiProfilePath = options.apiProfilePath
      ? path.resolve(options.apiProfilePath)
      : DEFAULT_API_PROFILE_PATH;
    const workerProfilePath = options.workerProfilePath
      ? path.resolve(options.workerProfilePath)
      : DEFAULT_WORKER_PROFILE_PATH;

    const apiProfile = readJsonFile(apiProfilePath);
    const workerProfile = readJsonFile(workerProfilePath);

    const nextApiProfile = updateApiProfile(apiProfile, calibratedApi);
    const nextWorkerProfile = updateWorkerProfile(workerProfile, calibratedWorker);

    writeJsonFile(apiProfilePath, nextApiProfile);
    writeJsonFile(workerProfilePath, nextWorkerProfile);

    outputs.apiProfilePath = apiProfilePath;
    outputs.workerProfilePath = workerProfilePath;
  }

  console.log(`[slo-calibration] successful gate runs used: ${successful.length}`);
  console.log(`[slo-calibration] calibration report: ${reportPath}`);

  if (writeProfiles) {
    console.log(`[slo-calibration] updated API profile: ${outputs.apiProfilePath}`);
    console.log(`[slo-calibration] updated worker profile: ${outputs.workerProfilePath}`);
  } else {
    console.log("[slo-calibration] dry-run mode: profiles not modified (use --write-profiles=true)");
  }

  return outputs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await calibrateSloThresholds({
    resultsDir: args["results-dir"],
    minRuns: args["min-runs"],
    maxRuns: args["max-runs"],
    writeProfiles: args["write-profiles"] === "true",
    apiProfilePath: args["api-profile"],
    workerProfilePath: args["worker-profile"]
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[slo-calibration] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
