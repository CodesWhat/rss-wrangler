<div align="center">

<h1>RSS Wrangler</h1>

**Open-source RSS reader with AI-powered clustering, full-text extraction, and smart digests. Self-host on any machine for free.**

</div>

<p align="center">
  <a href="https://github.com/s-b-e-n-s-o-n/rss-wrangler/commits/main"><img src="https://img.shields.io/github/last-commit/s-b-e-n-s-o-n/rss-wrangler?style=flat" alt="Last commit"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-C9A227" alt="License AGPL-3.0"></a>
  <br>
  <a href="https://github.com/s-b-e-n-s-o-n/rss-wrangler/stargazers"><img src="https://img.shields.io/github/stars/s-b-e-n-s-o-n/rss-wrangler?style=flat" alt="Stars"></a>
  <a href="https://github.com/s-b-e-n-s-o-n/rss-wrangler/issues"><img src="https://img.shields.io/github/issues/s-b-e-n-s-o-n/rss-wrangler?style=flat" alt="Issues"></a>
  <a href="https://github.com/s-b-e-n-s-o-n/rss-wrangler"><img src="https://img.shields.io/github/repo-size/s-b-e-n-s-o-n/rss-wrangler?style=flat" alt="Repo size"></a>
</p>

<h2 align="center">Screenshots</h2>

---

<table>
<tr>
<th align="center">3-Pane Reader</th>
<th align="center">Article View</th>
</tr>
<tr>
<td><img src="docs/assets/home-feed.png" alt="Home feed" width="400"></td>
<td><img src="docs/assets/reader-pane.png" alt="Reader pane" width="400"></td>
</tr>
<tr>
<th align="center">Source Management</th>
<th align="center">Mobile</th>
</tr>
<tr>
<td><img src="docs/assets/sources.png" alt="Sources" width="400"></td>
<td align="center"><img src="docs/assets/mobile.png" alt="Mobile" width="200"></td>
</tr>
</table>

<h2 align="center">Quick Start</h2>

---

```bash
git clone https://github.com/s-b-e-n-s-o-n/rss-wrangler.git && cd rss-wrangler
cp infra/.env.example infra/.env

# Edit infra/.env — set AUTH_JWT_SECRET and AUTH_PASSWORD at minimum
docker compose -f infra/docker-compose.yml up --build -d
```

Open `http://localhost:3001` and log in.

<details>
<summary><strong>What gets started</strong></summary>

| Service | Description | Default Port |
|---------|-------------|-------------|
| **postgres** | PostgreSQL 16 | 5433 |
| **migrate** | One-shot SQL migration runner (exits after success) | — |
| **api** | Fastify REST API | 4001 |
| **worker** | Feed polling, clustering, AI enrichment, digests | — |
| **web** | Next.js frontend | 3001 |

</details>

<details>
<summary><strong>Local development (no Docker)</strong></summary>

Requires Node.js >= 22 and PostgreSQL.

```bash
npm install

export DATABASE_URL=postgres://postgres:postgres@localhost:5432/rss_wrangler
sh db/run-migrations.sh

# In separate terminals:
npm run dev:api      # Fastify on :4000
npm run dev:worker   # Background jobs
npm run dev:web      # Next.js on :3000
```

</details>

<h2 align="center">Features</h2>

---

<table>
<tr>
<td align="center" width="33%">
<h3>3-Pane Reader</h3>
Sidebar + article list + reader pane. Keyboard shortcuts (j/k/s/o/Esc). Smart feeds: All, Unread, Starred.
</td>
<td align="center" width="33%">
<h3>Story Clustering</h3>
Deduplication via simhash + Jaccard similarity. Multiple outlets covering the same story get grouped into one cluster.
</td>
<td align="center" width="33%">
<h3>Full-Text Extraction</h3>
Automatic full-text fetch from article URLs. Read complete articles without leaving the app.
</td>
</tr>
<tr>
<td align="center">
<h3>AI Enrichment</h3>
Topic classification, story summaries, and smart digests. Multi-provider: OpenAI, Anthropic, or local Ollama.
</td>
<td align="center">
<h3>Feed Discovery</h3>
500+ curated feeds in a browsable directory. Category-based suggestions based on your subscriptions.
</td>
<td align="center">
<h3>Smart Filters</h3>
Mute-with-breakout filter system. Auto-suppress noise, surface important stories that break through.
</td>
</tr>
<tr>
<td align="center">
<h3>OPML Import/Export</h3>
Bring your feeds from any reader. Export anytime. No lock-in.
</td>
<td align="center">
<h3>Full-Text Search</h3>
Postgres FTS with tsvector/tsquery. Search across titles, sources, and article content.
</td>
<td align="center">
<h3>Daily Digests</h3>
Auto-generated digest of top stories when you've been away. Optional AI narrative summaries.
</td>
</tr>
<tr>
<td align="center">
<h3>Mobile Responsive</h3>
Hamburger sidebar overlay, stacked layout on small screens. PWA installable.
</td>
<td align="center">
<h3>Multi-Tenant</h3>
Row-level security with Postgres RLS. Invite members to shared workspaces.
</td>
<td align="center">
<h3>Privacy Controls</h3>
GDPR-ready consent manager. Data export and account deletion built in.
</td>
</tr>
</table>

