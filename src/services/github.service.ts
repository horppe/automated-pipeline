import axios, { AxiosError } from 'axios';
import { env } from '../config/env.js';

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  owner: {
    login: string;
  };
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: Array<{ name: string }>;
}

class GitHubService {
  private readonly baseURL = 'https://api.github.com';
  private readonly headers: Record<string, string>;

  constructor() {
    this.headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'automated-pipeline'
    };

    if (env.GITHUB_TOKEN) {
      this.headers['Authorization'] = `token ${env.GITHUB_TOKEN}`;
    }
  }

  /**
   * Exponential backoff with jitter
   * Waits for a duration that increases exponentially with each retry
   */
  private async exponentialBackoff(
    attempt: number,
    baseDelay: number = 1000
  ): Promise<void> {
    const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
    console.log(`Rate limited. Waiting ${Math.round(delay)}ms before retry...`);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Parse rate limit headers from response
   */
  private getRateLimitInfo(headers: any): RateLimitInfo {
    return {
      limit: parseInt(headers['x-ratelimit-limit'] || '60', 10),
      remaining: parseInt(headers['x-ratelimit-remaining'] || '60', 10),
      reset: parseInt(headers['x-ratelimit-reset'] || '0', 10)
    };
  }

  /**
   * Fetch repositories from GitHub with exponential backoff on rate limiting
   * @param query Search query (e.g., "language:typescript stars:>1000")
   * @param maxRetries Maximum number of retries on rate limit
   * @returns Array of repository data
   */
  async searchRepositories(
    query: string,
    maxRetries: number = 5
  ): Promise<GitHubRepo[]> {
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const response = await axios.get(`${this.baseURL}/search/repositories`, {
          headers: this.headers,
          params: {
            q: query,
            sort: 'stars',
            order: 'desc',
            per_page: 100
          },
          timeout: 30000
        });

        const rateLimitInfo = this.getRateLimitInfo(response.headers);
        console.log(
          `GitHub API - Remaining requests: ${rateLimitInfo.remaining}/${rateLimitInfo.limit}`
        );

        return response.data.items || [];
      } catch (error) {
        const axiosError = error as AxiosError;

        // Handle rate limiting specifically
        if (axiosError.response?.status === 403) {
          const rateLimitInfo = this.getRateLimitInfo(axiosError.response.headers);

          if (rateLimitInfo.remaining === 0) {
            const resetTime = new Date(rateLimitInfo.reset * 1000);
            console.warn(
              `Rate limit exceeded. Reset at ${resetTime.toISOString()}`
            );

            if (attempt < maxRetries) {
              await this.exponentialBackoff(attempt);
              attempt++;
              continue;
            } else {
              throw new Error(
                `Rate limit exceeded after ${maxRetries} retries. Reset at ${resetTime.toISOString()}`
              );
            }
          }
        }

        // Handle other errors
        if (axiosError.response) {
          console.error(
            `GitHub API error: ${axiosError.response.status} ${axiosError.response.statusText}`
          );
          throw new Error(
            `GitHub API error: ${axiosError.response.status} ${axiosError.response.statusText}`
          );
        }

        if (axiosError.code === 'ECONNABORTED') {
          console.error('GitHub API request timeout');
          throw new Error('GitHub API request timeout');
        }

        throw error;
      }
    }

    throw new Error('Failed to fetch repositories after all retries');
  }

  /**
   * Fetch a single repository by owner and repo name
   */
  async getRepository(owner: string, repo: string): Promise<GitHubRepo> {
    let attempt = 0;
    const maxRetries = 3;

    while (attempt <= maxRetries) {
      try {
        const response = await axios.get(
          `${this.baseURL}/repos/${owner}/${repo}`,
          {
            headers: this.headers,
            timeout: 30000
          }
        );

        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError;

        if (axiosError.response?.status === 403) {
          const rateLimitInfo = this.getRateLimitInfo(axiosError.response.headers);

          if (rateLimitInfo.remaining === 0 && attempt < maxRetries) {
            await this.exponentialBackoff(attempt);
            attempt++;
            continue;
          }
        }

        throw error;
      }
    }

    throw new Error('Failed to fetch repository after all retries');
  }

  /**
   * Fetch README content for a repository (decoded from base64 when needed)
   */
  async getReadme(owner: string, repo: string): Promise<string | null> {
    try {
      const response = await axios.get(
        `${this.baseURL}/repos/${owner}/${repo}/readme`,
        {
          headers: this.headers,
          timeout: 30000
        }
      );

      const content = response.data?.content;
      if (typeof content !== 'string') {
        return null;
      }

      const encoding = response.data?.encoding;
      if (encoding === 'base64') {
        return Buffer.from(content, 'base64').toString('utf-8');
      }

      return content;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Fetch open issues for a repository (excludes pull requests)
   */
  async getIssues(
    owner: string,
    repo: string,
    perPage: number = 20
  ): Promise<GitHubIssue[]> {
    try {
      const response = await axios.get(
        `${this.baseURL}/repos/${owner}/${repo}/issues`,
        {
          headers: this.headers,
          params: {
            state: 'open',
            per_page: perPage,
            sort: 'updated',
            direction: 'desc'
          },
          timeout: 30000
        }
      );

      const items: Array<{
        number: number;
        title: string;
        body?: string | null;
        state: string;
        pull_request?: unknown;
        labels?: Array<string | { name: string }>;
      }> = Array.isArray(response.data) ? response.data : [];

      return items
        .filter((item) => !item.pull_request)
        .map((item) => ({
          number: item.number,
          title: item.title,
          body: item.body ?? null,
          state: item.state,
          labels: (item.labels || []).map((label) =>
            typeof label === 'string' ? { name: label } : { name: label.name }
          )
        }));
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }
}

export const githubService = new GitHubService();
