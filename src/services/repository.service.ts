import { prisma } from '../lib/prisma.js';

export interface CreateRepositoryInput {
  githubId: number;
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  owner: string;
}

export const repositoryService = {
  async createOrUpdate(input: CreateRepositoryInput) {
    return prisma.repository.upsert({
      where: { githubId: input.githubId },
      update: {
        stars: input.stars,
        forks: input.forks,
        openIssues: input.openIssues,
        lastFetchedAt: new Date()
      },
      create: input
    });
  },

  async findByGithubId(githubId: number) {
    return prisma.repository.findUnique({
      where: { githubId }
    });
  },

  async findByFullName(fullName: string) {
    return prisma.repository.findUnique({
      where: { fullName }
    });
  },

  async listAll(limit: number = 100, offset: number = 0) {
    return prisma.repository.findMany({
      orderBy: { stars: 'desc' },
      take: limit,
      skip: offset
    });
  },

  async listByOwner(owner: string) {
    return prisma.repository.findMany({
      where: { owner },
      orderBy: { stars: 'desc' }
    });
  },

  async countAll() {
    return prisma.repository.count();
  },

  async deleteOlderThan(days: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return prisma.repository.deleteMany({
      where: {
        lastFetchedAt: {
          lt: cutoffDate
        }
      }
    });
  }
};
