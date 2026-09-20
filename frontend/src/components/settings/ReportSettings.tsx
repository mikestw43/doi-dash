import { useState, useEffect } from 'react';
import { fetchReportSettings, saveReportSettings, sendReportNow } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { ReportSettings as ReportSettingsType } from '../../types';

const selStyle: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text)',
  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-input)', padding: '7px 10px', outline: 'none', cursor: 'pointer',
};
const lbl: React.CSSProperties = {
  fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-label)', color: 'var(--text-dim)',
  letterSpacing: '.5px', display: 'block', marginBottom: '6px',
};

export const ReportSettings = () => {
  const addToast = useUIStore(s => s.addToast);
  const t = useTranslation();
  const [settings, setSettings] = useState<ReportSettingsType | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportSettings()
      .then(setSettings)
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await saveReportSettings(settings);
      setSettings(updated);
      addToast({ type: 'success', title: t('reports.saved') || 'Saved' });
    } catch {
      addToast({ type: 'error', title: 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendNow = async () => {
    setSending(true);
    try {
      await sendReportNow();
      addToast({ type: 'success', title: t('reports.sent') || 'Report sent' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed';
      addToast({ type: 'error', title: msg });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', padding: '12px 0' }}>Loading...</div>;
  }
  if (!settings) return null;

  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const days = [
    { value: 1, label: t('reports.mon') || 'Mon' },
    { value: 2, label: t('reports.tue') || 'Tue' },
    { value: 3, label: t('reports.wed') || 'Wed' },
    { value: 4, label: t('reports.thu') || 'Thu' },
    { value: 5, label: t('reports.fri') || 'Fri' },
    { value: 6, label: t('reports.sat') || 'Sat' },
    { value: 7, label: t('reports.sun') || 'Sun' },
  ];

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', padding: '20px 22px', marginBottom: '12px' }}>
      {/* Title */}
      <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '1px', marginBottom: '12px' }}>
        SCHEDULED REPORTS
      </div>
      <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginBottom: '14px', lineHeight: 1.6 }}>
        {t('reports.description') || 'Receive automated P&L reports via Telegram.'}
      </p>

      {/* Enable toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '14px' }}>
        <input
          type="checkbox"
          checked={settings.reportEnabled}
          onChange={e => setSettings({ ...settings, reportEnabled: e.target.checked })}
          style={{ width: '14px', height: '14px', accentColor: 'var(--cyan)', cursor: 'pointer' }}
        />
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: settings.reportEnabled ? 'var(--cyan)' : 'var(--text-dim)' }}>
          {t('reports.enabled') || 'Enable scheduled reports'}
        </span>
      </label>

      {settings.reportEnabled && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '14px', paddingLeft: '24px' }}>
          {/* Frequency */}
          <div>
            <label style={lbl}>{t('reports.frequency') || 'FREQUENCY'}</label>
            <select value={settings.reportFrequency} onChange={e => setSettings({ ...settings, reportFrequency: e.target.value })} style={selStyle}>
              <option value="daily">{t('reports.daily') || 'Daily'}</option>
              <option value="weekly">{t('reports.weekly') || 'Weekly'}</option>
            </select>
          </div>

          {/* Time */}
          <div>
            <label style={lbl}>{t('reports.time') || 'SEND TIME'}</label>
            <select value={settings.reportTime} onChange={e => setSettings({ ...settings, reportTime: e.target.value })} style={selStyle}>
              {hours.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>

          {/* Day (weekly only) */}
          {settings.reportFrequency === 'weekly' && (
            <div>
              <label style={lbl}>{t('reports.day') || 'DAY'}</label>
              <select value={settings.reportDay} onChange={e => setSettings({ ...settings, reportDay: parseInt(e.target.value) })} style={selStyle}>
                {days.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px', padding: '9px 16px', background: 'var(--cyan)', color: '#25272c', border: '1px solid var(--cyan)', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .6 : 1,}}
        >
          {saving ? 'SAVING...' : t('common.save') || 'SAVE'}
        </button>
        <button
          onClick={handleSendNow}
          disabled={sending}
          style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px', padding: '9px 16px', background: 'none', color: sending ? 'var(--text-dim)' : 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? .6 : 1 }}
        >
          {sending ? 'SENDING...' : t('reports.send_now') || 'SEND NOW'}
        </button>
      </div>
    </div>
  );
};
