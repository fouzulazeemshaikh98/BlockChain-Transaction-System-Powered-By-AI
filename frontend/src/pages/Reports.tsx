import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { fetchTransactions, TransactionResponse } from "../lib/api";
import RiskBadge from "../components/RiskBadge";

export default function Reports() {
  const [transactions, setTransactions] = useState<TransactionResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions()
      .then((all) => setTransactions(all.filter((t) => t.riskLevel != null)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">Every transaction that has completed AI analysis.</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : transactions.length === 0 ? (
        <div className="surface-card p-10 text-center text-slate-500 text-sm">
          No reports yet. Analyze a transaction to generate one.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {transactions.map((t) => (
            <Link
              key={t.id}
              to={`/reports/${t.id}`}
              className="surface-card p-5 hover:border-line-hover transition-colors block"
            >
              <div className="flex items-center justify-between mb-3">
                <FileText className="h-5 w-5 text-brand-600" />
                <RiskBadge level={t.riskLevel} />
              </div>
              <div className="font-mono text-xs text-slate-600 truncate">{t.transactionHash}</div>
              <div className="text-sm text-slate-500 mt-1">{t.network}</div>
              <div className="text-lg font-bold text-slate-900 mt-2 tabular-nums">
                {t.finalRiskScore?.toFixed(1)} <span className="text-xs text-slate-500 font-normal">/ 100</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
