import { Component, useEffect, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useAuthStore } from './stores/authStore';
import { useUIStore } from './stores/uiStore';
import { useWebSocket } from './hooks/useWebSocket';
import { getProfile } from './services/api';
import { LoginPage } from './components/auth/LoginPage';
import { ResetPasswordPage } from './components/auth/ResetPasswordPage';
import { Layout } from './components/layout/Layout';

import { OverviewTabs } from './components/overview/OverviewTabs';
import { BotList } from './components/bots/BotList';
import { ProfilePage } from './components/profile/ProfilePage';
import { SettingsPage } from './components/settings/SettingsPage';
import { UserManagement } from './components/admin/UserManagement';
import { AuditLogViewer } from './components/admin/AuditLogViewer';
import { AnalyticsPage } from './components/analytics/AnalyticsPage';
import { TradeHistoryPage } from './components/trades/TradeHistoryPage';
import { PrivacyPolicy } from './components/privacy/PrivacyPolicy';
import { EconomicCalendar } from './components/calendar/EconomicCalendar';
import { EaRepository } from './components/ea/EaRepository';
import { DownloadPage } from './components/download/DownloadPage';
import { AnnouncePage } from './components/admin/AnnouncePage';
import { TradingViewChart } from './components/chart/TradingViewChart';
import { AiPage, AiFab } from './components/ai/AiPage';
import { ToastContainer } from './components/ui/Toast';

/** Sync theme class on <html> element */
const useThemeSync = () => {
  const theme = useUIStore(s => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light', 'hud');
    if (theme === 'light') root.classList.add('light');
    else root.classList.add('dark');
  }, [theme]);
};

/** Keep <html lang> honest — it drives font selection, hyphenation and
 *  screen readers, and gives CSS a hook for per-language typography. */
const useLanguageSync = () => {
  const language = useUIStore(s => s.language);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
};

const Dashboard = () => {
  const token = useAuthStore(s => s.token);
  const currentPage = useUIStore(s => s.currentPage);
  useWebSocket(token);
  useThemeSync();
  useLanguageSync();

  return (
    <Layout>
      {currentPage === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* ── Portfolio (section header outside box, see OverviewTabs) ── */}
          <OverviewTabs />
          {/* ── Chart — manages its own border, no outer wrapper ── */}
          <TradingViewChart />
          {/* ── Accounts Boxes (MY ACCOUNTS + DEMO) ── */}
          <BotList />
        </div>
      )}
      {currentPage === 'analytics' && <AnalyticsPage />}
      {currentPage === 'trade-history' && <TradeHistoryPage />}
      {currentPage === 'profile' && <ProfilePage />}
      {currentPage === 'settings' && <SettingsPage />}
      {currentPage === 'admin' && <UserManagement />}
      {currentPage === 'audit' && <AuditLogViewer />}
      {currentPage === 'privacy' && <PrivacyPolicy />}
      {currentPage === 'calendar' && <EconomicCalendar />}
      {currentPage === 'ea-repository' && <EaRepository />}
      {currentPage === 'download' && <DownloadPage />}
      {currentPage === 'announce' && <AnnouncePage />}
      {currentPage === 'ai' && <AiPage />}
      <AiFab hidden={currentPage === 'ai'} onClick={() => useUIStore.getState().setCurrentPage('ai')} />
      <ToastContainer />
    </Layout>
  );
};

/** Catches a crash in any component below it. Without this React unmounts
 *  the whole tree and leaves a blank page, which tells the user nothing and
 *  leaves them no way to report what happened. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[OnlyFunds] render crash:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', padding: '32px', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: '16px',
        fontFamily: 'var(--ff-body)', color: 'var(--text-primary)',
      }}>
        <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--danger)' }}>
          SOMETHING BROKE
        </div>
        <div style={{
          border: '1px solid var(--danger)', background: 'var(--bg-card)',
          padding: '16px', fontSize: 'var(--fs-body)', overflowX: 'auto',
        }}>
          <div style={{ color: 'var(--warning)', marginBottom: '10px' }}>{error.message}</div>
          <pre style={{
            margin: 0, whiteSpace: 'pre-wrap', fontSize: 'var(--fs-body-sm)',
            color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            {(error.stack || '').split('\n').slice(0, 12).join('\n')}
          </pre>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              padding: '10px 16px', background: 'var(--accent-blue)',
              color: '#212327', border: 'none', cursor: 'pointer',
            }}
          >
            RELOAD
          </button>
          <button
            onClick={() => {
              // Corrupted saved state is the usual cause; start from clean.
              try { localStorage.clear(); } catch { /* private mode */ }
              window.location.reload();
            }}
            style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              padding: '10px 16px', background: 'transparent',
              color: 'var(--text-secondary)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}
          >
            CLEAR DATA + RELOAD
          </button>
        </div>
      </div>
    );
  }
}

/** Shown while the persisted token is being validated. Anything is better
 *  than a blank page — a white screen gives the user nothing to report. */
const Booting = ({ slow }: { slow: boolean }) => (
  <div style={{
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '14px',
    fontFamily: 'var(--ff-body)', color: 'var(--text-secondary)',
  }}>
    <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--accent-blue)' }}>
      OnlyFunds
    </div>
    <div style={{ fontSize: 'var(--fs-body)' }}>Loading…</div>
    {slow && (
      <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--warning)', textAlign: 'center', maxWidth: '320px' }}>
        The server is not responding. Check that the backend is running,
        then reload this page.
      </div>
    )}
  </div>
);

function App() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  /**
   * The reset link from the email arrives as a path with a token on it, and
   * the app has no router — so it is read once here, straight from the
   * address bar, and takes precedence over everything: somebody following
   * that link may well already be signed in on this device, and the point of
   * the link is that they cannot sign in.
   */
  const [resetToken, setResetToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    return window.location.pathname.startsWith('/reset-password') && token ? token : null;
  });
  const clearResetToken = () => {
    // Take the token out of the address bar so a reload, or a shoulder, does
    // not get a second look at it.
    window.history.replaceState({}, '', '/');
    setResetToken(null);
  };
  const logout = useAuthStore(s => s.logout);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);

  // Validate persisted token on startup
  useEffect(() => {
    if (!isAuthenticated) {
      setReady(true);
      return;
    }
    // Say something if the check drags on, and never let it block forever:
    // an unreachable backend used to leave the app stuck rendering nothing.
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    const giveUp = setTimeout(() => setReady(true), 25000);
    getProfile()
      .then(() => setReady(true))
      .catch(() => {
        logout();
        setReady(true);
      })
      .finally(() => {
        clearTimeout(slowTimer);
        clearTimeout(giveUp);
      });
    return () => {
      clearTimeout(slowTimer);
      clearTimeout(giveUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <Booting slow={slow} />;
  return (
    <ErrorBoundary>
      {resetToken
        ? <ResetPasswordPage token={resetToken} onDone={clearResetToken} />
        : isAuthenticated ? <Dashboard /> : <LoginPage />}
    </ErrorBoundary>
  );
}

export default App;
