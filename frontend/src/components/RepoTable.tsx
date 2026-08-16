"use client";

import { useEffect, useState } from "react";
import { listRepositories } from "../lib/api";
import type { Repository } from "../lib/types";
import {
  formatDate,
  formatNumber,
  riskBadgeClass,
} from "../lib/risk";

const PAGE_SIZE = 25;

export function RepoTable() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await listRepositories({
          limit: PAGE_SIZE,
          offset,
          search: debouncedSearch || undefined,
        });
        if (!cancelled) {
          setRepos(response.data);
          setTotal(response.pagination.total);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load repositories",
          );
          setRepos([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, offset]);

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Repositories</h2>
          <p className="mt-1 text-sm text-slate-500">
            Search by name, owner, language, or description
          </p>
        </div>
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Search repositories</span>
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 3.47 9.8l3.12 3.11a.75.75 0 1 0 1.06-1.06l-3.11-3.12A5.5 5.5 0 0 0 9 3.5ZM5.5 9a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none ring-slate-300 transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-2"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-3 font-medium">Repository</th>
              <th className="px-6 py-3 font-medium">Risk</th>
              <th className="px-6 py-3 font-medium">Language</th>
              <th className="px-6 py-3 font-medium text-right">Stars</th>
              <th className="px-6 py-3 font-medium">Analyzed</th>
              <th className="px-6 py-3 font-medium">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-16 text-center text-slate-500"
                >
                  Loading repositories…
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-16 text-center text-red-600"
                >
                  {error}
                </td>
              </tr>
            )}

            {!loading && !error && repos.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-16 text-center text-slate-500"
                >
                  {debouncedSearch
                    ? `No repositories match “${debouncedSearch}”.`
                    : "No repositories found."}
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              repos.map((repo) => (
                <tr
                  key={repo.id}
                  className="transition-colors hover:bg-slate-50/80"
                >
                  <td className="px-6 py-4">
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-slate-900 hover:text-slate-600"
                    >
                      {repo.fullName}
                    </a>
                    {repo.description && (
                      <p className="mt-0.5 line-clamp-1 max-w-xs text-xs text-slate-500">
                        {repo.description}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${riskBadgeClass(repo.securityRisk)}`}
                    >
                      {repo.securityRisk ?? "Unanalyzed"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {repo.language ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-slate-700">
                    {formatNumber(repo.stars)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                    {formatDate(repo.securityAnalyzedAt)}
                  </td>
                  <td className="max-w-sm px-6 py-4 text-slate-600">
                    <p className="line-clamp-2">
                      {repo.securitySummary ?? "—"}
                    </p>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
        <p className="text-sm text-slate-500">
          {total === 0
            ? "0 results"
            : `Showing ${pageStart}–${pageEnd} of ${formatNumber(total)}`}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canPrev || loading}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!canNext || loading}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
