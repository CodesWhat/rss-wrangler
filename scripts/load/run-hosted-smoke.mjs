import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const DEFAULT_OUTPUT_PATH = path.resolve("infra/load/results/latest-hosted-smoke.json");
const DEFAULT_TIMEOUT_MS = 10_000;

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

function sanitizeUrl(raw) {
  if (!raw || typeof raw !== "string") {
    return "";
  }
  return raw.trim().replace(/\/+$/, "");
}

function toNumber(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function timedFetch(url, init, timeoutMs) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      response
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
      response: null
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runHostedSmoke(options = {}) {
  const baseUrl = sanitizeUrl(options.baseUrl);
  const webUrl = sanitizeUrl(options.webUrl);
  const timeoutMs = toNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const tenantSlug = options.tenantSlug || "default";

  if (!baseUrl) {
    throw new Error("baseUrl is required. Example: --base-url https://api.example.com");
  }

  const report = {
    ranAt: new Date().toISOString(),
    config: {
      baseUrl,
      webUrl: webUrl || null,
      timeoutMs,
      tenantSlug,
      loginCheckEnabled: false
    },
    checks: [],
    passed: false
  };

  const health = await timedFetch(`${baseUrl}/health`, { method: "GET" }, timeoutMs);
  report.checks.push({
    name: "api_health",
    passed: health.ok,
    status: health.status,
    durationMs: health.durationMs,
    error: health.error ?? null
  });

  if (webUrl) {
    const web = await timedFetch(webUrl, { method: "GET" }, timeoutMs);
    report.checks.push({
      name: "web_home",
      passed: web.ok,
      status: web.status,
      durationMs: web.durationMs,
      error: web.error ?? null
    });
  }

  const username = options.username || "";
  const password = options.password || "";
  if (username && password) {
    report.config.loginCheckEnabled = true;

    const login = await timedFetch(
      `${baseUrl}/v1/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          tenantSlug
        })
      },
      timeoutMs
    );

    let accessToken = "";
    let loginError = login.error ?? null;

    if (login.response) {
      try {
        const payload = await login.response.json();
        accessToken = typeof payload?.accessToken === "string" ? payload.accessToken : "";
        if (!accessToken && !loginError) {
          loginError = "accessToken missing in response";
        }
      } catch (error) {
        loginError = error instanceof Error ? error.message : String(error);
      }
    }

    const loginPassed = login.ok && accessToken.length > 0;
    report.checks.push({
      name: "auth_login",
      passed: loginPassed,
      status: login.status,
      durationMs: login.durationMs,
      error: loginPassed ? null : loginError
    });

    if (loginPassed) {
      const settings = await timedFetch(
        `${baseUrl}/v1/settings`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        },
        timeoutMs
      );

      report.checks.push({
        name: "settings_authz",
        passed: settings.ok,
        status: settings.status,
        durationMs: settings.durationMs,
        error: settings.error ?? null
      });
    }
  }

  report.passed = report.checks.every((check) => check.passed);

  const outputPath = options.outputPath ? path.resolve(options.outputPath) : DEFAULT_OUTPUT_PATH;
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`[hosted-smoke] overall: ${report.passed ? "PASS" : "FAIL"}`);
  for (const check of report.checks) {
    console.log(
      `[hosted-smoke] ${check.name}: ${check.passed ? "PASS" : "FAIL"}`
      + ` status=${check.status ?? "n/a"} durationMs=${check.durationMs}`
      + (check.error ? ` error=${check.error}` : "")
    );
  }
  console.log(`[hosted-smoke] wrote report: ${outputPath}`);

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const report = await runHostedSmoke({
    baseUrl: args["base-url"] ?? process.env.HOSTED_API_BASE_URL,
    webUrl: args["web-url"] ?? process.env.HOSTED_WEB_BASE_URL,
    username: args.username ?? process.env.HOSTED_SMOKE_USERNAME,
    password: args.password ?? process.env.HOSTED_SMOKE_PASSWORD,
    tenantSlug: args["tenant-slug"] ?? process.env.HOSTED_SMOKE_TENANT_SLUG,
    timeoutMs: args["timeout-ms"],
    outputPath: args.out
  });

  process.exit(report.passed ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[hosted-smoke] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
