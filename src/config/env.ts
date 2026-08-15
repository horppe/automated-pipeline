import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_CRON_SCHEDULE: z.string().default('0 */6 * * *') // Every 6 hours
});

export const env = envSchema.parse(process.env);
