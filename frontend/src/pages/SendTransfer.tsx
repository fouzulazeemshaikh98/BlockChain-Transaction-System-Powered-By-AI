import { useEffect, useRef, useState } from "react";
import { UploadCloud, X, ScanSearch, FileSearch, ShieldCheck, Gauge } from "lucide-react";
import { downloadReceiptPdf } from "../lib/receiptPdf";
import {
  DemoWallet,
  NocVerificationResponse,
  ProfileResponse,
  TransactionResponse,
  analyzeTransaction,
  approveTransaction,
  createTransfer,
  extractErrorMessage,
  fetchNocDocument,
  fetchProfile,
  fetchWallets,
  settleTransaction,
  verifyNoc,
} from "../lib/api";
import RiskGauge from "../components/RiskGauge";
import ModuleScoreCard from "../components/ModuleScoreCard";
import AnomalyCard from "../components/AnomalyCard";
import AnalysisProgress from "../components/AnalysisProgress";
import NocVerifyProgress from "../components/NocVerifyProgress";
import TransferStepTracker from "../components/TransferStepTracker";
import PinModal from "../components/PinModal";
import TransactionResult from "../components/TransactionResult";
import { fetchReport, ReportResponse } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const NETWORKS = ["Ethereum", "Arbitrum", "Optimism", "Polygon"];
const MIN_TRANSFER_AMOUNT = 10;

const NOC_VERDICT_STYLE: Record<string, string> = {
  genuine: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  suspicious: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  forged: "bg-red-500/15 text-red-700 border-red-500/30",
};

const FLAG_SEVERITY_STYLE: Record<string, string> = {
  info: "border-l-slate-500 bg-slate-50 text-slate-600",
  warning: "border-l-amber-500 bg-amber-500/[0.06] text-amber-700",
  critical: "border-l-red-500 bg-red-500/[0.06] text-red-700",
};

type Stage = "upload" | "verified-blocked" | "transfer-form" | "analyzing" | "report" | "result";
type PendingPinAction = "verifyNoc" | "createTransfer" | "settle" | "approve" | null;

