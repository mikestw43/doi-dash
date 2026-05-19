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
          {/* ── Chart Box ── */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', padding: '14px 16px' }}>
            <TradingViewChart />
          </div>
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

function App() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const logout = useAuthStore(s => s.logout);
  const [ready, setReady] = useState(false);

  // Validate persisted token on startup
  useEffect(() => {
    if (!isAuthenticated) {
      setReady(true);
      return;
    }
    getProfile()
      .then(() => setReady(true))
      .catch(() => {
        logout();
        setReady(true);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null;
  if (!isAuthenticated) return <LoginPage />;
  return <Dashboard />;
}

export default App;
