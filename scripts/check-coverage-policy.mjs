import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const METRIC_KEYS = ["statements", "branches", "functions", "lines"];

const MIN_OVERALL_THRESHOLD = {
  statements: 40,
  branches: 35,
  functions: 30,
  lines: 40,
};

const NEW_FILE_THRESHOLD = {
  statements: 80,
  branches: 70,
  functions: 80,
  lines: 80,
};

const CRITICAL_NEW_FILE_THRESHOLD = {
  statements: 90,
  branches: 85,
  functions: 90,
  lines: 90,
};

const CRITICAL_FILE_PATTERNS = [
  /^apps\/api\/src\/services\/auth-service\.ts$/,
  /^apps\/api\/src\/plugins\/auth\.ts$/,
  /^apps\/api\/src\/routes\/v1\.ts$/,
  /^apps\/api\/src\/services\/postgres-store\.ts$/,
  /^apps\/worker\/src\/jobs\/register-jobs\.ts$/,
  /^apps\/worker\/src\/pipeline\/run-feed-pipeline\.ts$/,
];

const COVERAGE_SUMMARY_PATH = path.resolve("coverage/coverage-summary.json");
const COVERAGE_BASELINE_PATH = path.resolve(".coverage-policy-baseline.json");
const DEFAULT_REGRESSION_TOLERANCE = 0.1;
const EPSILON = 0.000001;

function normalizePath(inputPath) {
  return inputPath.replaceAll("\\", "/");
}

function parseTolerance() {
  const raw = process.env.COVERAGE_REGRESSION_TOLERANCE;
  if (!raw) return DEFAULT_REGRESSION_TOLERANCE;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_REGRESSION_TOLERANCE;
  }
  return value;
}

function getChangedFiles() {
  const explicit = process.env.COVERAGE_CHANGED_FILES?.trim();
  if (explicit) {
    return explicit
      .split(/[\n,]/g)
      .map((value) => value.trim())
      .filter(Boolean)
      .map(normalizePath);
  }

  const isCi = process.env.CI === "true";
  const baseRef = process.env.COVERAGE_BASE_REF || "origin/main";
  const diffCommands = isCi || process.env.COVERAGE_BASE_REF
    ? [
        `git diff --name-only --diff-filter=ACMR ${baseRef}...HEAD`,
        "git diff --name-only --diff-filter=ACMR HEAD~1",
      ]
    : [
        "git diff --name-only --diff-filter=ACMR --cached",
      ];

  for (const command of diffCommands) {
    try {
      const output = execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const files = output
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean)
        .map(normalizePath);
      if (files.length > 0) {
        return files;
      }
    } catch {
      // Try next strategy.
    }
  }

  return [];
}

function isSourceFile(filePath) {
  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return false;
  if (filePath.endsWith(".d.ts")) return false;
  if (!filePath.includes("/src/")) return false;
  if (!(filePath.startsWith("apps/") || filePath.startsWith("packages/"))) return false;
  if (filePath.includes("/__tests__/")) return false;
  return true;
}

function asPct(metric) {
  return typeof metric?.pct === "number" ? metric.pct : 0;
}

function extractMetricSet(metrics) {
  return {
    statements: asPct(metrics.statements),
    branches: asPct(metrics.branches),
    functions: asPct(metrics.functions),
    lines: asPct(metrics.lines),
  };
}

function formatThreshold(threshold) {
  return `S:${threshold.statements}% B:${threshold.branches}% F:${threshold.functions}% L:${threshold.lines}%`;
}

