const COLORS: Record<string, string> = {
  VERIFIED: "#34d399",
  LOW: "#38bdf8",
  MEDIUM: "#fbbf24",
  HIGH: "#fb923c",
  CRITICAL: "#f87171",
};

export default function RiskGauge({ score, level }: { score: number; level: string }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(score, 0), 100);
  const offset = circumference * (1 - clamped / 100);
  const color = COLORS[level] ?? "#334155";

  return (
    <div className="relative h-44 w-44 mx-auto">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="rgba(15,23,42,0.10)" strokeWidth="12" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-slate-900 tabular-nums">{clamped.toFixed(0)}</span>
        <span className="text-xs text-slate-500">/ 100</span>
        <span className="text-xs font-semibold uppercase tracking-wide mt-1" style={{ color }}>
          {level}
        </span>
      </div>
    </div>
  );
}
