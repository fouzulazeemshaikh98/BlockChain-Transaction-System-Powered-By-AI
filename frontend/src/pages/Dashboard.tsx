import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Line,
} from "recharts";
import { Activity, ShieldCheck, ShieldAlert, Gauge } from "lucide-react";
import {
  DashboardSummaryResponse,
  DashboardTrendPoint,
  fetchDashboardSummary,
  fetchDashboardTrend,
  TransactionResponse,
} from "../lib/api";
import RiskBadge from "../components/RiskBadge";
import StatusBadge from "../components/StatusBadge";
import ScrollFadeX from "../components/ScrollFadeX";

const RISK_COLORS: Record<string, string> = {
  VERIFIED: "#34d399",
  LOW: "#38bdf8",
  MEDIUM: "#fbbf24",
  HIGH: "#fb923c",
  CRITICAL: "#f87171",
};

const TONE_GRADIENTS: Record<string, [string, string]> = {
  brand: ["#60a5fa", "#2563eb"],
  emerald: ["#34d399", "#059669"],
  red: ["#f87171", "#dc2626"],
  amber: ["#fbbf24", "#d97706"],
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONE_GRADIENTS;
}) {
  const [from, to] = TONE_GRADIENTS[tone];
  return (
    <div className="surface-card p-5 flex items-center gap-4">
      <div className="icon-badge" style={{ "--badge-from": from, "--badge-to": to } as React.CSSProperties}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{value}</div>
      </div>
    </div>
  );
}

function riskBreakdown(transactions: TransactionResponse[]) {
  const counts: Record<string, number> = { VERIFIED: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const t of transactions) {
    if (t.riskLevel) counts[t.riskLevel] = (counts[t.riskLevel] ?? 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => ({ name: level, value: count }));
}

function networkBreakdown(transactions: TransactionResponse[]) {
  const counts: Record<string, number> = {};
  for (const t of transactions) {
    counts[t.network] = (counts[t.network] ?? 0) + 1;
  }
  return Object.entries(counts).map(([network, count]) => ({ network, count }));
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [trend, setTrend] = useState<DashboardTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .finally(() => setLoading(false));
    fetchDashboardTrend(30).then(setTrend).catch(() => {});
  }, []);

  if (loading) {
    return <div className="text-slate-500 text-sm">Loading dashboard...</div>;
  }
  if (!summary) {
    return <div className="text-slate-500 text-sm">Could not load dashboard data.</div>;
  }

  const riskData = riskBreakdown(summary.recentTransactions);
  const networkData = networkBreakdown(summary.recentTransactions);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Institutional transaction risk overview.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Transactions"
          value={summary.totalTransactions}
          icon={Activity}
          tone="brand"
        />
        <StatCard
          label="Verified Transactions"
          value={summary.verifiedTransactions}
          icon={ShieldCheck}
          tone="emerald"
        />
        <StatCard
          label="High Risk Transactions"
          value={summary.highRiskTransactions}
          icon={ShieldAlert}
          tone="red"
        />
        <StatCard
          label="Average Risk Score"
          value={summary.averageRiskScore.toFixed(1)}
          icon={Gauge}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Risk Level Breakdown</h2>
          {riskData.length === 0 ? (
            <p className="text-sm text-slate-500">No analyzed transactions yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {riskData.map((entry) => (
                    <Cell key={entry.name} fill={RISK_COLORS[entry.name] ?? "#64748B"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 4px 12px -2px rgba(15,23,42,0.10)" }} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#64748B" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Network Distribution</h2>
          {networkData.length === 0 ? (
            <p className="text-sm text-slate-500">No transactions yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={networkData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="network" stroke="#64748B" fontSize={12} />
                <YAxis stroke="#64748B" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 4px 12px -2px rgba(15,23,42,0.10)" }} />
                <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="surface-card p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">30-Day Volume &amp; Risk Trend</h2>
        {trend.every((p) => p.transactionCount === 0) ? (
          <p className="text-sm text-slate-500">No transactions in the last 30 days.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis
                dataKey="date"
                stroke="#64748B"
                fontSize={12}
                tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              />
              <YAxis yAxisId="count" stroke="#64748B" fontSize={12} allowDecimals={false} />
              <YAxis yAxisId="risk" orientation="right" stroke="#64748B" fontSize={12} domain={[0, 100]} />
              <Tooltip
                labelFormatter={(d) => new Date(String(d)).toLocaleDateString()}
                contentStyle={{ background: "#ffffff", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 4px 12px -2px rgba(15,23,42,0.10)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#64748B" }} />
              <Bar yAxisId="count" dataKey="transactionCount" name="Transactions" fill="#60A5FA" radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="risk"
                type="monotone"
                dataKey="averageRiskScore"
                name="Avg Risk Score"
                stroke="#dc2626"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900 tracking-wide uppercase">Recent Transactions</h2>
          <Link to="/transactions" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
            View all
          </Link>
        </div>
        <div className="surface-card overflow-hidden">
          <ScrollFadeX>
            <table className="w-full text-sm">
            <thead className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide bg-slate-100">
              <tr>
                <th className="px-4 py-3 font-semibold">Transaction Hash</th>
                <th className="px-4 py-3 font-semibold">Network</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Risk Score</th>
                <th className="px-4 py-3 font-semibold">Risk Level</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {summary.recentTransactions.map((t) => (
                <tr key={t.id} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.transactionHash}</td>
                  <td className="px-4 py-3 text-slate-600">{t.network}</td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums">{t.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums">{t.finalRiskScore?.toFixed(1) ?? "—"}</td>
                  <td className="px-4 py-3">
                    <RiskBadge level={t.riskLevel} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Link to={`/reports/${t.id}`} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {summary.recentTransactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    No transactions yet.{" "}
                    <Link to="/send-transfer" className="text-brand-600 hover:text-brand-700">
                      Send a transfer
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </ScrollFadeX>
        </div>
      </section>
    </div>
  );
}
