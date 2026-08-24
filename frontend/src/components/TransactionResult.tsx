import { Download, RotateCcw } from "lucide-react";
import ResultIcon from "./ResultIcon";
import { TransactionResponse } from "../lib/api";

interface Props {
  transaction: TransactionResponse;
  accountNumber?: string | null;
  recipientAccountNumber?: string | null;
  applicantName?: string | null;
  originCountry?: string | null;
  destinationCountry?: string | null;
  failureReason?: string | null;
  onDownloadPdf: () => void;
  onReset: () => void;
}

/// Full-page settlement confirmation, styled after a plain flat receipt
/// screen (solid card on a solid canvas, no gradients anywhere) rather than
/// the app's usual card-in-wizard treatment - this is the terminal screen
/// of the transfer flow so it gets its own dedicated layout.
export default function TransactionResult({
  transaction,
  accountNumber,
  recipientAccountNumber,
  applicantName,
  originCountry,
  destinationCountry,
  failureReason,
  onDownloadPdf,
  onReset,
}: Props) {
  const isSuccess = transaction.settlementStatus === "Executed";
  const reference = `TXN-${String(transaction.id).padStart(6, "0")}`;
  const reason = failureReason ?? transaction.settlementError ?? "Unknown error";

  const rows: Array<[string, string]> = [
    ["Reference No.", reference],
    ["Status", transaction.settlementStatus],
    ["Sender Account Number", accountNumber ?? "—"],
    ["Recipient Account Number", recipientAccountNumber ?? "—"],
    ["Authorized Under NOC", applicantName ?? "—"],
    ["From Country", originCountry ?? "—"],
    ["To Country", destinationCountry ?? "—"],
    isSuccess ? ["Blockchain Tx Hash", transaction.settlementTxHash ?? "—"] : ["Failure Reason", reason],
    ["Date & Time", new Date().toLocaleString()],
  ];

  return (
    <div className="min-h-[calc(100vh-8rem)] w-full flex items-start sm:items-center justify-center py-10 px-4">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-card overflow-hidden">
        <div
          className={`px-8 pt-10 pb-8 flex flex-col items-center text-center border-b ${
            isSuccess ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"
          }`}
        >
          <ResultIcon variant={isSuccess ? "success" : "failure"} />
          <h1 className="text-2xl font-bold text-slate-900 mt-5">
            {isSuccess ? "Transaction Successful" : "Transaction Failed"}
          </h1>
          <p className="text-sm text-slate-500 mt-2 max-w-sm">
            {isSuccess
              ? "Your transfer has been verified and executed on-chain."
              : reason}
          </p>
          <p className="text-4xl font-extrabold text-slate-900 mt-6 tabular-nums">
            ${transaction.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          {(originCountry || destinationCountry) && (
            <p className="text-xs font-semibold text-slate-500 mt-2 uppercase tracking-wide">
              {originCountry ?? "—"} &rarr; {destinationCountry ?? "—"}
            </p>
          )}
        </div>

        <dl className="px-8">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-6 py-3.5 border-b border-slate-100 last:border-b-0 text-sm"
            >
              <dt className="text-slate-500 shrink-0">{label}</dt>
              <dd className="text-slate-900 font-medium text-right break-all">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="px-8 py-6 flex flex-col sm:flex-row gap-3 border-t border-slate-200">
          <button
            onClick={onDownloadPdf}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-semibold px-4 py-2.5 w-full transition-colors hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Download PDF Receipt
          </button>
          <button
            onClick={onReset}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 text-white text-sm font-semibold px-4 py-2.5 w-full transition-colors hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" /> Start a New Transfer
          </button>
        </div>
      </div>
    </div>
  );
}
