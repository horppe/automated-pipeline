# AI Context — Design Principles

Guidance for agents working in this repo. Prefer patterns already present in the codebase over inventing new ones.

**Scan date:** 2026-08-16

## Core constraints

- **Strict TypeScript** — `strict: true`, ESM (`"type": "module"`), `NodeNext` resolution, target ES2022.
- **ESM import style** — Relative imports with explicit `.js` extensions (e.g. `../lib/prisma.js`), even for `.ts` sources.
- **Prefer existing dependencies** — Do not add libraries unless required for the task. Stack in use: Fastify, Prisma, PostgreSQL, Redis/BullMQ, Zod, Axios, node-cron, Pino, Anthropic SDK, OpenAI SDK; Next.js 16 + React 19 + Recharts + Tailwind 4 for the dashboard.
- **Functional-leaning services** — Prefer plain exported objects of async functions for stateless domain logic (`repositoryService`, `userService`). Use classes only when instance state is needed (`GitHubService`, `GitHubCronJob`).

## Architecture

Layered backend with an async security pipeline and a separate Next.js dashboard:

```text
GitHub cron  →  repositoryService (upsert)
                      ↓
              enqueueSecurityAnalysis (BullMQ)
                      ↓
              queue worker → GitHub README/issues → LLM → updateSecurityRisk

routes  →  services  →  lib (prisma / redis)
                ↑
             workers (cron / queues)

frontend (Next.js :3001)  →  REST /api/repositories*
```

| Layer | Role |
| --- | --- |
| `src/routes/` | Thin Fastify plugins: HTTP, validation, status codes |
| `src/services/` | Domain/API/DB logic; no Fastify types |
| `src/workers/` | Cron fetch + BullMQ security analysis; orchestrate services |
| `src/lib/` | Shared clients (Prisma, Redis) |
| `src/config/` | Env loading and validation |
| `frontend/` | Next.js dashboard (stats, risk chart, searchable repo table) |

- Register routes as Fastify plugins with prefixes in `buildApp()`.
- Keep `server.ts` as the listen/bootstrap entry; `app.ts` builds and wires the app.
- Export **singleton** clients/workers from modules (`prisma`, `redis`, `githubService`, `githubCronJob`, `securityAnalysisQueue` / `pipelineWorker`).
- Security queue worker starts on module import; close it in Fastify `onClose` via `closeSecurityQueue()`.

## Validation & configuration

- Validate **all env** with Zod at startup (`src/config/env.ts`); fail fast on bad config.
- Validate **request bodies** with Zod at route boundaries (see `createUserSchema` in users routes).
- Coerce/default numeric and enum env values via Zod (e.g. `PORT`, `NODE_ENV`, `LLM_PROVIDER`).
- Secrets and tokens live in `.env` only — never hardcode credentials.
- LLM: optional `LLM_PROVIDER` (`anthropic` \| `openai`); if unset, prefer Anthropic when `ANTHROPIC_API_KEY` is set, else OpenAI. Models via `ANTHROPIC_MODEL` / `OPENAI_MODEL`.
- Cron: `GITHUB_CRON_SCHEDULE` uses **node-cron** (supports optional seconds). Code default `0 */6 * * *`; `.env.example` uses `*/20 * * * * *` for local iteration.

## Data & persistence

- Prisma + PostgreSQL; map models to snake/plural tables with `@@map`.
- Prefer **upsert** for external-entity sync (`createOrUpdate` on `githubId`) to stay idempotent.
- Unique constraints on natural keys (`githubId`, `fullName`, `url`, `email`).
- Index columns used for list/filter (`owner`, `lastFetchedAt`, `securityRisk`).
- `Repository` security fields: `securityRisk` (`High` \| `Medium` \| `Low` \| null), `securitySummary`, `securityAnalyzedAt`.
- Reuse a single Prisma client; cache on `globalThis` in non-production to avoid hot-reload leaks.

## HTTP & API shape

- REST under `/api/...`; health at `GET /api/health`.
- List endpoints return `{ data, pagination }` (or `{ data, …context }`).
- Cap pagination (`limit` max 100); support `offset` and optional `search` on repository list.
- Dashboard stats: `GET /api/repositories/stats/security-risk` → `{ High, Medium, Low, Unanalyzed, total }`.
- Use appropriate status codes (`201` create, `404` missing, `400` failed admin actions).
- Register Helmet and CORS on the app (`origin: true` for local dashboard).

## Resilience & jobs

- External APIs: timeouts, typed error handling, **exponential backoff with jitter** on rate limits.
- Cron/workers: guard against concurrent runs (`isRunning`); validate cron expressions before schedule.
- After each repo upsert, enqueue security analysis with idempotent job id `security-${repositoryId}`.
- Queue worker (concurrency 2): fetch README + open issues → LLM JSON assessment → persist risk/summary; 3 attempts with exponential backoff.
- Graceful shutdown: stop cron and close BullMQ worker/queue/connection on Fastify `onClose`.
- Per-item error isolation in batch loops — one failed save/enqueue must not abort the whole run.
- Redis: BullMQ connection uses `maxRetriesPerRequest: null` and `lazyConnect`.

## Observability

- Fastify/Pino logging: `debug` + pretty transport in development, `info` in production.
- Log job start/end, durations, counts, rate-limit remaining, and LLM provider/risk outcome.
- Structured success/failure results from manual admin triggers (`{ success, message, error? }`).

## Frontend

- Next.js App Router under `frontend/`; API base from `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`).
- Components: `Dashboard`, `StatCards`, `RiskChart` (Recharts), `RepoTable` (search + pagination).
- Risk styling helpers in `frontend/src/lib/risk.ts`; shared types in `frontend/src/lib/types.ts`.
- Run separately: `npm run dev:frontend` (port 3001).

## Testing

- Jest + ts-jest in ESM mode; tests under `src/__tests__/` mirroring `services/` and `workers/`.
- Cover: `github.service`, `repository.service`, `github-cron.worker`, `queue.worker`.
- Mock external I/O (Axios, Prisma, Redis, LLM SDKs); do not hit live GitHub/DB/LLM in unit tests.
- Strip `.js` in `moduleNameMapper` so ESM import paths resolve under Jest.

## Infrastructure

- Docker Compose for Postgres, Redis, and the app; Alpine base images.
- Document env in `.env.example`; keep local/runtime config out of source.
- Migrations under `prisma/migrations/` (init → repositories → `add_security_risk`).

## When changing code

1. Put business logic in services; keep routes thin.
2. Match existing naming: `*Service`, `*Routes`, `*CronJob` / workers.
3. Extend Zod schemas when adding env or request fields.
4. Prefer upsert/idempotent writes for synced external data; keep queue job ids stable per repo.
5. Add or update tests beside the layer you change.
6. Keep frontend types aligned with Prisma/API response shapes when fields change.
