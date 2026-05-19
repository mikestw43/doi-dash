import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '../../stores/uiStore';
import {
  getTelegramSettings, saveTelegramSettings, testTelegramMessage,
  fetchNotifications,
} from '../../services/api';
import { exportToCSV } from '../../utils/export';
import { AccountsSection } from '../accounts/AccountsSection';
import { ReportSettings } from './ReportSettings';
import { TickerSettings } from './TickerSettings';
import type { NotificationLogEntry } from '../../types';

type Tab = 'account' | 'telegram' | 'reports' | 'ticker' | 'notifications';

/* ── shared styles ────────────────────────────────────── */
const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border2)',
  padding: '20px 22px',
};
const cardTitle: React.CSSProperties = {
  fontFamily: "'Press Start 2P'", fontSize: 'var(--fs-section)',
  color: 'var(--cyan)', letterSpacing: '1px',
  marginBottom: '14px',
};
const lbl: React.CSSProperties = {
  fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-label)', color: 'var(--text-dim)',
  letterSpacing: '.5px', display: 'block', marginBottom: '6px',
};
const inp: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-input)',
  padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
};
const btnPrimary = (disabled = false): React.CSSProperties => ({
  fontFamily: "'Press Start 2P'", fontSize: 'var(--fs-section)', letterSpacing: '.5px',
  padding: '9px 16px', background: 'var(--cyan)', color: '#0c1422',
  border: '1px solid var(--cyan)', cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? .5 : 1, boxShadow: disabled ? 'none' : '0 0 8px rgba(56,189,248,.4)',
});
const btnGhost: React.CSSProperties = {
  fontFamily: "'Press Start 2P'", fontSize: 'var(--fs-section)', letterSpacing: '.5px',
  padding: '9px 16px', background: 'none', color: 'var(--text)',
  border: '1px solid var(--border2)', cursor: 'pointer',
};

const TABS: { key: Tab; symbol: string; label: string }[] = [
  { key: 'account',       symbol: '◈', label: 'Account' },
  { key: 'telegram',      symbol: '✈', label: 'Telegram' },
  { key: 'reports',       symbol: '▤', label: 'Reports' },
  { key: 'ticker',        symbol: '▦', label: 'Ticker' },
  { key: 'notifications', symbol: '◉', label: 'Notifications' },
];

export const SettingsPage = () => {
  const setCurrentPage = useUIStore(s => s.setCurrentPage);
  const [tab, setTab] = useState<Tab>('account');

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Back bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <button
          onClick={() => setCurrentPage('dashboard')}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', color: 'var(--cyan)',
            fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-label)',
            letterSpacing: '.5px', cursor: 'pointer',
          }}
        >
          ‹ BACK
        </button>
        <span style={{ width: '6px', height: '6px', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)' }} />
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: 'var(--fs-title)', color: 'var(--cyan)', letterSpacing: '2px', textShadow: '0 0 12px rgba(56,189,248,.8)' }}>
          SETTINGS
        </span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border2)' }} />
      </div>

      <div className="settings-layout" style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr',
        gap: '12px',
        alignItems: 'flex-start',
      }}>
        {/* Left nav */}
        <div className="settings-nav" style={{
          background: 'var(--bg-card)', border: '1px solid var(--border2)',
          padding: '8px',
          display: 'flex', flexDirection: 'column', gap: '2px',
          position: 'sticky', top: '12px',
        }}>
          {TABS.map(({ key, symbol, label }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  width: '100%', padding: '9px 12px',
                  fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-body)',
                  color: active ? 'var(--cyan)' : 'var(--text-dim)',
                  background: active ? 'rgba(56,189,248,.08)' : 'none',
                  border: `1px solid ${active ? 'var(--cyan)' : 'transparent'}`,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all .15s',
                }}
              >
                <span style={{ fontSize: '13px', lineHeight: 1 }}>{symbol}</span>
                {label}
              </button>
            );
          })}
        </div>

        {/* Right content */}
        <div className="settings-body">
          {tab === 'account'       && <AccountsSection />}
          {tab === 'telegram'      && <TelegramTab />}
          {tab === 'reports'       && <ReportSettings />}
          {tab === 'ticker'        && <TickerSettings />}
          {tab === 'notifications' && <NotificationsTab />}
        </div>
      </div>

      {/* Mobile responsive: stack nav above content */}
      <style>{`
        @media (max-width: 768px) {
          .settings-layout {
            grid-template-columns: 1fr !important;
          }
          .settings-nav {
            flex-direction: row !important;
            overflow-x: auto;
            position: static !important;
          }
        }
      `}</style>
    </div>
  );
};

