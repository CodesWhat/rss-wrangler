#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.yml"
ENV_EXAMPLE="$ROOT_DIR/infra/.env.example"
ENV_FILE="$ROOT_DIR/infra/.env"
COMPOSE_ARGS=(-f "$COMPOSE_FILE" --env-file "$ENV_FILE")

log() {
  printf '[orbstack-smoke] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "missing required command: $1"
    exit 1
  fi
}

wait_for_service_url() {
  local service="$1"
  local url="$2"
  local timeout_seconds="${3:-120}"
  local start
  start="$(date +%s)"

  while true; do
    if docker compose "${COMPOSE_ARGS[@]}" exec -T "$service" \
      node -e "fetch(process.argv[1]).then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))" \
      "$url" >/dev/null 2>&1; then
      return 0
    fi

    if [ $(( $(date +%s) - start )) -ge "$timeout_seconds" ]; then
      log "timed out waiting for $service to serve $url"
      return 1
    fi

    sleep 2
  done
}

read_env_value() {
  local key="$1"
  local file="$2"

  if [ ! -f "$file" ]; then
    return 1
  fi

  local line
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  if [ -z "$line" ]; then
    return 1
  fi

  printf '%s' "${line#*=}" | tr -d '\r'
}

require_cmd docker

if [ ! -f "$ENV_FILE" ]; then
  log "infra/.env missing; creating from infra/.env.example"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  log "created infra/.env; set secure secrets before production use"
fi

log "starting stack via docker compose"
docker compose "${COMPOSE_ARGS[@]}" up --build -d

log "waiting for API health"
wait_for_service_url api "http://127.0.0.1:4000/health" 180

log "waiting for Web home"
wait_for_service_url web "http://127.0.0.1:3000" 180

AUTH_USERNAME="$(read_env_value AUTH_USERNAME "$ENV_FILE" || true)"
AUTH_PASSWORD="$(read_env_value AUTH_PASSWORD "$ENV_FILE" || true)"

if [ -n "$AUTH_USERNAME" ] && [ -n "$AUTH_PASSWORD" ]; then
  log "running auth login smoke check"
  if ! docker compose "${COMPOSE_ARGS[@]}" exec -T api node <<'NODE'
const username = process.env.AUTH_USERNAME ?? "";
const password = process.env.AUTH_PASSWORD ?? "";

async function main() {
  try {
    const res = await fetch("http://127.0.0.1:4000/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        tenantSlug: "default"
      })
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[orbstack-smoke] login HTTP ${res.status}: ${text}`);
      process.exit(1);
    }

    const payload = await res.json();
    if (!payload || typeof payload.accessToken !== "string" || payload.accessToken.length === 0) {
      console.error("[orbstack-smoke] login response missing accessToken");
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[orbstack-smoke] login request failed: ${message}`);
    process.exit(1);
  }
}

main();
NODE
  then
    log "login smoke check failed"
    exit 1
  fi

  log "running functional ingest smoke check"
  if ! docker compose "${COMPOSE_ARGS[@]}" exec -T api node <<'NODE'
const { createServer } = require("node:http");

const API_BASE_URL = "http://127.0.0.1:4000";
const SMOKE_FEED_PORT = 4100;
const SMOKE_RSS_FEED_URL = `http://api:${SMOKE_FEED_PORT}/smoke-feed.xml`;
const SMOKE_JSON_FEED_URL = `http://api:${SMOKE_FEED_PORT}/smoke-feed.json`;
const SMOKE_ATOM_FEED_URL = `http://api:${SMOKE_FEED_PORT}/smoke-feed.atom`;
const SMOKE_RDF_FEED_URL = `http://api:${SMOKE_FEED_PORT}/smoke-feed.rdf`;
const SMOKE_WAIT_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 2_000;

const username = process.env.AUTH_USERNAME ?? "";
const password = process.env.AUTH_PASSWORD ?? "";

const runToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const smokeTargets = [
  {
    name: "rss",
    feedUrl: SMOKE_RSS_FEED_URL,
    articlePath: `/article/rss-${runToken}`,
    heroPath: `/hero/rss-${runToken}.jpg`,
    extractionToken: `rss-${runToken}`,
    storyTitle: `SMOKE-RSS-${runToken}-ingest-hero-fulltext`,
    summary: `Functional smoke RSS summary token rss-${runToken}`,
    guid: `smoke-rss-${runToken}`,
  },
  {
    name: "json",
    feedUrl: SMOKE_JSON_FEED_URL,
    articlePath: `/article/json-${runToken}`,
    heroPath: `/hero/json-${runToken}.jpg`,
    extractionToken: `json-${runToken}`,
    storyTitle: `SMOKE-JSON-${runToken}-ingest-hero-fulltext`,
    summary: `Functional smoke JSON summary token json-${runToken}`,
    guid: `smoke-json-${runToken}`,
  },
  {
    name: "atom",
    feedUrl: SMOKE_ATOM_FEED_URL,
    articlePath: `/article/atom-${runToken}`,
    heroPath: `/hero/atom-${runToken}.jpg`,
    extractionToken: `atom-${runToken}`,
    storyTitle: `SMOKE-ATOM-${runToken}-ingest-hero-fulltext`,
    summary: `Functional smoke Atom summary token atom-${runToken}`,
    guid: `smoke-atom-${runToken}`,
  },
  {
    name: "rdf",
    feedUrl: SMOKE_RDF_FEED_URL,
    articlePath: `/article/rdf-${runToken}`,
    heroPath: `/hero/rdf-${runToken}.jpg`,
    extractionToken: `rdf-${runToken}`,
    storyTitle: `SMOKE-RDF-${runToken}-ingest-hero-fulltext`,
    summary: `Functional smoke RDF summary token rdf-${runToken}`,
    guid: `smoke-rdf-${runToken}`,
  },
].map((target) => ({
  ...target,
  articleUrl: `http://api:${SMOKE_FEED_PORT}${target.articlePath}`,
  heroUrl: `http://api:${SMOKE_FEED_PORT}${target.heroPath}`,
}));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function requestJson(path, options = {}) {
  const { method = "GET", token, body } = options;
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const detail =
      typeof payload === "string"
        ? payload
        : payload === null
          ? "(empty body)"
          : JSON.stringify(payload);
    throw new Error(`${method} ${path} failed with HTTP ${response.status}: ${detail}`);
  }

  return payload;
}

function getSmokeTarget(name) {
  const target = smokeTargets.find((entry) => entry.name === name);
  if (!target) {
    throw new Error(`${name} smoke target missing`);
  }
  return target;
}

function buildSmokeFeedXml() {
  const target = getSmokeTarget("rss");
  const now = new Date();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>RSS Wrangler Smoke Feed</title>
    <link>http://api:${SMOKE_FEED_PORT}/</link>
    <description>Functional smoke feed fixture</description>
    <item>
      <title>${target.storyTitle}</title>
      <link>${target.articleUrl}</link>
      <guid isPermaLink="false">${target.guid}</guid>
      <pubDate>${now.toUTCString()}</pubDate>
      <description>${target.summary}</description>
      <enclosure url="${target.heroUrl}" type="image/jpeg" />
    </item>
  </channel>
</rss>`;
}

function buildSmokeFeedJson() {
  const target = getSmokeTarget("json");
  const now = new Date().toISOString();
  return JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title: "RSS Wrangler Smoke JSON Feed",
    home_page_url: `http://api:${SMOKE_FEED_PORT}/`,
    feed_url: target.feedUrl,
    description: "Functional smoke JSON feed fixture",
    items: [
      {
        id: target.guid,
        url: target.articleUrl,
        title: target.storyTitle,
        summary: target.summary,
        content_text: `Functional smoke JSON content token ${target.extractionToken}`,
        date_published: now,
        image: target.heroUrl,
      },
    ],
  });
}

