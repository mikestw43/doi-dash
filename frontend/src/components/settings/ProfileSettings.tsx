import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import {
  updateProfile, changePassword,
  getTelegramSettings, saveTelegramSettings, testTelegramMessage,
  fetchNotifications, savePreferences,
} from '../../services/api';
import { exportToCSV } from '../../utils/export';
import { useTranslation } from '../../i18n/useTranslation';
import { ReportSettings } from './ReportSettings';
import { AccountsSection } from '../accounts/AccountsSection';
import type { NotificationLogEntry } from '../../types';

/* ── shared styles ────────────────────────────────────── */
const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border2)', padding: '20px 22px', marginBottom: '12px',
};
const secTitle = (color = 'var(--cyan)'): React.CSSProperties => ({
  fontFamily: "'Press Start 2P'", fontSize: '8px', color, letterSpacing: '1px', marginBottom: '16px',
});
const lbl: React.CSSProperties = {
  fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)', letterSpacing: '.5px', display: 'block', marginBottom: '6px',
};
const inp: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontSize: '12px',
  padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
};
const field: React.CSSProperties = { marginBottom: '14px' };
const btnPrimary = (disabled = false): React.CSSProperties => ({
  fontFamily: "'Press Start 2P'", fontSize: '8px', letterSpacing: '.5px',
  padding: '10px 18px', background: 'var(--cyan)', color: '#0c1422',
  border: '1px solid var(--cyan)', cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? .5 : 1, boxShadow: disabled ? 'none' : '0 0 8px rgba(56,189,248,.4)',
});
const btnGhost = (active = false): React.CSSProperties => ({
  fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px',
  padding: '7px 14px', background: active ? 'rgba(56,189,248,.08)' : 'none',
  color: active ? 'var(--cyan)' : 'var(--text-dim)',
  border: `1px solid ${active ? 'var(--cyan)' : 'var(--border2)'}`,
  cursor: 'pointer', transition: 'all .15s',
});

