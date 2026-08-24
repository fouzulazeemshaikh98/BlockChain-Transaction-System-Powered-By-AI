import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const NOC_VERIFY_STAGES = [
  "Scanning document",
  "Detecting official stamp & signature",
  "Extracting fields (OCR)",
  "Cross-checking authenticity",
  "Computing document risk score",
];

export default function NocVerifyProgress({ active }: { active: boolean }) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    setStageIndex(0);
    const interval = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, NOC_VERIFY_STAGES.length - 1));
    }, 350);
    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  return (
    <div className="rounded-lg border border-line bg-slate-50 p-4 space-y-2.5 animate-fade-in-up">
      {NOC_VERIFY_STAGES.map((stage, i) => {
        const isCurrent = i === stageIndex;
        const isPast = i < stageIndex;
        return (
          <div key={stage} className="flex items-center gap-2.5 text-sm">
            <div
              className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                isPast
                  ? "bg-emerald-500/20 text-emerald-600"
                  : isCurrent
                  ? "bg-brand-500/20 text-brand-600"
                  : "bg-slate-200 text-slate-400"
              }`}
            >
              {isPast ? (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              ) : isCurrent ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </div>
            <span className={isCurrent ? "text-slate-900 font-medium" : isPast ? "text-slate-500" : "text-slate-400"}>
              {stage}
            </span>
          </div>
        );
      })}
    </div>
  );
}
