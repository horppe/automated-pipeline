import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { z } from 'zod';
import type { SecurityRisk } from '@prisma/client';
import { env } from '../config/env.js';
import { githubService, type GitHubIssue } from '../services/github.service.js';
import { repositoryService } from '../services/repository.service.js';

export const SECURITY_ANALYSIS_QUEUE = 'security-analysis';

export interface SecurityAnalysisJobData {
  repositoryId: string;
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  description?: string | null;
}

export interface SecurityAnalysisResult {
  repositoryId: string;
  fullName: string;
  risk: SecurityRisk;
  summary: string;
  provider: 'anthropic' | 'openai';
}

const securityAssessmentSchema = z.object({
  risk: z.enum(['High', 'Medium', 'Low']),
  summary: z.string().min(1).max(2000)
});

const MAX_README_CHARS = 12_000;
const MAX_ISSUE_BODY_CHARS = 500;
const MAX_ISSUES = 15;

/** BullMQ requires maxRetriesPerRequest: null on the shared connection. */
// ioredis default export is not constructable under NodeNext typings
const connection = new (IORedis as any)(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true
});

export const securityAnalysisQueue = new Queue<SecurityAnalysisJobData>(
  SECURITY_ANALYSIS_QUEUE,
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: 100,
      removeOnFail: 50
    }
  }
);

function resolveLlmProvider(): 'anthropic' | 'openai' {
  if (env.LLM_PROVIDER) {
    if (env.LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      throw new Error('LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set');
    }
    if (env.LLM_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
      throw new Error('LLM_PROVIDER=openai but OPENAI_API_KEY is not set');
    }
    return env.LLM_PROVIDER;
  }

  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.OPENAI_API_KEY) return 'openai';

  throw new Error(
    'No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.'
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[truncated]`;
}

function buildAnalysisPrompt(input: {
  fullName: string;
  description: string | null | undefined;
  readme: string | null;
  issues: GitHubIssue[];
}): string {
  const issueBlock =
    input.issues.length === 0
      ? 'No open issues available.'
      : input.issues
          .slice(0, MAX_ISSUES)
          .map((issue) => {
            const labels = issue.labels.map((l) => l.name).join(', ') || 'none';
            const body = truncate(issue.body ?? '', MAX_ISSUE_BODY_CHARS);
            return [
              `### Issue #${issue.number}: ${issue.title}`,
              `Labels: ${labels}`,
              body || '(no body)'
            ].join('\n');
          })
          .join('\n\n');

  return [
    'You are a security analyst. Categorize the repository security risk as exactly one of: High, Medium, or Low.',
    'Base the assessment only on the README and open issues provided.',
    'Consider: auth/crypto handling, dependency/supply-chain warnings, reported CVEs or exploits, secrets exposure, unsafe defaults, and severity of security-related issues.',
    'Respond with JSON only (no markdown fences) in this shape:',
    '{"risk":"High"|"Medium"|"Low","summary":"1-3 sentence rationale"}',
    '',
    `Repository: ${input.fullName}`,
    `Description: ${input.description ?? '(none)'}`,
    '',
    '## README',
    truncate(input.readme ?? '(no README)', MAX_README_CHARS),
    '',
    '## Open Issues',
    issueBlock
  ].join('\n');
}

function parseAssessment(raw: string): { risk: SecurityRisk; summary: string } {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`LLM response did not contain JSON: ${trimmed.slice(0, 200)}`);
  }

  const parsed = securityAssessmentSchema.parse(JSON.parse(jsonMatch[0]));
  return {
    risk: parsed.risk,
    summary: parsed.summary
  };
}

async function categorizeWithAnthropic(prompt: string): Promise<{
  risk: SecurityRisk;
  summary: string;
}> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n');

  return parseAssessment(text);
}

async function categorizeWithOpenAI(prompt: string): Promise<{
  risk: SecurityRisk;
  summary: string;
}> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You categorize repository security risk as High, Medium, or Low. Reply with JSON only.'
      },
      { role: 'user', content: prompt }
    ]
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error('OpenAI returned an empty response');
  }

  return parseAssessment(text);
}

async function categorizeSecurityRisk(prompt: string): Promise<{
  risk: SecurityRisk;
  summary: string;
  provider: 'anthropic' | 'openai';
}> {
  const provider = resolveLlmProvider();
  const assessment =
    provider === 'anthropic'
      ? await categorizeWithAnthropic(prompt)
      : await categorizeWithOpenAI(prompt);

  return { ...assessment, provider };
}

/**
 * Process one security-analysis job:
 * 1. Load raw README + issues from GitHub
 * 2. Categorize risk via Claude or OpenAI
 * 3. Persist High/Medium/Low + summary on the repository row
 */
export async function processSecurityAnalysisJob(
  job: Job<SecurityAnalysisJobData>
): Promise<SecurityAnalysisResult> {
  const { repositoryId, owner, name, fullName, description } = job.data;
  console.log(`Security analysis started for ${fullName} (job ${job.id})`);

  const [readme, issues] = await Promise.all([
    githubService.getReadme(owner, name),
    githubService.getIssues(owner, name, MAX_ISSUES)
  ]);

  const prompt = buildAnalysisPrompt({
    fullName,
    description,
    readme,
    issues
  });

  const { risk, summary, provider } = await categorizeSecurityRisk(prompt);

  await repositoryService.updateSecurityRisk(repositoryId, {
    securityRisk: risk,
    securitySummary: summary
  });

  console.log(
    `Security analysis completed for ${fullName}: ${risk} via ${provider}`
  );

  return { repositoryId, fullName, risk, summary, provider };
}

export const pipelineWorker = new Worker<SecurityAnalysisJobData>(
  SECURITY_ANALYSIS_QUEUE,
  processSecurityAnalysisJob,
  {
    connection,
    concurrency: 2
  }
);

pipelineWorker.on('completed', (job, result) => {
  console.log(
    `Job ${job.id} completed: ${result.fullName} → ${result.risk}`
  );
});

pipelineWorker.on('ready', () => {
  console.log(
    `Pipeline worker is ready to process jobs`
  );
});

pipelineWorker.on('error', (err) => {
  console.error('Pipeline worker encountered an error:', err);
});

pipelineWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

pipelineWorker.on('active', (job) => {
  console.log(`Job ${job.id} is now active: ${job.data.fullName}`);
});

/**
 * Enqueue a repository for security analysis (idempotent job id per repo).
 */
export async function enqueueSecurityAnalysis(
  data: SecurityAnalysisJobData
): Promise<string | undefined> {
  const job = await securityAnalysisQueue.add('analyze-security', data, {
    jobId: `security-${data.repositoryId}`
  });
  return job.id;
}

export async function closeSecurityQueue(): Promise<void> {
  await pipelineWorker.close();
  await securityAnalysisQueue.close();
  await connection.quit();
}
