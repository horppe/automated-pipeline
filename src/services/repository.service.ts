import { prisma } from '../lib/prisma.js';
import type { Prisma, SecurityRisk } from '@prisma/client';

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

export interface UpdateSecurityRiskInput {
  securityRisk: SecurityRisk;
  securitySummary: string;
}

function searchWhere(search?: string): Prisma.RepositoryWhereInput | undefined {
  if (!search) return undefined;
  return {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { fullName: { contains: search, mode: 'insensitive' } },
      { owner: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { language: { contains: search, mode: 'insensitive' } }
    ]
  };
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

  async findById(id: string) {
    return prisma.repository.findUnique({
      where: { id }
    });
  },

  async findByFullName(fullName: string) {
    return prisma.repository.findUnique({
      where: { fullName }
    });
  },

  async listAll(limit: number = 100, offset: number = 0, search?: string) {
    return prisma.repository.findMany({
      where: searchWhere(search),
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

  async countAll(search?: string) {
    return prisma.repository.count({
      where: searchWhere(search)
    });
  },

  async getSecurityRiskBreakdown() {
    const groups = await prisma.repository.groupBy({
      by: ['securityRisk'],
      _count: { _all: true }
    });

    const counts = { High: 0, Medium: 0, Low: 0, Unanalyzed: 0 };
    for (const group of groups) {
      if (group.securityRisk === null) {
        counts.Unanalyzed = group._count._all;
      } else {
        counts[group.securityRisk] = group._count._all;
      }
    }

    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return { ...counts, total };
  },

  async updateSecurityRisk(id: string, input: UpdateSecurityRiskInput) {
    return prisma.repository.update({
      where: { id },
      data: {
        securityRisk: input.securityRisk,
        securitySummary: input.securitySummary,
        securityAnalyzedAt: new Date()
      }
    });
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
