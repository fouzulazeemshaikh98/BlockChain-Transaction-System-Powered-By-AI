import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, FileJson, RefreshCw } from "lucide-react";
import { fetchReport, reanalyzeTransaction, ReportResponse } from "../lib/api";
import { downloadReportPdf } from "../lib/reportPdf";
import RiskGauge from "../components/RiskGauge";
import ModuleScoreCard from "../components/ModuleScoreCard";
import AnomalyCard from "../components/AnomalyCard";
import RiskBadge from "../components/RiskBadge";

const TIMELINE_STEPS = [
  "Transaction Submitted",
  "Data Normalized",
  "Semantic Analysis Completed",
  "Template Verification Completed",
  "Forensic Analysis Completed",
  "Final Risk Score Generated",
];

export default function Report() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  async function load() {
    if (!transactionId) return;
    setLoading(true);
    const data = await fetchReport(parseInt(transactionId, 10));
    setReport(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);

  async function handleReanalyze() {
    if (!transactionId) return;
    setReanalyzing(true);
    await reanalyzeTransaction(parseInt(transactionId, 10));
    await load();
    setReanalyzing(false);
  }

  function handleExportJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${report.transaction.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await downloadReportPdf(report);
    } finally {
      setExportingPdf(false);
    }
  }

  if (loading) {
    return <div className="text-slate-500 text-sm">Loading report...</div>;
  }
  if (!report) {
    return <div className="text-slate-500 text-sm">Report not found.</div>;
  }

  const { transaction: tx, analysis } = report;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Forensic Report</h1>
          <p className="text-sm text-slate-500 mt-1 font-mono">{tx.transactionHash}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReanalyze} disabled={reanalyzing} className="btn-secondary">
            <RefreshCw className={`h-4 w-4 ${reanalyzing ? "animate-spin" : ""}`} />
            Re-analyze
          </button>
          <button onClick={handleExportJson} className="btn-secondary">
            <FileJson className="h-4 w-4" />
            Export JSON
          </button>
          <button onClick={handleExportPdf} disabled={exportingPdf} className="btn-secondary">
            <Download className="h-4 w-4" />
            {exportingPdf ? "Generating..." : "Download PDF"}
          </button>
        </div>
      </div>

      <section className="surface-card p-6">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
          Transaction Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">Network</div>
            <div className="text-slate-700 font-medium">{tx.network}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Amount</div>
            <div className="text-slate-700 font-medium">{tx.amount}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Timestamp</div>
            <div className="text-slate-700 font-medium">{new Date(tx.timestamp).toLocaleString()}</div>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <div className="text-xs text-slate-500">From</div>
            <div className="text-slate-700 font-mono text-xs break-all">{tx.fromAddress}</div>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <div className="text-xs text-slate-500">To</div>
            <div className="text-slate-700 font-mono text-xs break-all">{tx.toAddress}</div>
          </div>
        </div>
      </section>

      {!analysis ? (
        <section className="surface-card p-6 text-center text-slate-500 text-sm">
          This transaction hasn't been analyzed yet.
        </section>
      ) : (
        <>
          <section className="surface-card p-6 flex flex-col items-center">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 self-start">
              Overall Risk Score
            </h2>
            <RiskGauge score={analysis.finalRiskScore} level={analysis.riskLevel} />
          </section>

          <section className="surface-card p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Module Scores
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ModuleScoreCard label="Semantic Analysis" score={analysis.semanticScore} />
              <ModuleScoreCard label="Protocol Verification" score={analysis.templateScore} />
              <ModuleScoreCard label="Micro-Level Forensics" score={analysis.forensicScore} />
              <ModuleScoreCard label="Behavioral Analysis" score={analysis.behavioralScore} />
            </div>
          </section>

          <section className="surface-card p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Detected Anomalies
            </h2>
            {analysis.anomalies.length === 0 ? (
              <p className="text-sm text-slate-500">No anomalies detected.</p>
            ) : (
              <div className="space-y-3">
                {analysis.anomalies.map((a, i) => (
                  <AnomalyCard key={i} anomaly={a} />
                ))}
              </div>
            )}
          </section>

          <section className="surface-card p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Protocol Verification
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm mb-3">
              <div>
                <div className="text-xs text-slate-500">Matched Template</div>
                <div className="text-slate-700 font-medium">{analysis.matchedTemplateName ?? "None"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Similarity Score</div>
                <div className="text-slate-700 font-medium tabular-nums">
                  {analysis.templateSimilarityScore?.toFixed(1) ?? "—"}
                </div>
              </div>
            </div>
            {analysis.templateDeviations.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-1.5">Deviations</div>
                <ul className="list-disc list-inside text-sm text-orange-700 space-y-1">
                  {analysis.templateDeviations.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="surface-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                AI Recommendation
              </h2>
              <RiskBadge level={analysis.riskLevel} />
            </div>
            <p className="text-sm text-slate-700">{analysis.recommendation}</p>
          </section>

          <section className="surface-card p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Timeline</h2>
            <ol className="space-y-2">
              {TIMELINE_STEPS.map((step, i) => (
                <li key={step} className="flex items-center gap-3 text-sm text-slate-600">
                  <span className="h-5 w-5 rounded-full bg-emerald-500/15 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
