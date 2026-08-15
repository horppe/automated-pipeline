import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';

const connection = new IORedis(env.REDIS_URL);

export const pipelineWorker = new Worker(
  'pipeline-jobs',
  async (job) => {
    console.log(`Processing job ${job.id}:`, job.data);
    return { ok: true };
  },
  { connection }
);

pipelineWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

pipelineWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});
