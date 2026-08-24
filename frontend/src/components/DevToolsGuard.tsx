import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { extractErrorMessage, verifyAdminPin } from "../lib/api";

// A window-size-delta heuristic for "DevTools looks open" (docked panels
// shrink the viewport relative to the outer window). Imperfect and known
// to produce occasional false positives/negatives - see this component's
// module-level note in docs/ARCHITECTURE.md for why that tradeoff was
// accepted rather than treated as a bug to chase further. This alone
// misses DevTools undocked into its own separate OS window, since that
// doesn't change this tab's outer/inner window dimensions at all - the
// debugger-timing check below exists specifically to catch that case.
const SIZE_THRESHOLD = 160;
// A `debugger;` statement pauses JS execution for as long as DevTools is
// actually open and attached, whether docked in the tab or undocked into
// its own window - the pause happens because DevTools is open, not
// because of any window geometry. Measuring how long that statement took
// to "execute" is a long-standing heuristic for detecting DevTools in
// either mode. Threshold is generous (normal execution is sub-millisecond).
const DEBUGGER_THRESHOLD_MS = 100;

/// Mounted once at the app root. Two independent things happen here:
/// 1. A permanent deterrent - right-click and the common DevTools
///    shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U) are blocked app-wide, for
///    the life of the tab, regardless of the override below.
/// 2. Two independent heuristics for "DevTools looks open" - a
///    window-size delta (catches DevTools docked inside the tab) and a
///    `debugger;` pause-timing check (catches DevTools undocked into its
///    own separate window too, since that doesn't change this tab's
///    dimensions). Either one shows a full-screen lock overlay,
///    dismissible only by an Admin's email + PIN (verified server-side,
///    POST /api/auth/verify-admin-pin - not the current session's own
///    credentials, so a locked-out non-admin genuinely needs an admin
///    present). The unlock only suppresses the overlay for as long as
///    DevTools is continuously detected open right after that PIN entry
///    - the moment both heuristics stop seeing it open (i.e. it looks
///    closed), the override is dropped, so opening it again, even a
///    minute later in the same tab, prompts for the PIN again. There is
///    deliberately no "remember this tab for the rest of the session"
///    escape hatch. None of this is real security - anyone
///    who opens DevTools via the browser's own menu instead of a
///    shortcut, or disables JavaScript first, bypasses all of it. It's a
///    deterrent against casual snooping, not a barrier against someone
///    who knows how browsers work.
export default function DevToolsGuard() {
  const [locked, setLocked] = useState(false);
  // Ref, not state: this must be readable/writable from inside the poll
  // loop without retriggering the effect, and must NOT persist beyond
  // this component instance (no sessionStorage) - a fresh page load or a
  // DevTools close/reopen cycle always starts from "not overridden".
  const overrideActiveRef = useRef(false);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function blockContextMenu(e: MouseEvent) {
      e.preventDefault();
    }
    function blockShortcuts(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      const isDevToolsShortcut =
        key === "f12"
        || (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(key))
        || (e.ctrlKey && key === "u");
      if (isDevToolsShortcut) e.preventDefault();
    }

    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("keydown", blockShortcuts);
    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockShortcuts);
    };
  }, []);

  useEffect(() => {
    function poll() {
      const widthDelta = window.outerWidth - window.innerWidth;
      const heightDelta = window.outerHeight - window.innerHeight;
      const sizeOpen = widthDelta > SIZE_THRESHOLD || heightDelta > SIZE_THRESHOLD;

      const start = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      const debuggerOpen = performance.now() - start > DEBUGGER_THRESHOLD_MS;

      if (sizeOpen || debuggerOpen) {
        if (!overrideActiveRef.current) setLocked(true);
      } else {
        // DevTools no longer looks open - drop any prior override so the
        // PIN is required again next time it's opened, instead of only
        // the first time in this tab.
        overrideActiveRef.current = false;
        setLocked(false);
      }
    }
    poll();
    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await verifyAdminPin(email, pin);
      overrideActiveRef.current = true;
      setLocked(false);
      setEmail("");
      setPin("");
    } catch (err) {
      setError(extractErrorMessage(err, "Incorrect admin PIN."));
    } finally {
      setSubmitting(false);
    }
  }

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm px-4">
      <form onSubmit={handleUnlock} className="w-full max-w-sm surface-card p-6 space-y-4 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-500/15 text-red-700 flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Developer Tools Restricted</h3>
            <p className="text-xs text-slate-500 mt-0.5">An administrator must enter their PIN to continue.</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Admin Email</label>
          <input
            type="email"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Admin PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            className="field text-center text-lg tracking-[0.5em] font-semibold"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            required
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting || pin.length < 4} className="btn-primary w-full">
          {submitting ? "Verifying..." : "Unlock"}
        </button>
      </form>
    </div>
  );
}
