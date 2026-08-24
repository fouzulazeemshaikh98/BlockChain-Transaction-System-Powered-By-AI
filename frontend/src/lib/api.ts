import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5199";

const client = axios.create({ baseURL: API_BASE_URL });

const TOKEN_KEY = "abs_token";
const USER_KEY = "abs_user";

// "Stay signed in" controls which storage the session lands in:
// localStorage survives closing the browser, sessionStorage clears the
// moment the tab/browser does - the same distinction PayPal's "not
// recommended on shared devices" copy is warning about. Reads check both,
// since either could hold the live session depending on that choice.
function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearSession();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

function extractErrorMessage(err: any, fallback: string): string {
  const data = err?.response?.data;
  if (typeof data === "string") return data;
  if (data?.title) return data.title;
  if (data?.errors) return Object.values(data.errors).flat().join(" ");
  return err?.message ?? fallback;
}

export { extractErrorMessage };

// ---- Types ----

export type UserRole = "Admin" | "Analyst" | "User";

export interface AuthUser {
  fullName: string;
  email: string;
  role: UserRole;
}

export type RiskLevel = "VERIFIED" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type TransactionStatus = "Pending" | "Analyzing" | "Verified" | "Flagged" | "Rejected";

export interface TransactionResponse {
  id: number;
  transactionHash: string;
  network: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  gasUsed: number;
  gasPrice: number;
  nonce: number;
  timestamp: string;
  contractAddress?: string | null;
  functionName?: string | null;
  description?: string | null;
  status: TransactionStatus;
  createdAt: string;
  userId: number;
  finalRiskScore?: number | null;
  riskLevel?: RiskLevel | null;

  nocDocumentId?: number | null;
  recipientAddress?: string | null;
  recipientLabel?: string | null;
  settlementStatus: "NotAttempted" | "Executed" | "Failed" | "Blocked";
  settlementTxHash?: string | null;
  settlementError?: string | null;

  approvedByName?: string | null;
  approvedAt?: string | null;
}

export interface CreateTransactionPayload {
  transactionHash: string;
  network: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  gasUsed: number;
  gasPrice: number;
  nonce: number;
  contractAddress?: string;
  functionName?: string;
  description?: string;
  rawData?: string;
}

export interface AnomalyResponse {
  type: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  confidence: number;
  description: string;
  evidence: string;
}

export interface AnalysisResponse {
  transactionId: number;
  semanticScore: number;
  templateScore: number;
  forensicScore: number;
  behavioralScore: number;
  finalRiskScore: number;
  riskLevel: RiskLevel;
  recommendation: string;
  matchedTemplateName?: string | null;
  templateSimilarityScore?: number | null;
  templateIsMatch?: boolean | null;
  templateDeviations: string[];
  anomalies: AnomalyResponse[];
  createdAt: string;
}

export interface ReportResponse {
  transaction: TransactionResponse;
  analysis: AnalysisResponse | null;
}

export interface DashboardSummaryResponse {
  totalTransactions: number;
  verifiedTransactions: number;
  highRiskTransactions: number;
  averageRiskScore: number;
  recentTransactions: TransactionResponse[];
}

export interface ProtocolTemplateResponse {
  id: number;
  name: string;
  network: string;
  description?: string | null;
  expectedContracts: string[];
  expectedFunctions: string[];
  expectedRoutingPath: string[];
  isActive: boolean;
  createdAt: string;
}

// ---- Auth ----

function storeSession(
  data: { token: string; fullName: string; email: string; role: UserRole },
  remember = true
): AuthUser {
  clearSession();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, data.token);
  const user: AuthUser = { fullName: data.fullName, email: data.email, role: data.role };
  storage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export async function login(email: string, password: string, remember = true): Promise<AuthUser> {
  const { data } = await client.post("/api/auth/login", { email, password });
  return storeSession(data, remember);
}

/// Supervisor-override check for the DevTools-restriction overlay -
/// verifies {email, pin} belongs to an active Admin without touching the
/// caller's own session.
export async function verifyAdminPin(email: string, pin: string): Promise<void> {
  await client.post("/api/auth/verify-admin-pin", { email, pin });
}

export interface RegisterResult {
  email: string;
  message: string;
  devVerificationCode: string;
}