/* ── Main component ───────────────────────────────────── */
export const ProfileSettings = () => {
  const user = useAuthStore(s => s.user);
  const setAuth = useAuthStore(s => s.setAuth);
  const token = useAuthStore(s => s.token);
  const setCurrentPage = useUIStore(s => s.setCurrentPage);
  const addToast = useUIStore(s => s.addToast);
  const theme = useUIStore(s => s.theme);
  const setTheme = useUIStore(s => s.setTheme);
  const language = useUIStore(s => s.language);
  const setLanguage = useUIStore(s => s.setLanguage);
  const t = useTranslation();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [pwErr, setPwErr] = useState('');

  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [savingTg, setSavingTg] = useState(false);
  const [testingTg, setTestingTg] = useState(false);

  const { data: tgData, refetch: refetchTg } = useQuery({
    queryKey: ['telegram-settings'],
    queryFn: getTelegramSettings,
  });

  useEffect(() => { if (tgData?.telegramChatId) setChatId(tgData.telegramChatId); }, [tgData]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile({ name, email });
      if (token) setAuth(token, updated);
      addToast({ type: 'success', title: t('profile.saved') || 'Profile updated' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update';
      addToast({ type: 'error', title: msg });
    } finally { setSaving(false); }
  };

  const handleChangePw = async () => {
    setPwErr('');
    if (newPw !== confirmPw) { setPwErr('Passwords do not match'); return; }
    if (newPw.length < 6)    { setPwErr('Min 6 characters required'); return; }
    setChangingPw(true);
    try {
      await changePassword({ currentPassword: currentPw, newPassword: newPw });
      addToast({ type: 'success', title: 'Password changed' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to change password';
      addToast({ type: 'error', title: msg });
    } finally { setChangingPw(false); }
  };

  const handleSaveTg = async () => {
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

  const handleTestTg = async () => {
    setTestingTg(true);
    try {
      const res = await testTelegramMessage();
      addToast({ type: 'success', title: res.message });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Test failed';
      addToast({ type: 'error', title: msg });
    } finally { setTestingTg(false); }
  };

  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      {/* Back */}
      <button
        onClick={() => setCurrentPage('dashboard')}
        style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontFamily: "'Press Start 2P'", fontSize: '7px', cursor: 'pointer', marginBottom: '14px', letterSpacing: '.5px' }}
      >
        ← BACK
      </button>

      {/* Title */}
      <div style={{ fontFamily: "'Press Start 2P'", fontSize: '10px', color: 'var(--cyan)', letterSpacing: '2px', textShadow: '0 0 12px rgba(56,189,248,.8)', marginBottom: '16px' }}>
        PROFILE &amp; SETTINGS
      </div>

      {/* Avatar + role */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
        <div style={{ width: '52px', height: '52px', background: 'rgba(56,189,248,.08)', border: '2px solid var(--cyan)', boxShadow: '0 0 10px rgba(56,189,248,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Press Start 2P'", fontSize: '14px', color: 'var(--cyan)', flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '14px', color: 'var(--text)', marginBottom: '4px' }}>{user?.name}</div>
          <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px' }}>{user?.email}</div>
          <span style={{
            fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px',
            padding: '3px 8px',
            border: `1px solid ${user?.role === 'admin' ? 'rgba(56,189,248,.4)' : 'var(--border2)'}`,
            color: user?.role === 'admin' ? 'var(--cyan)' : 'var(--text-dim)',
            background: user?.role === 'admin' ? 'rgba(56,189,248,.08)' : 'none',
          }}>
            {(user?.role || 'user').toUpperCase()}
          </span>
        </div>
      </div>

      {/* Profile Info */}
      <div style={card}>
        <div style={secTitle()}>PERSONAL INFO</div>
        <div style={field}><label style={lbl}>FULL NAME</label><input style={inp} type="text" value={name} onChange={e => setName(e.target.value)} /></div>
        <div style={field}><label style={lbl}>EMAIL</label><input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <button onClick={handleSaveProfile} disabled={saving} style={btnPrimary(saving)}>
          {saving ? 'SAVING...' : 'SAVE CHANGES'}
        </button>
      </div>

      {/* Change Password */}
      <div style={card}>
        <div style={secTitle('var(--yellow)')}>CHANGE PASSWORD</div>
        <div style={field}><label style={lbl}>CURRENT PASSWORD</label><input style={inp} type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="••••••••" /></div>
        <div style={field}><label style={lbl}>NEW PASSWORD</label><input style={inp} type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="min 6 characters" /></div>
        <div style={field}><label style={lbl}>CONFIRM PASSWORD</label><input style={inp} type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="••••••••" /></div>
        {pwErr && <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--red)', marginBottom: '10px', padding: '7px 10px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)' }}>⚠ {pwErr}</div>}
        <button onClick={handleChangePw} disabled={changingPw || !currentPw || !newPw || !confirmPw} style={{ ...btnPrimary(changingPw || !currentPw || !newPw || !confirmPw), background: 'var(--yellow)', color: '#0c1422', border: '1px solid var(--yellow)' }}>
          {changingPw ? 'CHANGING...' : 'CHANGE PASSWORD'}
        </button>
      </div>

      {/* API Keys */}
      <AccountsSection />

      {/* Telegram */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={secTitle()}>TELEGRAM ALERTS</div>
          {tgData?.configured && (
            <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '3px 8px', border: '1px solid rgba(34,197,94,.4)', color: 'var(--green)' }}>✓ ACTIVE</span>
          )}
        </div>
        <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-dim)', marginBottom: '14px', lineHeight: 1.6 }}>
          Enter your Telegram Bot Token and Chat ID to receive alerts.
        </div>
        <div style={field}><label style={lbl}>BOT TOKEN</label><input style={inp} type="password" value={botToken} onChange={e => setBotToken(e.target.value)} placeholder={tgData?.telegramBotToken ?? 'Paste token from @BotFather'} /></div>
        <div style={field}><label style={lbl}>CHAT ID</label><input style={inp} type="text" value={chatId} onChange={e => setChatId(e.target.value)} placeholder="123456789" /></div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={handleSaveTg} disabled={savingTg} style={btnPrimary(savingTg)}>{savingTg ? 'SAVING...' : 'SAVE'}</button>
          <button onClick={handleTestTg} disabled={testingTg || !tgData?.configured} style={{ ...btnGhost(false), opacity: (testingTg || !tgData?.configured) ? .4 : 1 }}>
            {testingTg ? 'SENDING...' : 'SEND TEST'}
          </button>
        </div>
      </div>

      {/* Preferences */}
      <div style={card}>
        <div style={secTitle()}>PREFERENCES</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
          {/* Language */}
          <div>
            <div style={lbl}>LANGUAGE</div>
            <select
              value={language}
              onChange={e => { const v = e.target.value as 'en' | 'th'; setLanguage(v); savePreferences({ language: v }).catch(() => {}); }}
              style={{ ...inp, width: 'auto', cursor: 'pointer', padding: '7px 10px' }}
            >
              <option value="en">English (EN)</option>
              <option value="th">ภาษาไทย (TH)</option>
            </select>
          </div>
          {/* Theme */}
          <div>
            <div style={lbl}>THEME</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['dark', 'light', 'hud'] as const).map(t => (
                <button key={t} onClick={() => { setTheme(t); savePreferences({ theme: t }).catch(() => {}); }} style={btnGhost(theme === t)}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scheduled Reports */}
      <ReportSettings />

      {/* Notification History */}
      <NotificationHistory />
    </div>
  );
};

/* ── Notification History ─────────────────────────────── */
const NotificationHistory = () => {
  const [logs, setLogs] = useState<NotificationLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const limit = 10;

  const load = () => {
    setLoading(true);
    fetchNotifications(page, limit)
      .then(res => { setLogs(res.logs); setTotal(res.total); })
      .catch(() => { setLogs([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / limit) || 1;

  const handleExport = () => {
    if (!logs.length) return;
    exportToCSV(
      logs.map(l => ({ type: l.type, message: l.message.replace(/<[^>]+>/g, ''), success: l.success ? 'Yes' : 'No', sentAt: new Date(l.sentAt).toLocaleString() })),
      `notifications-${new Date().toISOString().slice(0, 10)}`,
      [{ key: 'type', label: 'Type' }, { key: 'message', label: 'Message' }, { key: 'success', label: 'Success' }, { key: 'sentAt', label: 'Sent At' }],
    );
  };

  const TYPE_COLOR: Record<string, string> = {
    drawdown: 'var(--yellow)', equity: 'var(--cyan)', margin: 'var(--red)',
    offline: 'var(--text-dim)', close_all: 'var(--red)', test: 'var(--green)',
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', padding: '20px 22px', marginBottom: '12px' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: "'Press Start 2P'", fontSize: '8px', color: 'var(--cyan)', letterSpacing: '1px' }}>NOTIFICATIONS</span>
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-dim)', padding: '2px 8px', border: '1px solid var(--border2)' }}>{total}</span>
        </div>
        <button
          onClick={handleExport}
          disabled={!logs.length}
          style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: logs.length ? 'pointer' : 'not-allowed', opacity: logs.length ? 1 : .3, letterSpacing: '.5px' }}
        >
          ↓ EXPORT
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-dim)', fontFamily: "'Share Tech Mono'", fontSize: '11px' }}>Loading...</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-dim)', fontFamily: "'Share Tech Mono'", fontSize: '11px' }}>No notifications sent yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {logs.map(log => (
            <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'var(--bg-card2)', border: '1px solid var(--border)', padding: '8px 10px' }}>
              <span style={{ fontFamily: "'Press Start 2P'", fontSize: '6px', letterSpacing: '.5px', color: TYPE_COLOR[log.type] || 'var(--text-dim)', flexShrink: 0, width: '52px', marginTop: '2px' }}>
                {log.type.toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {log.message.replace(/<[^>]+>/g, '').replace(/\[DOI DASH\]\n?|\[SENTINEL\]\n?/, '').slice(0, 120)}
                </div>
                <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '9px', color: 'var(--text-dim)', marginTop: '2px' }}>
                  {new Date(log.sentAt).toLocaleString()}
                </div>
              </div>
              <span style={{
                fontFamily: "'Press Start 2P'", fontSize: '6px', letterSpacing: '.5px', flexShrink: 0,
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
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-dim)' }}>Page {page}/{totalPages}</span>
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