function buildSmokeFeedAtom() {
  const target = getSmokeTarget("atom");
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <id>tag:rss-wrangler.local,${new Date().getFullYear()}:smoke-atom</id>
  <title>RSS Wrangler Smoke Atom Feed</title>
  <updated>${now}</updated>
  <entry>
    <id>${target.guid}</id>
    <title>${target.storyTitle}</title>
    <updated>${now}</updated>
    <published>${now}</published>
    <link rel="alternate" href="${target.articleUrl}" />
    <summary>${target.summary}</summary>
    <author><name>Smoke Atom Author</name></author>
    <media:thumbnail url="${target.heroUrl}" />
  </entry>
</feed>`;
}

function buildSmokeFeedRdf() {
  const target = getSmokeTarget("rdf");
  const now = new Date().toISOString();
  return `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns="http://purl.org/rss/1.0/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel rdf:about="${target.feedUrl}">
    <title>RSS Wrangler Smoke RDF Feed</title>
    <link>http://api:${SMOKE_FEED_PORT}/</link>
    <description>Functional smoke RDF feed fixture</description>
  </channel>
  <item rdf:about="${target.articleUrl}">
    <title>${target.storyTitle}</title>
    <link>${target.articleUrl}</link>
    <description>${target.summary}</description>
    <dc:creator>Smoke RDF Author</dc:creator>
    <dc:date>${now}</dc:date>
    <media:thumbnail url="${target.heroUrl}" />
  </item>
</rdf:RDF>`;
}

function buildSmokeArticleHtml(target) {
  const sentence = `Functional smoke extraction token ${target.extractionToken} verifies selfhost ingest, hero image persistence, and extracted full text correctness.`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Smoke Article ${target.extractionToken}</title>
  </head>
  <body>
    <main>
      <article>
        <h1>Smoke article ${target.extractionToken}</h1>
        <p>${sentence}</p>
        <p>${sentence}</p>
        <p>${sentence}</p>
      </article>
    </main>
  </body>
</html>`;
}

function startSmokeFixtureServer() {
  const feedXml = buildSmokeFeedXml();
  const feedJson = buildSmokeFeedJson();
  const feedAtom = buildSmokeFeedAtom();
  const feedRdf = buildSmokeFeedRdf();
  const articleHtmlByPath = new Map(
    smokeTargets.map((target) => [target.articlePath, buildSmokeArticleHtml(target)])
  );
  const heroPaths = new Set(smokeTargets.map((target) => target.heroPath));
  const heroBytes = Buffer.from([255, 216, 255, 217]); // minimal JPEG markers

  const server = createServer((req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("method not allowed");
      return;
    }

    if (url.pathname === "/smoke-feed.xml") {
      res.writeHead(200, { "Content-Type": "application/rss+xml; charset=utf-8" });
      res.end(method === "HEAD" ? undefined : feedXml);
      return;
    }

    if (url.pathname === "/smoke-feed.json") {
      res.writeHead(200, { "Content-Type": "application/feed+json; charset=utf-8" });
      res.end(method === "HEAD" ? undefined : feedJson);
      return;
    }

    if (url.pathname === "/smoke-feed.atom") {
      res.writeHead(200, { "Content-Type": "application/atom+xml; charset=utf-8" });
      res.end(method === "HEAD" ? undefined : feedAtom);
      return;
    }

    if (url.pathname === "/smoke-feed.rdf") {
      res.writeHead(200, { "Content-Type": "application/rdf+xml; charset=utf-8" });
      res.end(method === "HEAD" ? undefined : feedRdf);
      return;
    }

    if (articleHtmlByPath.has(url.pathname)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(method === "HEAD" ? undefined : articleHtmlByPath.get(url.pathname));
      return;
    }

    if (heroPaths.has(url.pathname)) {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(method === "HEAD" ? undefined : heroBytes);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(SMOKE_FEED_PORT, "0.0.0.0", () => resolve(server));
  });
}

async function stopSmokeFixtureServer(server) {
  await new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function login() {
  const payload = await requestJson("/v1/auth/login", {
    method: "POST",
    body: {
      username,
      password,
      tenantSlug: "default",
    },
  });

  const accessToken = payload?.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new Error("login response missing accessToken");
  }
  return accessToken;
}

