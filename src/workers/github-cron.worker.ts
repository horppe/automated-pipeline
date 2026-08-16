import cron from 'node-cron';
import { githubService } from '../services/github.service.js';
import { repositoryService } from '../services/repository.service.js';
import { enqueueSecurityAnalysis } from './queue.worker.js';
import { env } from '../config/env.js';

/**
 * GitHub Cron Job
 * Fetches popular repositories from GitHub and stores them in Postgres
 */
export class GitHubCronJob {
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;

  /**
   * Start the cron job scheduler
   */
  start(): void {
    if (this.task) {
      console.log('GitHub cron job is already running');
      return;
    }

    console.log(`Starting GitHub cron job with schedule: ${env.GITHUB_CRON_SCHEDULE}`);

    // Validate cron expression
    if (!cron.validate(env.GITHUB_CRON_SCHEDULE)) {
      throw new Error(`Invalid cron expression: ${env.GITHUB_CRON_SCHEDULE}`);
    }

    // Schedule the job
    this.task = cron.schedule(env.GITHUB_CRON_SCHEDULE, () => {
      this.execute();
    });

    console.log('GitHub cron job started successfully');
  }

  /**
   * Stop the cron job scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('GitHub cron job stopped');
    }
  }

  /**
   * Execute the cron job
   * Fetches repositories from GitHub and stores them in Postgres
   */
  private async execute(): Promise<void> {
    // Prevent concurrent executions
    if (this.isRunning) {
      console.warn('GitHub cron job is already running, skipping this execution');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('=== GitHub Cron Job Started ===');

      // Search for popular TypeScript repositories
      const queries = [
        // 'language:typescript stars:>1000 sort:stars',
        // 'language:javascript stars:>1000 sort:stars',
        // 'language:python stars:>1000 sort:stars',
        'user:horppe sort:stars'
      ];

      let totalSaved = 0;
      let totalEnqueued = 0;

      for (const query of queries) {
        try {
          console.log(`Fetching repositories with query: ${query}`);
          const repos = await githubService.searchRepositories(query);

          console.log(`Found ${repos.length} repositories for query: ${query}`);

          for (const repo of repos) {
            try {
              const saved = await repositoryService.createOrUpdate({
                githubId: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                description: repo.description,
                url: repo.html_url,
                language: repo.language,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                openIssues: repo.open_issues_count,
                owner: repo.owner.login
              });

              totalSaved++;

              try {
                await enqueueSecurityAnalysis({
                  repositoryId: saved.id,
                  githubId: saved.githubId,
                  owner: saved.owner,
                  name: saved.name,
                  fullName: saved.fullName,
                  description: saved.description
                });
                totalEnqueued++;
              } catch (error) {
                console.error(
                  `Failed to enqueue security analysis for ${repo.full_name}:`,
                  error instanceof Error ? error.message : error
                );
              }
            } catch (error) {
              console.error(
                `Failed to save repository ${repo.full_name}:`,
                error instanceof Error ? error.message : error
              );
            }
          }
        } catch (error) {
          console.error(
            `Failed to fetch repositories with query "${query}":`,
            error instanceof Error ? error.message : error
          );
        }
      }

      const duration = Date.now() - startTime;
      const count = await repositoryService.countAll();

      console.log(`=== GitHub Cron Job Completed ===`);
      console.log(`Saved/Updated: ${totalSaved} repositories`);
      console.log(`Enqueued for security analysis: ${totalEnqueued}`);
      console.log(`Total repositories in DB: ${count}`);
      console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    } catch (error) {
      console.error(
        'GitHub cron job failed:',
        error instanceof Error ? error.message : error
      );
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manually trigger the cron job (for testing/admin endpoints)
   */
  async executeManually(): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    if (this.isRunning) {
      return {
        success: false,
        message: 'Cron job is already running'
      };
    }

    try {
      await this.execute();
      return {
        success: true,
        message: 'Cron job executed successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Cron job execution failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get the current status of the cron job
   */
  getStatus(): {
    running: boolean;
    isExecuting: boolean;
    schedule: string;
  } {
    return {
      running: this.task !== null,
      isExecuting: this.isRunning,
      schedule: env.GITHUB_CRON_SCHEDULE
    };
  }
}

// Create and export singleton instance
export const githubCronJob = new GitHubCronJob();