<h2 align="center">Self-Hosting</h2>

---

All features are unlocked when self-hosted. No license keys, no feature gates, no phone-home.

Docker Compose on any Linux server, NAS (Synology, QNAP, etc.), or cloud VM. Runs on ARM64 and AMD64.

<details>
<summary><strong>Environment variables</strong></summary>

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_JWT_SECRET` | Yes | JWT signing secret (min 32 chars) |
| `AUTH_USERNAME` | Yes | Admin username |
| `AUTH_PASSWORD` | Yes | Admin password |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `APP_BASE_URL` | No | Base URL for email links (default: `http://localhost:3001`) |
| `REQUIRE_EMAIL_VERIFICATION` | No | Require verified email before login (default: `false`) |
| `RESEND_API_KEY` | No | Resend API key for transactional emails |
| `WORKER_POLL_MINUTES` | No | Feed poll interval (default: `60`) |
| `OPENAI_API_KEY` | No | OpenAI key for AI features |
| `ANTHROPIC_API_KEY` | No | Anthropic key for AI features |
| `AI_PROVIDER` | No | `openai`, `anthropic`, or `ollama` |
| `OLLAMA_BASE_URL` | No | Ollama server URL for local AI |

</details>

<details>
<summary><strong>Reverse proxy (Caddy, nginx, Traefik)</strong></summary>

Set `NEXT_PUBLIC_API_BASE_URL` to your public API URL and rebuild the web container:

```bash
# In infra/.env
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com
APP_BASE_URL=https://your-domain.com

docker compose -f infra/docker-compose.yml up --build -d
```

`NEXT_PUBLIC_*` vars are inlined at build time by Next.js, so a rebuild is required when changing them.

</details>

<h2 align="center">Architecture</h2>

---

```
apps/
  web/        Next.js 14 frontend (React 18, custom CSS)
  api/        Fastify 5 REST API (JWT auth, Postgres RLS)
  worker/     pg-boss background jobs (polling, clustering, AI, digests)
packages/
  contracts/  Shared TypeScript types and Zod schemas
db/
  migrations/ Sequential SQL migrations (applied on startup)
infra/
  docker-compose.yml
```

<details>
<summary><strong>Tech stack</strong></summary>

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, custom CSS (Brutalist Mono design system) |
| API | Fastify 5, PostgreSQL 16, JWT auth (Better Auth) |
| Worker | pg-boss (Postgres-backed job queue) |
| AI | Multi-provider: OpenAI, Anthropic, Ollama |
| Search | Postgres FTS (tsvector/tsquery) |
| Email | Resend (transactional) |
| Shared | TypeScript, Zod schemas, Biome linter |

</details>

<details>
<summary><strong>Scripts</strong></summary>

| Command | Description |
|---------|-------------|
| `npm run dev:web` | Next.js dev server |
| `npm run dev:api` | Fastify dev server (tsx watch) |
| `npm run dev:worker` | Worker dev server (tsx watch) |
| `npm run build` | Build all packages |
| `npm test` | Run tests (Vitest) |
| `npm run typecheck` | Type-check all packages |
| `npm run lint` | Lint with Biome |

</details>

<h2 align="center">Hosted Service (Planned)</h2>

---

| Tier | Price | Highlights |
|------|-------|-----------|
| Free | $0 | 50 feeds, 500 items/day, 30d retention, 60min refresh |
| Pro | $7/mo ($70/yr) | Unlimited feeds, 1yr retention, 10min refresh, full-text search |
| Pro + AI | $14/mo ($140/yr) | AI summaries, topic classification, smart digests |

Self-hosted users get all Pro + AI features for free.

<h2 align="center">Roadmap</h2>

---

| Phase | Theme | Status |
|-------|-------|--------|
| 0 | Platform hardening, Docker Compose, CI/CD | Done |
| 1 | 3-pane reader, full-text extraction, reader mode | Done |
| 2 | Ranking personalization, mark-read tuning | Next |
| 3 | AI enrichment pipeline (multi-provider) | Done |
| 4 | Feed discovery engine | Partial |
| 5 | Notifications (push, email digest) | Partial |
| 6 | Billing integration (Lemon Squeezy) | Wired |
| 7 | Mobile PWA polish | Planned |
| 8 | Annotations and highlights | Done |
| 9 | Privacy, GDPR, data export | Done |

---

<div align="center">

### Built With

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js_14-000?logo=nextdotjs&logoColor=fff)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React_18-61DAFB?logo=react&logoColor=000)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify_5-000?logo=fastify&logoColor=fff)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-4169E1?logo=postgresql&logoColor=fff)](https://www.postgresql.org/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=fff)](https://vitest.dev/)
[![Biome](https://img.shields.io/badge/Biome-60a5fa?logo=biome&logoColor=fff)](https://biomejs.dev/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=fff)](https://www.docker.com/)
[![Built with AI](https://img.shields.io/badge/Built_with_AI-000000?style=flat&logo=anthropic&logoColor=white)](https://claude.ai/)

---

**[AGPL-3.0 License](LICENSE)**

</div>