/// Registration no longer logs the user in directly - it creates the
/// account (unverified) and returns the simulated "email" (a dev-mode
/// verification code, since no SMTP is configured) instead of a token.
export async function register(
  fullName: string,
  email: string,
  password: string,
  confirmPassword: string,
  pin: string,
  confirmPin: string
): Promise<RegisterResult> {
  const { data } = await client.post("/api/auth/register", {
    fullName,
    email,
    password,
    confirmPassword,
    pin,
    confirmPin,
  });
  return data;
}

export async function verifyEmail(email: string, code: string): Promise<AuthUser> {
  const { data } = await client.post("/api/auth/verify-email", { email, code });
  return storeSession(data);
}

export async function resendVerification(email: string): Promise<RegisterResult> {
  const { data } = await client.post("/api/auth/resend-verification", { email });
  return data;
}

export function logout() {
  clearSession();
}

export function getCurrentUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export interface ProfileResponse {
  id: number;
  fullName: string;
  email: string;
  role: UserRole;
  accountNumber: string;
  createdAt: string;
}

export async function fetchProfile(): Promise<ProfileResponse> {
  const { data } = await client.get("/api/auth/profile");
  return data;
}

// ---- Transactions ----

export async function createTransaction(payload: CreateTransactionPayload): Promise<TransactionResponse> {
  const { data } = await client.post("/api/transactions", payload);
  return data;
}

export async function fetchTransactions(): Promise<TransactionResponse[]> {
  const { data } = await client.get("/api/transactions");
  return data;
}

export async function fetchTransaction(id: number): Promise<TransactionResponse> {
  const { data } = await client.get(`/api/transactions/${id}`);
  return data;
}

export async function updateTransaction(
  id: number,
  payload: CreateTransactionPayload
): Promise<TransactionResponse> {
  const { data } = await client.put(`/api/transactions/${id}`, payload);
  return data;
}

export async function deleteTransaction(id: number): Promise<void> {
  await client.delete(`/api/transactions/${id}`);
}

export async function analyzeTransaction(id: number): Promise<AnalysisResponse> {
  const { data } = await client.post(`/api/transactions/${id}/analyze`);
  return data;
}

export async function reanalyzeTransaction(id: number): Promise<AnalysisResponse> {
  const { data } = await client.post(`/api/transactions/${id}/reanalyze`);
  return data;
}

// ---- Reports ----

export async function fetchReport(transactionId: number): Promise<ReportResponse> {
  const { data } = await client.get(`/api/reports/${transactionId}`);
  return data;
}

// ---- Dashboard ----

export async function fetchDashboardSummary(): Promise<DashboardSummaryResponse> {
  const { data } = await client.get("/api/dashboard/summary");
  return data;
}

// ---- Templates ----

export async function fetchTemplates(): Promise<ProtocolTemplateResponse[]> {
  const { data } = await client.get("/api/templates");
  return data;
}

export async function createTemplate(payload: {
  name: string;
  network: string;
  description?: string;
  expectedContracts: string[];
  expectedFunctions: string[];
  expectedRoutingPath: string[];
}): Promise<ProtocolTemplateResponse> {
  const { data } = await client.post("/api/templates", payload);
  return data;
}

export async function deleteTemplate(id: number): Promise<void> {
  await client.delete(`/api/templates/${id}`);
}

// ---- NOC-gated transfer flow ----

export interface NocExtractedFields {
  applicantName?: string | null;
  originCity?: string | null;
  originCountry?: string | null;
  destinationCity?: string | null;
  destinationCountry?: string | null;
  issuingAuthority?: string | null;
  issueDate?: string | null;
  authorizedAmount?: number | null;
  rawText: string;
}

export interface NocDocumentSummary {
  id: number;
  fileName: string;
  verdict: string;
  authenticityScore: number;
  riskScore: number;
  applicantName?: string | null;
  originCity?: string | null;
  originCountry?: string | null;
  destinationCity?: string | null;
  destinationCountry?: string | null;
  authorizedAmount?: number | null;
  monthlyUsed: number;
  monthlyRemaining?: number | null;
  createdAt: string;
}

export interface NocStampAnalysis {
  stampDetected: boolean;
  boundingBox?: number[] | null;
  circularity?: number | null;
  colorLabel?: string | null;
}

