import { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useUIStore } from './stores/uiStore';
import { useWebSocket } from './hooks/useWebSocket';
import { getProfile } from './services/api';
import { LoginPage } from './components/auth/LoginPage';
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

const Dashboard = () => {
  const token = useAuthStore(s => s.token);
  const currentPage = useUIStore(s => s.currentPage);
  useWebSocket(token);
  useThemeSync();

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
      <ToastContainer />
    </Layout>
  );
};

/** Shown while the persisted token is being validated. Anything is better
 *  than a blank page — a white screen gives the user nothing to report. */
const Booting = ({ slow }: { slow: boolean }) => (
  <div style={{
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '14px',
    fontFamily: 'var(--ff-body)', color: 'var(--text-secondary)',
  }}>
    <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--accent-blue)' }}>
      DOI DASH
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
  if (!isAuthenticated) return <LoginPage />;
  return <Dashboard />;
}

export default App;