function formatCurrency(amount: number | null | undefined): string {
  return amount != null ? `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";
}

const MAX_NOC_FILE_BYTES = 8 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function SendTransfer() {
  const { isAdmin } = useAuth();
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [nocError, setNocError] = useState<string | null>(null);
  const [nocResult, setNocResult] = useState<NocVerificationResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(next: File | null) {
    if (next) {
      if (!next.type.startsWith("image/")) {
        setNocError("Please upload an image file (PNG or JPG).");
        return;
      }
      if (next.size > MAX_NOC_FILE_BYTES) {
        setNocError("File is too large — please upload an image under 8 MB.");
        return;
      }
    }
    setNocError(null);
    setFile(next);
  }

  function clearFile() {
    if (inputRef.current) inputRef.current.value = "";
    selectFile(null);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const pasted = item?.getAsFile();
    if (pasted) selectFile(pasted);
  }

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [wallets, setWallets] = useState<DemoWallet[]>([]);
  const [network, setNetwork] = useState("Ethereum");
  const [fromAddress, setFromAddress] = useState("0xAliceWallet");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("1000");
  const [transferError, setTransferError] = useState<string | null>(null);

  const [transaction, setTransaction] = useState<TransactionResponse | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [updatedRemaining, setUpdatedRemaining] = useState<number | null | undefined>(undefined);

  const [pendingPinAction, setPendingPinAction] = useState<PendingPinAction>(null);

  useEffect(() => {
    fetchProfile().then(setProfile).catch(() => {});
    fetchWallets().then((data) => {
      setWallets(data);
      if (data.length > 0) setRecipientAddress(data[0].address);
    });
  }, []);

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setNocError(null);
    setPendingPinAction("verifyNoc");
  }

  async function submitVerify(pin: string) {
    if (!file) return;
    setVerifying(true);
    setNocError(null);
    try {
      const data = await verifyNoc(file, pin);
      setPendingPinAction(null);
      setNocResult(data);
      setStage(data.transferUnlocked ? "transfer-form" : "verified-blocked");
    } catch (err) {
      throw new Error(extractErrorMessage(err, "NOC verification failed unexpectedly."));
    } finally {
      setVerifying(false);
    }
  }

  const selectedWallet = wallets.find((w) => w.address === recipientAddress) ?? null;

  async function submitCreateTransfer(pin: string) {
    if (!nocResult || !selectedWallet) return;

    setTransferError(null);
    try {
      const tx = await createTransfer({
        nocDocumentId: nocResult.nocDocumentId,
        transactionHash: `0xtransfer${Date.now().toString(16)}`,
        network,
        fromAddress,
        recipientAddress: selectedWallet.address,
        recipientLabel: selectedWallet.label,
        amount: parseFloat(amount) || 0,
        gasUsed: 21000,
        gasPrice: 30,
        nonce: Math.floor(Math.random() * 100000),
        functionName: "transfer(address,uint256)",
        description: `Cross-border transfer: ${nocResult.fields.originCity ?? "?"} -> ${selectedWallet.city}`,
        pin,
      });
      setPendingPinAction(null);
      setTransaction(tx);
      setStage("analyzing");

      await analyzeTransaction(tx.id);
      const fullReport = await fetchReport(tx.id);
      setReport(fullReport);
      setStage("report");
    } catch (err) {
      throw new Error(extractErrorMessage(err, "Could not create or analyze the transfer."));
    }
  }

  async function submitSettle(pin: string) {
    if (!transaction) return;
    setSettling(true);
    setSettleError(null);
    try {
      const result = await settleTransaction(transaction.id, pin);
      setPendingPinAction(null);
      const fullReport = await fetchReport(transaction.id);
      setReport(fullReport);
      if (result.settlementStatus !== "Executed") {
        setSettleError(result.settlementError ?? "Settlement did not complete.");
      } else if (transaction.nocDocumentId) {
        // Refresh the remaining limit now that this settlement counts
        // against it - the NOC-verify-time snapshot is stale as of now.
        const doc = await fetchNocDocument(transaction.nocDocumentId);
        setUpdatedRemaining(doc.monthlyRemaining);
      }
      // Every actual settle *attempt* (as opposed to the pre-checks that
      // gate whether the button even shows) is a definitive outcome -
      // success or failure both land on the result screen.
      setStage("result");
    } catch (err) {
      throw new Error(extractErrorMessage(err, "Settlement failed unexpectedly."));
    } finally {
      setSettling(false);
    }
  }

  async function submitApprove(pin: string) {
    if (!transaction) return;
    setApproving(true);
    setSettleError(null);
    try {
      await approveTransaction(transaction.id, pin);
      setPendingPinAction(null);
      const fullReport = await fetchReport(transaction.id);
      setReport(fullReport);
    } catch (err) {
      throw new Error(extractErrorMessage(err, "Approval failed unexpectedly."));
    } finally {
      setApproving(false);
    }
  }

  function reset() {
    setStage("upload");
    setFile(null);
    setNocResult(null);
    setNocError(null);
    setTransaction(null);
    setReport(null);
    setSettleError(null);
    setTransferError(null);
    setUpdatedRemaining(undefined);
  }

  async function handlePrintReceipt() {
    if (!report) return;
    await downloadReceiptPdf({
      transaction: report.transaction,
      accountNumber: profile?.accountNumber,
      recipientAccountNumber: selectedWallet?.accountNumber,
      applicantName: f?.applicantName,
      originCountry: f?.originCountry,
      destinationCountry: f?.destinationCountry,
      failureReason: settleError,
    });
  }

  const f = nocResult?.fields;
  const blockedBySettlementRisk =
    report?.analysis && ["HIGH", "CRITICAL"].includes(report.analysis.riskLevel);
  const needsApproval =
    report?.analysis?.riskLevel === "MEDIUM" && !report?.transaction.approvedByName;

  const PIN_MODAL_CONFIG: Record<Exclude<PendingPinAction, null>, { title: string; description: string; onConfirm: (pin: string) => Promise<void> }> = {
    verifyNoc: {
      title: "Confirm NOC Upload",
      description: `Enter your PIN to verify ${file?.name ?? "this document"}.`,
      onConfirm: submitVerify,
    },
    createTransfer: {
      title: "Confirm Transfer",
      description: `Sending ${amount || "0"} mUSDC to ${selectedWallet?.label ?? "the selected branch"}.`,
      onConfirm: submitCreateTransfer,
    },
    settle: {
      title: "Confirm Settlement",
      description: "This executes the on-chain transfer. This cannot be undone.",
      onConfirm: submitSettle,
    },
    approve: {
      title: "Confirm Approval",
      description: "You're approving this MEDIUM-risk transfer for settlement.",
      onConfirm: submitApprove,
    },
  };

  if (stage === "result" && report) {
    return (
      <>
        <TransactionResult
          transaction={report.transaction}
          accountNumber={profile?.accountNumber}
          recipientAccountNumber={selectedWallet?.accountNumber}
          applicantName={f?.applicantName}
          originCountry={f?.originCountry}
          destinationCountry={f?.destinationCountry}
          failureReason={settleError}
          onDownloadPdf={handlePrintReceipt}
          onReset={reset}
        />
        <PinModal
          open={pendingPinAction !== null}
          title={pendingPinAction ? PIN_MODAL_CONFIG[pendingPinAction].title : ""}
          description={pendingPinAction ? PIN_MODAL_CONFIG[pendingPinAction].description : undefined}
          onConfirm={async (pin) => {
            if (pendingPinAction) await PIN_MODAL_CONFIG[pendingPinAction].onConfirm(pin);
          }}
          onClose={() => setPendingPinAction(null)}
        />
      </>
    );
  }

  const stepIndex = stage === "transfer-form" || stage === "analyzing" ? 1 : stage === "report" ? 2 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Send Transfer</h1>
        <p className="text-sm text-slate-500 mt-1">
          NOC-gated cross-border transfer: document verification → AI risk analysis → on-chain settlement.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">

      {stage === "upload" && (
        <form onSubmit={handleVerify} className="surface-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 tracking-wide uppercase">
            Step 1 — Upload the NOC document
          </h2>

          {file && previewUrl ? (
            <div className="rounded-lg border border-line bg-slate-50 p-4 flex items-center gap-4 animate-fade-in-up">
              <img
                src={previewUrl}
                alt="NOC document preview"
                className="h-20 w-20 rounded-md object-cover border border-line shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatBytes(file.size)} · {file.type || "image"}
                </p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 mt-1"
                >
                  Choose a different file
                </button>
              </div>
              <button
                type="button"
                onClick={clearFile}
                title="Remove file"
                className="shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-500/10 rounded-lg p-1.5 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) selectFile(dropped);
              }}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); }
              }}
              onPaste={handlePaste}
              className={`rounded-lg border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
                dragging ? "border-brand-400 bg-brand-500/[0.06] scale-[1.01]" : "border-line hover:border-line-hover bg-slate-50"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <UploadCloud className={`h-8 w-8 mx-auto mb-2 transition-colors ${dragging ? "text-brand-500" : "text-slate-400"}`} />
              <p className="text-sm text-slate-600 font-medium">
                {dragging ? "Drop it right here" : "Drop the NOC image here, or click to browse"}
              </p>
              <p className="text-xs text-slate-500 mt-1">PNG or JPG, up to 8 MB — you can also paste from clipboard</p>
            </div>
          )}

          {nocError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 text-sm px-3 py-2">
              {nocError}
            </div>
          )}

          <NocVerifyProgress active={verifying} />

          <button type="submit" disabled={!file || verifying} className="btn-primary w-full">
            {verifying ? "Verifying document..." : "Verify Document"}
          </button>
        </form>
      )}

      {nocResult && stage !== "upload" && (
        <section className="surface-card p-6 space-y-4 animate-fade-in-up">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 tracking-wide uppercase">NOC Verification Result</h2>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${NOC_VERDICT_STYLE[nocResult.verdict]}`}>
              {nocResult.verdict}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-line bg-slate-50 p-4">
              <div className="text-xs text-slate-500 mb-1">Authenticity Score</div>
              <div className="text-xl font-bold text-slate-900 tabular-nums">{nocResult.authenticityScore.toFixed(0)}</div>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 p-4">
              <div className="text-xs text-slate-500 mb-1">Document Risk Score</div>
              <div className="text-xl font-bold text-slate-900 tabular-nums">{nocResult.riskScore.toFixed(0)}</div>
            </div>
          </div>
          {nocResult.transferUnlocked && (
            <div className="rounded-lg border border-brand-500/30 bg-brand-500/[0.04] p-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500 mb-1">Used This Month</div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">{formatCurrency(nocResult.monthlyUsed)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Remaining Monthly Transfer Limit</div>
                <div className="text-lg font-bold text-brand-700 tabular-nums">{formatCurrency(nocResult.monthlyRemaining)}</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-500">Applicant:</span> <span className="text-slate-700">{f?.applicantName ?? "—"}</span></div>
            <div><span className="text-slate-500">Stamp:</span> <span className="text-slate-700">{nocResult.stamp.stampDetected ? `${nocResult.stamp.colorLabel}, circularity ${nocResult.stamp.circularity?.toFixed(2)}` : "Not detected"}</span></div>
            <div><span className="text-slate-500">Origin:</span> <span className="text-slate-700">{f?.originCity ?? "—"}{f?.originCountry ? `, ${f.originCountry}` : ""}</span></div>
            <div><span className="text-slate-500">Destination:</span> <span className="text-slate-700">{f?.destinationCity ?? "—"}{f?.destinationCountry ? `, ${f.destinationCountry}` : ""}</span></div>
            <div>
              <span className="text-slate-500">Authorized monthly amount:</span>{" "}
              <span className="text-slate-700 font-medium">
                {f?.authorizedAmount != null ? `$${f.authorizedAmount.toLocaleString()}` : "Not stated"}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            {nocResult.flags.map((flag) => (
              <div key={flag.code} className={`border-l-4 rounded-r-lg px-3 py-2 text-sm ${FLAG_SEVERITY_STYLE[flag.severity]}`}>
                <div className="font-medium">{flag.code}</div>
                <div className="text-slate-500">{flag.message}</div>
              </div>
            ))}
          </div>

          {nocResult.cnnHeatmap && (
            <div className="rounded-lg border border-line bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  CNN Stamp Analysis
                </span>
                {nocResult.cnnForgedProbability != null && (
                  <span className="text-xs text-slate-500">
                    Forged probability: <span className="font-semibold text-slate-700">{(nocResult.cnnForgedProbability * 100).toFixed(0)}%</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <img
                  src={nocResult.cnnHeatmap}
                  alt="Grad-CAM heatmap of the stamp region"
                  className="h-24 w-24 rounded-lg border border-line object-cover"
                />
                <p className="text-xs text-slate-500 flex-1">
                  Heatmap highlights the pixels the model weighted most heavily toward a forged verdict — warmer
                  colors mean stronger influence. Independent of the ELA/edge/noise checks above.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {stage === "verified-blocked" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6">
          <p className="text-red-700 font-medium">
            Transfer blocked — document verdict was "{nocResult?.verdict}".
          </p>
          <p className="text-sm text-red-600/80 mt-1">
            Only documents that pass forensic verification with a "genuine" verdict can authorize a transfer.
          </p>
          <button onClick={reset} className="btn-secondary mt-4">Try another document</button>
        </div>
      )}

      {stage === "transfer-form" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const requested = parseFloat(amount) || 0;
            const remaining = nocResult?.monthlyRemaining;
            if (requested < MIN_TRANSFER_AMOUNT) {
              setTransferError(
                `Amount is below the minimum transfer of ${formatCurrency(MIN_TRANSFER_AMOUNT)}.`
              );
              return;
            }
            if (remaining != null && requested > remaining) {
              setTransferError(
                `Amount exceeds the remaining monthly limit of ${formatCurrency(remaining)} — ` +
                  `${formatCurrency(requested - remaining)} over.`
              );
              return;
            }
            setTransferError(null);
            setPendingPinAction("createTransfer");
          }}
          className="surface-card p-6 space-y-4 animate-fade-in-up"
        >
          <h2 className="text-sm font-semibold text-slate-900 tracking-wide uppercase">
            Step 2 — Transfer details &amp; risk analysis
          </h2>

          {nocResult && nocResult.monthlyRemaining != null && (
            <div className="rounded-lg border border-brand-500/30 bg-brand-500/[0.04] px-4 py-2.5 flex items-center justify-between text-sm">
              <span className="text-slate-600">Remaining monthly transfer limit</span>
              <span className="font-bold text-brand-700 tabular-nums">{formatCurrency(nocResult.monthlyRemaining)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Sender Account Number</label>
              <div className="field bg-slate-50 text-slate-700 font-mono tracking-wide cursor-default">
                {profile?.accountNumber ?? "—"}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Network</label>
              <select className="field" value={network} onChange={(e) => setNetwork(e.target.value)}>
                {NETWORKS.map((n) => <option key={n} value={n} className="bg-ink-800">{n}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Sender Wallet Address <span className="text-slate-400 font-normal normal-case">(underlying blockchain address)</span>
              </label>
              <input className="field font-mono text-xs" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Recipient Account Number (Destination Branch)
              </label>
              <select className="field" value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)}>
                {wallets.map((w) => (
                  <option key={w.address} value={w.address} className="bg-ink-800">
                    {w.accountNumber} — {w.label} ({w.city}, {w.country})
                  </option>
                ))}
              </select>
              {selectedWallet && (
                <p className="text-xs text-slate-500 mt-1.5 font-mono">
                  Wallet address: {selectedWallet.address}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Amount to Transfer (mUSDC)</label>
              <input
                type="number"
                min={MIN_TRANSFER_AMOUNT}
                step="0.01"
                max={nocResult?.monthlyRemaining ?? undefined}
                className="field"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1.5">
                Min {formatCurrency(MIN_TRANSFER_AMOUNT)}
                {nocResult?.monthlyRemaining != null && ` · Max ${formatCurrency(nocResult.monthlyRemaining)}`}
              </p>
            </div>
          </div>

          {transferError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 text-sm px-3 py-2">
              {transferError}
            </div>
          )}

          <button type="submit" disabled={!recipientAddress} className="btn-primary w-full">
            Run Risk Analysis
          </button>
        </form>
      )}

      {stage === "analyzing" && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 tracking-wide uppercase">Analyzing transfer...</h2>
          <AnalysisProgress active={stage === "analyzing"} failed={!!transferError} />
        </div>
      )}

      {stage === "report" && report?.analysis && (
        <div className="space-y-6 animate-fade-in-up">
          <section className="surface-card p-6 flex flex-col items-center">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 self-start">
              Transfer Risk Score
            </h2>
            <RiskGauge score={report.analysis.finalRiskScore} level={report.analysis.riskLevel} />
          </section>

          <section className="surface-card p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Module Scores</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ModuleScoreCard label="Semantic Analysis" score={report.analysis.semanticScore} />
              <ModuleScoreCard label="Protocol Verification" score={report.analysis.templateScore} />
              <ModuleScoreCard label="Micro-Level Forensics" score={report.analysis.forensicScore} />
              <ModuleScoreCard label="Behavioral Analysis" score={report.analysis.behavioralScore} />
            </div>
          </section>

          {report.analysis.anomalies.length > 0 && (
            <section className="surface-card p-6">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Detected Anomalies</h2>
              <div className="space-y-3">
                {report.analysis.anomalies.map((a, i) => <AnomalyCard key={i} anomaly={a} />)}
              </div>
            </section>
          )}

          <section className="surface-card p-6">
            <h2 className="text-sm font-semibold text-slate-900 tracking-wide uppercase mb-3">
              Step 3 — Blockchain Settlement
            </h2>

            {blockedBySettlementRisk ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-5">
                <p className="text-red-700 font-medium">
                  Settlement blocked — risk level is {report.analysis.riskLevel}.
                </p>
                <p className="text-sm text-red-600/80 mt-1">
                  Only VERIFIED, LOW, or MEDIUM risk transfers with a genuine NOC can be settled on-chain.
                </p>
              </div>
            ) : needsApproval ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
                <div>
                  <p className="text-amber-700 font-medium">Awaiting Admin approval.</p>
                  <p className="text-sm text-amber-600/80 mt-1">
                    MEDIUM-risk transfers require an Admin's sign-off before they can settle on-chain — a
                    maker-checker control separate from the risk score itself.
                  </p>
                </div>
                {settleError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 text-sm px-3 py-2">
                    {settleError}
                  </div>
                )}
                {isAdmin ? (
                  <button onClick={() => setPendingPinAction("approve")} disabled={approving} className="btn-primary w-full">
                    {approving ? "Approving..." : "Approve for Settlement"}
                  </button>
                ) : (
                  <p className="text-xs text-amber-600/80">Ask an Admin to review and approve this transfer.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">
                  NOC genuine and risk level {report.analysis.riskLevel} — eligible for settlement to{" "}
                  <span className="text-slate-700 font-medium">{report.transaction.recipientLabel}</span>.
                </p>
                {report.transaction.approvedByName && (
                  <p className="text-xs text-slate-500">
                    Approved by <span className="text-slate-700 font-medium">{report.transaction.approvedByName}</span>
                    {report.transaction.approvedAt && ` on ${new Date(report.transaction.approvedAt).toLocaleString()}`}.
                  </p>
                )}
                {settleError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 text-sm px-3 py-2">
                    {settleError}
                  </div>
                )}
                <button onClick={() => setPendingPinAction("settle")} disabled={settling} className="btn-primary w-full">
                  {settling ? "Executing on-chain..." : "Execute Settlement"}
                </button>
              </div>
            )}
          </section>

          <button onClick={reset} className="btn-secondary w-full">Start a new transfer</button>
        </div>
      )}

        </div>

        <aside className="lg:col-span-1 space-y-6 lg:sticky lg:top-24">
          <TransferStepTracker activeIndex={stepIndex} />

          {(stage === "upload" || stage === "verified-blocked") && (
            <div className="surface-card p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">What we check</p>
              <ul className="space-y-2.5">
                <li className="flex items-start gap-2.5 text-sm text-slate-600">
                  <ScanSearch className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" />
                  Official stamp &amp; signature detection
                </li>
                <li className="flex items-start gap-2.5 text-sm text-slate-600">
                  <FileSearch className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" />
                  Field extraction — applicant, countries, authorized amount
                </li>
                <li className="flex items-start gap-2.5 text-sm text-slate-600">
                  <ShieldCheck className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" />
                  Authenticity scoring against known forgery patterns
                </li>
                <li className="flex items-start gap-2.5 text-sm text-slate-600">
                  <Gauge className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" />
                  Document risk score feeding the transfer's overall risk analysis
                </li>
              </ul>
            </div>
          )}

          {(stage === "transfer-form" || stage === "analyzing" || stage === "report") && (
            <div className="surface-card p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Transfer Summary</p>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Amount</dt>
                  <dd className="text-slate-900 font-medium tabular-nums">{formatCurrency(parseFloat(amount) || 0)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Network</dt>
                  <dd className="text-slate-900 font-medium">{network}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-slate-500 shrink-0">Recipient</dt>
                  <dd className="text-slate-900 font-medium text-right">
                    {selectedWallet ? `${selectedWallet.label} (${selectedWallet.city}, ${selectedWallet.country})` : "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Sender Account</dt>
                  <dd className="text-slate-900 font-medium font-mono text-xs">{profile?.accountNumber ?? "—"}</dd>
                </div>
                {nocResult?.monthlyRemaining != null && (
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-line">
                    <dt className="text-slate-500">Remaining Monthly Limit</dt>
                    <dd className="text-brand-700 font-bold tabular-nums">{formatCurrency(nocResult.monthlyRemaining)}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </aside>
      </div>

      <PinModal
        open={pendingPinAction !== null}
        title={pendingPinAction ? PIN_MODAL_CONFIG[pendingPinAction].title : ""}
        description={pendingPinAction ? PIN_MODAL_CONFIG[pendingPinAction].description : undefined}
        onConfirm={async (pin) => {
          if (pendingPinAction) await PIN_MODAL_CONFIG[pendingPinAction].onConfirm(pin);
        }}
        onClose={() => setPendingPinAction(null)}
      />
    </div>
  );
}
