"use client";

import { useCallback, useEffect, useState } from "react";
import { getSecurityRiskBreakdown } from "../lib/api";
import type { SecurityRiskBreakdown } from "../lib/types";
import { RiskChart } from "./RiskChart";
import { RepoTable } from "./RepoTable";
import { StatCards } from "./StatCards";

const EMPTY_BREAKDOWN: SecurityRiskBreakdown = {
  High: 0,
  Medium: 0,
  Low: 0,
  Unanalyzed: 0,
  total: 0,
};

export function Dashboard() {
  const [breakdown, setBreakdown] =
    useState<SecurityRiskBreakdown>(EMPTY_BREAKDOWN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBreakdown = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSecurityRiskBreakdown();
      setBreakdown(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load security risk stats",
      );
      setBreakdown(EMPTY_BREAKDOWN);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBreakdown();
  }, [loadBreakdown]);

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Automated Pipeline
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              Security risk dashboard
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void loadBreakdown()}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Could not reach the API ({error}). Make sure the backend is running
            on{" "}
            <code className="rounded bg-red-100 px-1">
              {process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}
            </code>
            .
          </div>
        )}

        <StatCards breakdown={breakdown} />
        <RiskChart breakdown={breakdown} />
        <RepoTable />
      </main>
    </div>
  );
}
