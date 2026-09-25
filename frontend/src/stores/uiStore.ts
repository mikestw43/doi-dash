import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
}

type Language = 'en' | 'th';
type Theme = 'dark' | 'light';
type BotViewMode = 'card' | 'table';

interface UIState {
  toasts: Toast[];
  botFilter: { status: string; broker: string; search: string; sort: string; group: string };
  botViewMode: BotViewMode;
  activeTab: string;
  currentPage: 'dashboard' | 'profile' | 'settings' | 'admin' | 'analytics' | 'trade-history' | 'audit' | 'privacy' | 'calendar' | 'ea-repository' | 'announce' | 'download';
  language: Language;
  theme: Theme;
  /** Account the trade-history page should open filtered to, set by whoever
   *  navigates there. Consumed and cleared on arrival, and deliberately not
   *  persisted: it is a one-way handoff, not a saved preference. */
  tradeHistoryAccountId: string | null;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  setBotFilter: (filter: Partial<UIState['botFilter']>) => void;
  setBotViewMode: (mode: BotViewMode) => void;
  setActiveTab: (tab: string) => void;
  setCurrentPage: (page: UIState['currentPage']) => void;
  /** Go to the trade history already filtered to one account. */
  openTradeHistory: (accountId: string) => void;
  clearTradeHistoryAccount: () => void;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      toasts: [],
      botFilter: { status: 'all', broker: 'all', search: '', sort: 'name', group: 'all' },
      botViewMode: 'card',
      activeTab: 'overview',
      currentPage: 'dashboard',
      language: 'en',
      theme: 'dark',
      tradeHistoryAccountId: null,
      addToast: (toast) => {
        const id = Math.random().toString(36).slice(2);
        set(s => ({ toasts: [...s.toasts, { ...toast, id }] }));
        setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4000);
      },
      removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
      setBotFilter: (filter) => set(s => ({ botFilter: { ...s.botFilter, ...filter } })),
      setBotViewMode: (botViewMode) => set({ botViewMode }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setCurrentPage: (page) => set({ currentPage: page }),
      openTradeHistory: (accountId) =>
        set({ currentPage: 'trade-history', tradeHistoryAccountId: accountId }),
      clearTradeHistoryAccount: () => set({ tradeHistoryAccountId: null }),
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'onlyfunds_ui',
      partialize: (s) => ({
        botFilter: s.botFilter,
        botViewMode: s.botViewMode,
        language: s.language,
        theme: s.theme,
      }),
      // Normalize legacy 'hud' theme to 'dark' when rehydrating
      merge: (persistedState, currentState) => {
        const persisted = { ...(persistedState as Record<string, unknown> ?? {}) };
        if (persisted.theme !== 'dark' && persisted.theme !== 'light') persisted.theme = 'dark';
        return { ...currentState, ...persisted } as UIState;
      },
    }
  )
);
