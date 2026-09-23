import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
  headers: { 'Content-Type': 'application/json' },
  // Without this a stalled backend leaves requests pending forever, and the
  // startup profile check never settles — the app renders a blank page.
  timeout: 20000,
});

// Attach token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('onlyfunds_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401 (expired/invalid token)
api.interceptors.response.use(
  res => res,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('onlyfunds_token');
      localStorage.removeItem('onlyfunds_auth');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// Auth
import type { AuthUser } from '../types';

export const login = async (email: string, password: string) => {
  const res = await api.post('/auth/login', { email, password });
  return res.data as { token: string; user: AuthUser };
};

/** Send Google OAuth access_token to backend; backend validates it +
 *  fetches the user profile from Google, then returns our own JWT. */
export const googleLogin = async (accessToken: string) => {
  const res = await api.post('/auth/google', { accessToken });
  return res.data as { token: string; user: AuthUser };
};

/** Link a Google account to the currently authenticated user. */
export const linkGoogle = async (accessToken: string): Promise<AuthUser> => {
  const res = await api.post('/auth/google/link', { accessToken });
  return res.data;
};

/** Unlink Google from the currently authenticated user. */
export const unlinkGoogle = async (): Promise<AuthUser> => {
  const res = await api.post('/auth/google/unlink');
  return res.data;
};

export const register = async (data: {
  email: string; password: string; name?: string; displayName?: string;
  mobile?: string; phoneCountry?: string;
}) => {
  const res = await api.post('/auth/register', data);
  return res.data as { message: string };
};

export const getProfile = async (): Promise<AuthUser> => {
  const res = await api.get('/auth/me');
  return res.data;
};

export const updateProfile = async (data: {
  name?: string; displayName?: string; email?: string;
  mobile?: string; phoneCountry?: string; timezone?: string;
}): Promise<AuthUser> => {
  const res = await api.patch('/auth/profile', data);
  return res.data;
};

export const changePassword = async (data: { currentPassword: string; newPassword: string }) => {
  const res = await api.post('/auth/change-password', data);
  return res.data;
};

// Accounts
export const fetchAccounts = async () => {
  const res = await api.get('/accounts');
  return res.data;
};

export const createAccount = async (data: {
  name: string; apiKey: string; isDemo?: boolean;
  broker?: string; accountNumber?: string; server?: string; currency?: string; leverage?: number;
}) => {
  const res = await api.post('/accounts', data);
  return res.data;
};

export const deleteAccount = async (id: string) => {
  const res = await api.delete(`/accounts/${id}`);
  return res.data;
};

export const revealApiKey = async (id: string): Promise<string> => {
  const res = await api.get(`/accounts/${id}/apikey`);
  return res.data.apiKey;
};

export const closeAllOrders = async (id: string) => {
  const res = await api.post(`/accounts/${id}/close-all`);
  return res.data;
};

export const openTrade = async (
  accountId: string,
  data: {
    symbol: string;
    action: 'BUY' | 'SELL';
    volume: number;
    price?: number;
    sl?: number;
    tp?: number;
    comment?: string;
  },
) => {
  const res = await api.post(`/accounts/${accountId}/open-trade`, data);
  return res.data as { message: string; commandId: string };
};

export const closePosition = async (accountId: string, ticket: number) => {
  const res = await api.post(`/accounts/${accountId}/close-position`, { ticket });
  return res.data as { message: string; commandId: string };
};

export const setPositionSLTP = async (
  accountId: string,
  ticket: number,
  sl: number,
  tp: number,
) => {
  const res = await api.post(`/accounts/${accountId}/set-sltp`, { ticket, sl, tp });
  return res.data as { message: string; commandId: string };
};

// Dashboard
export const fetchOverview = async () => {
  const res = await api.get('/dashboard/overview');
  return res.data;
};

export const fetchTodayPnl = async (): Promise<Record<string, number>> => {
  const res = await api.get('/dashboard/today-pnl');
  return res.data;
};

export const fetchEconomicCalendar = async (force = false) => {
  const url = force
    ? '/dashboard/economic-calendar?force=1'
    : '/dashboard/economic-calendar';
  const res = await api.get(url);
  return res.data;
};

export const fetchHeatmapAccounts = async () => {
  const res = await api.get('/dashboard/heatmap/accounts');
  return res.data;
};

export const fetchHeatmapOrders = async () => {
  const res = await api.get('/dashboard/heatmap/orders');
  return res.data;
};

export const fetchHeatmapPending = async () => {
  const res = await api.get('/dashboard/heatmap/pending');
  return res.data;
};

// Admin - User Management
export const fetchUsers = async () => {
  const res = await api.get('/admin/users');
  return res.data;
};

export const createUser = async (data: {
  email: string; password: string;
  name?: string; displayName?: string;
  mobile?: string; phoneCountry?: string;
  role?: string;
}) => {
  const res = await api.post('/admin/users', data);
  return res.data;
};

export const resetUserPassword = async (id: string) => {
  const res = await api.post(`/admin/users/${id}/reset-password`);
  return res.data as { newPassword: string; message: string };
};

export const deleteUser = async (id: string) => {
  const res = await api.delete(`/admin/users/${id}`);
  return res.data;
};

export const changeUserRole = async (id: string, role: string) => {
  const res = await api.patch(`/admin/users/${id}/role`, { role });
  return res.data;
};

export const changeUserStatus = async (id: string, status: 'active' | 'pending' | 'rejected' | 'suspended') => {
  const res = await api.patch(`/admin/users/${id}/status`, { status });
  return res.data;
};

// Telegram Settings
import type {
  TelegramSettings,
  AccountAlerts,
  EquitySnapshot,
  TradeHistoryResponse,
  DailyPnL,
  PerformanceMetrics,
  NotificationResponse,
  AccountGroup,
  ReportSettings,
  ProtectionSettings,
  AuditLogResponse,
  UserPreferences,
} from '../types';

export const getTelegramSettings = async (): Promise<TelegramSettings> => {
  const res = await api.get('/auth/telegram');
  return res.data;
};

export const saveTelegramSettings = async (data: {
  telegramBotToken?: string;
  telegramChatId?: string;
}) => {
  const res = await api.patch('/auth/telegram', data);
  return res.data as TelegramSettings;
};

export const testTelegramMessage = async () => {
  const res = await api.post('/auth/telegram/test');
  return res.data as { ok: boolean; message: string };
};

// Account Alerts
export const getAccountAlerts = async (accountId: string): Promise<AccountAlerts> => {
  const res = await api.get(`/accounts/${accountId}/alerts`);
  return res.data;
};

export const saveAccountAlerts = async (
  accountId: string,
  data: Omit<AccountAlerts, 'id'>,
): Promise<AccountAlerts> => {
  const res = await api.patch(`/accounts/${accountId}/alerts`, data);
  return res.data;
};

// --- Analytics ---

export const fetchEquityHistory = async (
  accountId: string,
  timeframe: '1D' | '1W' | '1M' | '3M' = '1M',
): Promise<EquitySnapshot[]> => {
  const res = await api.get(`/analytics/equity/${accountId}`, { params: { timeframe } });
  return res.data;
};

export const fetchTradeHistory = async (params: {
  accountId?: string;
  page?: number;
  limit?: number;
  symbol?: string;
  type?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
}): Promise<TradeHistoryResponse> => {
  const res = await api.get('/analytics/trades', { params });
  return res.data;
};

export const fetchDailyPnL = async (
  accountId?: string,
  period: '1M' | '3M' | '6M' = '3M',
): Promise<DailyPnL[]> => {
  const res = await api.get('/analytics/pnl', { params: { accountId, period } });
  return res.data;
};

export const fetchPerformanceMetrics = async (
  accountId?: string,
): Promise<PerformanceMetrics> => {
  const res = await api.get('/analytics/performance', { params: { accountId } });
  return res.data;
};

// --- Notifications ---

export const fetchNotifications = async (
  page = 1,
  limit = 25,
): Promise<NotificationResponse> => {
  const res = await api.get('/notifications', { params: { page, limit } });
  return res.data;
};

// --- Groups ---

export const fetchGroups = async (): Promise<AccountGroup[]> => {
  const res = await api.get('/groups');
  return res.data;
};

export const createGroup = async (name: string, color: string): Promise<AccountGroup> => {
  const res = await api.post('/groups', { name, color });
  return res.data;
};

export const updateGroupApi = async (
  id: string,
  data: { name?: string; color?: string },
): Promise<AccountGroup> => {
  const res = await api.patch(`/groups/${id}`, data);
  return res.data;
};

export const deleteGroupApi = async (id: string) => {
  const res = await api.delete(`/groups/${id}`);
  return res.data;
};

export const assignAccountGroup = async (
  accountId: string,
  groupId: string | null,
) => {
  const res = await api.patch(`/groups/assign/${accountId}`, { groupId });
  return res.data;
};

// --- Report Settings ---

export const fetchReportSettings = async (): Promise<ReportSettings> => {
  const res = await api.get('/settings/report');
  return res.data;
};

export const saveReportSettings = async (data: Partial<ReportSettings>): Promise<ReportSettings> => {
  const res = await api.patch('/settings/report', data);
  return res.data;
};

export const sendReportNow = async () => {
  const res = await api.post('/settings/report/send-now');
  return res.data;
};

// --- Drawdown Protection ---

export const fetchProtectionSettings = async (accountId: string): Promise<ProtectionSettings> => {
  const res = await api.get(`/settings/protection/${accountId}`);
  return res.data;
};

export const saveProtectionSettings = async (
  accountId: string,
  data: { protectionEnabled?: boolean; protectionDrawdown?: number | null },
): Promise<ProtectionSettings> => {
  const res = await api.patch(`/settings/protection/${accountId}`, data);
  return res.data;
};

// --- Audit Logs ---

export const fetchAuditLogs = async (params: {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
}): Promise<AuditLogResponse> => {
  const res = await api.get('/admin/audit', { params });
  return res.data;
};

export const fetchAuditActions = async (): Promise<string[]> => {
  const res = await api.get('/admin/audit/actions');
  return res.data;
};

// --- Preferences ---

export const fetchPreferences = async (): Promise<UserPreferences> => {
  const res = await api.get('/settings/preferences');
  return res.data;
};

export const savePreferences = async (data: Partial<UserPreferences>): Promise<UserPreferences> => {
  const res = await api.patch('/settings/preferences', data);
  return res.data;
};

// --- PDPA ---

// ── Market quotes (ticker bar) ────────────────────────────────────────────────
export interface MarketQuote {
  sym: string;
  price: number;
  chgPct: number | null;
  up: boolean | null;
}

export const fetchMarketQuotes = async (): Promise<MarketQuote[]> => {
  const res = await api.get<MarketQuote[]>('/market/quotes');
  return res.data;
};

// ── Ticker symbol preferences ────────────────────────────────────────────────
export const fetchTickerSymbols = async (): Promise<{ symbols: string[] }> => {
  const res = await api.get<{ symbols: string[] }>('/settings/ticker');
  return res.data;
};

export const saveTickerSymbols = async (symbols: string[]): Promise<{ symbols: string[] }> => {
  const res = await api.put<{ symbols: string[] }>('/settings/ticker', { symbols });
  return res.data;
};

export const exportMyData = async () => {
  const res = await api.get('/auth/my-data');
  return res.data;
};

export const deleteMyAccount = async () => {
  const res = await api.delete('/auth/my-account');
  return res.data;
};

export default api;

// ─── EA repository ───────────────────────────────────────────────────────────

export interface EaImageDto { id: string; filename: string; caption: string; size: number }
export interface EaFileDto { id: string; filename: string; label: string; size: number; createdAt: string }
export interface EaItemDto {
  id: string;
  name: string;
  /** One or more — an entry is often an EA and its source at once. */
  type: string[];
  /** Untest | Waiting | OK | Other */
  status: string;
  description: string;
  /** Where it came from. Empty when it was never filled in. */
  url: string;
  /** A second link — vendor page and download are rarely the same URL. */
  url2: string;
  /** Who wrote it. Free text. */
  developer: string;
  /** Flagged by hand: shown as a red mark in front of the name. */
  important: boolean;
  tags: string[];
  images: EaImageDto[];
  files: EaFileDto[];
  updatedAt: string;
}

export const fetchEaItems = async (): Promise<EaItemDto[]> => (await api.get('/ea')).data;

/**
 * Progress, 0..1, as the bytes go up.
 *
 * `total` is absent on some browsers and proxies, and a bar that never moves
 * is worse than none — callers get undefined then and show a busy state.
 */
export type UploadProgress = (fraction: number | undefined) => void;

const uploadConfig = (onProgress?: UploadProgress) => ({
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 120_000,
  onUploadProgress: onProgress
    ? (e: { loaded: number; total?: number }) =>
        onProgress(e.total ? Math.min(1, e.loaded / e.total) : undefined)
    : undefined,
});

export const createEaItem = async (form: FormData, onProgress?: UploadProgress): Promise<EaItemDto> =>
  (await api.post('/ea', form, uploadConfig(onProgress))).data;

/** The text fields only. Files are never part of this, so a mistyped edit
 *  cannot cost an upload. */
export const patchEaItem = async (
  id: string,
  fields: Partial<Pick<EaItemDto,
    'name' | 'status' | 'description' | 'url' | 'url2' | 'developer' | 'important'>>
    & { type?: string[]; tags?: string },
): Promise<EaItemDto> => (await api.patch(`/ea/${id}`, fields)).data;

/** Add attachments to an entry that already exists. */
export const addEaUploads = async (
  id: string, form: FormData, onProgress?: UploadProgress,
): Promise<EaItemDto> => (await api.post(`/ea/${id}/files`, form, uploadConfig(onProgress))).data;

export const setEaFileLabel = async (fileId: string, label: string): Promise<void> => {
  await api.patch(`/ea/files/${fileId}`, { label });
};
export const setEaImageCaption = async (imageId: string, caption: string): Promise<void> => {
  await api.patch(`/ea/images/${imageId}`, { caption });
};
export const deleteEaFile = async (fileId: string): Promise<void> => {
  await api.delete(`/ea/files/${fileId}`);
};
export const deleteEaImage = async (imageId: string): Promise<void> => {
  await api.delete(`/ea/images/${imageId}`);
};

export const deleteEaItem = async (id: string): Promise<void> => {
  await api.delete(`/ea/${id}`);
};

/**
 * Fetch bytes through axios so the Authorization header goes with them.
 *
 * The repository is login-only, and <img src> / <a href> cannot carry a header
 * — putting the token in the query string instead would leak it into logs and
 * referrers. Blob URLs keep it in the header where it belongs.
 */
const fetchBlobUrl = async (url: string): Promise<string> =>
  URL.createObjectURL((await api.get(url, { responseType: 'blob', timeout: 60_000 })).data);

export const fetchEaImageUrl = (imageId: string) => fetchBlobUrl(`/ea/images/${imageId}/raw`);

export const downloadEaFile = async (fileId: string, filename: string): Promise<void> => {
  const href = await fetchBlobUrl(`/ea/files/${fileId}/download`);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
};
