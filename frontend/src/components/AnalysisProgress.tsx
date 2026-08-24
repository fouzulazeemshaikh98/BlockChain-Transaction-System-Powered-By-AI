import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

export const ANALYSIS_STAGES = [
  "Validating Transaction",
  "Normalizing Metadata",
  "Semantic Analysis",
  "Protocol Template Matching",
  "Micro-Level Forensic Analysis",
  "AI Risk Calculation",
  "Generating Final Report",
];

interface Props {
  active: boolean;
  failed: boolean;
}

export default function AnalysisProgress({ active, failed }: Props) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    setStageIndex(0);
    const interval = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, ANALYSIS_STAGES.length - 1));
    }, 500);
    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  return (
    <div className="surface-card p-6">
      <ol className="space-y-0">
        {ANALYSIS_STAGES.map((stage, i) => {
          const isCurrent = i === stageIndex;
          const isPast = i < stageIndex;
          const isFailedHere = failed && isCurrent;

          return (
            <li key={stage} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    isFailedHere
                      ? "bg-red-500/20 text-red-600"
                      : isPast
                      ? "bg-emerald-500/20 text-emerald-600"
                      : isCurrent
                      ? "bg-brand-500/20 text-brand-600"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {isFailedHere ? (
                    <span className="text-xs font-bold">!</span>
                  ) : isPast ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : isCurrent ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </div>
                {i < ANALYSIS_STAGES.length - 1 && (
                  <div
                    className={`w-px flex-1 min-h-[18px] ${
                      isPast ? "bg-emerald-500/30" : "bg-slate-100"
                    }`}
                  />
                )}
              </div>
              <div className={`pb-5 text-sm ${isCurrent ? "text-slate-900 font-medium" : isPast ? "text-slate-600" : "text-slate-600"}`}>
                {stage}
                {isFailedHere && <span className="block text-xs text-red-600 mt-0.5">Failed at this stage</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