async function ensureSmokeFeed(accessToken, feedUrl) {
  const feeds = await requestJson("/v1/feeds", { token: accessToken });
  if (!Array.isArray(feeds)) {
    throw new Error("feed list response was not an array");
  }

  const existing = feeds.find((feed) => feed && feed.url === feedUrl);
  if (existing && typeof existing.id === "string" && existing.id.length > 0) {
    return existing.id;
  }

  const created = await requestJson("/v1/feeds", {
    method: "POST",
    token: accessToken,
    body: { url: feedUrl },
  });
  if (!created || typeof created.id !== "string" || created.id.length === 0) {
    throw new Error("feed create response missing id");
  }
  return created.id;
}

async function queuePollNow(accessToken, feedId) {
  const response = await requestJson(`/v1/feeds/${feedId}/poll-now`, {
    method: "POST",
    token: accessToken,
    body: { lookbackDays: 7 },
  });
  if (!response || response.ok !== true) {
    throw new Error("poll-now response did not include ok=true");
  }
}

async function fetchClusterDetail(accessToken, clusterId) {
  return requestJson(`/v1/clusters/${clusterId}`, { token: accessToken });
}

async function findSmokeCluster(accessToken, target) {
  const list = await requestJson("/v1/clusters?state=all&sort=latest&limit=40", {
    token: accessToken,
  });

  if (!list || !Array.isArray(list.data)) {
    throw new Error("cluster list response missing data array");
  }

  const prioritized = [];
  const seen = new Set();

  function addCandidate(card) {
    if (!card || typeof card.id !== "string" || seen.has(card.id)) {
      return;
    }
    seen.add(card.id);
    prioritized.push(card);
  }

  for (const card of list.data) {
    const headline = typeof card.headline === "string" ? card.headline : "";
    const heroImageUrl = typeof card.heroImageUrl === "string" ? card.heroImageUrl : "";
    if (headline.includes(target.extractionToken) || heroImageUrl.includes(target.heroPath)) {
      addCandidate(card);
    }
  }

  for (const card of list.data.slice(0, 15)) {
    addCandidate(card);
  }

  for (const card of prioritized) {
    const detail = await fetchClusterDetail(accessToken, card.id);
    const members = Array.isArray(detail?.members) ? detail.members : [];
    const hasMember = members.some((member) => {
      const url = typeof member?.url === "string" ? member.url : "";
      return url.includes(target.articlePath);
    });
    if (hasMember) {
      return detail;
    }
  }

  return null;
}

function hasExpectedHeroImage(detail, target) {
  const heroImageUrl = typeof detail?.cluster?.heroImageUrl === "string"
    ? detail.cluster.heroImageUrl
    : "";
  return heroImageUrl.includes(target.heroPath);
}

function hasExpectedExtractedText(detail, target) {
  const storySoFar = typeof detail?.storySoFar === "string" ? detail.storySoFar.trim() : "";
  const storyTextSource = detail?.storyTextSource;
  return storySoFar.length >= 200
    && storySoFar.includes(target.extractionToken)
    && storyTextSource === "extracted_full_text";
}

async function waitForFunctionalSignals(accessToken, target) {
  const deadline = Date.now() + SMOKE_WAIT_TIMEOUT_MS;
  let lastStatus = `${target.name}: no matching cluster found yet`;

  while (Date.now() < deadline) {
    const detail = await findSmokeCluster(accessToken, target);
    if (detail) {
      const heroOk = hasExpectedHeroImage(detail, target);
      const storySoFar = typeof detail?.storySoFar === "string" ? detail.storySoFar.trim() : "";
      const extractedOk = hasExpectedExtractedText(detail, target);
      const storyTextSource = typeof detail?.storyTextSource === "string" ? detail.storyTextSource : "unknown";
      lastStatus = `${target.name}: clusterId=${detail?.cluster?.id ?? "unknown"} heroOk=${heroOk} storyTextSource=${storyTextSource} extractedChars=${storySoFar.length}`;
      if (heroOk && extractedOk) {
        return detail;
      }
    }
    await delay(POLL_INTERVAL_MS);
  }

  throw new Error(`timed out waiting for ingest+hero+extracted-text assertions (${lastStatus})`);
}

