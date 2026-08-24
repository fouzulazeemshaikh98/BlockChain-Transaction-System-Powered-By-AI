import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Blocks, MailCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { extractErrorMessage, resendVerification } from "../lib/api";

interface LocationState {
  email?: string;
  devCode?: string;
}

export default function VerifyEmail() {
  const { verifyEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState) ?? {};

  const [email, setEmail] = useState(state.email ?? "");
  const [devCode, setDevCode] = useState(state.devCode ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await verifyEmail(email, code);
      navigate("/");
    } catch (err) {
      setError(extractErrorMessage(err, "That code is invalid or has expired."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const result = await resendVerification(email);
      setDevCode(result.devVerificationCode);
      setInfo("A new code was generated.");
    } catch (err) {
      setError(extractErrorMessage(err, "Could not resend a code."));
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-900 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm surface-card p-8 space-y-5 animate-fade-in-up"
      >
        <div className="text-center mb-2">
          <div className="h-12 w-12 rounded-lg bg-brand-600 flex items-center justify-center mx-auto mb-3">
            <Blocks className="h-6 w-6 text-white" strokeWidth={2.25} />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Verify your email</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {email ? <>A verification code was sent to <span className="font-medium text-slate-700">{email}</span>.</> : "Enter your email and verification code."}
          </p>
        </div>

        {devCode && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 flex items-center gap-2.5">
            <MailCheck className="h-4 w-4 text-amber-700 shrink-0" />
            <div className="text-xs text-amber-700">
              <span className="font-semibold">Dev mode — simulated email.</span> No SMTP is configured, so here's
              the code directly: <span className="font-mono font-bold tracking-wider">{devCode}</span>
            </div>
          </div>
        )}

        {!state.email && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Email</label>
            <input type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Verification Code</label>
          <input
            inputMode="numeric"
            maxLength={6}
            autoFocus
            className="field text-center text-lg tracking-[0.5em] font-semibold"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 text-sm px-3 py-2">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-sm px-3 py-2">
            {info}
          </div>
        )}

        <button type="submit" disabled={submitting || !email || code.length < 6} className="btn-primary w-full">
          {submitting ? "Verifying..." : "Verify Email"}
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending || !email}
          className="btn-secondary w-full"
        >
          {resending ? "Resending..." : "Resend Code"}
        </button>

        <p className="text-sm text-slate-500 text-center">
          <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">
            Back to login
          </Link>
        </p>
      </form>
    </div>
  );
}
