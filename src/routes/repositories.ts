import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { repositoryService } from '../services/repository.service.js';
import { githubCronJob } from '../workers/github-cron.worker.js';

export const repositoryRoutes: FastifyPluginAsync = async (fastify) => {
  // List all repositories
  fastify.get('/', async (request, reply) => {
    const query = request.query as { limit?: string; offset?: string; search?: string };
    const limit = Math.min(100, Number(query.limit) || 100);
    const offset = Number(query.offset) || 0;
    const search = query.search?.trim() || undefined;

    const [repos, total] = await Promise.all([
      repositoryService.listAll(limit, offset, search),
      repositoryService.countAll(search)
    ]);

    return reply.send({
      data: repos,
      pagination: {
        total,
        limit,
        offset
      }
    });
  });

  // Security risk breakdown for dashboard charts
  fastify.get('/stats/security-risk', async (_request, reply) => {
    const breakdown = await repositoryService.getSecurityRiskBreakdown();
    return reply.send(breakdown);
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

  // Admin: Get cron job status
  fastify.get('/admin/status', async (request, reply) => {
    return reply.send(githubCronJob.getStatus());
  });

  // Admin: Manually trigger the cron job
  fastify.post('/admin/trigger', async (request, reply) => {
    const result = await githubCronJob.executeManually();
    return reply.code(result.success ? 200 : 400).send(result);
  });

  // Get a single repository by full name (after static paths)
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
};
