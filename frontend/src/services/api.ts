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

/** What this account can be asked to trade: the broker's own list once the
 *  reporter has sent one, plus everything held or traded either way. The
 *  symbol box stays free text on top of these suggestions. */
export const fetchAccountSymbols = async (
  accountId: string,
): Promise<{ symbols: string[]; fromBroker: number }> => {
  const res = await api.get(`/accounts/${accountId}/symbols`);
  return {
    symbols: (res.data?.symbols ?? []) as string[],
    fromBroker: (res.data?.fromBroker ?? 0) as number,
  };
};

export const openTrade = async (
  accountId: string,
  data: {
    symbol: string;
    action: 'BUY' | 'SELL';
    volume: number;
    orderType?: 'market' | 'limit' | 'stop';
    price?: number;
    sl?: number;
    tp?: number;
  },
) => {
  const res = await api.post(`/accounts/${accountId}/open-trade`, data);
  return res.data as { message: string; commandId: string };
};

export interface CommandOutcome {
  commandId: string;
  type: string;
  detail: string | null;
  status: 'queued' | 'sent' | 'done' | 'failed' | 'dropped';
  result: string | null;
}

export const fetchCommand = async (accountId: string, commandId: string): Promise<CommandOutcome> => {
  const res = await api.get(`/accounts/${accountId}/commands/${commandId}`);
  return res.data as CommandOutcome;
};

/**
 * Wait for the EA's answer to one command.
 *
 * The button used to end at "queued", which is not an outcome: between it
 * and the broker the EA can refuse on its own limits and the broker can
 * refuse outright. This asks until the answer arrives — the round trip is
 * a push cycle, about two seconds — and gives up quietly after a while
 * rather than leaving a spinner forever.
 */
export const waitForCommand = async (
  accountId: string,
  commandId: string,
  timeoutMs = 20000,
): Promise<CommandOutcome | null> => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const outcome = await fetchCommand(accountId, commandId);
      if (outcome.status === 'done' || outcome.status === 'failed' || outcome.status === 'dropped') {
        return outcome;
      }
    } catch {
      return null;
    }
  }
  return null;
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

export interface EmailLogRow {
  id: string;
  to: string;
  subject: string;
  kind: string;
  status: string;
  detail: string | null;
  createdAt: string;
}

export const fetchEmailLog = async () => {
  const res = await api.get('/admin/email-log');
  return res.data as EmailLogRow[];
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

/** The symbols this user has closed a trade on, for the history filter. */
/** Ask for a reset link. Answers the same whether or not the address has an
 *  account — see the route for why — so there is nothing to branch on. */
export const forgotPassword = async (email: string): Promise<{ message: string }> => {
  const res = await api.post('/auth/forgot-password', { email });
  return res.data;
};

/** Whether a reset link is still good, so the page can say so before asking
 *  for a password rather than after. */
export const checkResetToken = async (token: string): Promise<{ valid: boolean }> => {
  const res = await api.get(`/auth/reset-password/${encodeURIComponent(token)}`);
  return res.data;
};

export const resetPassword = async (token: string, password: string): Promise<{ message: string }> => {
  const res = await api.post('/auth/reset-password', { token, password });
  return res.data;
};

export const fetchTradedSymbols = async (accountId?: string): Promise<string[]> => {
  const res = await api.get('/analytics/trades/symbols', { params: { accountId } });
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
export interface EaLinkDto {
  /** What it is — "Telegram group", "Manual". May be empty; then the URL shows. */
  label: string;
  url: string;
}

export interface EaItemDto {
  id: string;
  name: string;
  /** One or more — an entry is often an EA and its source at once. */
  type: string[];
  /** Untest | Waiting | OK | Other */
  status: string;
  description: string;
  /** Named links — vendor page, download, manual, chat group. */
  links: EaLinkDto[];
  /** Who wrote it. Free text. */
  developer: string;
  /** Flagged by hand: shown as a red bookmark in front of the name. */
  important: boolean;
  /** 1–5, or 0 for "not rated yet" — which is not the same as a bad score. */
  rating: number;
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
    'name' | 'status' | 'description' | 'developer' | 'important' | 'rating' | 'links'>>
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

// ── AI assistant ─────────────────────────────────────────────────────────────

export interface AiStatus {
  configured: boolean;
  provider: string;
  model: string | null;
}

export interface AiContext {
  accounts: number;
  online: number;
  openOrders: number;
  losingOrders: number;
  ordersWithoutStop: number;
  floating: number;
  todayPnl: number;
  closedTrades30d: number;
}

export interface AiSettings {
  provider: string;
  model: string;
  defaultModel: string;
  hasKey: boolean;
  keyHint: string | null;
  source: 'dashboard' | 'environment' | 'none';
  providers: string[];
  defaults: Record<string, string>;
}

export const fetchAiSettings = async (): Promise<AiSettings> => {
  const res = await api.get('/ai/settings');
  return res.data as AiSettings;
};

export const saveAiSettings = async (next: { provider?: string; model?: string; apiKey?: string }) => {
  const res = await api.put('/ai/settings', next);
  return res.data as { provider: string; model: string; hasKey: boolean; keyHint: string | null; source: string };
};

/** Ask the provider one cheap question, with a key that may not be saved
 *  yet — a mistake is better caught before it is stored. */
export const testAiSettings = async (next: { provider?: string; model?: string; apiKey?: string }) => {
  const res = await api.post('/ai/settings/test', next);
  return res.data as { ok: boolean; ms?: number; model?: string; said?: string; message?: string; detail?: string };
};

export const fetchAiStatus = async (): Promise<AiStatus> => {
  const res = await api.get('/ai/status');
  return res.data as AiStatus;
};

export const fetchAiContext = async (): Promise<AiContext> => {
  const res = await api.get('/ai/context');
  return res.data as AiContext;
};

/**
 * Ask a question, with photos and the conversation so far.
 *
 * The browser holds the conversation, so it goes back with each question —
 * text only. Old photos are not re-sent: the model has already been told
 * what was in them, and paying to re-read them every turn is how a chat
 * becomes expensive.
 */
export const askAi = async (
  message: string,
  images: string[] = [],
  history: { role: 'user' | 'assistant'; text: string }[] = [],
  language = 'en',
): Promise<{ reply: string; model?: string }> => {
  const res = await api.post('/ai/chat', {
    message,
    language,
    ...(images.length ? { images } : {}),
    ...(history.length ? { history } : {}),
  });
  return res.data as { reply: string; model?: string };
};
