const DOT_STYLES: Record<string, string> = {
  Pending: "bg-slate-400",
  Analyzing: "bg-brand-600",
  Verified: "bg-emerald-500",
  Flagged: "bg-orange-500",
  Rejected: "bg-red-500",
};

/// Status-dot convention (colored dot + plain-text label) instead of a
/// solid-fill pill - matches RiskBadge's treatment.
export default function StatusBadge({ status }: { status: string }) {
  const dot = DOT_STYLES[status] ?? "bg-slate-400";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
      {status}
    </span>
  );
}
