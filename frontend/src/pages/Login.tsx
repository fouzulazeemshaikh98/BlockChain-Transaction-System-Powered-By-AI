import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Blocks, CircleHelp } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { extractErrorMessage } from "../lib/api";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showTroubleHelp, setShowTroubleHelp] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const loggedInUser = await login(email, password, remember);
      // The restricted "User" role only has Send Transfer - land there
      // directly instead of on the Dashboard it can't see.
      navigate(loggedInUser.role === "User" ? "/send-transfer" : "/");
    } catch (err) {
      const message = extractErrorMessage(err, "Invalid email or password.");
      if (message.startsWith("EMAIL_NOT_VERIFIED:")) {
        navigate("/verify-email", { state: { email } });
        return;
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm surface-card p-8 space-y-5 animate-fade-in-up"
      >
        <div className="flex flex-col items-center text-center gap-2">
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 shadow-glow-sm"
              style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}
            >
              <Blocks className="h-4 w-4 text-white" strokeWidth={2.25} />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">AI Block System</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 pt-3">Log in to your account</h1>
        </div>

        <div className="space-y-3 pt-1">
          <input
            type="email"
            placeholder="Email address"
            className="field py-3"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="field py-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/40"
            />
            Stay signed in
            <span title="Keeps you signed in on this device until you log out.">
              <CircleHelp className="h-3.5 w-3.5 text-slate-400" />
            </span>
          </label>
          <p className="text-xs text-slate-500 mt-1 ml-6">Not recommended on shared devices.</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3 rounded-lg">
          {submitting ? "Logging in..." : "Log In"}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowTroubleHelp((v) => !v)}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            Having trouble logging in?
          </button>
          {showTroubleHelp && (
            <p className="text-xs text-slate-500 mt-2">
              Contact your administrator to reset your password or transfer PIN.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