/* ── Telegram tab ─────────────────────────────────────── */
const TelegramTab = () => {
  const addToast = useUIStore(s => s.addToast);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [savingTg, setSavingTg] = useState(false);
  const [testingTg, setTestingTg] = useState(false);

  const { data: tgData, refetch: refetchTg } = useQuery({
    queryKey: ['telegram-settings'],
    queryFn: getTelegramSettings,
  });

  useEffect(() => { if (tgData?.telegramChatId) setChatId(tgData.telegramChatId); }, [tgData]);

  const handleSave = async () => {
    setSavingTg(true);
    try {
      const payload: { telegramBotToken?: string; telegramChatId?: string } = { telegramChatId: chatId || undefined };
      if (botToken && !botToken.startsWith('●')) payload.telegramBotToken = botToken;
      await saveTelegramSettings(payload);
      refetchTg(); setBotToken('');
      addToast({ type: 'success', title: 'Telegram settings saved' });
    } catch { addToast({ type: 'error', title: 'Failed to save Telegram settings' }); }
    finally { setSavingTg(false); }
  };

  const handleTest = async () => {
    setTestingTg(true);
    try {
      const res = await testTelegramMessage();
      addToast({ type: 'success', title: res.message });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Test failed';
      addToast({ type: 'error', title: msg });
    } finally { setTestingTg(false); }
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={cardTitle}>TELEGRAM ALERTS</div>
        {tgData?.configured && (
          <span style={{ fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-label)', padding: '3px 8px', border: '1px solid rgba(34,197,94,.4)', color: 'var(--green)' }}>✓ ACTIVE</span>
        )}
      </div>
      <p style={{ fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginBottom: '14px', lineHeight: 1.6 }}>
        Enter your Telegram Bot Token and Chat ID to receive alerts.
      </p>
      <div style={{ marginBottom: '14px' }}>
        <label style={lbl}>BOT TOKEN</label>
        <input style={inp} type="password" value={botToken} onChange={e => setBotToken(e.target.value)} placeholder={tgData?.telegramBotToken ?? 'Paste token from @BotFather'} />
      </div>
      <div style={{ marginBottom: '14px' }}>
        <label style={lbl}>CHAT ID</label>
        <input style={inp} value={chatId} onChange={e => setChatId(e.target.value)} placeholder="123456789" />
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={handleSave} disabled={savingTg} style={btnPrimary(savingTg)}>{savingTg ? 'SAVING...' : 'SAVE'}</button>
        <button onClick={handleTest} disabled={testingTg || !tgData?.configured} style={{ ...btnGhost, opacity: (testingTg || !tgData?.configured) ? .4 : 1 }}>
          {testingTg ? 'SENDING...' : 'SEND TEST'}
        </button>
      </div>
    </div>
  );
};

/* ── Notifications tab ────────────────────────────────── */
const TYPE_COLOR: Record<string, string> = {
  drawdown: 'var(--yellow)', equity: 'var(--cyan)', margin: 'var(--red)',
  offline: 'var(--text-dim)', close_all: 'var(--red)', test: 'var(--green)',
};

const NotificationsTab = () => {
  const [logs, setLogs] = useState<NotificationLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const limit = 25;

  useEffect(() => {
    setLoading(true);
    fetchNotifications(page, limit)
      .then(res => { setLogs(res.logs); setTotal(res.total); })
      .catch(() => { setLogs([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / limit) || 1;

  const handleExport = () => {
    if (!logs.length) return;
    exportToCSV(
      logs.map(l => ({ type: l.type, message: l.message.replace(/<[^>]+>/g, ''), success: l.success ? 'Yes' : 'No', sentAt: new Date(l.sentAt).toLocaleString() })),
      `notifications-${new Date().toISOString().slice(0, 10)}`,
      [{ key: 'type', label: 'Type' }, { key: 'message', label: 'Message' }, { key: 'success', label: 'Success' }, { key: 'sentAt', label: 'Sent At' }],
    );
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={cardTitle as React.CSSProperties}>NOTIFICATIONS</span>
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', padding: '2px 8px', border: '1px solid var(--border2)' }}>{total}</span>
        </div>
        <button
          onClick={handleExport}
          disabled={!logs.length}
          style={{ fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-label)', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: logs.length ? 'pointer' : 'not-allowed', opacity: logs.length ? 1 : .3, letterSpacing: '.5px' }}
        >
          ↓ EXPORT
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-dim)', fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-body-sm)' }}>Loading...</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-dim)', fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-body-sm)' }}>No notifications sent yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {logs.map(log => (
            <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'var(--bg-card2)', border: '1px solid var(--border)', padding: '8px 10px' }}>
              <span style={{ fontFamily: 'var(--ff-micro)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px', color: TYPE_COLOR[log.type] || 'var(--text-dim)', flexShrink: 0, width: '52px', marginTop: '2px' }}>
                {log.type.toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-body-sm)', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {log.message.replace(/<[^>]+>/g, '').replace(/\[DOI DASH\]\n?|\[SENTINEL\]\n?/, '').slice(0, 120)}
                </div>
                <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginTop: '2px' }}>
                  {new Date(log.sentAt).toLocaleString()}
                </div>
              </div>
              <span style={{
                fontFamily: 'var(--ff-micro)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px', flexShrink: 0,
                padding: '2px 6px',
                border: `1px solid ${log.success ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
                color: log.success ? 'var(--green)' : 'var(--red)',
              }}>
                {log.success ? 'OK' : 'ERR'}
              </span>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)' }}>Page {page}/{totalPages}</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: page > 1 ? 'pointer' : 'not-allowed', padding: '4px 8px', opacity: page > 1 ? 1 : .3 }}>
              ‹
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: page < totalPages ? 'pointer' : 'not-allowed', padding: '4px 8px', opacity: page < totalPages ? 1 : .3 }}>
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
