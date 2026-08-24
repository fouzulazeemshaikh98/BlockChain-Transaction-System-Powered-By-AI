import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ListTree,
  FileText,
  ShieldCheck,
  Settings,
  LogOut,
  Search,
  Bell,
  Send,
  AlertTriangle,
  Blocks,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { DashboardSummaryResponse, fetchDashboardSummary, TransactionResponse } from "../lib/api";

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const NAV_LINKS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/send-transfer", label: "Send Transfer", icon: Send },
  { to: "/transactions", label: "Transactions", icon: ListTree },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/templates", label: "Protocol Templates", icon: ShieldCheck },
];

function tabLinkClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-2 px-1 py-3.5 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
    isActive
      ? "border-brand-600 text-slate-900 font-semibold"
      : "border-transparent text-slate-500 hover:text-slate-900"
  }`;
}

const HIGH_RISK_LEVELS = ["HIGH", "CRITICAL"];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const isRestrictedUser = user?.role === "User";

  const [searchQuery, setSearchQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The restricted "User" role can't see Dashboard/Transactions data at
    // all (backend now 403s this for that role too) - skip the call
    // entirely rather than firing a request that's just going to fail.
    if (isRestrictedUser) return;
    fetchDashboardSummary().then(setSummary).catch(() => {});
  }, [isRestrictedUser]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const flagged: TransactionResponse[] =
    summary?.recentTransactions.filter((t) => t.riskLevel && HIGH_RISK_LEVELS.includes(t.riskLevel)) ?? [];

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(`/transactions?q=${encodeURIComponent(searchQuery.trim())}`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Solid navy masthead - business-portal style top bar, no left sidebar */}
      <div className="bg-brand-800 text-white">
        <div className="px-6 py-2.5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <Blocks className="h-5 w-5 text-white" strokeWidth={2.25} />
            <span className="text-sm font-bold tracking-tight">AI BLOCK</span>
          </div>

          <div className="flex items-center gap-5">
            {!isRestrictedUser && (
              <form onSubmit={handleSearch} className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/60" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by transaction hash..."
                  className="w-64 rounded-md border border-white/20 bg-white/10 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/15"
                />
              </form>
            )}

            {!isRestrictedUser && (
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative text-white/80 hover:text-white transition-colors"
              >
                <Bell className="h-4 w-4" />
                {flagged.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-0.5 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center">
                    {flagged.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 surface-card p-0 overflow-hidden animate-fade-in-up text-left">
                  <div className="px-4 py-3 border-b border-line">
                    <span className="text-sm font-semibold text-slate-900">Flagged Transactions</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {flagged.length === 0 ? (
                      <p className="text-sm text-slate-500 px-4 py-6 text-center">
                        No high-risk transactions right now.
                      </p>
                    ) : (
                      flagged.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setNotifOpen(false);
                            navigate(`/reports/${t.id}`);
                          }}
                          className="flex items-start gap-2.5 w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-line last:border-0 transition-colors"
                        >
                          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-mono text-slate-700 truncate">{t.transactionHash}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {t.riskLevel} · {t.network}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setNotifOpen(false);
                      navigate("/transactions");
                    }}
                    className="block w-full text-center text-xs font-medium text-brand-600 hover:text-brand-700 px-4 py-2.5 border-t border-line"
                  >
                    View all transactions
                  </button>
                </div>
              )}
            </div>
            )}

            {user && (
              <div className="flex items-center gap-2.5 border-l border-white/20 pl-4">
                <div className="h-7 w-7 rounded-full bg-white/15 ring-1 ring-white/30 flex items-center justify-center text-[11px] font-semibold text-white shrink-0">
                  {getInitials(user.fullName)}
                </div>
                <div className="hidden md:block leading-tight">
                  <div className="text-xs font-medium text-white">{user.fullName}</div>
                  <div className="text-[10px] font-medium text-white/60">{user.role}</div>
                </div>
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="ml-1 text-white/70 hover:text-white hover:bg-white/10 rounded-md p-1.5 transition-colors"
                >
                  <LogOut className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* White horizontal tab bar underneath the masthead - replaces the old left sidebar */}
      <nav className="sticky top-0 z-30 bg-white border-b border-line">
        <div className="px-6 flex items-center gap-6 overflow-x-auto">
          {(isRestrictedUser ? NAV_LINKS.filter((l) => l.to === "/send-transfer") : NAV_LINKS).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={tabLinkClass}>
              <Icon className="h-4 w-4" strokeWidth={2} />
              {label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/admin" className={tabLinkClass}>
              <Settings className="h-4 w-4" strokeWidth={2} />
              Admin
            </NavLink>
          )}
        </div>
      </nav>

      <main className="flex-1 px-6 py-8 animate-fade-in-up">{children}</main>
    </div>
  );
}
