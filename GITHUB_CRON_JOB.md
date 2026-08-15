# GitHub Cron Job Documentation

## Overview

The automated pipeline includes a robust GitHub repository fetching system that:
- ✅ Fetches popular repositories from the GitHub API
- ✅ Handles rate limiting with exponential backoff
- ✅ Stores repository metadata in PostgreSQL
- ✅ Runs on a configurable cron schedule
- ✅ Provides REST APIs to query stored repositories

## Architecture

### Components

1. **GitHub Service** (`src/services/github.service.ts`)
   - Handles all GitHub API interactions
   - Implements exponential backoff for rate limiting
   - Parses GitHub API responses

2. **Repository Service** (`src/services/repository.service.ts`)
   - ORM layer for database operations
   - CRUD operations for repositories
   - Upsert logic to avoid duplicates

3. **GitHub Cron Worker** (`src/workers/github-cron.worker.ts`)
   - Schedules and executes the cron job
   - Orchestrates fetching and storage
   - Provides admin controls (manual trigger, status)

4. **Repository Routes** (`src/routes/repositories.ts`)
   - REST API endpoints for querying repositories
   - Admin endpoints for cron management

## Configuration

### Environment Variables

Add to `.env`:

```env
# GitHub API token (optional but recommended for higher rate limits)
# Get yours from: https://github.com/settings/tokens
# Required scopes: public_repo (read-only access)
GITHUB_TOKEN=ghp_your_token_here

# Cron schedule (standard cron expression format)
# Default: Every 6 hours
GITHUB_CRON_SCHEDULE="0 */6 * * *"
```

### Cron Schedule Format

The cron schedule uses standard cron expression syntax:

```
┌───────────── second (0 - 59)
│ ┌───────────── minute (0 - 59)
│ │ ┌───────────── hour (0 - 23)
│ │ │ ┌───────────── day of month (1 - 31)
│ │ │ │ ┌───────────── month (0 - 11)
│ │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │ │
│ │ │ │ │ │
* * * * * *
```

**Common Examples:**
- `0 */6 * * *` - Every 6 hours (default)
- `0 0 * * *` - Daily at midnight
- `0 */12 * * *` - Every 12 hours
- `0 2 * * 0` - Weekly on Sunday at 2 AM
- `*/30 * * * *` - Every 30 minutes

See [crontab.guru](https://crontab.guru) for more patterns.

## API Endpoints

### List Repositories

**GET** `/api/repositories`

Query all repositories stored in the database.

**Parameters:**
- `limit` (number, default: 100, max: 100) - Results per page
- `offset` (number, default: 0) - Pagination offset

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
      "lastFetchedAt": "2026-08-15T20:00:00Z",
      "createdAt": "2026-08-15T19:00:00Z",
      "updatedAt": "2026-08-15T20:00:00Z"
    }
  ],
  "pagination": {
    "total": 300,
    "limit": 100,
    "offset": 0
  }
}
```

### Get Repositories by Owner

**GET** `/api/repositories/owner/:owner`

Query repositories by GitHub owner/organization.

**Parameters:**
- `owner` (string) - GitHub username or organization name

**Response:**
```json
{
  "data": [...],
  "owner": "facebook"
}
```

### Get Single Repository

**GET** `/api/repositories/:fullName`

Get a single repository by full name (owner/repo).

**Parameters:**
- `fullName` (string) - GitHub full repository name (e.g., "torvalds/linux")

**Response:**
```json
{
  "id": "unique-id",
  "githubId": 12345,
  ...
}
```

### Manual Cron Trigger (Admin)

**POST** `/api/repositories/admin/trigger`

Manually trigger the GitHub cron job immediately.

**Response:**
```json
{
  "success": true,
  "message": "Cron job executed successfully"
}
```

### Get Cron Status (Admin)

**GET** `/api/repositories/admin/status`

Get the current status of the GitHub cron job.

**Response:**
```json
{
  "running": true,
  "isExecuting": false,
  "schedule": "0 */6 * * *"
}
```

## Rate Limiting

### GitHub API Limits

- **Unauthenticated:** 60 requests/hour
- **Authenticated:** 5,000 requests/hour

### Exponential Backoff Strategy

When rate limited (HTTP 403), the system:

1. Detects the rate limit via `x-ratelimit-remaining` header
2. Extracts reset time from `x-ratelimit-reset` header
3. Calculates exponential backoff: `delay = baseDelay * 2^attempt + random(0-1000)ms`
4. Retries the request
5. Gives up after 5 retries with logging

**Example backoff sequence:**
- Attempt 1: ~1 second + jitter
- Attempt 2: ~2 seconds + jitter
- Attempt 3: ~4 seconds + jitter
- Attempt 4: ~8 seconds + jitter
- Attempt 5: ~16 seconds + jitter

## Search Queries

The cron job currently searches for popular repositories in three categories:

```typescript
const queries = [
  'language:typescript stars:>1000 sort:stars',
  'language:javascript stars:>1000 sort:stars',
  'language:python stars:>1000 sort:stars'
];
```

To modify queries, edit `src/workers/github-cron.worker.ts`:

```typescript
const queries = [
  'language:go stars:>500',
  'language:rust stars:>500',
  'topic:machine-learning stars:>100'
];
```

**Common query examples:**
- `language:javascript stars:>5000` - Popular JavaScript repos
- `topic:react` - Repositories tagged with React topic
- `created:>2024-01-01` - Repos created after Jan 1, 2024
- `is:archived` - Archived repositories

See [GitHub search documentation](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories) for all options.

## Database Schema

### Repository Model

```prisma
model Repository {
  id            String   @id @default(cuid())
  githubId      Int      @unique
  name          String
  fullName      String   @unique
  description   String?
  url           String   @unique
  language      String?
  stars         Int      @default(0)
  forks         Int      @default(0)
  openIssues    Int      @default(0)
  owner         String
  lastFetchedAt DateTime @default(now())
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([owner])
  @@index([lastFetchedAt])
  @@map("repositories")
}
```

**Indexes:**
- `githubId` - Unique constraint for GitHub repo IDs
- `fullName` - Unique constraint for owner/repo names
- `owner` - Quick lookups by owner
- `lastFetchedAt` - Track which repos need refreshing

## Usage Examples

### TypeScript

```typescript
import { repositoryService } from './services/repository.service';
import { githubCronJob } from './workers/github-cron.worker';

