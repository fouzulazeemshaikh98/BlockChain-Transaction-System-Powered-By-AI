import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Receipt } from "lucide-react";
import {
  deleteTransaction,
  extractErrorMessage,
  fetchNocDocument,
  fetchProfile,
  fetchReport,
  fetchTransactions,
  fetchWallets,
  reanalyzeTransaction,
  TransactionResponse,
} from "../lib/api";
import { downloadReportPdf } from "../lib/reportPdf";
import { downloadReceiptPdf } from "../lib/receiptPdf";
import RiskBadge from "../components/RiskBadge";
import StatusBadge from "../components/StatusBadge";

const NETWORKS = ["All", "Ethereum", "Arbitrum", "Optimism", "Polygon"];
const RISK_LEVELS = ["All", "VERIFIED", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES = ["All", "Pending", "Analyzing", "Verified", "Flagged", "Rejected"];
const PAGE_SIZE = 10;

export default function Transactions() {
  const [searchParams] = useSearchParams();
  const [transactions, setTransactions] = useState<TransactionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [network, setNetwork] = useState("All");
  const [riskLevel, setRiskLevel] = useState("All");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);
  const [receiptBusyId, setReceiptBusyId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    fetchTransactions()
      .then(setTransactions)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (search && !t.transactionHash.toLowerCase().includes(search.toLowerCase())) return false;
      if (network !== "All" && t.network !== network) return false;
      if (riskLevel !== "All" && t.riskLevel !== riskLevel) return false;
      if (status !== "All" && t.status !== status) return false;
      return true;
    });
  }, [transactions, search, network, riskLevel, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleDownloadPdf(id: number) {
    setPdfBusyId(id);
    try {
      const report = await fetchReport(id);
      await downloadReportPdf(report);
    } catch (e) {
      window.alert(extractErrorMessage(e, "Failed to generate PDF."));
    } finally {
      setPdfBusyId(null);
    }
  }

  async function handleDownloadReceipt(t: TransactionResponse) {
    setReceiptBusyId(t.id);
    try {
      const [profile, wallets, noc] = await Promise.all([
        fetchProfile(),
        fetchWallets(),
        t.nocDocumentId ? fetchNocDocument(t.nocDocumentId) : Promise.resolve(null),
      ]);
      const recipientWallet = wallets.find((w) => w.address === t.recipientAddress);
      await downloadReceiptPdf({
        transaction: t,
        accountNumber: profile.accountNumber,
        recipientAccountNumber: recipientWallet?.accountNumber,
        applicantName: noc?.applicantName,
        originCountry: noc?.originCountry,
        destinationCountry: noc?.destinationCountry,
      });
    } catch (e) {
      window.alert(extractErrorMessage(e, "Failed to generate receipt."));
    } finally {
      setReceiptBusyId(null);
    }
  }

  async function handleReanalyze(id: number) {
    setBusyId(id);
    try {
      await reanalyzeTransaction(id);
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this transaction and its analysis?")) return;
    setBusyId(id);
    try {
      await deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      window.alert(extractErrorMessage(e, "Failed to delete transaction."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Transactions</h1>
        <p className="text-sm text-slate-500 mt-1">Search, filter, and manage submitted transactions.</p>
      </div>

      <div className="surface-card p-4 flex flex-wrap gap-3">
        <input
          className="field flex-1 min-w-[220px]"
          placeholder="Search by transaction hash..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select className="field w-auto" value={network} onChange={(e) => { setNetwork(e.target.value); setPage(1); }}>
          {NETWORKS.map((n) => (
            <option key={n} value={n} className="bg-ink-800">{n}</option>
          ))}
        </select>
        <select className="field w-auto" value={riskLevel} onChange={(e) => { setRiskLevel(e.target.value); setPage(1); }}>
          {RISK_LEVELS.map((r) => (
            <option key={r} value={r} className="bg-ink-800">{r}</option>
          ))}
        </select>
        <select className="field w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUSES.map((s) => (
            <option key={s} value={s} className="bg-ink-800">{s}</option>
          ))}
        </select>
      </div>

      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide bg-slate-100">
            <tr>
              <th className="px-4 py-3 font-semibold">Transaction Hash</th>
              <th className="px-4 py-3 font-semibold">Network</th>
              <th className="px-4 py-3 font-semibold">Risk Score</th>
              <th className="px-4 py-3 font-semibold">Risk Level</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              paged.map((t) => (
                <tr key={t.id} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.transactionHash}</td>
                  <td className="px-4 py-3 text-slate-600">{t.network}</td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums">{t.finalRiskScore?.toFixed(1) ?? "—"}</td>
                  <td className="px-4 py-3"><RiskBadge level={t.riskLevel} /></td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3 text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <Link to={`/reports/${t.id}`} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                        View Report
                      </Link>
                      <button
                        onClick={() => handleDownloadPdf(t.id)}
                        disabled={pdfBusyId === t.id}
                        className="text-xs text-slate-500 hover:text-slate-900 font-medium disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" />
                        {pdfBusyId === t.id ? "Generating..." : "PDF"}
                      </button>
                      {t.settlementStatus === "Executed" && (
                        <button
                          onClick={() => handleDownloadReceipt(t)}
                          disabled={receiptBusyId === t.id}
                          className="text-xs text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <Receipt className="h-3 w-3" />
                          {receiptBusyId === t.id ? "Generating..." : "Receipt"}
                        </button>
                      )}
                      <button
                        onClick={() => handleReanalyze(t.id)}
                        disabled={busyId === t.id}
                        className="text-xs text-slate-500 hover:text-slate-900 font-medium disabled:opacity-50"
                      >
                        Re-analyze
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        disabled={busyId === t.id || t.settlementStatus !== "Executed"}
                        title={
                          t.settlementStatus !== "Executed"
                            ? "Only successfully settled transactions can be deleted."
                            : undefined
                        }
                        className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-40 disabled:hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            {!loading && paged.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No transactions match these filters.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`h-8 w-8 rounded-lg text-xs font-medium transition-colors ${
                p === page ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
