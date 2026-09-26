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
  /** The assistant is a sheet over whatever page you are on, not a page. */
  aiOpen: boolean;
  setAiOpen: (open: boolean) => void;
  /**
   * The conversation, kept out here rather than inside the sheet.
   *
   * The sheet unmounts when it closes, so anything it held went with it —
   * close it to look at a position and the exchange you were in the middle
   * of was gone. Held for the session; a reload still starts fresh, and
   * conversations that survive that belong on the server, with the model.
   */
  aiMessages: { id: number; who: 'me' | 'ai'; text: string; images?: string[] }[];
  addAiMessage: (m: { who: 'me' | 'ai'; text: string; images?: string[] }) => void;
  clearAiMessages: () => void;
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
      aiOpen: false,
      aiMessages: [],
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
      setAiOpen: (open) => set({ aiOpen: open }),
      addAiMessage: (m) => set(state => ({
        aiMessages: [...state.aiMessages, { ...m, id: Date.now() + state.aiMessages.length }],
      })),
      clearAiMessages: () => set({ aiMessages: [] }),
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
