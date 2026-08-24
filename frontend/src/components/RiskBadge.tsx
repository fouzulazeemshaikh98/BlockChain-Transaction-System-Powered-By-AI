const DOT_STYLES: Record<string, string> = {
  VERIFIED: "bg-emerald-500",
  LOW: "bg-sky-500",
  MEDIUM: "bg-amber-500",
  HIGH: "bg-orange-500",
  CRITICAL: "bg-red-500",
};

/// Status-dot convention (colored dot + plain-text label) instead of a
/// solid-fill pill - color signals via the dot only, keeping the label
/// itself neutral and letting dense tables read calmer.
export default function RiskBadge({ level }: { level?: string | null }) {
  const key = level ?? "PENDING";
  const dot = DOT_STYLES[key] ?? "bg-slate-400";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
      {key}
    </span>
  );
}
