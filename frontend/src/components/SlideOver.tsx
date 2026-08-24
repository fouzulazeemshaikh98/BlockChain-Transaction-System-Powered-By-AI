import { ReactNode } from "react";
import { X } from "lucide-react";

interface SlideOverProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}

/// Right-side sliding detail/edit panel used by the Admin list tabs
/// (Users, Watchlist, Recipient Accounts) and the Transactions edit
/// action, instead of navigating to a whole new page for a quick
/// view/edit - the Stripe-dashboard convention for list drill-down.
export default function SlideOver({ open, title, description, onClose, children }: SlideOverProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative h-full w-full max-w-md bg-white border-l border-line shadow-card-hover flex flex-col animate-fade-in-up">
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-line shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">{children}</div>
      </div>
    </div>
  );
}
