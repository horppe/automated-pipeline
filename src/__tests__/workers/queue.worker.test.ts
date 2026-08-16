jest.unstable_mockModule('ioredis', () => ({
  default: jest.fn().mockImplementation(() => ({
    quit: jest.fn(),
    on: jest.fn()
  }))
}));

jest.unstable_mockModule('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    close: jest.fn().mockResolvedValue(undefined)
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined)
  }))
}));

const anthropicCreate = jest.fn();
jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: { create: anthropicCreate }
  }))
}));

const openaiCreate = jest.fn();
jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: openaiCreate } }
  }))
}));

jest.unstable_mockModule('./src/services/github.service.js', () => ({
  githubService: {
    getReadme: jest.fn(),
    getIssues: jest.fn()
  }
}));

jest.unstable_mockModule('./src/services/repository.service.js', () => ({
  repositoryService: {
    updateSecurityRisk: jest.fn()
  }
}));

jest.unstable_mockModule('./src/config/env.js', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    LLM_PROVIDER: undefined,
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    OPENAI_API_KEY: 'test-openai-key',
    ANTHROPIC_MODEL: 'claude-sonnet-4-20250514',
    OPENAI_MODEL: 'gpt-4o-mini'
  }
}));

const { processSecurityAnalysisJob, enqueueSecurityAnalysis } = await import(
  '../../workers/queue.worker.js'
);
const { githubService: mockedGithubService } = await import(
  '../../services/github.service.js'
);
const { repositoryService: mockedRepositoryService } = await import(
  '../../services/repository.service.js'
);

describe('Security analysis queue worker', () => {
  const jobData = {
    repositoryId: 'repo-1',
    githubId: 1,
    owner: 'owner',
    name: 'secure-app',
    fullName: 'owner/secure-app',
    description: 'A sample app'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGithubService.getReadme.mockResolvedValue('# Secure App\nUses OAuth.');
    mockedGithubService.getIssues.mockResolvedValue([
      {
        number: 10,
        title: 'Rotate leaked API key',
        body: 'A production key was exposed in logs.',
        state: 'open',
        labels: [{ name: 'security' }]
      }
    ]);
    mockedRepositoryService.updateSecurityRisk.mockResolvedValue({
      id: 'repo-1',
      securityRisk: 'High'
    });
  });

  it('categorizes risk with Anthropic and updates the database', async () => {
    anthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            risk: 'High',
            summary: 'Leaked credentials reported in open issues.'
          })
        }
      ]
    });

    const result = await processSecurityAnalysisJob({
      id: 'job-1',
      data: jobData
    } as never);

    expect(mockedGithubService.getReadme).toHaveBeenCalledWith('owner', 'secure-app');
    expect(mockedGithubService.getIssues).toHaveBeenCalledWith('owner', 'secure-app', 15);
    expect(anthropicCreate).toHaveBeenCalled();
    expect(mockedRepositoryService.updateSecurityRisk).toHaveBeenCalledWith('repo-1', {
      securityRisk: 'High',
      securitySummary: 'Leaked credentials reported in open issues.'
    });
    expect(result).toMatchObject({
      repositoryId: 'repo-1',
      fullName: 'owner/secure-app',
      risk: 'High',
      provider: 'anthropic'
    });
  });

  it('parses fenced JSON from the model response', async () => {
    anthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '```json\n{"risk":"Medium","summary":"Some dependency warnings."}\n```'
        }
      ]
    });

    const result = await processSecurityAnalysisJob({
      id: 'job-2',
      data: jobData
    } as never);

    expect(result.risk).toBe('Medium');
    expect(result.summary).toContain('dependency');
  });

  it('handles missing README and empty issues', async () => {
    mockedGithubService.getReadme.mockResolvedValueOnce(null);
    mockedGithubService.getIssues.mockResolvedValueOnce([]);
    anthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '{"risk":"Low","summary":"No security signals found."}'
        }
      ]
    });

    const result = await processSecurityAnalysisJob({
      id: 'job-3',
      data: jobData
    } as never);

    expect(result.risk).toBe('Low');
    expect(mockedRepositoryService.updateSecurityRisk).toHaveBeenCalled();
  });

  it('enqueues a security analysis job', async () => {
    const jobId = await enqueueSecurityAnalysis(jobData);
    expect(jobId).toBe('job-1');
  });
});
