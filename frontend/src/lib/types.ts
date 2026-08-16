export type SecurityRisk = "High" | "Medium" | "Low";

export interface Repository {
  id: string;
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
  securityRisk: SecurityRisk | null;
  securitySummary: string | null;
  securityAnalyzedAt: string | null;
  lastFetchedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
}

export interface RepositoryListResponse {
  data: Repository[];
  pagination: Pagination;
}

export interface SecurityRiskBreakdown {
  High: number;
  Medium: number;
  Low: number;
  Unanalyzed: number;
  total: number;
}
