# GitHub Cron Job Documentation

**Scan date:** 2026-08-16

## Overview

The automated pipeline includes a GitHub repository fetching and security-analysis system that:

- Fetches repositories from the GitHub Search API on a configurable cron schedule
- Handles rate limiting with exponential backoff
- Upserts repository metadata into PostgreSQL
- Enqueues each saved repo for LLM security risk categorization (BullMQ)
- Exposes REST APIs (and a Next.js dashboard) to query repos and risk breakdown

## Architecture

### Pipeline flow

```text
cron tick
  → githubService.searchRepositories(query)
  → repositoryService.createOrUpdate(...)
  → enqueueSecurityAnalysis({ repositoryId, ... })  // jobId: security-${id}
       → Worker: getReadme + getIssues
       → Anthropic or OpenAI → { risk, summary }
       → repositoryService.updateSecurityRisk(...)
```

### Components

1. **GitHub Service** (`src/services/github.service.ts`)
   - Search repos, fetch single repo, README, and open issues
   - Exponential backoff on rate limiting

2. **Repository Service** (`src/services/repository.service.ts`)
   - Upsert / list / search / security risk updates and breakdown

3. **GitHub Cron Worker** (`src/workers/github-cron.worker.ts`)
   - Schedules fetch + store + enqueue
   - Admin manual trigger and status

4. **Security Queue Worker** (`src/workers/queue.worker.ts`)
   - BullMQ queue `security-analysis`
   - LLM categorization (Anthropic preferred when key present; OpenAI fallback)
   - Concurrency 2; 3 attempts with exponential backoff

5. **Repository Routes** (`src/routes/repositories.ts`)
   - List (with search), by owner, by full name, security stats, admin cron controls

6. **Frontend** (`frontend/`)
   - Next.js dashboard on port 3001 consuming the repository APIs

## Configuration

### Environment Variables

Add to `.env` (see `.env.example`):

```env
# GitHub API token (optional but recommended for higher rate limits)
GITHUB_TOKEN=ghp_your_token_here

# Cron schedule (node-cron; optional seconds field)
# Code default when unset: every 6 hours — 0 */6 * * *
# Local example in .env.example: every 20 seconds
GITHUB_CRON_SCHEDULE="*/20 * * * * *"

# LLM for security risk (at least one key required for analysis jobs)
# When LLM_PROVIDER is unset: Anthropic if ANTHROPIC_API_KEY set, else OpenAI
# LLM_PROVIDER=anthropic
# LLM_PROVIDER=openai
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514
OPENAI_MODEL=gpt-4o-mini
```

### Cron Schedule Format

Uses **node-cron**, which supports an optional leading **seconds** field:

```
┌───────────── second (0 - 59)          [optional]
│ ┌───────────── minute (0 - 59)
│ │ ┌───────────── hour (0 - 23)
│ │ │ ┌───────────── day of month (1 - 31)
│ │ │ │ ┌───────────── month (1 - 12)
│ │ │ │ │ ┌───────────── day of week (0 - 7) (Sunday = 0 or 7)
│ │ │ │ │ │
* * * * * *
```

**Common Examples:**
- `*/20 * * * * *` - Every 20 seconds (local example)
- `0 */6 * * *` - Every 6 hours (code default)
- `0 0 * * *` - Daily at midnight
- `0 */12 * * *` - Every 12 hours
- `0 2 * * 0` - Weekly on Sunday at 2 AM

