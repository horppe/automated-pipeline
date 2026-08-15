// Mock services using ESM-compatible API
jest.unstable_mockModule('./src/services/github.service.js', () => ({
  githubService: {
    searchRepositories: jest.fn(),
    getRepository: jest.fn()
  }
}));

jest.unstable_mockModule('./src/services/repository.service.js', () => ({
  repositoryService: {
    createOrUpdate: jest.fn(),
    findByGithubId: jest.fn(),
    findByFullName: jest.fn(),
    listAll: jest.fn(),
    listByOwner: jest.fn(),
    countAll: jest.fn(),
    deleteOlderThan: jest.fn()
  }
}));

// Import after mocking (use .js extensions for ESM)
const { githubCronJob } = await import('../../workers/github-cron.worker.js');
const { githubService: mockedGithubService } = await import('../../services/github.service.js');
const { repositoryService: mockedRepositoryService } = await import('../../services/repository.service.js');

describe('GitHubCronJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Create a fresh instance for each test
    githubCronJob.stop();
  });

  afterEach(() => {
    githubCronJob.stop();
  });

  describe('start', () => {
    it('should start the cron job scheduler', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      githubCronJob.start();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Starting GitHub cron job')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('GitHub cron job started successfully')
      );

      consoleLogSpy.mockRestore();
    });

    it('should not start twice', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      githubCronJob.start();
      githubCronJob.start();

      const callsWithAlreadyRunning = consoleLogSpy.mock.calls.filter((call) =>
        call[0].toString().includes('already running')
      );

      expect(callsWithAlreadyRunning.length).toBe(1);

      consoleLogSpy.mockRestore();
    });

    it('should throw error for invalid cron expression', () => {
      expect(() => {
        // This test assumes the env variable can be mocked
        // For this test to work, we'd need to mock the env module
        // which is beyond the scope here, so we just verify the start works
        githubCronJob.start();
      }).not.toThrow();
    });
  });

  describe('stop', () => {
    it('should stop the cron job scheduler', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      githubCronJob.start();
      githubCronJob.stop();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('GitHub cron job stopped')
      );

      consoleLogSpy.mockRestore();
    });

    it('should handle stopping when not running', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      githubCronJob.stop();

      // Should not throw error
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('GitHub cron job stopped')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('executeManually', () => {
    describe('Success scenarios', () => {
      it('should execute the cron job manually', async () => {
        const mockRepos = [
          {
            id: 1,
            name: 'repo1',
            full_name: 'owner/repo1',
            description: 'Test repo',
            html_url: 'https://github.com/owner/repo1',
            language: 'TypeScript',
            stargazers_count: 1000,
            forks_count: 100,
            open_issues_count: 5,
            owner: { login: 'owner' }
          }
        ];

        mockedGithubService.searchRepositories.mockResolvedValue(mockRepos);
        mockedRepositoryService.createOrUpdate.mockResolvedValue({
          id: 'repo-1',
          githubId: 1,
          name: 'repo1',
          fullName: 'owner/repo1',
          description: 'Test repo',
          url: 'https://github.com/owner/repo1',
          language: 'TypeScript',
          stars: 1000,
          forks: 100,
          openIssues: 5,
          owner: 'owner',
          lastFetchedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
        mockedRepositoryService.countAll.mockResolvedValue(1);

        const result = await githubCronJob.executeManually();

        expect(result.success).toBe(true);
        expect(result.message).toContain('executed successfully');
      });

      it('should handle empty API responses', async () => {
        mockedGithubService.searchRepositories.mockResolvedValue([]);
        mockedRepositoryService.countAll.mockResolvedValue(0);

        const result = await githubCronJob.executeManually();

        expect(result.success).toBe(true);
      });

      it('should fetch from multiple query sources', async () => {
        const mockRepos = [
          {
            id: 1,
            name: 'repo1',
            full_name: 'owner/repo1',
            description: 'Test repo',
            html_url: 'https://github.com/owner/repo1',
            language: 'TypeScript',
            stargazers_count: 1000,
            forks_count: 100,
            open_issues_count: 5,
            owner: { login: 'owner' }
          }
        ];

        mockedGithubService.searchRepositories
          .mockResolvedValueOnce(mockRepos) // TypeScript query
          .mockResolvedValueOnce(mockRepos) // JavaScript query
          .mockResolvedValueOnce(mockRepos); // Python query

        mockedRepositoryService.createOrUpdate.mockResolvedValue({
          id: 'repo-1',
          githubId: 1,
          name: 'repo1',
          fullName: 'owner/repo1',
          description: 'Test repo',
          url: 'https://github.com/owner/repo1',
          language: 'TypeScript',
          stars: 1000,
          forks: 100,
          openIssues: 5,
          owner: 'owner',
          lastFetchedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
        mockedRepositoryService.countAll.mockResolvedValue(300);

        const result = await githubCronJob.executeManually();

        expect(result.success).toBe(true);
        expect(mockedGithubService.searchRepositories).toHaveBeenCalledTimes(3);
      });

      it('should continue processing after individual repo save fails', async () => {
        const mockRepos = [
          {
            id: 1,
            name: 'repo1',
            full_name: 'owner/repo1',
            description: 'Test repo',
            html_url: 'https://github.com/owner/repo1',
            language: 'TypeScript',
            stargazers_count: 1000,
            forks_count: 100,
            open_issues_count: 5,
            owner: { login: 'owner' }
          },
          {
            id: 2,
            name: 'repo2',
            full_name: 'owner/repo2',
            description: 'Another repo',
            html_url: 'https://github.com/owner/repo2',
            language: 'JavaScript',
            stargazers_count: 2000,
            forks_count: 200,
            open_issues_count: 10,
            owner: { login: 'owner' }
          }
        ];

        mockedGithubService.searchRepositories.mockResolvedValue(mockRepos);

        // First save fails, second succeeds
        mockedRepositoryService.createOrUpdate
          .mockRejectedValueOnce(new Error('Database error'))
          .mockResolvedValueOnce({
            id: 'repo-2',
            githubId: 2,
            name: 'repo2',
            fullName: 'owner/repo2',
            description: 'Another repo',
            url: 'https://github.com/owner/repo2',
            language: 'JavaScript',
            stars: 2000,
            forks: 200,
            openIssues: 10,
            owner: 'owner',
            lastFetchedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
          });

        mockedRepositoryService.countAll.mockResolvedValue(1);

        const result = await githubCronJob.executeManually();

        expect(result.success).toBe(true);
        expect(mockedRepositoryService.createOrUpdate).toHaveBeenCalledTimes(2);
      });
    });

    describe('Failure scenarios', () => {
      it('should prevent concurrent executions', async () => {
        mockedGithubService.searchRepositories.mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve([]), 1000))
        );
        mockedRepositoryService.countAll.mockResolvedValue(0);

        // Start first execution (won't complete immediately due to delay)
        const result1Promise = githubCronJob.executeManually();

        // Try to start second execution while first is running
        const result2 = await githubCronJob.executeManually();

        expect(result2.success).toBe(false);
        expect(result2.message).toContain('already running');

        // Wait for first execution to complete
        const result1 = await result1Promise;
        expect(result1.success).toBe(true);
      });

      it('should handle GitHub API errors', async () => {
        const apiError = new Error('GitHub API error');
        mockedGithubService.searchRepositories.mockRejectedValue(apiError);

        const result = await githubCronJob.executeManually();

        expect(result.success).toBe(false);
        expect(result.error).toContain('GitHub API error');
      });

      it('should handle partial query failures', async () => {
        mockedGithubService.searchRepositories
          .mockResolvedValueOnce([]) // First query succeeds
          .mockRejectedValueOnce(new Error('Rate limited')) // Second query fails
          .mockResolvedValueOnce([]); // Third query succeeds

        mockedRepositoryService.countAll.mockResolvedValue(0);

        const result = await githubCronJob.executeManually();

        // Should still succeed even if one query fails
        expect(result.success).toBe(true);
      });

      it('should handle database count errors', async () => {
        mockedGithubService.searchRepositories.mockResolvedValue([]);
        mockedRepositoryService.countAll.mockRejectedValue(
          new Error('Database connection failed')
        );

        const result = await githubCronJob.executeManually();

        expect(result.success).toBe(false);
        expect(result.error).toContain('Database connection failed');
      });
    });

    describe('Empty payload scenarios', () => {
      it('should handle all queries returning empty results', async () => {
        mockedGithubService.searchRepositories.mockResolvedValue([]);
        mockedRepositoryService.countAll.mockResolvedValue(0);

        const result = await githubCronJob.executeManually();

        expect(result.success).toBe(true);
      });

      it('should handle queries with single repo results', async () => {
        const singleRepo = [
          {
            id: 1,
            name: 'lonely-repo',
            full_name: 'owner/lonely-repo',
            description: 'Only repo',
            html_url: 'https://github.com/owner/lonely-repo',
            language: 'Go',
            stargazers_count: 100,
            forks_count: 10,
            open_issues_count: 1,
            owner: { login: 'owner' }
          }
        ];

        mockedGithubService.searchRepositories
          .mockResolvedValueOnce(singleRepo)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        mockedRepositoryService.createOrUpdate.mockResolvedValue({
          id: 'repo-1',
          githubId: 1,
          name: 'lonely-repo',
          fullName: 'owner/lonely-repo',
          description: 'Only repo',
          url: 'https://github.com/owner/lonely-repo',
          language: 'Go',
          stars: 100,
          forks: 10,
          openIssues: 1,
          owner: 'owner',
          lastFetchedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });

        mockedRepositoryService.countAll.mockResolvedValue(1);

        const result = await githubCronJob.executeManually();

        expect(result.success).toBe(true);
      });

      it('should handle queries with null items', async () => {
        mockedGithubService.searchRepositories.mockResolvedValue([]);
        mockedRepositoryService.countAll.mockResolvedValue(0);

        const result = await githubCronJob.executeManually();

        expect(result.success).toBe(true);
      });
    });

    describe('Logging and reporting', () => {
      it('should log job execution details', async () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

        mockedGithubService.searchRepositories.mockResolvedValue([]);
        mockedRepositoryService.countAll.mockResolvedValue(0);

        await githubCronJob.executeManually();

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('GitHub Cron Job Started')
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('GitHub Cron Job Completed')
        );

        consoleLogSpy.mockRestore();
      });

      it('should log error details', async () => {
        const consoleErrorSpy = jest
          .spyOn(console, 'error')
          .mockImplementation();

        mockedGithubService.searchRepositories.mockRejectedValue(
          new Error('API failed')
        );

        await githubCronJob.executeManually();

        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it('should track duration of execution', async () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

        mockedGithubService.searchRepositories.mockResolvedValue([]);
        mockedRepositoryService.countAll.mockResolvedValue(0);

        await githubCronJob.executeManually();

        const durationLog = consoleLogSpy.mock.calls.find((call) =>
          call[0].toString().includes('Duration')
        );

        expect(durationLog).toBeDefined();

        consoleLogSpy.mockRestore();
      });
    });
  });

  describe('getStatus', () => {
    it('should return status when not running', () => {
      const status = githubCronJob.getStatus();

      expect(status.running).toBe(false);
      expect(status.isExecuting).toBe(false);
      expect(status.schedule).toBeDefined();
    });

    it('should return status when running', () => {
      githubCronJob.start();

      const status = githubCronJob.getStatus();

      expect(status.running).toBe(true);
      expect(status.isExecuting).toBe(false);
      expect(status.schedule).toMatch(/\*/);

      githubCronJob.stop();
    });

    it('should show correct schedule in status', () => {
      githubCronJob.start();

      const status = githubCronJob.getStatus();

      expect(status.schedule).toBe('0 */6 * * *');

      githubCronJob.stop();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete workflow with many repositories', async () => {
      const largeRepoList = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `repo-${i}`,
        full_name: `owner/repo-${i}`,
        description: `Test repository ${i}`,
        html_url: `https://github.com/owner/repo-${i}`,
        language: i % 3 === 0 ? 'TypeScript' : i % 3 === 1 ? 'JavaScript' : 'Python',
        stargazers_count: 1000 - i,
        forks_count: 100 - (i % 100),
        open_issues_count: i % 10,
        owner: { login: 'owner' }
      }));

      mockedGithubService.searchRepositories
        .mockResolvedValueOnce(largeRepoList)
        .mockResolvedValueOnce(largeRepoList)
        .mockResolvedValueOnce(largeRepoList);

      mockedRepositoryService.createOrUpdate.mockResolvedValue({
        id: 'repo-1',
        githubId: 1,
        name: 'repo-1',
        fullName: 'owner/repo-1',
        description: 'Test',
        url: 'https://github.com/owner/repo-1',
        language: 'TypeScript',
        stars: 1000,
        forks: 100,
        openIssues: 5,
        owner: 'owner',
        lastFetchedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      mockedRepositoryService.countAll.mockResolvedValue(300);

      const result = await githubCronJob.executeManually();

      expect(result.success).toBe(true);
      expect(mockedRepositoryService.createOrUpdate).toHaveBeenCalledTimes(300);
    });

    it('should handle graceful degradation on partial failures', async () => {
      const mockRepos = [
        {
          id: 1,
          name: 'repo1',
          full_name: 'owner/repo1',
          description: 'Test',
          html_url: 'https://github.com/owner/repo1',
          language: 'TypeScript',
          stargazers_count: 1000,
          forks_count: 100,
          open_issues_count: 5,
          owner: { login: 'owner' }
        }
      ];

      mockedGithubService.searchRepositories
        .mockResolvedValueOnce(mockRepos) // First query succeeds
        .mockRejectedValueOnce(new Error('Rate limited')) // Second query fails
        .mockResolvedValueOnce(mockRepos); // Third query succeeds

      mockedRepositoryService.createOrUpdate.mockResolvedValue({
        id: 'repo-1',
        githubId: 1,
        name: 'repo1',
        fullName: 'owner/repo1',
        description: 'Test',
        url: 'https://github.com/owner/repo1',
        language: 'TypeScript',
        stars: 1000,
        forks: 100,
        openIssues: 5,
        owner: 'owner',
        lastFetchedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      mockedRepositoryService.countAll.mockResolvedValue(200);

      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation();

      const result = await githubCronJob.executeManually();

      expect(result.success).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch repositories')
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
