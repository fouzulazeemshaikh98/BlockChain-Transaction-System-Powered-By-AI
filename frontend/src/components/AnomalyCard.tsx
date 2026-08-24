import { AlertTriangle, AlertOctagon, Info, ShieldAlert } from "lucide-react";
import { AnomalyResponse } from "../lib/api";

const SEVERITY_STYLE: Record<string, { border: string; bg: string; text: string; Icon: typeof Info }> = {
  Low: { border: "border-slate-500/30", bg: "bg-slate-500/[0.06]", text: "text-slate-600", Icon: Info },
  Medium: { border: "border-amber-500/30", bg: "bg-amber-500/[0.06]", text: "text-amber-700", Icon: AlertTriangle },
  High: { border: "border-orange-500/30", bg: "bg-orange-500/[0.06]", text: "text-orange-700", Icon: ShieldAlert },
  Critical: { border: "border-red-500/30", bg: "bg-red-500/[0.06]", text: "text-red-700", Icon: AlertOctagon },
};

export default function AnomalyCard({ anomaly }: { anomaly: AnomalyResponse }) {
  const style = SEVERITY_STYLE[anomaly.severity] ?? SEVERITY_STYLE.Low;
  const Icon = style.Icon;

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${style.text}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">{anomaly.type}</span>
            <span className={`text-[11px] font-medium uppercase tracking-wide ${style.text}`}>
              {anomaly.severity}
            </span>
            <span className="text-[11px] text-slate-500">
              {(anomaly.confidence * 100).toFixed(0)}% confidence
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">{anomaly.description}</p>
          <p className="text-xs text-slate-500 mt-1 font-mono break-all">{anomaly.evidence}</p>
        </div>
      </div>
    </div>
  );
}
