import { AxiosError } from 'axios';

// Mock axios using ESM-compatible API
jest.unstable_mockModule('axios', () => ({
  default: {
    get: jest.fn()
  }
}));

// Import after mocking (use .js extensions for ESM)
const { default: mockedAxios } = await import('axios');
const { githubService } = await import('../../services/github.service.js');

describe('GitHubService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchRepositories', () => {
    describe('Success scenarios', () => {
      it('should successfully fetch repositories from GitHub API', async () => {
        const mockRepos = [
          {
            id: 1,
            name: 'test-repo',
            full_name: 'owner/test-repo',
            description: 'A test repository',
            html_url: 'https://github.com/owner/test-repo',
            language: 'TypeScript',
            stargazers_count: 1000,
            forks_count: 100,
            open_issues_count: 5,
            owner: { login: 'owner' }
          }
        ];

        mockedAxios.get.mockResolvedValueOnce({
          data: { items: mockRepos },
          headers: {
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '59',
            'x-ratelimit-reset': '1234567890'
          },
          status: 200
        });

        const result = await githubService.searchRepositories(
          'language:typescript stars:>1000'
        );

        expect(result).toEqual(mockRepos);
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining('/search/repositories'),
          expect.any(Object)
        );
      });

      it('should handle empty repository list', async () => {
        mockedAxios.get.mockResolvedValueOnce({
          data: { items: [] },
          headers: {
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '59',
            'x-ratelimit-reset': '1234567890'
          },
          status: 200
        });

        const result = await githubService.searchRepositories(
          'language:nonexistent'
        );

        expect(result).toEqual([]);
      });

      it('should handle null items in API response', async () => {
        mockedAxios.get.mockResolvedValueOnce({
          data: { items: null },
          headers: {
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '59',
            'x-ratelimit-reset': '1234567890'
          },
          status: 200
        });

        const result = await githubService.searchRepositories('query');

        expect(result).toEqual([]);
      });

      it('should log rate limit information', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        mockedAxios.get.mockResolvedValueOnce({
          data: { items: [] },
          headers: {
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '45',
            'x-ratelimit-reset': '1234567890'
          },
          status: 200
        });

        await githubService.searchRepositories('query');

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Remaining requests: 45/60')
        );

        consoleSpy.mockRestore();
      });
    });

    describe('Rate limiting scenarios', () => {
      it(
        'should retry on rate limit (403) with exponential backoff',
        async () => {
          const mockRepos = [{ id: 1, full_name: 'test/repo' }];

          // First call: rate limited
          mockedAxios.get.mockRejectedValueOnce({
            response: {
              status: 403,
              headers: {
                'x-ratelimit-limit': '60',
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600)
              }
            }
          } as AxiosError);

          // Second call: success
          mockedAxios.get.mockResolvedValueOnce({
            data: { items: mockRepos },
            headers: {
              'x-ratelimit-limit': '60',
              'x-ratelimit-remaining': '59',
              'x-ratelimit-reset': '1234567890'
            },
            status: 200
          });

          const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

          const result = await githubService.searchRepositories('query', 3);

          expect(result).toEqual(mockRepos);
          expect(mockedAxios.get).toHaveBeenCalledTimes(2);
          expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Rate limited')
          );

          consoleSpy.mockRestore();
        },
        30000
      );

      it(
        'should throw error after max retries on persistent rate limiting',
        async () => {
          mockedAxios.get.mockRejectedValue({
            response: {
              status: 403,
              headers: {
                'x-ratelimit-limit': '60',
                'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600)
            }
          }
        } as AxiosError);

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        await expect(
          githubService.searchRepositories('query', 2)
        ).rejects.toThrow('Rate limit exceeded after 2 retries');

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Rate limit exceeded')
        );

        consoleSpy.mockRestore();
        },
        30000
      );

      it(
        'should parse rate limit reset time correctly',
        async () => {
          const resetTime = Math.floor(Date.now() / 1000) + 1800; // 30 minutes from now

          mockedAxios.get.mockRejectedValue({
            response: {
              status: 403,
              headers: {
                'x-ratelimit-limit': '60',
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(resetTime)
              }
            }
          } as AxiosError);

          const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

          try {
            await githubService.searchRepositories('query', 1);
          } catch (error) {
            // Expected to fail
          }

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Reset at')
        );

        consoleWarnSpy.mockRestore();
        },
        30000
      );
    });

    describe('Network failure scenarios', () => {
      it('should handle connection timeout errors', async () => {
        const timeoutError = new Error('ECONNABORTED');
        (timeoutError as any).code = 'ECONNABORTED';

        mockedAxios.get.mockRejectedValueOnce(timeoutError as AxiosError);

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        await expect(
          githubService.searchRepositories('query')
        ).rejects.toThrow('GitHub API request timeout');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'GitHub API request timeout'
        );

        consoleErrorSpy.mockRestore();
      });

      it('should handle network connection errors', async () => {
        mockedAxios.get.mockRejectedValueOnce(
          new Error('Network error') as AxiosError
        );

        await expect(
          githubService.searchRepositories('query')
        ).rejects.toThrow('Network error');
      });

      it('should handle socket hang up errors', async () => {
        mockedAxios.get.mockRejectedValueOnce(
          new Error('EHANGUP') as AxiosError
        );

        await expect(
          githubService.searchRepositories('query')
        ).rejects.toThrow('EHANGUP');
      });

      it('should handle DNS resolution failures', async () => {
        mockedAxios.get.mockRejectedValueOnce(
          new Error('ENOTFOUND') as AxiosError
        );

        await expect(
          githubService.searchRepositories('query')
        ).rejects.toThrow('ENOTFOUND');
      });
    });

    describe('API error scenarios', () => {
      it('should handle 401 Unauthorized responses', async () => {
        mockedAxios.get.mockRejectedValueOnce({
          response: {
            status: 401,
            statusText: 'Unauthorized',
            headers: {}
          }
        } as AxiosError);

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        await expect(
          githubService.searchRepositories('query')
        ).rejects.toThrow('GitHub API error: 401 Unauthorized');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('401')
        );

        consoleErrorSpy.mockRestore();
      });

      it('should handle 404 Not Found responses', async () => {
        mockedAxios.get.mockRejectedValueOnce({
          response: {
            status: 404,
            statusText: 'Not Found',
            headers: {}
          }
        } as AxiosError);

        await expect(
          githubService.searchRepositories('query')
        ).rejects.toThrow('GitHub API error: 404 Not Found');
      });

      it('should handle 500 Server Error responses', async () => {
        mockedAxios.get.mockRejectedValueOnce({
          response: {
            status: 500,
            statusText: 'Internal Server Error',
            headers: {}
          }
        } as AxiosError);

        await expect(
          githubService.searchRepositories('query')
        ).rejects.toThrow('GitHub API error: 500 Internal Server Error');
      });

      it('should handle 422 Unprocessable Entity responses', async () => {
        mockedAxios.get.mockRejectedValueOnce({
          response: {
            status: 422,
            statusText: 'Unprocessable Entity',
            headers: {}
          }
        } as AxiosError);

        await expect(
          githubService.searchRepositories('query')
        ).rejects.toThrow('GitHub API error: 422 Unprocessable Entity');
      });
    });

    describe('Payload validation', () => {
      it('should handle missing repository fields gracefully', async () => {
        const incompleteMock = [
          {
            id: 1,
            name: 'test-repo',
            full_name: 'owner/test-repo'
            // Missing description, url, etc.
          }
        ];

        mockedAxios.get.mockResolvedValueOnce({
          data: { items: incompleteMock },
          headers: {
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '59',
            'x-ratelimit-reset': '1234567890'
          },
          status: 200
        });

        const result = await githubService.searchRepositories('query');

        expect(result).toEqual(incompleteMock);
        expect(result[0]).toHaveProperty('id');
      });

      it('should handle very large repository responses', async () => {
        const largeRepoList = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `repo-${i}`,
          full_name: `owner/repo-${i}`,
          description: `Repository ${i}`,
          html_url: `https://github.com/owner/repo-${i}`,
          language: 'TypeScript',
          stargazers_count: 1000 - i,
          forks_count: 100 - (i % 100),
          open_issues_count: i % 10,
          owner: { login: 'owner' }
        }));

        mockedAxios.get.mockResolvedValueOnce({
          data: { items: largeRepoList },
          headers: {
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '59',
            'x-ratelimit-reset': '1234567890'
          },
          status: 200
        });

        const result = await githubService.searchRepositories('query');

        expect(result).toHaveLength(1000);
        expect(result[0].id).toBe(0);
        expect(result[999].id).toBe(999);
      });

      it('should handle repositories with null/undefined fields', async () => {
        const mockRepos = [
          {
            id: 1,
            name: 'test-repo',
            full_name: 'owner/test-repo',
            description: null,
            html_url: 'https://github.com/owner/test-repo',
            language: null,
            stargazers_count: 1000,
            forks_count: 100,
            open_issues_count: 5,
            owner: { login: 'owner' }
          }
        ];

        mockedAxios.get.mockResolvedValueOnce({
          data: { items: mockRepos },
          headers: {
            'x-ratelimit-limit': '60',
            'x-ratelimit-remaining': '59',
            'x-ratelimit-reset': '1234567890'
          },
          status: 200
        });

        const result = await githubService.searchRepositories('query');

        expect(result[0].description).toBeNull();
        expect(result[0].language).toBeNull();
      });
    });
  });

  describe('getRepository', () => {
    it('should successfully fetch a single repository', async () => {
      const mockRepo = {
        id: 1,
        name: 'react',
        full_name: 'facebook/react',
        description: 'A JavaScript library for building UI',
        html_url: 'https://github.com/facebook/react',
        language: 'JavaScript',
        stargazers_count: 200000,
        forks_count: 50000,
        open_issues_count: 1500,
        owner: { login: 'facebook' }
      };

      mockedAxios.get.mockResolvedValueOnce({
        data: mockRepo,
        headers: {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': '1234567890'
        },
        status: 200
      });

      const result = await githubService.getRepository('facebook', 'react');

      expect(result).toEqual(mockRepo);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/repos/facebook/react'),
        expect.any(Object)
      );
    });

    it('should handle 404 when repository not found', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 404,
          statusText: 'Not Found'
        }
      } as AxiosError);

      await expect(
        githubService.getRepository('nonexistent', 'repo')
      ).rejects.toBeDefined();
    });

    it(
      'should retry on rate limit for single repo fetch',
      async () => {
        const mockRepo = { id: 1, full_name: 'test/repo' };

        mockedAxios.get.mockRejectedValueOnce({
          response: {
            status: 403,
            headers: {
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600)
            }
          }
        } as AxiosError);

        mockedAxios.get.mockResolvedValueOnce({
          data: mockRepo,
          headers: {
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '4999',
            'x-ratelimit-reset': '1234567890'
          },
          status: 200
        });

        const result = await githubService.getRepository('test', 'repo');

        expect(result).toEqual(mockRepo);
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      },
      30000
    );

    it('should handle timeout on single repo fetch', async () => {
      const timeoutError = new Error('ECONNABORTED');
      (timeoutError as any).code = 'ECONNABORTED';

      mockedAxios.get.mockRejectedValueOnce(timeoutError as AxiosError);

      await expect(
        githubService.getRepository('test', 'repo')
      ).rejects.toBeDefined();
    });
  });

  describe('Rate limit info parsing', () => {
    it('should handle missing rate limit headers', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { items: [] },
        headers: {}, // Empty headers
        status: 200
      });

      const result = await githubService.searchRepositories('query');

      expect(result).toEqual([]);
      expect(mockedAxios.get).toHaveBeenCalled();
    });

    it('should use default rate limit values when headers are missing', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      mockedAxios.get.mockResolvedValueOnce({
        data: { items: [] },
        headers: {}, // No rate limit headers
        status: 200
      });

      await githubService.searchRepositories('query');

      // Should still complete successfully with default values
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Remaining requests')
      );

      consoleSpy.mockRestore();
    });
  });
});
