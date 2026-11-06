import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Blocks } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { extractErrorMessage } from "../lib/api";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await register(fullName, email, password, confirmPassword, pin, confirmPin);
      navigate("/verify-email", { state: { email: result.email, devCode: result.devVerificationCode } });
    } catch (err) {
      setError(extractErrorMessage(err, "Could not create account."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm surface-card p-8 space-y-5 animate-fade-in-up"
      >
        <div className="text-center mb-2">
          <div
            className="h-12 w-12 rounded-lg flex items-center justify-center mx-auto mb-3 shadow-glow-sm"
            style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}
          >
            <Blocks className="h-6 w-6 text-white" strokeWidth={2.25} />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Create your account</h1>
          <p className="text-sm text-slate-500 mt-0.5">Registers as an Analyst</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Full Name</label>
          <input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Email</label>
          <input type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Password</label>
          <input
            type="password"
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Confirm Password</label>
          <input
            type="password"
            className="field"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Transfer PIN (4-6 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              className="field"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              className="field"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 -mt-2">
          You'll be asked for this PIN before every transfer, approval, or settlement.
        </p>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "Creating account..." : "Create Account"}
        </button>

        <p className="text-sm text-slate-500 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">
            Login
          </Link>
        </p>
      </form>
    </div>
  );
}
