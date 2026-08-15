// Mock Prisma using ESM-compatible API
jest.unstable_mockModule('./src/lib/prisma.js', () => ({
  prisma: {
    repository: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn()
    }
  },
  
}));

// Import after mocking (use .js extensions for ESM)
const { prisma: mockedPrisma } = await import('../../lib/prisma.js');
const { repositoryService } = await import('../../services/repository.service.js');

describe('RepositoryService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('createOrUpdate', () => {
    it('should create a new repository', async () => {
      const input = {
        githubId: 12345,
        name: 'test-repo',
        fullName: 'owner/test-repo',
        description: 'Test repository',
        url: 'https://github.com/owner/test-repo',
        language: 'TypeScript',
        stars: 1000,
        forks: 100,
        openIssues: 10,
        owner: 'owner'
      };

      const mockResult = {
        id: 'repo-1',
        ...input,
        lastFetchedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockedPrisma.repository.upsert.mockResolvedValueOnce(mockResult);

      const result = await repositoryService.createOrUpdate(input);

      expect(result).toEqual(mockResult);
      expect(mockedPrisma.repository.upsert).toHaveBeenCalledWith({
        where: { githubId: input.githubId },
        update: expect.objectContaining({
          stars: input.stars,
          forks: input.forks,
          openIssues: input.openIssues
        }),
        create: input
      });
    });

    it('should update an existing repository', async () => {
      const input = {
        githubId: 12345,
        name: 'test-repo',
        fullName: 'owner/test-repo',
        description: 'Updated description',
        url: 'https://github.com/owner/test-repo',
        language: 'TypeScript',
        stars: 2000, // Updated from 1000
        forks: 200, // Updated from 100
        openIssues: 20, // Updated from 10
        owner: 'owner'
      };

      const mockResult = {
        id: 'repo-1',
        ...input,
        lastFetchedAt: new Date(),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date()
      };

      mockedPrisma.repository.upsert.mockResolvedValueOnce(mockResult);

      const result = await repositoryService.createOrUpdate(input);

      expect(result).toEqual(mockResult);
      expect(mockedPrisma.repository.upsert).toHaveBeenCalled();
    });

    it('should handle null description gracefully', async () => {
      const input = {
        githubId: 12345,
        name: 'test-repo',
        fullName: 'owner/test-repo',
        description: null,
        url: 'https://github.com/owner/test-repo',
        language: null,
        stars: 1000,
        forks: 100,
        openIssues: 10,
        owner: 'owner'
      };

      const mockResult = {
        id: 'repo-1',
        ...input,
        lastFetchedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockedPrisma.repository.upsert.mockResolvedValueOnce(mockResult);

      const result = await repositoryService.createOrUpdate(input);

      expect(result.description).toBeNull();
      expect(result.language).toBeNull();
    });

    it('should handle database constraint violation', async () => {
      const input = {
        githubId: 12345,
        name: 'test-repo',
        fullName: 'owner/test-repo',
        description: 'Test',
        url: 'https://github.com/owner/test-repo',
        language: 'TypeScript',
        stars: 1000,
        forks: 100,
        openIssues: 10,
        owner: 'owner'
      };

      const dbError = new Error('Unique constraint failed');
      mockedPrisma.repository.upsert.mockRejectedValueOnce(dbError);

      await expect(
        repositoryService.createOrUpdate(input)
      ).rejects.toThrow('Unique constraint failed');
    });
  });

  describe('findByGithubId', () => {
    it('should find a repository by GitHub ID', async () => {
      const mockRepo = {
        id: 'repo-1',
        githubId: 12345,
        name: 'test-repo',
        fullName: 'owner/test-repo',
        description: 'Test repository',
        url: 'https://github.com/owner/test-repo',
        language: 'TypeScript',
        stars: 1000,
        forks: 100,
        openIssues: 10,
        owner: 'owner',
        lastFetchedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockedPrisma.repository.findUnique.mockResolvedValueOnce(mockRepo);

      const result = await repositoryService.findByGithubId(12345);

      expect(result).toEqual(mockRepo);
      expect(mockedPrisma.repository.findUnique).toHaveBeenCalledWith({
        where: { githubId: 12345 }
      });
    });

    it('should return null if repository not found', async () => {
      mockedPrisma.repository.findUnique.mockResolvedValueOnce(null);

      const result = await repositoryService.findByGithubId(99999);

      expect(result).toBeNull();
    });
  });

  describe('findByFullName', () => {
    it('should find a repository by full name', async () => {
      const mockRepo = {
        id: 'repo-1',
        githubId: 12345,
        name: 'react',
        fullName: 'facebook/react',
        description: 'UI library',
        url: 'https://github.com/facebook/react',
        language: 'JavaScript',
        stars: 200000,
        forks: 50000,
        openIssues: 1500,
        owner: 'facebook',
        lastFetchedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockedPrisma.repository.findUnique.mockResolvedValueOnce(mockRepo);

      const result = await repositoryService.findByFullName('facebook/react');

      expect(result).toEqual(mockRepo);
      expect(mockedPrisma.repository.findUnique).toHaveBeenCalledWith({
        where: { fullName: 'facebook/react' }
      });
    });

    it('should return null if repository not found by name', async () => {
      mockedPrisma.repository.findUnique.mockResolvedValueOnce(null);

      const result = await repositoryService.findByFullName('nonexistent/repo');

      expect(result).toBeNull();
    });
  });

  describe('listAll', () => {
    it('should list all repositories with pagination', async () => {
      const mockRepos = [
        {
          id: 'repo-1',
          githubId: 1,
          name: 'popular-repo',
          fullName: 'owner/popular-repo',
          description: 'Popular',
          url: 'https://github.com/owner/popular-repo',
          language: 'TypeScript',
          stars: 5000,
          forks: 500,
          openIssues: 50,
          owner: 'owner',
          lastFetchedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockedPrisma.repository.findMany.mockResolvedValueOnce(mockRepos);

      const result = await repositoryService.listAll(50, 0);

      expect(result).toEqual(mockRepos);
      expect(mockedPrisma.repository.findMany).toHaveBeenCalledWith({
        orderBy: { stars: 'desc' },
        take: 50,
        skip: 0
      });
    });

    it('should use default pagination values', async () => {
      mockedPrisma.repository.findMany.mockResolvedValueOnce([]);

      await repositoryService.listAll();

      expect(mockedPrisma.repository.findMany).toHaveBeenCalledWith({
        orderBy: { stars: 'desc' },
        take: 100,
        skip: 0
      });
    });

    it('should handle empty result set', async () => {
      mockedPrisma.repository.findMany.mockResolvedValueOnce([]);

      const result = await repositoryService.listAll(100, 0);

      expect(result).toEqual([]);
    });

    it('should handle large pagination offsets', async () => {
      mockedPrisma.repository.findMany.mockResolvedValueOnce([]);

      await repositoryService.listAll(100, 10000);

      expect(mockedPrisma.repository.findMany).toHaveBeenCalledWith({
        orderBy: { stars: 'desc' },
        take: 100,
        skip: 10000
      });
    });
  });

  describe('listByOwner', () => {
    it('should list repositories by owner', async () => {
      const mockRepos = [
        {
          id: 'repo-1',
          githubId: 1,
          name: 'react',
          fullName: 'facebook/react',
          description: 'UI library',
          url: 'https://github.com/facebook/react',
          language: 'JavaScript',
          stars: 200000,
          forks: 50000,
          openIssues: 1500,
          owner: 'facebook',
          lastFetchedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'repo-2',
          githubId: 2,
          name: 'flow',
          fullName: 'facebook/flow',
          description: 'Static type checker',
          url: 'https://github.com/facebook/flow',
          language: 'OCaml',
          stars: 25000,
          forks: 5000,
          openIssues: 300,
          owner: 'facebook',
          lastFetchedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockedPrisma.repository.findMany.mockResolvedValueOnce(mockRepos);

      const result = await repositoryService.listByOwner('facebook');

      expect(result).toEqual(mockRepos);
      expect(result).toHaveLength(2);
      expect(mockedPrisma.repository.findMany).toHaveBeenCalledWith({
        where: { owner: 'facebook' },
        orderBy: { stars: 'desc' }
      });
    });

    it('should return empty array for owner with no repositories', async () => {
      mockedPrisma.repository.findMany.mockResolvedValueOnce([]);

      const result = await repositoryService.listByOwner('nonexistent');

      expect(result).toEqual([]);
    });

    it('should handle owner names with special characters', async () => {
      mockedPrisma.repository.findMany.mockResolvedValueOnce([]);

      await repositoryService.listByOwner('owner-with-dashes');

      expect(mockedPrisma.repository.findMany).toHaveBeenCalledWith({
        where: { owner: 'owner-with-dashes' },
        orderBy: { stars: 'desc' }
      });
    });
  });

  describe('countAll', () => {
    it('should return total count of repositories', async () => {
      mockedPrisma.repository.count.mockResolvedValueOnce(300);

      const result = await repositoryService.countAll();

      expect(result).toBe(300);
      expect(mockedPrisma.repository.count).toHaveBeenCalled();
    });

    it('should return 0 for empty database', async () => {
      mockedPrisma.repository.count.mockResolvedValueOnce(0);

      const result = await repositoryService.countAll();

      expect(result).toBe(0);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete repositories older than specified days', async () => {
      mockedPrisma.repository.deleteMany.mockResolvedValueOnce({
        count: 50
      });

      const result = await repositoryService.deleteOlderThan(30);

      expect(result.count).toBe(50);
      expect(mockedPrisma.repository.deleteMany).toHaveBeenCalledWith({
        where: {
          lastFetchedAt: {
            lt: expect.any(Date)
          }
        }
      });
    });

    it('should handle 0 days (delete all records)', async () => {
      mockedPrisma.repository.deleteMany.mockResolvedValueOnce({
        count: 0
      });

      const result = await repositoryService.deleteOlderThan(0);

      expect(mockedPrisma.repository.deleteMany).toHaveBeenCalled();
    });

    it('should handle when no records match deletion criteria', async () => {
      mockedPrisma.repository.deleteMany.mockResolvedValueOnce({
        count: 0
      });

      const result = await repositoryService.deleteOlderThan(1);

      expect(result.count).toBe(0);
    });

    it('should handle database errors during deletion', async () => {
      const dbError = new Error('Database error');
      mockedPrisma.repository.deleteMany.mockRejectedValueOnce(dbError);

      await expect(
        repositoryService.deleteOlderThan(30)
      ).rejects.toThrow('Database error');
    });
  });
});
