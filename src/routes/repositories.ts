import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { repositoryService } from '../services/repository.service.js';
import { githubCronJob } from '../workers/github-cron.worker.js';

export const repositoryRoutes: FastifyPluginAsync = async (fastify) => {
  // List all repositories
  fastify.get('/', async (request, reply) => {
    const limit = Math.min(100, (request.query as any).limit || 100);
    const offset = (request.query as any).offset || 0;

    const repos = await repositoryService.listAll(limit, offset);
    const total = await repositoryService.countAll();

    return reply.send({
      data: repos,
      pagination: {
        total,
        limit,
        offset
      }
    });
  });

  // Get repositories by owner
  fastify.get<{ Params: { owner: string } }>(
    '/owner/:owner',
    async (request, reply) => {
      const { owner } = request.params;
      const repos = await repositoryService.listByOwner(owner);

      return reply.send({
        data: repos,
        owner
      });
    }
  );

  // Get a single repository by full name
  fastify.get<{ Params: { fullName: string } }>(
    '/:fullName',
    async (request, reply) => {
      const { fullName } = request.params;
      const repo = await repositoryService.findByFullName(fullName);

      if (!repo) {
        return reply.code(404).send({
          error: 'Repository not found'
        });
      }

      return reply.send(repo);
    }
  );

  // Admin: Get cron job status
  fastify.get('/admin/status', async (request, reply) => {
    return reply.send(githubCronJob.getStatus());
  });

  // Admin: Manually trigger the cron job
  fastify.post('/admin/trigger', async (request, reply) => {
    const result = await githubCronJob.executeManually();
    return reply.code(result.success ? 200 : 400).send(result);
  });
};
