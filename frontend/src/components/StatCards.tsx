import type { SecurityRiskBreakdown } from "../lib/types";
import { RISK_COLORS, formatNumber } from "../lib/risk";

interface StatCardsProps {
  breakdown: SecurityRiskBreakdown;
}

const CARDS = [
  { key: "High" as const, label: "High risk", hint: "Needs attention" },
  { key: "Medium" as const, label: "Medium risk", hint: "Monitor closely" },
  { key: "Low" as const, label: "Low risk", hint: "Looking healthy" },
  {
    key: "Unanalyzed" as const,
    label: "Unanalyzed",
    hint: "Awaiting assessment",
  },
];

export function StatCards({ breakdown }: StatCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map((card) => (
        <div
          key={card.key}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">{card.label}</p>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: RISK_COLORS[card.key] }}
            />
          </div>
          <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
            {formatNumber(breakdown[card.key])}
          </p>
          <p className="mt-1 text-xs text-slate-400">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}
