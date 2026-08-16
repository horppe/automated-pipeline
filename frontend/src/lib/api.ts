import type {
  RepositoryListResponse,
  SecurityRiskBreakdown,
} from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export function getSecurityRiskBreakdown(): Promise<SecurityRiskBreakdown> {
  return apiFetch<SecurityRiskBreakdown>(
    "/api/repositories/stats/security-risk",
  );
}

export function listRepositories(options: {
  limit?: number;
  offset?: number;
  search?: string;
} = {}): Promise<RepositoryListResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 50));
  params.set("offset", String(options.offset ?? 0));
  if (options.search?.trim()) {
    params.set("search", options.search.trim());
  }

  return apiFetch<RepositoryListResponse>(
    `/api/repositories?${params.toString()}`,
  );
}
