import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_RESULTS_DIR = path.resolve("infra/load/results");
const DEFAULT_OUTPUT_PATH = path.resolve("infra/load/results/latest-selfhost-readiness.json");
const DEFAULT_COMPOSE_FILE = path.resolve("infra/docker-compose.yml");
const DEFAULT_ENV_FILE = path.resolve("infra/.env");

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

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return fallback;
}

function summarizeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function trimTail(value, max = 4000) {
  if (!value) {
    return "";
  }
  if (value.length <= max) {
    return value;
  }
  return value.slice(value.length - max);
}

async function runCommand(stepName, command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const started = performance.now();

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout?.on("data", (chunk) => {
      const value = chunk.toString();
      stdout += value;
      process.stdout.write(value);
    });

    child.stderr?.on("data", (chunk) => {
      const value = chunk.toString();
      stderr += value;
      process.stderr.write(value);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        name: stepName,
        passed: false,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started),
        exitCode: null,
        signal: null,
        command: [command, ...args].join(" "),
        error: summarizeError(error),
        stdoutTail: trimTail(stdout),
        stderrTail: trimTail(stderr)
      });
    });

    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        name: stepName,
        passed: code === 0,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started),
        exitCode: code,
        signal,
        command: [command, ...args].join(" "),
        error: code === 0 ? null : `exit code ${code}${signal ? `, signal ${signal}` : ""}`,
        stdoutTail: trimTail(stdout),
        stderrTail: trimTail(stderr)
      });
    });
  });
}

function buildComposeArgs(composeFile, envFile, subcommandArgs) {
  return ["compose", "-f", composeFile, "--env-file", envFile, ...subcommandArgs];
}

function addCheck(report, check) {
  report.checks.push(check);
}

export async function runSelfhostReadiness(options = {}) {
  const composeFile = options.composeFile ? path.resolve(options.composeFile) : DEFAULT_COMPOSE_FILE;
  const envFile = options.envFile ? path.resolve(options.envFile) : DEFAULT_ENV_FILE;
  const resultsDir = options.resultsDir ? path.resolve(options.resultsDir) : DEFAULT_RESULTS_DIR;
  const outputPath = options.outputPath ? path.resolve(options.outputPath) : DEFAULT_OUTPUT_PATH;
  const cleanDb = Boolean(options.cleanDb);
  const teardown = Boolean(options.teardown);
  const skipLint = Boolean(options.skipLint);
  const skipDockerBuild = Boolean(options.skipDockerBuild);
  const skipSmoke = Boolean(options.skipSmoke);

  mkdirSync(resultsDir, { recursive: true });

  const report = {
    ranAt: new Date().toISOString(),
    config: {
      composeFile,
      envFile,
      cleanDb,
      teardown,
      skipLint,
      skipDockerBuild,
      skipSmoke
    },
    checks: [],
    summary: {
      passedChecks: 0,
      failedChecks: 0
    },
    passed: false
  };

  let priorStepFailed = false;
  const shouldRun = () => !priorStepFailed;

  if (cleanDb) {
    if (shouldRun()) {
      const result = await runCommand(
        "docker_clean_db",
        "docker",
        buildComposeArgs(composeFile, envFile, ["down", "-v", "--remove-orphans"])
      );
      addCheck(report, result);
      priorStepFailed = priorStepFailed || !result.passed;
    }
  } else {
    addCheck(report, {
      name: "docker_clean_db",
      passed: true,
      skipped: true,
      reason: "cleanDb=false"
    });
  }

  if (!skipLint) {
    if (shouldRun()) {
      const result = await runCommand("lint", "npm", ["run", "lint"]);
      addCheck(report, result);
      priorStepFailed = priorStepFailed || !result.passed;
    }
  } else {
    addCheck(report, {
      name: "lint",
      passed: true,
      skipped: true,
      reason: "skipLint=true"
    });
  }

  if (!skipDockerBuild) {
    if (shouldRun()) {
      const result = await runCommand(
        "docker_compose_build",
        "docker",
        buildComposeArgs(composeFile, envFile, ["build"])
      );
      addCheck(report, result);
      priorStepFailed = priorStepFailed || !result.passed;
    }
  } else {
    addCheck(report, {
      name: "docker_compose_build",
      passed: true,
      skipped: true,
      reason: "skipDockerBuild=true"
    });
  }

  if (!skipSmoke) {
    if (shouldRun()) {
      const result = await runCommand("orbstack_smoke", "npm", ["run", "orbstack:smoke"]);
      addCheck(report, result);
      priorStepFailed = priorStepFailed || !result.passed;
    }
  } else {
    addCheck(report, {
      name: "orbstack_smoke",
      passed: true,
      skipped: true,
      reason: "skipSmoke=true"
    });
  }

  if (teardown) {
    const teardownResult = await runCommand(
      "docker_teardown",
      "docker",
      buildComposeArgs(composeFile, envFile, ["down", "--remove-orphans"])
    );
    addCheck(report, teardownResult);
  } else {
    addCheck(report, {
      name: "docker_teardown",
      passed: true,
      skipped: true,
      reason: "teardown=false"
    });
  }

  report.summary.passedChecks = report.checks.filter((check) => check.passed).length;
  report.summary.failedChecks = report.checks.filter((check) => !check.passed).length;
  report.passed = report.summary.failedChecks === 0;

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`[selfhost-readiness] checks: ${report.summary.passedChecks} passed, ${report.summary.failedChecks} failed`);
  console.log(`[selfhost-readiness] overall: ${report.passed ? "PASS" : "FAIL"}`);
  console.log(`[selfhost-readiness] wrote report: ${outputPath}`);

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const report = await runSelfhostReadiness({
    composeFile: args["compose-file"],
    envFile: args["env-file"],
    resultsDir: args["results-dir"],
    outputPath: args.out,
    cleanDb: toBoolean(args["clean-db"]),
    teardown: toBoolean(args.teardown),
    skipLint: toBoolean(args["skip-lint"]),
    skipDockerBuild: toBoolean(args["skip-docker-build"]),
    skipSmoke: toBoolean(args["skip-smoke"])
  });

  process.exit(report.passed ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[selfhost-readiness] failed: ${summarizeError(error)}`);
    process.exit(1);
  });
}
