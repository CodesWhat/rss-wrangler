import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { runHostedSmoke } from "./run-hosted-smoke.mjs";
import { runPhase0SloGate } from "./run-phase0-slo-gate.mjs";

const DEFAULT_RESULTS_DIR = path.resolve("infra/load/results");
const DEFAULT_OUTPUT_PATH = path.resolve("infra/load/results/latest-hosted-dogfood-readiness.json");
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
      response,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      durationMs: Math.round(performance.now() - started),
      response: null,
      error: summarizeError(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`invalid JSON response: ${summarizeError(error)}`);
  }
}

function addCheck(report, input) {
  report.checks.push({
    name: input.name,
    passed: Boolean(input.passed),
    details: input.details ?? {}
  });
}

function formatStepStatus(step) {
  if (!step) {
    return "FAIL";
  }
  if (step.skipped) {
    return "SKIP";
  }
  return step.passed ? "PASS" : "FAIL";
}

async function loginForToken({ baseUrl, username, password, tenantSlug, timeoutMs }) {
  const request = await timedFetch(
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

  if (!request.response) {
    return {
      ok: false,
      status: request.status,
      durationMs: request.durationMs,
      token: null,
      error: request.error ?? "login request failed"
    };
  }

  let payload;
  try {
    payload = await safeJson(request.response);
  } catch (error) {
    return {
      ok: false,
      status: request.status,
      durationMs: request.durationMs,
      token: null,
      error: summarizeError(error)
    };
  }

  const token = typeof payload?.accessToken === "string" ? payload.accessToken : null;
  if (!request.ok || !token) {
    return {
      ok: false,
      status: request.status,
      durationMs: request.durationMs,
      token: null,
      error: !request.ok
        ? `login failed with status ${request.status}`
        : "accessToken missing in login response"
    };
  }

  return {
    ok: true,
    status: request.status,
    durationMs: request.durationMs,
    token,
    error: null
  };
}

async function fetchAuthedJson({ baseUrl, token, routePath, timeoutMs }) {
  const request = await timedFetch(
    `${baseUrl}${routePath}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    },
    timeoutMs
  );

  if (!request.response) {
    return {
      ok: false,
      status: request.status,
      durationMs: request.durationMs,
      data: null,
      error: request.error ?? "request failed"
    };
  }

  let payload = null;
  let parseError = null;
  try {
    payload = await safeJson(request.response);
  } catch (error) {
    parseError = summarizeError(error);
  }

  if (!request.ok) {
    return {
      ok: false,
      status: request.status,
      durationMs: request.durationMs,
      data: payload,
      error: parseError ?? `request failed with status ${request.status}`
    };
  }

  if (parseError) {
    return {
      ok: false,
      status: request.status,
      durationMs: request.durationMs,
      data: null,
      error: parseError
    };
  }

  return {
    ok: true,
    status: request.status,
    durationMs: request.durationMs,
    data: payload,
    error: null
  };
}

function normalizeCredentials(options) {
  const username = (options.username || "").trim();
  const password = options.password || "";
  const tenantSlug = (options.tenantSlug || "default").trim() || "default";
  return { username, password, tenantSlug };
}

export async function runHostedDogfoodReadiness(options = {}) {
  const baseUrl = sanitizeUrl(options.baseUrl);
  if (!baseUrl) {
    throw new Error("baseUrl is required. Example: --base-url https://api.example.com");
  }

  const webUrl = sanitizeUrl(options.webUrl);
  const usersPath = options.usersPath ? path.resolve(options.usersPath) : "";
  const resultsDir = options.resultsDir ? path.resolve(options.resultsDir) : DEFAULT_RESULTS_DIR;
  const timeoutMs = toNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const skipSmoke = Boolean(options.skipSmoke);
  const skipSlo = Boolean(options.skipSlo);
  const skipWorker = Boolean(options.skipWorker);
  const skipTelemetry = Boolean(options.skipTelemetry);
  const requireBillingConfigured = Boolean(options.requireBillingConfigured);
  const requireAnnualCheckout = Boolean(options.requireAnnualCheckout);
  const runId = new Date().toISOString().replaceAll(":", "-");
  const outputPath = options.outputPath ? path.resolve(options.outputPath) : DEFAULT_OUTPUT_PATH;
  const smokeOutputPath = path.resolve(resultsDir, `dogfood-smoke-${runId}.json`);
  const credentials = normalizeCredentials(options);

  mkdirSync(resultsDir, { recursive: true });

  const report = {
    ranAt: new Date().toISOString(),
    runId,
    config: {
      baseUrl,
      webUrl: webUrl || null,
      usersPath: usersPath || null,
      timeoutMs,
      tenantSlug: credentials.tenantSlug,
      skipSmoke,
      skipSlo,
      skipWorker,
      skipTelemetry,
      requireBillingConfigured,
      requireAnnualCheckout
    },
    steps: {
      smoke: null,
      sloGate: null,
      telemetry: null
    },
    checks: [],
    warnings: [],
    summary: {
      passedChecks: 0,
      failedChecks: 0
    },
    passed: false
  };

  if (skipSmoke) {
    report.steps.smoke = {
      enabled: false,
      skipped: true,
      passed: true
    };
  } else if (!credentials.username || !credentials.password) {
    report.steps.smoke = {
      enabled: true,
      skipped: false,
      passed: false,
      error: "username/password are required for smoke auth checks"
    };
    addCheck(report, {
      name: "smoke.auth_credentials",
      passed: false,
      details: {
        message: "missing username/password for smoke"
      }
    });
  } else {
    try {
      const smokeReport = await runHostedSmoke({
        baseUrl,
        webUrl,
        username: credentials.username,
        password: credentials.password,
        tenantSlug: credentials.tenantSlug,
        timeoutMs,
        outputPath: smokeOutputPath
      });

      const authLoginCheck = smokeReport.checks.find((check) => check.name === "auth_login");
      report.steps.smoke = {
        enabled: true,
        skipped: false,
        passed: smokeReport.passed,
        outputPath: smokeOutputPath,
        checks: smokeReport.checks
      };

      addCheck(report, {
        name: "smoke.overall",
        passed: smokeReport.passed,
        details: {
          outputPath: smokeOutputPath
        }
      });
      addCheck(report, {
        name: "smoke.auth_login",
        passed: Boolean(authLoginCheck?.passed),
        details: authLoginCheck ?? {
          message: "auth_login check missing in smoke report"
        }
      });
    } catch (error) {
      report.steps.smoke = {
        enabled: true,
        skipped: false,
        passed: false,
        error: summarizeError(error)
      };
      addCheck(report, {
        name: "smoke.overall",
        passed: false,
        details: {
          error: summarizeError(error)
        }
      });
    }
  }

  if (skipSlo) {
    report.steps.sloGate = {
      enabled: false,
      skipped: true,
      passed: true
    };
  } else if (!usersPath) {
    report.steps.sloGate = {
      enabled: true,
      skipped: false,
      passed: false,
      error: "users path is required for SLO gate"
    };
    addCheck(report, {
      name: "slo_gate.users_file",
      passed: false,
      details: {
        message: "missing --users path"
      }
    });
  } else if (!skipWorker && !(options.databaseUrl || "").trim()) {
    report.steps.sloGate = {
      enabled: true,
      skipped: false,
      passed: false,
      error: "databaseUrl is required when worker SLO checks are enabled"
    };
    addCheck(report, {
      name: "slo_gate.database_url",
      passed: false,
      details: {
        message: "missing --database-url while worker checks are enabled"
      }
    });
  } else {
    try {
      const sloResult = await runPhase0SloGate({
        baseUrl,
        usersPath,
        resultsDir,
        timeoutMs,
        databaseUrl: options.databaseUrl,
        skipWorker
      });

      report.steps.sloGate = {
        enabled: true,
        skipped: false,
        passed: sloResult.passed,
        artifacts: sloResult.artifacts,
        api: sloResult.api,
        worker: sloResult.worker
      };

      addCheck(report, {
        name: "slo_gate.overall",
        passed: sloResult.passed,
        details: {
          artifacts: sloResult.artifacts
        }
      });
    } catch (error) {
      report.steps.sloGate = {
        enabled: true,
        skipped: false,
        passed: false,
        error: summarizeError(error)
      };
      addCheck(report, {
        name: "slo_gate.overall",
        passed: false,
        details: {
          error: summarizeError(error)
        }
      });
    }
  }

  if (skipTelemetry) {
    report.steps.telemetry = {
      enabled: false,
      skipped: true,
      passed: true
    };
  } else if (!credentials.username || !credentials.password) {
    report.steps.telemetry = {
      enabled: true,
      skipped: false,
      passed: false,
      error: "username/password are required for telemetry checks"
    };
    addCheck(report, {
      name: "telemetry.auth_credentials",
      passed: false,
      details: {
        message: "missing username/password for telemetry"
      }
    });
  } else {
    const login = await loginForToken({
      baseUrl,
      username: credentials.username,
      password: credentials.password,
      tenantSlug: credentials.tenantSlug,
      timeoutMs
    });

    if (!login.ok || !login.token) {
      report.steps.telemetry = {
        enabled: true,
        skipped: false,
        passed: false,
        login
      };
      addCheck(report, {
        name: "telemetry.auth_login",
        passed: false,
        details: login
      });
    } else {
      const [entitlements, billing, privacy] = await Promise.all([
        fetchAuthedJson({
          baseUrl,
          token: login.token,
          routePath: "/v1/account/entitlements",
          timeoutMs
        }),
        fetchAuthedJson({
          baseUrl,
          token: login.token,
          routePath: "/v1/billing",
          timeoutMs
        }),
        fetchAuthedJson({
          baseUrl,
          token: login.token,
          routePath: "/v1/privacy/consent",
          timeoutMs
        })
      ]);

      const endpointChecksPassed = entitlements.ok && billing.ok && privacy.ok;
      let consistencyPassed = true;

      addCheck(report, {
        name: "telemetry.auth_login",
        passed: true,
        details: {
          status: login.status,
          durationMs: login.durationMs
        }
      });

      addCheck(report, {
        name: "telemetry.entitlements_endpoint",
        passed: entitlements.ok,
        details: {
          status: entitlements.status,
          error: entitlements.error
        }
      });
      addCheck(report, {
        name: "telemetry.billing_endpoint",
        passed: billing.ok,
        details: {
          status: billing.status,
          error: billing.error
        }
      });
      addCheck(report, {
        name: "telemetry.privacy_endpoint",
        passed: privacy.ok,
        details: {
          status: privacy.status,
          error: privacy.error
        }
      });

      if (entitlements.ok && billing.ok) {
        const planAligned = entitlements.data.planId === billing.data.planId;
        addCheck(report, {
          name: "telemetry.plan_alignment",
          passed: planAligned,
          details: {
            entitlementsPlanId: entitlements.data.planId,
            billingPlanId: billing.data.planId
          }
        });
        consistencyPassed = consistencyPassed && planAligned;

        if (requireBillingConfigured) {
          addCheck(report, {
            name: "telemetry.billing_configured",
            passed: Boolean(billing.data.checkoutEnabled),
            details: {
              checkoutEnabled: billing.data.checkoutEnabled
            }
          });
          consistencyPassed = consistencyPassed && Boolean(billing.data.checkoutEnabled);
        } else if (!billing.data.checkoutEnabled) {
          report.warnings.push("Billing checkout is not configured on this deployment.");
        }

        const annualAvailable = Boolean(
          billing.data.checkoutAvailability?.pro?.annual
          && billing.data.checkoutAvailability?.pro_ai?.annual
        );

        if (requireAnnualCheckout) {
          addCheck(report, {
            name: "telemetry.annual_checkout_variants",
            passed: annualAvailable,
            details: {
              availability: billing.data.checkoutAvailability
            }
          });
          consistencyPassed = consistencyPassed && annualAvailable;
        } else if (!annualAvailable) {
          report.warnings.push("Annual checkout variants are not fully configured.");
        }
      }

      if (privacy.ok) {
        const necessaryOnlyGuard = privacy.data.necessary === true;
        addCheck(report, {
          name: "telemetry.privacy_necessary_guard",
          passed: necessaryOnlyGuard,
          details: {
            necessary: privacy.data.necessary,
            requiresExplicitConsent: privacy.data.requiresExplicitConsent,
            regionCode: privacy.data.regionCode
          }
        });
        consistencyPassed = consistencyPassed && necessaryOnlyGuard;
      }

      report.steps.telemetry = {
        enabled: true,
        skipped: false,
        passed: endpointChecksPassed && consistencyPassed,
        login: {
          status: login.status,
          durationMs: login.durationMs
        },
        entitlements: entitlements.ok ? entitlements.data : null,
        billing: billing.ok ? billing.data : null,
        privacy: privacy.ok ? privacy.data : null,
        endpointStatus: {
          entitlements: {
            ok: entitlements.ok,
            status: entitlements.status
          },
          billing: {
            ok: billing.ok,
            status: billing.status
          },
          privacy: {
            ok: privacy.ok,
            status: privacy.status
          }
        }
      };
    }
  }

  report.summary.passedChecks = report.checks.filter((check) => check.passed).length;
  report.summary.failedChecks = report.checks.filter((check) => !check.passed).length;
  report.passed = report.summary.failedChecks === 0;

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`[hosted-dogfood] smoke: ${formatStepStatus(report.steps.smoke)}`);
  console.log(`[hosted-dogfood] slo_gate: ${formatStepStatus(report.steps.sloGate)}`);
  console.log(`[hosted-dogfood] telemetry: ${formatStepStatus(report.steps.telemetry)}`);
  console.log(`[hosted-dogfood] checks: ${report.summary.passedChecks} passed, ${report.summary.failedChecks} failed`);
  if (report.warnings.length > 0) {
    for (const warning of report.warnings) {
      console.log(`[hosted-dogfood] warning: ${warning}`);
    }
  }
  console.log(`[hosted-dogfood] overall: ${report.passed ? "PASS" : "FAIL"}`);
  console.log(`[hosted-dogfood] wrote report: ${outputPath}`);

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const report = await runHostedDogfoodReadiness({
    baseUrl: args["base-url"] ?? process.env.HOSTED_API_BASE_URL,
    webUrl: args["web-url"] ?? process.env.HOSTED_WEB_BASE_URL,
    usersPath: args.users ?? process.env.HOSTED_LOAD_USERS_FILE,
    databaseUrl: args["database-url"] ?? process.env.DATABASE_URL,
    username: args.username ?? process.env.HOSTED_SMOKE_USERNAME,
    password: args.password ?? process.env.HOSTED_SMOKE_PASSWORD,
    tenantSlug: args["tenant-slug"] ?? process.env.HOSTED_SMOKE_TENANT_SLUG ?? "default",
    timeoutMs: args["timeout-ms"],
    resultsDir: args["results-dir"],
    outputPath: args.out,
    skipSmoke: toBoolean(args["skip-smoke"]),
    skipSlo: toBoolean(args["skip-slo"]),
    skipWorker: toBoolean(args["skip-worker"]),
    skipTelemetry: toBoolean(args["skip-telemetry"]),
    requireBillingConfigured: toBoolean(args["require-billing"]),
    requireAnnualCheckout: toBoolean(args["require-annual"])
  });

  process.exit(report.passed ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[hosted-dogfood] failed: ${summarizeError(error)}`);
    process.exit(1);
  });
}
