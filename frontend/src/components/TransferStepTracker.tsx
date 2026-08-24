import { Check } from "lucide-react";

const STEPS = ["Upload NOC Document", "Transfer Details & Risk Analysis", "Blockchain Settlement"];

export default function TransferStepTracker({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="surface-card p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Transfer Progress</p>
      <ol className="space-y-0">
        {STEPS.map((step, i) => {
          const isComplete = activeIndex > i;
          const isActive = activeIndex === i;
          return (
            <li key={step} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-semibold transition-colors ${
                    isComplete
                      ? "bg-emerald-500/20 text-emerald-600"
                      : isActive
                      ? "bg-brand-500/20 text-brand-600"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-px flex-1 min-h-[20px] ${isComplete ? "bg-emerald-500/30" : "bg-slate-100"}`} />
                )}
              </div>
              <div className={`pb-5 text-sm ${isActive ? "text-slate-900 font-medium" : isComplete ? "text-slate-600" : "text-slate-400"}`}>
                {step}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