See [crontab.guru](https://crontab.guru) for 5-field patterns; use node-cron docs for 6-field (with seconds).

## API Endpoints

### List Repositories

**GET** `/api/repositories`

**Parameters:**
- `limit` (number, default: 100, max: 100)
- `offset` (number, default: 0)
- `search` (string, optional) — case-insensitive match on name, fullName, owner, description, language

**Response:**
```json
{
  "data": [
    {
      "id": "unique-id",
      "githubId": 12345,
      "name": "repo-name",
      "fullName": "owner/repo-name",
      "description": "Repository description",
      "url": "https://github.com/owner/repo-name",
      "language": "TypeScript",
      "stars": 5000,
      "forks": 500,
      "openIssues": 42,
      "owner": "owner-name",
      "securityRisk": "Medium",
      "securitySummary": "1-3 sentence rationale from the LLM",
      "securityAnalyzedAt": "2026-08-16T00:00:00.000Z",
      "lastFetchedAt": "2026-08-16T00:00:00.000Z",
      "createdAt": "2026-08-15T19:00:00.000Z",
      "updatedAt": "2026-08-16T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 300,
    "limit": 100,
    "offset": 0
  }
}
```

`securityRisk` / `securitySummary` / `securityAnalyzedAt` are `null` until the queue worker finishes analysis.

### Security Risk Breakdown

**GET** `/api/repositories/stats/security-risk`

```json
{
  "High": 2,
  "Medium": 10,
  "Low": 5,
  "Unanalyzed": 3,
  "total": 20
}
```

### Get Repositories by Owner

**GET** `/api/repositories/owner/:owner`

```json
{
  "data": [...],
  "owner": "facebook"
}
```

### Get Single Repository

**GET** `/api/repositories/:fullName`

Get by full name (e.g. `torvalds/linux`). Returns `404` if missing.

### Manual Cron Trigger (Admin)

**POST** `/api/repositories/admin/trigger`

```json
{
  "success": true,
  "message": "Cron job executed successfully"
}
```

### Get Cron Status (Admin)

**GET** `/api/repositories/admin/status`

```json
{
  "running": true,
  "isExecuting": false,
  "schedule": "*/20 * * * * *"
}
```

## Rate Limiting

### GitHub API Limits

- **Unauthenticated:** 60 requests/hour
- **Authenticated:** 5,000 requests/hour

Search and per-repo README/issues calls all count toward the limit. Security analysis adds extra traffic after each fetch.

### Exponential Backoff Strategy

When rate limited (HTTP 403 with remaining 0):

1. Reads `x-ratelimit-remaining` / `x-ratelimit-reset`
2. Backoff: `delay = baseDelay * 2^attempt + random(0-1000)ms`
3. Retries (search: up to 5; single-repo fetch: up to 3)
4. Gives up with logged reset time

## Search Queries

Configured in `src/workers/github-cron.worker.ts`. **Current active query** (as of scan):

```typescript
const queries = [
  // Popular-language queries remain commented out for local use:
  // 'language:typescript stars:>1000 sort:stars',
  // 'language:javascript stars:>1000 sort:stars',
  // 'language:python stars:>1000 sort:stars',
  'user:horppe sort:stars'
];
```

Restore broader queries by uncommenting / editing that array.

**Common query examples:**
- `language:javascript stars:>5000`
- `topic:react`
- `created:>2024-01-01`
- `user:some-org sort:stars`

See [GitHub search documentation](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories).

## Security Analysis Queue

| Detail | Value |
| --- | --- |
| Queue name | `security-analysis` |
| Job name | `analyze-security` |
| Job id | `security-${repositoryId}` (idempotent per repo) |
| Concurrency | 2 |
| Retries | 3, exponential backoff (2s base) |
| Inputs | README (≤12k chars) + up to 15 open issues (body ≤500 chars each) |
| Output | `High` \| `Medium` \| `Low` + summary string |

Without an LLM API key, enqueue still succeeds but jobs fail until keys are configured.

## Database Schema

### Repository Model

```prisma
enum SecurityRisk {
  High
  Medium
  Low
}

model Repository {
  id                  String         @id @default(cuid())
  githubId            Int            @unique
  name                String
  fullName            String         @unique
  description         String?
  url                 String         @unique
  language            String?
  stars               Int            @default(0)
  forks               Int            @default(0)
  openIssues          Int            @default(0)
  owner               String
  securityRisk        SecurityRisk?
  securitySummary     String?
  securityAnalyzedAt  DateTime?
  lastFetchedAt       DateTime       @default(now())
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  @@index([owner])
  @@index([lastFetchedAt])
  @@index([securityRisk])
  @@map("repositories")
}
```

Migration: `prisma/migrations/20260815234000_add_security_risk`.

## Usage Examples

### TypeScript

```typescript
import { repositoryService } from './services/repository.service';
import { githubCronJob } from './workers/github-cron.worker';
import { enqueueSecurityAnalysis } from './workers/queue.worker';

const repos = await repositoryService.listAll(50, 0, 'react');
const breakdown = await repositoryService.getSecurityRiskBreakdown();
await githubCronJob.executeManually();
```

### cURL

```bash
# List + search
curl 'http://localhost:3000/api/repositories?limit=10&search=react'

# Risk breakdown
curl http://localhost:3000/api/repositories/stats/security-risk

# By owner / full name
curl http://localhost:3000/api/repositories/owner/facebook
curl http://localhost:3000/api/repositories/facebook/react

# Admin
curl -X POST http://localhost:3000/api/repositories/admin/trigger
curl http://localhost:3000/api/repositories/admin/status
```

## Error Handling

### Rate Limiting
- Detects 403 + remaining 0; retries with backoff; logs reset time

### Connection Errors
- 30s Axios timeout; network/DNS failures logged and thrown

### Queue / LLM Errors
- Missing API keys → job fails with clear error
- Invalid LLM JSON → parse failure and retry
- Per-repo enqueue failures do not stop the cron batch

### Data Errors
- Upsert on `githubId` avoids duplicate rows
- Missing README (404) → analysis continues with `(no README)`

## Performance Considerations

- Fetch volume depends on active search queries (`per_page: 100` per query)
- Each analyzed repo costs additional GitHub calls (README + issues) plus one LLM request
- Prefer authenticated `GITHUB_TOKEN` and a sane cron interval in production
- BullMQ retains last 100 completed / 50 failed jobs

## Troubleshooting

### Cron job not running
```bash
# Logs should include "GitHub cron job started successfully"
# GET /api/repositories/admin/status
# Validate GITHUB_CRON_SCHEDULE with node-cron (seconds field if used)
```

### Security jobs stuck / failing
- Ensure Redis is up (`REDIS_URL`)
- Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- Check worker logs for `Security analysis started/completed` or job failures

### Rate limit errors
- Add `GITHUB_TOKEN`; reduce cron frequency; narrow search queries

### Missing security fields
- Repo rows appear immediately; risk fields fill asynchronously after the worker runs

## Security

- Keep tokens/keys in `.env` only; never commit them
- GitHub PAT: minimal scopes (public repo read)
- Admin cron endpoints are currently unauthenticated — protect before exposing publicly
- LLM prompts include only README/issue text already public on GitHub

## Future Enhancements

- [ ] Authentication middleware for admin endpoints
- [ ] Webhook support for real-time updates
- [ ] Custom search query management via API
- [ ] Re-analyze stale security assessments on a schedule
- [ ] Archived record cleanup jobs
- [ ] Data export (CSV, JSON)
