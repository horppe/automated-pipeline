"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { SecurityRiskBreakdown } from "../lib/types";
import { RISK_COLORS, RISK_LABELS, formatNumber } from "../lib/risk";

interface RiskChartProps {
  breakdown: SecurityRiskBreakdown;
}

const KEYS = ["High", "Medium", "Low", "Unanalyzed"] as const;

export function RiskChart({ breakdown }: RiskChartProps) {
  const data = KEYS.map((key) => ({
    name: RISK_LABELS[key],
    value: breakdown[key],
    color: RISK_COLORS[key],
  })).filter((item) => item.value > 0);

  const analyzed =
    breakdown.High + breakdown.Medium + breakdown.Low;
  const highShare =
    analyzed > 0 ? Math.round((breakdown.High / analyzed) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Security risk breakdown
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Distribution across analyzed and pending repositories
        </p>
      </div>

      {breakdown.total === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          No repositories yet. Trigger a sync from the API to populate data.
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="relative mx-auto h-64 w-full max-w-sm">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={68}
                  outerRadius={100}
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatNumber(Number(value ?? 0))}
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-semibold tabular-nums text-slate-900">
                {formatNumber(breakdown.total)}
              </span>
              <span className="text-xs uppercase tracking-wide text-slate-500">
                repositories
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {KEYS.map((key) => {
              const count = breakdown[key];
              const pct =
                breakdown.total > 0
                  ? Math.round((count / breakdown.total) * 100)
                  : 0;

              return (
                <div key={key} className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: RISK_COLORS[key] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-slate-700">
                        {RISK_LABELS[key]}
                      </span>
                      <span className="text-sm tabular-nums text-slate-900">
                        {formatNumber(count)}
                        <span className="ml-2 text-slate-400">{pct}%</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: RISK_COLORS[key],
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <p className="pt-2 text-sm text-slate-500">
              {analyzed > 0
                ? `${highShare}% of analyzed repos are rated High risk.`
                : "No repositories have been analyzed yet."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
