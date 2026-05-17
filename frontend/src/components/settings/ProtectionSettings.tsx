import { useState, useEffect } from 'react';
import { fetchProtectionSettings, saveProtectionSettings } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';
import { useTranslation } from '../../i18n/useTranslation';

interface Props {
  accountId: string;
  accountName: string;
  onClose: () => void;
}

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
  padding: '7px 10px', outline: 'none', boxSizing: 'border-box',
};

export const ProtectionSettings = ({ accountId, accountName, onClose }: Props) => {
  const addToast = useUIStore(s => s.addToast);
  const t = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProtectionSettings(accountId)
      .then(data => {
        setEnabled(data.protectionEnabled);
        setThreshold(data.protectionDrawdown?.toString() || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accountId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveProtectionSettings(accountId, {
        protectionEnabled: enabled,
        protectionDrawdown: threshold ? parseFloat(threshold) : null,
      });
      addToast({ type: 'success', title: t('protection.saved') });
      onClose();
    } catch {
      addToast({ type: 'error', title: 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,.65)',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border2)',
        padding: '20px 22px', width: '100%', maxWidth: '400px',
        margin: '0 16px', position: 'relative',
        boxShadow: '4px 4px 0 rgba(56,189,248,.3)',
      }}>
        {/* Corner brackets */}
        <div style={{ position: 'absolute', top: 5, left: 5, width: 12, height: 12, borderTop: '2px solid var(--cyan)', borderLeft: '2px solid var(--cyan)' }} />
        <div style={{ position: 'absolute', bottom: 5, right: 5, width: 12, height: 12, borderBottom: '2px solid var(--cyan)', borderRight: '2px solid var(--cyan)' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--yellow)', letterSpacing: '.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ⛨ {t('protection.title') || 'DRAWDOWN PROTECTION'}
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginTop: '4px' }}>{accountName}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Warning */}
        <div style={{
          padding: '10px 12px', marginBottom: '14px',
          background: 'rgba(250,204,21,.06)', border: '1px solid rgba(250,204,21,.3)',
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', lineHeight: 1.6,
        }}>
          {t('protection.description') || '⚠ When drawdown exceeds the threshold, all positions will be closed automatically.'}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}>
            Loading...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                style={{ width: '14px', height: '14px', accentColor: 'var(--yellow)', cursor: 'pointer' }}
              />
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: enabled ? 'var(--yellow)' : 'var(--text-dim)' }}>
                {t('protection.enabled') || 'Enable drawdown protection'}
              </span>
            </label>

            {enabled && (
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px', marginBottom: '6px' }}>
                  {t('protection.threshold') || 'THRESHOLD (%)'}
                </label>
                <input
                  type="number"
                  value={threshold}
                  onChange={e => setThreshold(e.target.value)}
                  placeholder="e.g. 10"
                  min={1} max={100} step={0.5}
                  style={inp}
                />
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginTop: '4px' }}>
                  {threshold ? `Close all when drawdown ≥ ${threshold}%` : 'Enter threshold percentage'}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
                  padding: '9px 16px', background: 'var(--yellow)', color: '#0c1422',
                  border: '1px solid var(--yellow)', cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? .6 : 1,
                }}
              >
                {saving ? 'SAVING...' : t('protection.save') || 'SAVE'}
              </button>
              <button
                onClick={onClose}
                style={{
                  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
                  padding: '9px 14px', background: 'none',
                  border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer',
                }}
              >
                {t('common.cancel') || 'CANCEL'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