function isCriticalFile(filePath) {
  return CRITICAL_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function buildCoverageLookup(summary) {
  const lookup = new Map();
  const cwd = process.cwd();

  for (const [rawKey, value] of Object.entries(summary)) {
    if (rawKey === "total") continue;
    const key = normalizePath(rawKey);

    lookup.set(key, value);

    const relative = normalizePath(path.relative(cwd, rawKey));
    if (relative && relative !== "." && !relative.startsWith("..")) {
      lookup.set(relative, value);
    }
  }

  return lookup;
}

function loadBaseline() {
  if (!existsSync(COVERAGE_BASELINE_PATH)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(COVERAGE_BASELINE_PATH, "utf8"));
  const overall = parsed?.overall;
  const files = parsed?.files ?? {};

  return {
    version: parsed?.version ?? 0,
    updatedAt: parsed?.updatedAt ?? null,
    overall: {
      statements: Number(overall?.statements ?? 0),
      branches: Number(overall?.branches ?? 0),
      functions: Number(overall?.functions ?? 0),
      lines: Number(overall?.lines ?? 0),
    },
    files: Object.fromEntries(
      Object.entries(files).map(([filePath, metrics]) => [
        normalizePath(filePath),
        {
          statements: Number(metrics?.statements ?? 0),
          branches: Number(metrics?.branches ?? 0),
          functions: Number(metrics?.functions ?? 0),
          lines: Number(metrics?.lines ?? 0),
        },
      ])
    ),
  };
}

function resolveOverallThreshold(baseline) {
  if (!baseline) {
    return { ...MIN_OVERALL_THRESHOLD };
  }

  const threshold = {};
  for (const key of METRIC_KEYS) {
    threshold[key] = Math.max(MIN_OVERALL_THRESHOLD[key], baseline.overall[key] ?? 0);
  }
  return threshold;
}

function checkAbsoluteThreshold(label, actual, threshold, violations) {
  for (const key of METRIC_KEYS) {
    if (actual[key] + EPSILON < threshold[key]) {
      violations.push(`${label}: ${key} ${actual[key].toFixed(2)}% < ${threshold[key].toFixed(2)}%`);
    }
  }
}

function checkRegressionThreshold(label, actual, baselineMetrics, tolerance, violations) {
  for (const key of METRIC_KEYS) {
    const minimumAllowed = Math.max(0, baselineMetrics[key] - tolerance);
    if (actual[key] + EPSILON < minimumAllowed) {
      violations.push(
        `${label}: ${key} regressed ${actual[key].toFixed(2)}% < ${minimumAllowed.toFixed(2)}% (baseline ${baselineMetrics[key].toFixed(2)}%, tolerance ${tolerance.toFixed(2)}%)`
      );
    }
  }
}

function main() {
  if (!existsSync(COVERAGE_SUMMARY_PATH)) {
    console.error(
      `[coverage-policy] Missing ${COVERAGE_SUMMARY_PATH}. Run "npm run test:coverage" first.`
    );
    process.exit(1);
  }

  const summary = JSON.parse(readFileSync(COVERAGE_SUMMARY_PATH, "utf8"));
  const lookup = buildCoverageLookup(summary);
  const violations = [];
  const tolerance = parseTolerance();
  const baseline = loadBaseline();

  if (baseline && baseline.version !== 1) {
    console.error(
      `[coverage-policy] Unsupported baseline version ${String(baseline.version)} in ${COVERAGE_BASELINE_PATH}.`
    );
    process.exit(1);
  }

  if (!baseline) {
    console.warn(
      `[coverage-policy] Baseline file not found at ${COVERAGE_BASELINE_PATH}; using minimum overall thresholds only.`
    );
  }

  const overallActual = extractMetricSet(summary.total);
  const overallThreshold = resolveOverallThreshold(baseline);
  checkAbsoluteThreshold(
    `overall [${formatThreshold(overallThreshold)}]`,
    overallActual,
    overallThreshold,
    violations
  );

  const changedSourceFiles = getChangedFiles().filter(isSourceFile);
  if (changedSourceFiles.length === 0) {
    console.log("[coverage-policy] No changed source files detected. Only overall threshold enforced.");
  }

  for (const sourceFile of changedSourceFiles) {
    const metrics = lookup.get(sourceFile);
    if (!metrics) {
      violations.push(`${sourceFile}: no coverage data found (add tests for changed source file)`);
      continue;
    }

    const actual = extractMetricSet(metrics);
    const baselineMetrics = baseline?.files?.[sourceFile];

    if (baselineMetrics) {
      checkRegressionThreshold(
        `${sourceFile} [baseline regression guard]`,
        actual,
        baselineMetrics,
        tolerance,
        violations
      );
      continue;
    }

    const threshold = isCriticalFile(sourceFile)
      ? CRITICAL_NEW_FILE_THRESHOLD
      : NEW_FILE_THRESHOLD;

    checkAbsoluteThreshold(
      `${sourceFile} [new file ${isCriticalFile(sourceFile) ? "critical " : ""}${formatThreshold(threshold)}]`,
      actual,
      threshold,
      violations
    );
  }

  if (violations.length > 0) {
    console.error("[coverage-policy] Failed:");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  if (baseline?.updatedAt) {
    console.log(`[coverage-policy] Passed. Baseline: ${baseline.updatedAt}`);
  } else {
    console.log("[coverage-policy] Passed.");
  }
}

main();
