import { useEffect, useState } from "react";
import { CheckCircle2, ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";
import {
  DemoWallet,
  RiskGatedTransferResult,
  RiskGatedTransferSummary,
  fetchRiskGatedTransfers,
  fetchWallets,
  submitRiskGatedTransfer,
} from "../lib/api";

/// Risk-gated settlement: the backend asks the AI risk oracle for a score
/// (behavioural 45% / template 25% / micro-level 30%, block above 40), then
/// settles on-chain through RiskGatedSettlement only with the oracle's
/// signed, 2-minute attestation.
export default function RiskGatedTransfer() {
  const [wallets, setWallets] = useState<DemoWallet[]>([]);
  const [history, setHistory] = useState<RiskGatedTransferSummary[]>([]);
  const [receiver, setReceiver] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [calldata, setCalldata] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RiskGatedTransferResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadHistory() {
    fetchRiskGatedTransfers().then(setHistory).catch(() => {});
  }

  useEffect(() => {
    fetchWallets()
      .then((w) => {
        setWallets(w);
        if (w.length > 0) setReceiver(w[0].address);
      })
      .catch(() => {});
    loadHistory();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await submitRiskGatedTransfer({
        receiver,
        amount: Number(amount),
        pin,
        calldata: calldata.trim() || undefined,
      });
      setResult(res);
      setPin("");
      loadHistory();
    } catch (err: any) {
      setError(err?.message ?? "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Risk-Gated Transfer</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every transfer is scored by the AI risk engine before settlement. Scores above 40 are blocked; approved
          transfers settle on-chain with a signed risk attestation the smart contract verifies.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="surface-card p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Recipient</label>
            <select className="field w-full" value={receiver} onChange={(e) => setReceiver(e.target.value)} required>
              {wallets.map((w) => (
                <option key={w.address} value={w.address}>
                  {w.label} - {w.city}, {w.country}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Amount (mUSDC)</label>
            <input
              className="field w-full"
              type="number"
              min="0.000001"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Transfer PIN</label>
            <input
              className="field w-full"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>

          <button type="button" className="text-xs text-slate-500 underline" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "Hide" : "Show"} advanced (custom calldata for attack testing)
          </button>
          {showAdvanced && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Calldata override (blank = canonical ERC-20 transfer)
              </label>
              <textarea
                className="field w-full font-mono text-xs"
                rows={3}
                value={calldata}
                onChange={(e) => setCalldata(e.target.value)}
                placeholder="0xa9059cbb..."
              />
            </div>
          )}

          <button type="submit" className="btn-primary w-full justify-center" disabled={submitting || !receiver}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {submitting ? "Scoring and settling..." : "Score and Settle"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>

        <div className="surface-card p-6">
          {!result ? (
            <p className="text-sm text-slate-500">The AI risk decision and settlement result will appear here.</p>
          ) : result.accepted ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <CheckCircle2 className="h-5 w-5" /> Approved and settled (risk {result.riskScore}/100)
              </div>
              <Field label="Transfer ID" value={result.transferId} />
              <Field label="Settlement tx" value={result.txHash ?? "-"} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-700 font-semibold">
                <ShieldAlert className="h-5 w-5" /> Blocked by the AI risk engine (risk {result.riskScore}/100)
              </div>
              <Field label="Transfer ID" value={result.transferId} />
              <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
                {result.findings.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Settlement tx</th>
            </tr>
          </thead>
          <tbody>
            {history.map((t) => (
              <tr key={t.id} className="border-t border-slate-100" title={t.findings.join("\n")}>
                <td className="px-4 py-2 whitespace-nowrap">{new Date(t.createdUtc).toLocaleString()}</td>
                <td className="px-4 py-2">{t.receiverLabel ?? t.receiver}</td>
                <td className="px-4 py-2">{t.amount.toLocaleString()}</td>
                <td className={`px-4 py-2 font-semibold ${t.riskScore > 40 ? "text-red-600" : "text-emerald-600"}`}>
                  {t.riskScore}
                </td>
                <td className="px-4 py-2">{t.status}</td>
                <td className="px-4 py-2 font-mono text-xs">{t.l2TxHash ? `${t.l2TxHash.slice(0, 10)}...` : "-"}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={6}>
                  No risk-gated transfers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-mono text-xs break-all text-slate-800">{value}</div>
    </div>
  );
}
