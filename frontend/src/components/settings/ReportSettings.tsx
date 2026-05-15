import { useState, useEffect } from 'react';
import { Clock, Save, Loader2, Send } from 'lucide-react';
import { fetchReportSettings, saveReportSettings, sendReportNow } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { ReportSettings as ReportSettingsType } from '../../types';

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
      addToast({ type: 'success', title: t('reports.saved') });
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
      addToast({ type: 'success', title: t('reports.sent') });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed';
      addToast({ type: 'error', title: msg });
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-500 py-4">{t('common.loading')}</div>;
  if (!settings) return null;

  const days = [
    { value: 1, label: t('reports.mon') },
    { value: 2, label: t('reports.tue') },
    { value: 3, label: t('reports.wed') },
    { value: 4, label: t('reports.thu') },
    { value: 5, label: t('reports.fri') },
    { value: 6, label: t('reports.sat') },
    { value: 7, label: t('reports.sun') },
  ];

  const hours = Array.from({ length: 24 }, (_, i) =>
    `${String(i).padStart(2, '0')}:00`
  );

  return (
    <div className="bg-bg-secondary border border-border2 p-6 space-y-4">
      <div className="flex items-center gap-2 text-accent-blue mb-2">
        <Clock size={14} />
        <h3 className="font-pixel text-[9px] tracking-widest">{t('reports.title')}</h3>
      </div>

      <p className="font-tech text-xs text-gray-600">{t('reports.description')}</p>

      {/* Toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.reportEnabled}
          onChange={e => setSettings({ ...settings, reportEnabled: e.target.checked })}
          className="w-4 h-4 accent-accent-blue"
        />
        <span className="font-tech text-sm text-gray-400">{t('reports.enabled')}</span>
      </label>

      {settings.reportEnabled && (
        <div className="space-y-3 pl-7">
          {/* Frequency */}
          <div>
            <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">{t('reports.frequency')}</label>
            <select
              value={settings.reportFrequency}
              onChange={e => setSettings({ ...settings, reportFrequency: e.target.value })}
              className="bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white focus:outline-none focus:border-accent-blue"
            >
              <option value="daily">{t('reports.daily')}</option>
              <option value="weekly">{t('reports.weekly')}</option>
            </select>
          </div>

          {/* Time */}
          <div>
            <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">{t('reports.time')}</label>
            <select
              value={settings.reportTime}
              onChange={e => setSettings({ ...settings, reportTime: e.target.value })}
              className="bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white focus:outline-none focus:border-accent-blue"
            >
              {hours.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          {/* Day (weekly only) */}
          {settings.reportFrequency === 'weekly' && (
            <div>
              <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">{t('reports.day')}</label>
              <select
                value={settings.reportDay}
                onChange={e => setSettings({ ...settings, reportDay: parseInt(e.target.value) })}
                className="bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white focus:outline-none focus:border-accent-blue"
              >
                {days.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button onClick={handleSave} disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {t('common.save')}
        </button>
        <button onClick={handleSendNow} disabled={sending}
          className="btn-ghost flex items-center gap-2 disabled:opacity-50">
          {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          {t('reports.send_now')}
        </button>
      </div>
    </div>
  );
};