async function main() {
  let server;
  try {
    server = await startSmokeFixtureServer();
  } catch (error) {
    throw new Error(`failed to start smoke fixture server: ${toErrorMessage(error)}`);
  }

  try {
    const accessToken = await login();
    const feedIds = {};
    for (const target of smokeTargets) {
      feedIds[target.name] = await ensureSmokeFeed(accessToken, target.feedUrl);
    }

    await Promise.all(
      smokeTargets.map((target) => queuePollNow(accessToken, feedIds[target.name]))
    );

    const details = {};
    for (const target of smokeTargets) {
      details[target.name] = await waitForFunctionalSignals(accessToken, target);
    }

    console.log("[orbstack-smoke] functional ingest check passed", {
      rssFeedId: feedIds.rss,
      rssClusterId: details.rss?.cluster?.id,
      rssHeroImageUrl: details.rss?.cluster?.heroImageUrl,
      rssStoryTextSource: details.rss?.storyTextSource,
      rssStoryExtractedAt: details.rss?.storyExtractedAt,
      rssExtractedLength: typeof details.rss?.storySoFar === "string" ? details.rss.storySoFar.length : 0,
      jsonFeedId: feedIds.json,
      jsonClusterId: details.json?.cluster?.id,
      jsonHeroImageUrl: details.json?.cluster?.heroImageUrl,
      jsonStoryTextSource: details.json?.storyTextSource,
      jsonStoryExtractedAt: details.json?.storyExtractedAt,
      jsonExtractedLength: typeof details.json?.storySoFar === "string" ? details.json.storySoFar.length : 0,
      atomFeedId: feedIds.atom,
      atomClusterId: details.atom?.cluster?.id,
      atomHeroImageUrl: details.atom?.cluster?.heroImageUrl,
      atomStoryTextSource: details.atom?.storyTextSource,
      atomStoryExtractedAt: details.atom?.storyExtractedAt,
      atomExtractedLength: typeof details.atom?.storySoFar === "string" ? details.atom.storySoFar.length : 0,
      rdfFeedId: feedIds.rdf,
      rdfClusterId: details.rdf?.cluster?.id,
      rdfHeroImageUrl: details.rdf?.cluster?.heroImageUrl,
      rdfStoryTextSource: details.rdf?.storyTextSource,
      rdfStoryExtractedAt: details.rdf?.storyExtractedAt,
      rdfExtractedLength: typeof details.rdf?.storySoFar === "string" ? details.rdf.storySoFar.length : 0
    });
  } finally {
    if (server) {
      await stopSmokeFixtureServer(server);
    }
  }
}

main().catch((error) => {
  console.error(`[orbstack-smoke] functional ingest check failed: ${toErrorMessage(error)}`);
  process.exit(1);
});
NODE
  then
    log "functional ingest smoke check failed"
    exit 1
  fi
else
  log "skipping auth login smoke check (AUTH_USERNAME/AUTH_PASSWORD not found in infra/.env)"
  log "skipping functional ingest smoke check (AUTH_USERNAME/AUTH_PASSWORD not found in infra/.env)"
fi

RUNNING_SERVICES="$(docker compose "${COMPOSE_ARGS[@]}" ps --services --status running)"
for required in api web worker postgres; do
  if ! printf '%s\n' "$RUNNING_SERVICES" | grep -qx "$required"; then
    log "required service is not running: $required"
    docker compose "${COMPOSE_ARGS[@]}" ps
    exit 1
  fi
done

log "stack smoke check passed"
log "services:"
docker compose "${COMPOSE_ARGS[@]}" ps

WEB_CONTAINER_NAME="$(docker compose "${COMPOSE_ARGS[@]}" ps -q web || true)"
API_CONTAINER_NAME="$(docker compose "${COMPOSE_ARGS[@]}" ps -q api || true)"

if [ -n "$WEB_CONTAINER_NAME" ]; then
  WEB_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$WEB_CONTAINER_NAME" 2>/dev/null || true)"
  if [ -n "$WEB_IP" ]; then
    log "web direct URL: http://$WEB_IP:3000"
  fi
fi

if [ -n "$API_CONTAINER_NAME" ]; then
  API_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$API_CONTAINER_NAME" 2>/dev/null || true)"
  if [ -n "$API_IP" ]; then
    log "api direct URL: http://$API_IP:4000"
  fi
fi
