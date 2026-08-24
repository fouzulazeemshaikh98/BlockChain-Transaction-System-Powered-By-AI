import { useState } from "react";
import { Lock, X } from "lucide-react";
import { extractErrorMessage } from "../lib/api";

interface PinModalProps {
  open: boolean;
  title: string;
  description?: string;
  onConfirm: (pin: string) => Promise<void>;
  onClose: () => void;
}

/// A confirmation modal required before every money-moving action (create
/// transfer, admin approval, settle) - the PIN is only ever verified
/// server-side (see TransactionController's VerifyCallerPinAsync); this is
/// just the UI prompt, not the actual security boundary.
export default function PinModal({ open, title, description, onConfirm, onClose }: PinModalProps) {
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleClose() {
    setPin("");
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(pin);
      setPin("");
    } catch (err) {
      setError(extractErrorMessage(err, "Incorrect PIN."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm surface-card p-6 space-y-4 animate-fade-in-up"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand-500/15 text-brand-700 flex items-center justify-center shrink-0">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
            </div>
          </div>
          <button type="button" onClick={handleClose} className="text-slate-400 hover:text-slate-700 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Enter your transfer PIN</label>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            className="field text-center text-lg tracking-[0.5em] font-semibold"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={handleClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button type="submit" disabled={submitting || pin.length < 4} className="btn-primary flex-1">
            {submitting ? "Verifying..." : "Confirm"}
          </button>
        </div>
      </form>
    </div>
  );
}