export interface NocForensicFlag {
  code: string;
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface NocVerificationResponse {
  nocDocumentId: number;
  verdict: "genuine" | "suspicious" | "forged";
  authenticityScore: number;
  riskScore: number;
  transferUnlocked: boolean;
  fields: NocExtractedFields;
  stamp: NocStampAnalysis;
  flags: NocForensicFlag[];
  cnnForgedProbability?: number | null;
  cnnHeatmap?: string | null;
  monthlyUsed: number;
  monthlyRemaining?: number | null;
}

export interface DemoWallet {
  label: string;
  address: string;
  accountNumber: string;
  city: string;
  country: string;
}

export interface SettlementResponse {
  transactionId: number;
  settlementStatus: "NotAttempted" | "Executed" | "Failed" | "Blocked";
  settlementTxHash?: string | null;
  settlementError?: string | null;
}

export async function verifyNoc(file: File, pin: string): Promise<NocVerificationResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("pin", pin);
  const { data } = await client.post("/api/noc/verify", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function fetchNocHistory(): Promise<NocDocumentSummary[]> {
  const { data } = await client.get("/api/noc");
  return data;
}

export interface NocDocumentDetail {
  id: number;
  fileName: string;
  verdict: string;
  authenticityScore: number;
  riskScore: number;
  applicantName?: string | null;
  originCity?: string | null;
  originCountry?: string | null;
  destinationCity?: string | null;
  destinationCountry?: string | null;
  authorizedAmount?: number | null;
  monthlyUsed: number;
  monthlyRemaining?: number | null;
  transferUnlocked: boolean;
}

/// Used to refresh the remaining monthly limit after a settlement -
/// GET /api/noc/{id} recomputes MonthlyUsed/MonthlyRemaining live, so this
/// always reflects the latest state rather than the NOC-verify-time snapshot.
export async function fetchNocDocument(id: number): Promise<NocDocumentDetail> {
  const { data } = await client.get(`/api/noc/${id}`);
  return data;
}

export async function fetchWallets(): Promise<DemoWallet[]> {
  const { data } = await client.get("/api/wallets");
  return data;
}

export interface CreateTransferPayload {
  nocDocumentId: number;
  transactionHash: string;
  network: string;
  fromAddress: string;
  recipientAddress: string;
  recipientLabel: string;
  amount: number;
  gasUsed: number;
  gasPrice: number;
  nonce: number;
  contractAddress?: string;
  functionName?: string;
  description?: string;
  rawData?: string;
  pin: string;
}

export async function createTransfer(payload: CreateTransferPayload): Promise<TransactionResponse> {
  const { data } = await client.post("/api/transactions/transfer", payload);
  return data;
}

export async function settleTransaction(id: number, pin: string): Promise<SettlementResponse> {
  const { data } = await client.post(`/api/transactions/${id}/settle`, { pin });
  return data;
}

export async function approveTransaction(id: number, pin: string): Promise<TransactionResponse> {
  const { data } = await client.post(`/api/transactions/${id}/approve`, { pin });
  return data;
}

// ---- Admin ----

export interface AdminOverview {
  totalUsers: number;
  activeUsers: number;
  adminCount: number;
  totalAiCalls: number;
  failedAiCalls: number;
}

export interface AdminUser {
  id: number;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface AdminLog {
  id: number;
  transactionId: number;
  transactionHash?: string | null;
  moduleName: string;
  status: "Success" | "Error";
  processingTimeMs: number;
  createdAt: string;
  requestPayload: string;
  responsePayload: string;
}

export interface AdminLogPage {
  items: AdminLog[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface RiskThresholds {
  verified: number;
  low: number;
  medium: number;
  high: number;
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const { data } = await client.get("/api/admin/overview");
  return data;
}

export interface AdminLoginAttempt {
  id: number;
  email: string;
  success: boolean;
  failureReason?: string | null;
  ipAddress?: string | null;
  device: string;
  context: string;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  attemptedAt: string;
}

export interface AdminLoginAttemptPage {
  items: AdminLoginAttempt[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export async function fetchLoginAttempts(page = 1, pageSize = 25): Promise<AdminLoginAttemptPage> {
  const { data } = await client.get("/api/admin/login-attempts", { params: { page, pageSize } });
  return data;
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { data } = await client.get("/api/admin/users");
  return data;
}

export async function setUserActive(id: number, isActive: boolean): Promise<AdminUser> {
  const { data } = await client.put(`/api/admin/users/${id}/status`, { isActive });
  return data;
}

export async function setUserRole(id: number, role: UserRole): Promise<AdminUser> {
  const { data } = await client.put(`/api/admin/users/${id}/role`, { role });
  return data;
}

export async function setUserPin(id: number, pin: string): Promise<void> {
  await client.put(`/api/admin/users/${id}/pin`, { pin });
}

export interface DemoCredential {
  email: string;
  password: string;
  role: string;
}

export interface RevealedCredentials {
  accounts: DemoCredential[];
  transferPin: string;
}

export async function revealDemoCredentials(password: string): Promise<RevealedCredentials> {
  const { data } = await client.post("/api/admin/vault/demo-credentials", { password });
  return data;
}

export async function createAdminUser(payload: {
  fullName: string;
  email: string;
  password: string;
  pin: string;
  role: UserRole;
}): Promise<AdminUser> {
  const { data } = await client.post("/api/admin/users", payload);
  return data;
}

export async function deleteAdminUser(id: number): Promise<void> {
  await client.delete(`/api/admin/users/${id}`);
}

export async function fetchAdminLogs(page = 1, pageSize = 25, status?: string): Promise<AdminLogPage> {
  const { data } = await client.get("/api/admin/logs", { params: { page, pageSize, status } });
  return data;
}

export async function fetchRiskThresholds(): Promise<RiskThresholds> {
  const { data } = await client.get("/api/admin/settings");
  return data;
}

export async function updateRiskThresholds(thresholds: RiskThresholds): Promise<RiskThresholds> {
  const { data } = await client.put("/api/admin/settings", thresholds);
  return data;
}

export interface WatchlistEntry {
  id: number;
  address: string;
  label: string;
  reason?: string | null;
  addedByName: string;
  createdAt: string;
}

export async function fetchWatchlist(): Promise<WatchlistEntry[]> {
  const { data } = await client.get("/api/admin/watchlist");
  return data;
}

export async function addWatchlistEntry(payload: {
  address: string;
  label: string;
  reason?: string;
}): Promise<WatchlistEntry> {
  const { data } = await client.post("/api/admin/watchlist", payload);
  return data;
}

export async function updateWatchlistEntry(
  id: number,
  payload: { label: string; reason?: string }
): Promise<WatchlistEntry> {
  const { data } = await client.put(`/api/admin/watchlist/${id}`, payload);
  return data;
}

export async function removeWatchlistEntry(id: number): Promise<void> {
  await client.delete(`/api/admin/watchlist/${id}`);
}

// ---- Recipient (wallet) accounts ----

export interface WalletAccount {
  id: number;
  label: string;
  accountNumber: string;
  address: string;
  city: string;
  country: string;
  isActive: boolean;
  createdAt: string;
}

export interface WalletAccountPayload {
  label: string;
  accountNumber: string;
  address: string;
  city: string;
  country: string;
  isActive?: boolean;
}

export async function fetchAdminWallets(): Promise<WalletAccount[]> {
  const { data } = await client.get("/api/admin/wallets");
  return data;
}

export async function createWalletAccount(payload: WalletAccountPayload): Promise<WalletAccount> {
  const { data } = await client.post("/api/admin/wallets", payload);
  return data;
}

export async function updateWalletAccount(id: number, payload: WalletAccountPayload): Promise<WalletAccount> {
  const { data } = await client.put(`/api/admin/wallets/${id}`, payload);
  return data;
}

export async function deleteWalletAccount(id: number): Promise<void> {
  await client.delete(`/api/admin/wallets/${id}`);
}

// ---- Dashboard trend ----

export interface DashboardTrendPoint {
  date: string;
  transactionCount: number;
  averageRiskScore?: number | null;
}

export async function fetchDashboardTrend(days = 30): Promise<DashboardTrendPoint[]> {
  const { data } = await client.get("/api/dashboard/trend", { params: { days } });
  return data;
}
