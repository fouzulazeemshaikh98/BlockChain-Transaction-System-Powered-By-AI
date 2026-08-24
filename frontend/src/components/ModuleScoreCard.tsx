export default function ModuleScoreCard({ label, score }: { label: string; score: number }) {
  const clamped = Math.min(Math.max(score, 0), 100);
  const color = clamped >= 60 ? "bg-red-400" : clamped >= 30 ? "bg-amber-400" : "bg-emerald-400";

  return (
    <div className="rounded-lg border border-line bg-slate-50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-sm font-semibold text-slate-900 tabular-nums">{clamped.toFixed(0)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
