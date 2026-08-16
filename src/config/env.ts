import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_CRON_SCHEDULE: z.string().default('0 */6 * * *'), // Every 20 seconds
  // Prefer anthropic when both keys are set; override with LLM_PROVIDER
  LLM_PROVIDER: z.enum(['anthropic', 'openai']).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-20250514'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini')
});

export const env = envSchema.parse(process.env);
