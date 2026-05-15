import { useState, useEffect } from 'react';
import { ArrowLeft, User, Lock, Save, Loader2, MessageSquare, Send, Bell, ChevronLeft, ChevronRight, Download, Globe, Sun, Moon, Cpu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { updateProfile, changePassword, getTelegramSettings, saveTelegramSettings, testTelegramMessage, fetchNotifications, savePreferences } from '../../services/api';
import { exportToCSV } from '../../utils/export';
import { useTranslation } from '../../i18n/useTranslation';
import { ReportSettings } from './ReportSettings';
import { AccountsSection } from '../accounts/AccountsSection';
import type { NotificationLogEntry } from '../../types';

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

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  // Telegram
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);

  const { data: telegramData, refetch: refetchTelegram } = useQuery({
    queryKey: ['telegram-settings'],
    queryFn: getTelegramSettings,
  });

  useEffect(() => {
    if (telegramData?.telegramChatId) {
      setChatId(telegramData.telegramChatId);
    }
  }, [telegramData]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile({ name, email });
      if (token) setAuth(token, updated);
      addToast({ type: 'success', title: 'Profile updated' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update';
      addToast({ type: 'error', title: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      addToast({ type: 'error', title: 'Passwords do not match' });
      return;
    }
    if (newPassword.length < 6) {
      addToast({ type: 'error', title: 'Password must be at least 6 characters' });
      return;
    }
    setChangingPw(true);
    try {
      await changePassword({ currentPassword, newPassword });
      addToast({ type: 'success', title: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to change password';
      addToast({ type: 'error', title: msg });
    } finally {
      setChangingPw(false);
    }
  };

  const handleSaveTelegram = async () => {
    setSavingTelegram(true);
    try {
      const payload: { telegramBotToken?: string; telegramChatId?: string } = {
        telegramChatId: chatId || undefined,
      };
      if (botToken && !botToken.startsWith('●')) {
        payload.telegramBotToken = botToken;
      }
      await saveTelegramSettings(payload);
      refetchTelegram();
      setBotToken('');
      addToast({ type: 'success', title: 'Telegram settings saved' });
    } catch {
      addToast({ type: 'error', title: 'Failed to save Telegram settings' });
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      const result = await testTelegramMessage();
      addToast({ type: 'success', title: result.message });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to send test message';
      addToast({ type: 'error', title: msg });
    } finally {
      setTestingTelegram(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => setCurrentPage('dashboard')}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={16} />
        {t('nav.back_dashboard')}
      </button>

      <h2 className="font-pixel text-[13px] text-accent-blue tracking-wider" style={{ textShadow: '0 0 8px rgba(56,189,248,0.5)' }}>{t('profile.title')}</h2>

      {/* Profile Info */}
      <div className="bg-bg-secondary border border-border2 p-6 space-y-4">
        <div className="flex items-center gap-2 text-accent-blue mb-2">
          <User size={14} />
          <h3 className="font-pixel text-[9px] tracking-widest">Profile Information</h3>
        </div>

        <div>
          <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white focus:outline-none focus:border-accent-blue"
          />
        </div>

        <div>
          <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white focus:outline-none focus:border-accent-blue"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-pixel text-[8px] text-gray-600 tracking-widest">Role:</span>
          <span className={`font-pixel text-[8px] px-2 py-0.5 border ${
            user?.role === 'admin' ? 'border-accent-blue/40 text-accent-blue' : 'border-gray-700 text-gray-500'
          }`}>{user?.role}</span>
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          SAVE CHANGES
        </button>
      </div>

      {/* Change Password */}
      <div className="bg-bg-secondary border border-border2 p-6 space-y-4">
        <div className="flex items-center gap-2 text-warning mb-2">
          <Lock size={14} />
          <h3 className="font-pixel text-[9px] tracking-widest">Change Password</h3>
        </div>

        <div>
          <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white focus:outline-none focus:border-accent-blue"
          />
        </div>

        <div>
          <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white focus:outline-none focus:border-accent-blue"
          />
        </div>

        <div>
          <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white focus:outline-none focus:border-accent-blue"
          />
        </div>

        <button
          onClick={handleChangePassword}
          disabled={changingPw || !currentPassword || !newPassword || !confirmPassword}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
          style={{ background: 'var(--warning)', color: '#000' }}
        >
          {changingPw ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
          CHANGE PASSWORD
        </button>
      </div>

      {/* API Key Management */}
      <AccountsSection />

      {/* Telegram Alerts */}
      <div className="bg-bg-secondary border border-border2 p-6 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-accent-blue">
            <MessageSquare size={14} />
            <h3 className="font-pixel text-[9px] tracking-widest">Telegram Alerts</h3>
          </div>
          {telegramData?.configured && (
            <span className="font-pixel text-[8px] px-2 py-0.5 border border-success/40 text-success">
              ✓ Configured
            </span>
          )}
        </div>

        <p className="font-tech text-xs text-gray-600">
          Enter your Telegram Bot Token and Chat ID to receive account alerts.
        </p>

        <div>
          <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">Bot Token</label>
          <input
            type="password"
            value={botToken}
            onChange={e => setBotToken(e.target.value)}
            placeholder={telegramData?.telegramBotToken ?? 'Paste your bot token from @BotFather'}
            className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white placeholder-gray-700 focus:outline-none focus:border-accent-blue"
          />
        </div>

        <div>
          <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">Chat ID</label>
          <input
            type="text"
            value={chatId}
            onChange={e => setChatId(e.target.value)}
            placeholder="123456789"
            className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white placeholder-gray-700 focus:outline-none focus:border-accent-blue"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveTelegram}
            disabled={savingTelegram}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {savingTelegram ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            SAVE
          </button>
          <button
            onClick={handleTestTelegram}
            disabled={testingTelegram || !telegramData?.configured}
            className="btn-ghost flex items-center gap-2 disabled:opacity-50"
          >
            {testingTelegram ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            SEND TEST
          </button>
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-bg-secondary border border-border2 p-6 space-y-4">
        <div className="flex items-center gap-2 text-accent-blue mb-2">
          <Globe size={14} />
          <h3 className="font-pixel text-[9px] tracking-widest">{t('preferences.title')}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div>
            <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">{t('preferences.language')}</label>
            <select
              value={language}
              onChange={e => {
                const val = e.target.value as 'en' | 'th';
                setLanguage(val);
                savePreferences({ language: val }).catch(() => {});
              }}
              className="bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white focus:outline-none focus:border-accent-blue"
            >
              <option value="en">English</option>
              <option value="th">ภาษาไทย</option>
            </select>
          </div>

          <div>
            <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">{t('preferences.theme')}</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { setTheme('dark'); savePreferences({ theme: 'dark' }).catch(() => {}); }}
                className={`btn-ghost flex items-center gap-1.5 ${theme === 'dark' ? 'border-accent-blue text-accent-blue' : ''}`}
              >
                <Moon size={12} />
                {t('preferences.dark')}
              </button>
              <button
                onClick={() => { setTheme('light'); savePreferences({ theme: 'light' }).catch(() => {}); }}
                className={`btn-ghost flex items-center gap-1.5 ${theme === 'light' ? 'border-accent-blue text-accent-blue' : ''}`}
              >
                <Sun size={12} />
                {t('preferences.light')}
              </button>
              <button
                onClick={() => { setTheme('hud'); savePreferences({ theme: 'hud' }).catch(() => {}); }}
                className={`btn-ghost flex items-center gap-1.5 ${theme === 'hud' ? 'border-accent-blue text-accent-blue' : ''}`}
              >
                <Cpu size={12} />
                {t('preferences.hud')}
              </button>
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

// --- Notification History Sub-component ---
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

  useEffect(() => { load(); }, [page]);

  const totalPages = Math.ceil(total / limit) || 1;

  const handleExport = () => {
    if (logs.length === 0) return;
    exportToCSV(
      logs.map(l => ({
        type: l.type,
        message: l.message.replace(/<[^>]+>/g, ''),
        success: l.success ? 'Yes' : 'No',
        sentAt: new Date(l.sentAt).toLocaleString(),
      })),
      `notifications-${new Date().toISOString().slice(0, 10)}`,
      [
        { key: 'type', label: 'Type' },
        { key: 'message', label: 'Message' },
        { key: 'success', label: 'Success' },
        { key: 'sentAt', label: 'Sent At' },
      ],
    );
  };

  const typeColors: Record<string, string> = {
    drawdown: 'text-warning',
    equity: 'text-accent-blue',
    margin: 'text-danger',
    offline: 'text-gray-400',
    close_all: 'text-danger',
    test: 'text-success',
  };

  return (
    <div className="bg-bg-secondary border border-border2 p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-accent-blue">
          <Bell size={14} />
          <h3 className="font-pixel text-[9px] tracking-widest">Notification History</h3>
          <span className="font-tech text-xs border border-border2 text-gray-600 px-2 py-0.5">{total}</span>
        </div>
        <button
          onClick={handleExport}
          disabled={logs.length === 0}
          className="font-pixel text-[8px] text-gray-600 hover:text-accent-blue flex items-center gap-1.5 transition-colors disabled:opacity-30"
        >
          <Download size={11} />
          EXPORT
        </button>
      </div>

      {loading ? (
        <div className="font-tech text-sm text-gray-600 text-center py-6">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="font-tech text-sm text-gray-600 text-center py-6">No notifications sent yet.</div>
      ) : (
        <div className="space-y-1.5">
          {logs.map(log => (
            <div
              key={log.id}
              className="flex items-start gap-3 bg-bg-primary border border-gray-800/60 px-3 py-2"
            >
              <div className={`font-pixel text-[8px] tracking-wider uppercase shrink-0 w-14 ${typeColors[log.type] || 'text-gray-500'}`}>
                {log.type}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-tech text-xs text-gray-400 truncate">
                  {log.message.replace(/<[^>]+>/g, '').replace(/\[DOI DASH\]\n?|\[SENTINEL\]\n?/, '').slice(0, 120)}
                </p>
                <p className="font-tech text-[10px] text-gray-700 mt-0.5">
                  {new Date(log.sentAt).toLocaleString()}
                </p>
              </div>
              <div className="shrink-0">
                {log.success ? (
                  <span className="font-pixel text-[8px] px-1.5 py-0.5 border border-success/30 text-success">OK</span>
                ) : (
                  <span className="font-pixel text-[8px] px-1.5 py-0.5 border border-danger/30 text-danger">ERR</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="font-tech text-[10px] text-gray-600">
            Page {page}/{totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 text-gray-600 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 text-gray-600 hover:text-white disabled:opacity-30"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
