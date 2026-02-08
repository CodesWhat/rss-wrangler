import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const OVERALL_THRESHOLD = {
  statements: 70,
  branches: 60,
  functions: 70,
  lines: 70,
};

const CHANGED_THRESHOLD = {
  statements: 80,
  branches: 70,
  functions: 80,
  lines: 80,
};

const CRITICAL_CHANGED_THRESHOLD = {
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

function normalizePath(inputPath) {
  return inputPath.replaceAll("\\", "/");
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

function formatThreshold(threshold) {
  return `S:${threshold.statements}% B:${threshold.branches}% F:${threshold.functions}% L:${threshold.lines}%`;
}

function checkThreshold(label, metrics, threshold, violations) {
  const actual = {
    statements: asPct(metrics.statements),
    branches: asPct(metrics.branches),
    functions: asPct(metrics.functions),
    lines: asPct(metrics.lines),
  };

  for (const key of Object.keys(threshold)) {
    const typedKey = key;
    if (actual[typedKey] < threshold[typedKey]) {
      violations.push(
        `${label}: ${typedKey} ${actual[typedKey].toFixed(2)}% < ${threshold[typedKey].toFixed(2)}%`
      );
    }
  }
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

  checkThreshold("overall", summary.total, OVERALL_THRESHOLD, violations);

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

    const threshold = isCriticalFile(sourceFile)
      ? CRITICAL_CHANGED_THRESHOLD
      : CHANGED_THRESHOLD;
    const label = `${sourceFile} [${isCriticalFile(sourceFile) ? "critical" : "changed"} ${formatThreshold(
      threshold
    )}]`;
    checkThreshold(label, metrics, threshold, violations);
  }

  if (violations.length > 0) {
    console.error("[coverage-policy] Failed:");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log("[coverage-policy] Passed.");
}

main();
