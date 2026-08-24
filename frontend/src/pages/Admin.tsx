import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  FileClock,
  SlidersHorizontal,
  Shield,
  ShieldCheck,
  ShieldX,
  User,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Save,
  Plus,
  Trash2,
  Search,
  Landmark,
  Pencil,
  KeyRound,
  MonitorSmartphone,
  MapPin,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  AdminLog,
  AdminLoginAttempt,
  AdminOverview,
  AdminUser,
  RevealedCredentials,
  RiskThresholds,
  UserRole,
  WalletAccount,
  WatchlistEntry,
  addWatchlistEntry,
  createAdminUser,
  createWalletAccount,
  deleteAdminUser,
  deleteWalletAccount,
  extractErrorMessage,
  fetchAdminLogs,
  fetchAdminOverview,
  fetchAdminUsers,
  fetchAdminWallets,
  fetchLoginAttempts,
  fetchRiskThresholds,
  fetchWatchlist,
  removeWatchlistEntry,
  revealDemoCredentials,
  setUserActive,
  setUserPin,
  setUserRole,
  updateRiskThresholds,
  updateWalletAccount,
  updateWatchlistEntry,
} from "../lib/api";
import { useAuth } from "../context/AuthContext";
import SlideOver from "../components/SlideOver";

type Tab = "users" | "loginActivity" | "logs" | "thresholds" | "watchlist" | "wallets" | "templates" | "vault";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "users", label: "User Management", icon: Users },
  { id: "loginActivity", label: "Login Activity", icon: KeyRound },
  { id: "logs", label: "AI Analysis Logs", icon: FileClock },
  { id: "thresholds", label: "Risk Thresholds", icon: SlidersHorizontal },
  { id: "watchlist", label: "Sanctions Watchlist", icon: ShieldX },
  { id: "wallets", label: "Recipient Accounts", icon: Landmark },
  { id: "templates", label: "Protocol Templates", icon: ShieldCheck },
  { id: "vault", label: "Credential Vault", icon: Lock },
];

// ---- Shared sort/search helpers ----

type SortDir = "asc" | "desc";
interface SortState {
  key: string;
  dir: SortDir;
}

