import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const COVERAGE_SUMMARY_PATH = path.resolve("coverage/coverage-summary.json");
const COVERAGE_BASELINE_PATH = path.resolve(".coverage-policy-baseline.json");

function normalizePath(inputPath) {
  return inputPath.replaceAll("\\", "/");
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
    statements: Number(asPct(metrics.statements).toFixed(2)),
    branches: Number(asPct(metrics.branches).toFixed(2)),
    functions: Number(asPct(metrics.functions).toFixed(2)),
    lines: Number(asPct(metrics.lines).toFixed(2)),
  };
}

function main() {
  if (!existsSync(COVERAGE_SUMMARY_PATH)) {
    console.error(
      `[coverage-baseline] Missing ${COVERAGE_SUMMARY_PATH}. Run "npm run test:coverage" first.`
    );
    process.exit(1);
  }

  const summary = JSON.parse(readFileSync(COVERAGE_SUMMARY_PATH, "utf8"));
  const cwd = process.cwd();

  const files = {};
  for (const [rawKey, value] of Object.entries(summary)) {
    if (rawKey === "total") continue;
    const relative = normalizePath(path.relative(cwd, rawKey));
    if (!relative || relative === "." || relative.startsWith("..")) continue;
    if (!isSourceFile(relative)) continue;
    files[relative] = extractMetricSet(value);
  }

  const sortedFiles = Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
  );

  const baseline = {
    version: 1,
    updatedAt: new Date().toISOString(),
    overall: extractMetricSet(summary.total),
    files: sortedFiles,
  };

  writeFileSync(`${COVERAGE_BASELINE_PATH}`, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  console.log(
    `[coverage-baseline] Wrote ${COVERAGE_BASELINE_PATH} with ${Object.keys(sortedFiles).length} source file entries.`
  );
}

main();