// List all repositories
const repos = await repositoryService.listAll(50, 0);

// Find by owner
const fbRepos = await repositoryService.listByOwner('facebook');

// Manually trigger cron
await githubCronJob.executeManually();

// Check status
const status = githubCronJob.getStatus();
```

### cURL

```bash
# List repositories
curl http://localhost:3000/api/repositories?limit=10

# Get Facebook repositories
curl http://localhost:3000/api/repositories/owner/facebook

# Get specific repo
curl http://localhost:3000/api/repositories/facebook/react

# Manually trigger fetch
curl -X POST http://localhost:3000/api/repositories/admin/trigger

# Check cron status
curl http://localhost:3000/api/repositories/admin/status
```

## Error Handling

The system handles various error scenarios:

### Rate Limiting
- Detects 403 Forbidden responses
- Extracts reset time from headers
- Retries with exponential backoff
- Logs reset time for user awareness

### Connection Errors
- Timeout errors (30 second default)
- Network failures
- DNS resolution issues

### Data Errors
- Invalid GitHub responses
- Missing fields in API responses
- Database constraint violations (upsert prevents duplicates)

All errors are logged with context for debugging.

## Performance Considerations

### Fetch Performance
- Current: 300 repositories in ~22 seconds
- Rate limited by GitHub API (search queries consume 100 points per request)
- 3 queries × 100 results = 300 repos

### Database Performance
- Upsert pattern prevents duplicate data
- Indexes on `owner` and `lastFetchedAt` for quick queries
- Batch operations handled by Prisma ORM

### Recommendations
- Use authenticated tokens to maximize rate limits
- Adjust cron schedule based on your needs
- Monitor logs for rate limit warnings
- Consider archiving old records (30+ days) for performance

## Troubleshooting

### Cron job not running
```bash
# Check server logs for "GitHub cron job started successfully"
# Verify GITHUB_CRON_SCHEDULE is valid cron expression
# Check /api/repositories/admin/status endpoint
```

### Rate limit errors
```
Error: Rate limit exceeded. Reset at 2026-08-15T21:00:00Z
```
- Add `GITHUB_TOKEN` to `.env` for higher limits (5000/hour vs 60/hour)
- Reduce cron frequency (increase schedule interval)
- Use smaller search queries (fewer results per request)

### Database errors
```
Error: unique constraint violation on githubId
```
- This shouldn't happen with upsert pattern
- Check database for corrupted records
- Run: `npx prisma db push` to resync schema

### Missing repositories
- Check if queries are too restrictive (stars:>1000)
- Modify queries in `github-cron.worker.ts`
- Manually trigger with POST `/api/repositories/admin/trigger`
- Check logs for API errors

## Security

### GitHub Token Safety
- Store token in `.env` (never commit to Git)
- Use personal access tokens with `public_repo` scope only
- Rotate tokens periodically
- Monitor GitHub security settings

### Rate Limit Safety
- Never hardcode API credentials in code
- Validate cron expressions before using
- Limit admin endpoints to authenticated users (recommended future enhancement)
- Log all cron executions for audit trails

## Future Enhancements

- [ ] Authentication middleware for admin endpoints
- [ ] Webhook support for real-time updates
- [ ] Advanced filtering and search
- [ ] Repository trend analysis (stars over time)
- [ ] Notification system for new trending repos
- [ ] Custom search query management via API
- [ ] Data export (CSV, JSON)
- [ ] Archived record cleanup jobs