function sortRows<T extends object>(rows: T[], sort: SortState | null): T[] {
  if (!sort) return rows;
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[key];
    const bv = (b as Record<string, unknown>)[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

function useSort(initial: SortState | null = null) {
  const [sort, setSort] = useState<SortState | null>(initial);
  function onSort(key: string) {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }
  return { sort, onSort };
}

function SortableHeader({ label, col, sort, onSort, className }: {
  label: string;
  col: string;
  sort: SortState | null;
  onSort: (col: string) => void;
  className?: string;
}) {
  const active = sort?.key === col;
  return (
    <th
      className={`px-5 py-3 font-semibold uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 transition-colors ${className ?? ""}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sort!.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 text-slate-300" />
        )}
      </span>
    </th>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-64">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      <input
        className="field pl-8"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${color}`} />;
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>("users");
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  useEffect(() => {
    fetchAdminOverview().then(setOverview).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Admin</h1>
        <p className="text-sm text-slate-500 mt-1">System administration.</p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard label="Total Users" value={overview.totalUsers} />
          <StatCard label="Active Users" value={overview.activeUsers} />
          <StatCard label="Admins" value={overview.adminCount} />
          <StatCard label="AI Calls Logged" value={overview.totalAiCalls} />
          <StatCard label="Failed AI Calls" value={overview.failedAiCalls} accent={overview.failedAiCalls > 0} />
        </div>
      )}

      <div className="flex gap-1.5 border-b border-line overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-brand-500 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersPanel />}
      {tab === "loginActivity" && <LoginActivityPanel />}
      {tab === "logs" && <LogsPanel />}
      {tab === "thresholds" && <ThresholdsPanel />}
      {tab === "watchlist" && <WatchlistPanel />}
      {tab === "wallets" && <WalletsPanel />}
      {tab === "templates" && <TemplatesPanel />}
      {tab === "vault" && <CredentialVaultPanel />}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="surface-card p-4">
      <div className={`text-xl font-bold tabular-nums ${accent ? "text-red-600" : "text-slate-900"}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

// ---- Users ----

const EMPTY_CREATE_USER_FORM = { fullName: "", email: "", password: "", pin: "", role: "Analyst" as UserRole };

function UsersPanel() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const { sort, onSort } = useSort({ key: "fullName", dir: "asc" });

  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_USER_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  function load() {
    setLoading(true);
    fetchAdminUsers()
      .then(setUsers)
      .catch((e) => setError(extractErrorMessage(e, "Failed to load users.")))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? users.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      : users;
    return sortRows(filtered, sort);
  }, [users, search, sort]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const created = await createAdminUser(createForm);
      setUsers((prev) => [...prev, created]);
      setCreateForm(EMPTY_CREATE_USER_FORM);
      setShowCreate(false);
    } catch (e) {
      setCreateError(extractErrorMessage(e, "Failed to create user."));
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(u: AdminUser) {
    setError("");
    setBusyId(u.id);
    try {
      const updated = await setUserActive(u.id, !u.isActive);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      setSelectedUser(updated);
    } catch (e) {
      setError(extractErrorMessage(e, "Failed to update user status."));
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(u: AdminUser, role: UserRole) {
    if (role === u.role) return;
    setError("");
    setBusyId(u.id);
    try {
      const updated = await setUserRole(u.id, role);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      setSelectedUser(updated);
    } catch (e) {
      setError(extractErrorMessage(e, "Failed to update user role."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(u: AdminUser) {
    if (!window.confirm(`Permanently delete ${u.fullName}? This can't be undone.`)) return;
    setDeleteError("");
    setBusyId(u.id);
    try {
      await deleteAdminUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setSelectedUser(null);
    } catch (e) {
      setDeleteError(extractErrorMessage(e, "Failed to delete user."));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search name or email..." />
        <button onClick={() => setShowCreate(true)} className="btn-primary shrink-0">
          <Plus className="h-4 w-4" />
          Create User
        </button>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide bg-slate-100">
                <SortableHeader label="Name" col="fullName" sort={sort} onSort={onSort} />
                <SortableHeader label="Email" col="email" sort={sort} onSort={onSort} />
                <SortableHeader label="Role" col="role" sort={sort} onSort={onSort} />
                <SortableHeader label="Status" col="isActive" sort={sort} onSort={onSort} />
                <SortableHeader label="Joined" col="createdAt" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-slate-500">No users match.</td>
                </tr>
              ) : (
                visible.map((u) => {
                  const isSelf = me?.email === u.email;
                  return (
                    <tr
                      key={u.id}
                      onClick={() => {
                        setSelectedUser(u);
                        setDeleteError("");
                      }}
                      className="cursor-pointer odd:bg-white even:bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <td className="px-5 py-3 text-slate-700 font-medium">
                        {u.fullName} {isSelf && <span className="text-slate-400 font-normal">(you)</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-500">{u.email}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          {u.role === "Admin" ? <Shield className="h-3.5 w-3.5 text-brand-600" /> : <User className="h-3.5 w-3.5 text-slate-400" />}
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          <Dot color={u.isActive ? "bg-emerald-500" : "bg-red-500"} />
                          {u.isActive ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SlideOver open={showCreate} title="Create User" onClose={() => setShowCreate(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Full Name</label>
            <input className="field" value={createForm.fullName} onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Email</label>
            <input type="email" className="field" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Password</label>
            <input type="password" className="field" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Transfer PIN (4-6 digits)</label>
            <input
              inputMode="numeric"
              maxLength={6}
              className="field"
              value={createForm.pin}
              onChange={(e) => setCreateForm({ ...createForm, pin: e.target.value.replace(/\D/g, "") })}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Role</label>
            <select className="field" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })}>
              <option value="Analyst" className="bg-ink-800">Analyst</option>
              <option value="Admin" className="bg-ink-800">Admin</option>
              <option value="User" className="bg-ink-800">User (Send Transfer only)</option>
            </select>
          </div>
          <p className="text-xs text-slate-500">Admin-created accounts skip email verification — you're vouching for it directly.</p>
          {createError && <div className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{createError}</div>}
          <button type="submit" disabled={creating} className="btn-primary w-full">
            {creating ? "Creating..." : "Create User"}
          </button>
        </form>
      </SlideOver>

      <SlideOver open={!!selectedUser} title={selectedUser?.fullName ?? ""} description={selectedUser?.email} onClose={() => setSelectedUser(null)}>
        {selectedUser && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 mb-1">Role</div>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                  {selectedUser.role === "Admin" ? <Shield className="h-3.5 w-3.5 text-brand-600" /> : <User className="h-3.5 w-3.5 text-slate-400" />}
                  {selectedUser.role}
                </span>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Status</div>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                  <Dot color={selectedUser.isActive ? "bg-emerald-500" : "bg-red-500"} />
                  {selectedUser.isActive ? "Active" : "Deactivated"}
                </span>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-slate-500 mb-1">Joined</div>
                <div className="text-slate-700">{new Date(selectedUser.createdAt).toLocaleString()}</div>
              </div>
            </div>

            <p className="text-xs text-slate-500 border-t border-line pt-4">
              Transfer PINs can only be reset from the Credential Vault tab, which requires re-entering your
              own password first.
            </p>

            <div className="border-t border-line pt-4 space-y-2">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Role</label>
              <select
                className="field"
                value={selectedUser.role}
                disabled={busyId === selectedUser.id}
                onChange={(e) => changeRole(selectedUser, e.target.value as UserRole)}
              >
                <option value="Analyst" className="bg-ink-800">Analyst</option>
                <option value="Admin" className="bg-ink-800">Admin</option>
                <option value="User" className="bg-ink-800">User (Send Transfer only)</option>
              </select>
              <button
                disabled={busyId === selectedUser.id || (me?.email === selectedUser.email && selectedUser.isActive)}
                onClick={() => toggleActive(selectedUser)}
                className="btn-secondary w-full justify-start"
              >
                {selectedUser.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                {selectedUser.isActive ? "Deactivate Account" : "Activate Account"}
              </button>
              {deleteError && (
                <div className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{deleteError}</div>
              )}
              <button
                disabled={busyId === selectedUser.id || me?.email === selectedUser.email}
                onClick={() => handleDelete(selectedUser)}
                className="inline-flex items-center justify-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 text-red-700 text-sm font-medium px-4 py-2.5 w-full transition-colors hover:bg-red-500/10 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
                Delete User
              </button>
              <p className="text-xs text-slate-500">
                Deletion is only allowed once the user has zero transactions, NOC documents, and watchlist entries.
              </p>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}

// ---- Login Activity (security audit trail) ----

function LoginActivityPanel() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<AdminLoginAttempt[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  useEffect(() => {
    setLoading(true);
    fetchLoginAttempts(page, pageSize)
      .then((res) => {
        setItems(res.items);
        setTotalCount(res.totalCount);
      })
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const q = search.trim().toLowerCase();
  const visible = q
    ? items.filter((a) =>
        a.email.toLowerCase().includes(q)
        || (a.ipAddress ?? "").includes(q)
        || a.device.toLowerCase().includes(q)
        || a.context.toLowerCase().includes(q)
        || (a.location ?? "").toLowerCase().includes(q)
      )
    : items;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search email, IP, device, or location (this page)..." />
        <span className="text-xs text-slate-500 shrink-0">{totalCount} attempts logged</span>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide bg-slate-100">
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Action</th>
                <th className="px-5 py-3 font-semibold">Device</th>
                <th className="px-5 py-3 font-semibold">IP Address</th>
                <th className="px-5 py-3 font-semibold">Location</th>
                <th className="px-5 py-3 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-slate-500">Loading...</td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-slate-500">No login attempts found.</td>
                </tr>
              ) : (
                visible.map((a) => (
                  <tr key={a.id} className="odd:bg-white even:bg-slate-50">
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700" title={a.failureReason ?? undefined}>
                        <Dot color={a.success ? "bg-emerald-500" : "bg-red-500"} />
                        {a.success ? "Success" : a.failureReason ?? "Failed"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700 font-medium">{a.email}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{a.context}</td>
                    <td className="px-5 py-3 text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <MonitorSmartphone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        {a.device}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 font-mono text-xs">{a.ipAddress ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {a.location ? (
                        a.latitude != null && a.longitude != null ? (
                          <a
                            href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 hover:underline"
                            title="Open in Google Maps"
                          >
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            {a.location}
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            {a.location}
                          </span>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{new Date(a.attemptedAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-slate-500">
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---- AI Analysis Logs ----

function LogsPanel() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<AdminLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const pageSize = 15;

  useEffect(() => {
    setLoading(true);
    fetchAdminLogs(page, pageSize, status || undefined)
      .then((res) => {
        setItems(res.items);
        setTotalCount(res.totalCount);
      })
      .finally(() => setLoading(false));
  }, [page, status]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const q = search.trim().toLowerCase();
  const visible = q ? items.filter((l) => l.transactionHash?.toLowerCase().includes(q)) : items;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select
            className="field w-40"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="" className="bg-ink-800">All statuses</option>
            <option value="Success" className="bg-ink-800">Success</option>
            <option value="Error" className="bg-ink-800">Error</option>
          </select>
          <SearchBox value={search} onChange={setSearch} placeholder="Search tx hash (this page)..." />
        </div>
        <span className="text-xs text-slate-500 shrink-0">{totalCount} calls logged</span>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide bg-slate-100">
                <th className="px-5 py-3 font-semibold">Module</th>
                <th className="px-5 py-3 font-semibold">Transaction</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Time</th>
                <th className="px-5 py-3 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-slate-500">Loading...</td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-slate-500">No logs found.</td>
                </tr>
              ) : (
                visible.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      className="cursor-pointer odd:bg-white even:bg-slate-50 hover:bg-slate-100"
                    >
                      <td className="px-5 py-3 text-slate-700 font-mono text-xs">{log.moduleName}</td>
                      <td className="px-5 py-3 text-slate-500">
                        #{log.transactionId}
                        {log.transactionHash && (
                          <span className="text-slate-600 ml-1.5 font-mono text-xs">
                            {log.transactionHash.slice(0, 12)}...
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          <Dot color={log.status === "Success" ? "bg-emerald-500" : "bg-red-500"} />
                          {log.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500 tabular-nums">{log.processingTimeMs}ms</td>
                      <td className="px-5 py-3 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                    </tr>
                    {expanded === log.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-5 py-4 space-y-3">
                          <div>
                            <div className="text-xs font-medium text-slate-500 mb-1">Request</div>
                            <pre className="text-xs font-mono text-slate-200 bg-slate-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                              {log.requestPayload}
                            </pre>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-slate-500 mb-1">Response</div>
                            <pre className="text-xs font-mono text-slate-200 bg-slate-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                              {log.responsePayload}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-slate-500">
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---- Risk Threshold Settings ----

function ThresholdsPanel() {
  const [thresholds, setThresholds] = useState<RiskThresholds | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetchRiskThresholds().then(setThresholds);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!thresholds) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateRiskThresholds(thresholds);
      setThresholds(updated);
      setSavedAt(Date.now());
    } catch (e) {
      setError(extractErrorMessage(e, "Failed to save thresholds."));
    } finally {
      setSaving(false);
    }
  }

  if (!thresholds) return <p className="text-sm text-slate-500">Loading...</p>;

  const fields: { key: keyof RiskThresholds; label: string; color: string }[] = [
    { key: "verified", label: "VERIFIED max score", color: "text-emerald-600" },
    { key: "low", label: "LOW max score", color: "text-lime-600" },
    { key: "medium", label: "MEDIUM max score", color: "text-amber-600" },
    { key: "high", label: "HIGH max score", color: "text-orange-600" },
  ];

  return (
    <form onSubmit={handleSave} className="surface-card p-6 max-w-xl space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Risk Level Cutoffs</h3>
        <p className="text-xs text-slate-500 mt-1">
          A transaction's final risk score (0-100) maps to a level using these ceilings — anything above the HIGH
          ceiling is CRITICAL. Changes apply to every analysis run after saving.
        </p>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        {fields.map(({ key, label, color }) => (
          <div key={key}>
            <label className={`block text-xs font-medium mb-1.5 ${color}`}>{label}</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              className="field"
              value={thresholds[key]}
              onChange={(e) => setThresholds({ ...thresholds, [key]: Number(e.target.value) })}
              required
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-primary">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Thresholds"}
        </button>
        {savedAt && Date.now() - savedAt < 4000 && (
          <span className="text-xs text-emerald-600">Saved.</span>
        )}
      </div>
    </form>
  );
}

// ---- Sanctions/watchlist ----

const EMPTY_WATCHLIST_FORM = { address: "", label: "", reason: "" };

function WatchlistPanel() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_WATCHLIST_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const { sort, onSort } = useSort({ key: "createdAt", dir: "desc" });

  const [selected, setSelected] = useState<WatchlistEntry | null>(null);
  const [editForm, setEditForm] = useState({ label: "", reason: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  function load() {
    setLoading(true);
    fetchWatchlist()
      .then(setEntries)
      .catch((e) => setError(extractErrorMessage(e, "Failed to load watchlist.")))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? entries.filter((w) => w.address.toLowerCase().includes(q) || w.label.toLowerCase().includes(q))
      : entries;
    return sortRows(filtered, sort);
  }, [entries, search, sort]);

  function openEdit(w: WatchlistEntry) {
    setSelected(w);
    setEditForm({ label: w.label, reason: w.reason ?? "" });
    setEditError("");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const entry = await addWatchlistEntry({
        address: form.address.trim(),
        label: form.label.trim(),
        reason: form.reason.trim() || undefined,
      });
      setEntries((prev) => [entry, ...prev]);
      setForm(EMPTY_WATCHLIST_FORM);
      setShowForm(false);
    } catch (e) {
      setError(extractErrorMessage(e, "Failed to add watchlist entry."));
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setEditSaving(true);
    setEditError("");
    try {
      const updated = await updateWatchlistEntry(selected.id, {
        label: editForm.label.trim(),
        reason: editForm.reason.trim() || undefined,
      });
      setEntries((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      setSelected(null);
    } catch (e) {
      setEditError(extractErrorMessage(e, "Failed to save changes."));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleRemove(id: number) {
    if (!window.confirm("Remove this address from the watchlist?")) return;
    setBusyId(id);
    try {
      await removeWatchlistEntry(id);
      setEntries((prev) => prev.filter((w) => w.id !== id));
      setSelected(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 max-w-xl">
          An address matching an entry here forces any transaction touching it straight to CRITICAL risk —
          a hard compliance block, checked before the AI engine even runs.
        </p>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary shrink-0">
          <Plus className="h-4 w-4" />
          Add Address
        </button>
      </div>

      <SearchBox value={search} onChange={setSearch} placeholder="Search address or label..." />

      {error && <div className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

      {showForm && (
        <form onSubmit={handleAdd} className="surface-card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Address</label>
              <input
                className="field font-mono"
                placeholder="0x..."
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Label</label>
              <input
                className="field"
                placeholder="e.g. OFAC SDN List"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Reason (optional)</label>
              <input
                className="field"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Adding..." : "Add to Watchlist"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide bg-slate-100">
                  <SortableHeader label="Address" col="address" sort={sort} onSort={onSort} />
                  <SortableHeader label="Label" col="label" sort={sort} onSort={onSort} />
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <th className="px-5 py-3 font-semibold">Added By</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                      No addresses match.
                    </td>
                  </tr>
                ) : (
                  visible.map((w) => (
                    <tr
                      key={w.id}
                      onClick={() => openEdit(w)}
                      className="cursor-pointer odd:bg-white even:bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">{w.address}</td>
                      <td className="px-5 py-3 text-slate-700 font-medium">{w.label}</td>
                      <td className="px-5 py-3 text-slate-500">{w.reason ?? "—"}</td>
                      <td className="px-5 py-3 text-slate-500">{w.addedByName}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          disabled={busyId === w.id}
                          onClick={(e) => { e.stopPropagation(); handleRemove(w.id); }}
                          className="text-slate-500 hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SlideOver open={!!selected} title="Edit Watchlist Entry" description={selected?.address} onClose={() => setSelected(null)}>
        <form onSubmit={handleEditSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Label</label>
            <input className="field" value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Reason</label>
            <input className="field" value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} />
          </div>
          <p className="text-xs text-slate-500">The address itself can't be changed — remove and re-add if it's wrong.</p>
          {editError && <div className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{editError}</div>}
          <button type="submit" disabled={editSaving} className="btn-primary w-full">
            {editSaving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </SlideOver>
    </div>
  );
}

// ---- Recipient (wallet) accounts ----

const EMPTY_WALLET_FORM = { label: "", accountNumber: "", address: "", city: "", country: "", isActive: true };

function WalletsPanel() {
  const [wallets, setWallets] = useState<WalletAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const { sort, onSort } = useSort({ key: "label", dir: "asc" });

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_WALLET_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  function load() {
    setLoading(true);
    fetchAdminWallets()
      .then(setWallets)
      .catch((e) => setError(extractErrorMessage(e, "Failed to load recipient accounts.")))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? wallets.filter((w) => w.label.toLowerCase().includes(q) || w.accountNumber.includes(q) || w.city.toLowerCase().includes(q))
      : wallets;
    return sortRows(filtered, sort);
  }, [wallets, search, sort]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_WALLET_FORM);
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(w: WalletAccount) {
    setEditingId(w.id);
    setForm({ label: w.label, accountNumber: w.accountNumber, address: w.address, city: w.city, country: w.country, isActive: w.isActive });
    setFormError("");
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      if (editingId) {
        const updated = await updateWalletAccount(editingId, form);
        setWallets((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      } else {
        const created = await createWalletAccount(form);
        setWallets((prev) => [...prev, created]);
      }
      setFormOpen(false);
    } catch (e) {
      setFormError(extractErrorMessage(e, "Failed to save recipient account."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this recipient account? It will no longer appear in Send Transfer.")) return;
    setBusyId(id);
    try {
      await deleteWalletAccount(id);
      setWallets((prev) => prev.filter((w) => w.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 max-w-xl">
          Branch accounts available as settlement recipients in Send Transfer. Only active accounts appear there.
        </p>
        <button onClick={openCreate} className="btn-primary shrink-0">
          <Plus className="h-4 w-4" />
          Add Account
        </button>
      </div>

      <SearchBox value={search} onChange={setSearch} placeholder="Search label, account #, or city..." />

      {error && <div className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide bg-slate-100">
                  <SortableHeader label="Account Number" col="accountNumber" sort={sort} onSort={onSort} />
                  <SortableHeader label="Label" col="label" sort={sort} onSort={onSort} />
                  <SortableHeader label="Location" col="city" sort={sort} onSort={onSort} />
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-slate-500">No recipient accounts match.</td>
                  </tr>
                ) : (
                  visible.map((w) => (
                    <tr
                      key={w.id}
                      onClick={() => openEdit(w)}
                      className="cursor-pointer odd:bg-white even:bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">{w.accountNumber}</td>
                      <td className="px-5 py-3 text-slate-700 font-medium">{w.label}</td>
                      <td className="px-5 py-3 text-slate-500">{w.city}, {w.country}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          <Dot color={w.isActive ? "bg-emerald-500" : "bg-slate-400"} />
                          {w.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={(e) => { e.stopPropagation(); openEdit(w); }} className="text-slate-500 hover:text-brand-600">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            disabled={busyId === w.id}
                            onClick={(e) => { e.stopPropagation(); handleDelete(w.id); }}
                            className="text-slate-500 hover:text-red-600 disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SlideOver open={formOpen} title={editingId ? "Edit Recipient Account" : "Add Recipient Account"} onClose={() => setFormOpen(false)}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Label</label>
            <input className="field" placeholder="e.g. Karachi Branch" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Account Number</label>
            <input className="field font-mono" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Blockchain Address</label>
            <input className="field font-mono text-xs" placeholder="0x..." value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">City</label>
              <input className="field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Country</label>
              <input className="field" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} required />
            </div>
          </div>
          {editingId && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active (visible in Send Transfer)
            </label>
          )}
          {formError && <div className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</div>}
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? "Saving..." : editingId ? "Save Changes" : "Add Account"}
          </button>
        </form>
      </SlideOver>
    </div>
  );
}

// ---- Protocol Templates (delegates to the existing page) ----

function TemplatesPanel() {
  return (
    <div className="surface-card p-6 flex items-center justify-between">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Protocol Templates</h3>
        <p className="text-sm text-slate-500 mt-1">
          Manage the institutional templates the AI engine matches against.
        </p>
      </div>
      <Link to="/templates" className="btn-secondary">
        Open Templates
      </Link>
    </div>
  );
}

// ---- Credential vault (demo credentials, re-auth gated) ----

function CredentialVaultPanel() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<RevealedCredentials | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pinUserId, setPinUserId] = useState<number | "">("");
  const [pinValue, setPinValue] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSavedAt, setPinSavedAt] = useState<number | null>(null);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    setError("");
    try {
      const data = await revealDemoCredentials(password);
      setCredentials(data);
      setPassword("");
      fetchAdminUsers().then(setUsers).catch(() => {});
    } catch (e) {
      setError(extractErrorMessage(e, "Incorrect password."));
    } finally {
      setUnlocking(false);
    }
  }

  function handleLock() {
    setCredentials(null);
    setPassword("");
    setError("");
    setPinUserId("");
    setPinValue("");
    setPinError("");
    setPinSavedAt(null);
  }

  async function handleChangePin(e: React.FormEvent) {
    e.preventDefault();
    if (!pinUserId) return;
    setPinSaving(true);
    setPinError("");
    try {
      await setUserPin(pinUserId, pinValue);
      setPinValue("");
      setPinSavedAt(Date.now());
    } catch (e) {
      setPinError(extractErrorMessage(e, "Failed to change PIN."));
    } finally {
      setPinSaving(false);
    }
  }

  if (!credentials) {
    return (
      <div className="surface-card p-8 max-w-md mx-auto text-center space-y-4">
        <div className="h-12 w-12 rounded-lg bg-brand-500/15 text-brand-700 flex items-center justify-center mx-auto">
          <Lock className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Credential Vault</h3>
          <p className="text-sm text-slate-500 mt-1">
            Re-enter your own login password to reveal the seeded demo account credentials.
          </p>
        </div>
        <form onSubmit={handleUnlock} className="space-y-3 text-left">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className="field pr-10"
              placeholder="Your login password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {error && (
            <div className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
          )}
          <button type="submit" disabled={unlocking || !password} className="btn-primary w-full">
            <Lock className="h-4 w-4" />
            {unlocking ? "Verifying..." : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="surface-card p-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Demo Account Credentials</h3>
        <button onClick={handleLock} className="btn-secondary">
          <Lock className="h-4 w-4" />
          Lock
        </button>
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide bg-slate-100">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Password</th>
              <th className="px-4 py-3">Role</th>
            </tr>
          </thead>
          <tbody>
            {credentials.accounts.map((acc) => (
              <tr key={acc.email} className="odd:bg-white even:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{acc.email}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{acc.password}</td>
                <td className="px-4 py-3 text-slate-700">{acc.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-600">
        Transfer PIN for both accounts: <span className="font-mono font-semibold text-slate-900">{credentials.transferPin}</span>
      </p>

      <p className="text-xs text-slate-500">
        These credentials are only ever returned after re-verifying your own password, and only to an Admin.
      </p>

      <form onSubmit={handleChangePin} className="border-t border-line pt-5 space-y-3">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Change a User's Transfer PIN
        </label>
        <p className="text-xs text-slate-500">
          PIN changes are only available here, behind the same password re-check used to unlock this vault.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <select
            className="field"
            value={pinUserId}
            onChange={(e) => { setPinUserId(e.target.value ? Number(e.target.value) : ""); setPinSavedAt(null); }}
          >
            <option value="" className="bg-ink-800">Select a user...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id} className="bg-ink-800">{u.fullName} ({u.email})</option>
            ))}
          </select>
          <input
            inputMode="numeric"
            maxLength={6}
            placeholder="New PIN"
            className="field"
            value={pinValue}
            onChange={(e) => { setPinValue(e.target.value.replace(/\D/g, "")); setPinSavedAt(null); }}
          />
        </div>
        {pinError && (
          <div className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{pinError}</div>
        )}
        {pinSavedAt && Date.now() - pinSavedAt < 4000 && (
          <p className="text-xs text-emerald-600">PIN updated.</p>
        )}
        <button
          type="submit"
          disabled={pinSaving || !pinUserId || pinValue.length < 4}
          className="btn-secondary w-full"
        >
          <KeyRound className="h-4 w-4" />
          {pinSaving ? "Saving..." : "Change PIN"}
        </button>
      </form>
    </div>
  );
}
