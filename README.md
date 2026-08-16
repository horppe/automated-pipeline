# Automated Pipeline

TypeScript pipeline that fetches GitHub repositories on a cron schedule, stores them in PostgreSQL, categorizes security risk with an LLM via BullMQ, and serves a Next.js dashboard.

**Scan date:** 2026-08-16

## Stack

| Area | Tech |
| --- | --- |
| API | Fastify 5, Zod, Pino, Helmet, CORS |
| Data | Prisma, PostgreSQL 16 |
| Jobs | node-cron, BullMQ, Redis 7 |
| GitHub | Axios + optional `GITHUB_TOKEN` |
| LLM | Anthropic and/or OpenAI (`security-analysis` queue) |
| UI | Next.js 16, React 19, Tailwind 4, Recharts |
| Tests | Jest (ESM) |

## Folder structure

```text
.
├── docker-compose.yml
├── Dockerfile
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       ├── 20260815185243_init/
│       ├── 20260815191411_add_repositories/
│       └── 20260815234000_add_security_risk/
├── src/
│   ├── config/
│   │   └── env.ts
│   ├── lib/
│   │   ├── prisma.ts
│   │   └── redis.ts
│   ├── routes/
│   │   ├── health.ts
│   │   ├── repositories.ts
│   │   └── users.ts
│   ├── services/
│   │   ├── github.service.ts
│   │   ├── repository.service.ts
│   │   └── user.service.ts
│   ├── workers/
│   │   ├── github-cron.worker.ts
│   │   └── queue.worker.ts
│   ├── __tests__/
│   │   ├── services/
│   │   └── workers/
│   ├── server.ts
│   └── app.ts
├── frontend/
│   └── src/
│       ├── app/
│       ├── components/   # Dashboard, StatCards, RiskChart, RepoTable
│       └── lib/          # api, risk, types
├── ai-context.md
├── GITHUB_CRON_JOB.md
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## How it works

1. **Cron** (`github-cron.worker`) searches GitHub and upserts repos.
2. Each saved repo is **enqueued** for security analysis (`security-${repositoryId}`).
3. **Queue worker** loads README + open issues, asks Claude or OpenAI for `High` / `Medium` / `Low` + summary, and updates the row.
4. **API** exposes list/search, owner lookup, risk stats, and admin cron controls.
5. **Dashboard** (`frontend`, port 3001) charts risk breakdown and lists repositories.

See [GITHUB_CRON_JOB.md](./GITHUB_CRON_JOB.md) for endpoints, cron, rate limits, and schema detail. See [ai-context.md](./ai-context.md) for agent/design conventions.

## Getting started

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
   Set `GITHUB_TOKEN` (recommended) and at least one of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` for security jobs.

2. Start infrastructure:
   ```bash
   docker compose up -d postgres redis
   ```

3. Install and migrate:
   ```bash
   npm install
   npx prisma migrate dev
   ```

4. Start the API:
   ```bash
   npm run dev
   ```

5. Start the dashboard (separate terminal):
   ```bash
   npm run dev:frontend
   ```
   Open http://localhost:3001 — it calls `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`).

## Docker

```bash
docker compose up --build
```

Runs Postgres, Redis, and the API (`prisma db push` then `npm run dev`). Frontend is local-only via `npm run dev:frontend`.

## Useful commands

```bash
npm run dev
npm run dev:frontend
npm run build
npm run build:frontend
npm test
npm run db:studio
npm run docker:up
npm run docker:down
```

## Key environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` / `REDIS_URL` | Postgres and Redis |
| `GITHUB_TOKEN` | Higher GitHub rate limits |
| `GITHUB_CRON_SCHEDULE` | node-cron expression (optional seconds); example every 20s, code default every 6h |
| `LLM_PROVIDER` | Optional `anthropic` \| `openai` override |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Security analysis |
| `ANTHROPIC_MODEL` / `OPENAI_MODEL` | Model ids |
| `NEXT_PUBLIC_API_URL` | Frontend → API base (in `frontend`) |
