import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { userRoutes } from './routes/users.js';
import { repositoryRoutes } from './routes/repositories.js';
import { githubCronJob } from './workers/github-cron.worker.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: { colorize: true }
            }
          : undefined
    }
  });

  await app.register(helmet);
  await app.register(cors, { origin: true });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(repositoryRoutes, { prefix: '/api/repositories' });

  // Start the GitHub cron job
  githubCronJob.start();

  // Graceful shutdown
  app.addHook('onClose', async () => {
    githubCronJob.stop();
  });

  return app;
}
