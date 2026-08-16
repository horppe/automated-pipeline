import type { SecurityRisk } from "./types";

export const RISK_COLORS = {
  High: "#dc2626",
  Medium: "#d97706",
  Low: "#16a34a",
  Unanalyzed: "#94a3b8",
} as const;

export const RISK_LABELS = {
  High: "High",
  Medium: "Medium",
  Low: "Low",
  Unanalyzed: "Unanalyzed",
} as const;

export function riskBadgeClass(risk: SecurityRisk | null): string {
  switch (risk) {
    case "High":
      return "bg-red-50 text-red-700 ring-red-600/20";
    case "Medium":
      return "bg-amber-50 text-amber-700 ring-amber-600/20";
    case "Low":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    default:
      return "bg-slate-50 text-slate-600 ring-slate-500/20";
  }
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
