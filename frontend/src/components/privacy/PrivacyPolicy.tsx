import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { exportMyData, deleteMyAccount } from '../../services/api';
import { useTranslation } from '../../i18n/useTranslation';

const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border2)',
  padding: '20px 22px', marginBottom: '12px',
};
const h2: React.CSSProperties = {
  fontFamily: "'Press Start 2P'", fontSize: '8px', color: 'var(--cyan)',
  letterSpacing: '.5px', marginBottom: '10px',
};
const li: React.CSSProperties = {
  fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-dim)',
  lineHeight: 1.7, marginBottom: '4px',
};
const inp: React.CSSProperties = {
  flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontSize: '12px',
  padding: '7px 10px', outline: 'none',
};

export const PrivacyPolicy = () => {
  const t = useTranslation();
  const { addToast } = useUIStore();
  const logout = useAuthStore(s => s.logout);
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentinel-my-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast({ type: 'success', title: 'Data exported successfully' });
    } catch {
      addToast({ type: 'error', title: 'Failed to export data' });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (deleteText !== 'DELETE') return;
    setDeleting(true);
    try {
      await deleteMyAccount();
      addToast({ type: 'info', title: 'Account deleted' });
      logout();
    } catch {
      addToast({ type: 'error', title: 'Failed to delete account' });
      setDeleting(false);
    }
  };

  const Section = ({ title, items }: { title: string; items: string[] }) => (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text)', letterSpacing: '.5px', marginBottom: '8px' }}>
        {title}
      </div>
      <ul style={{ paddingLeft: '16px' }}>
        {items.map((item, i) => (
          <li key={i} style={{ ...li, display: 'list-item', listStyleType: 'disc' }}>{item}</li>
        ))}
      </ul>
    </div>
  );

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <div style={{ width: '7px', height: '7px', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)', flexShrink: 0 }} />
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: '8px', color: 'var(--text)', letterSpacing: '2px', textShadow: '0 0 12px rgba(56,189,248,.8)' }}>
          PRIVACY POLICY & PDPA
        </span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
      </div>

      {/* Policy content */}
      <div style={card}>
        <Section
          title="1. DATA WE COLLECT"
          items={[
            'Account info: Email, name, password (hashed)',
            'Trading accounts: Broker name, account number, server',
            'Trading data: Equity snapshots, closed trades, alerts (retained 90 days)',
            'Telegram credentials: Bot token (encrypted), chat ID',
            'Activity logs: Login history, action audit trail (retained 1 year)',
          ]}
        />
        <Section
          title="2. WHAT WE DO NOT COLLECT"
          items={[
            'We do NOT store trading passwords or MT5 login credentials',
            'We do NOT share any data with third parties',
            'We do NOT use cookies for tracking or advertising',
            'We do NOT collect IP addresses or browser fingerprints',
          ]}
        />
        <Section
          title="3. DATA SECURITY"
          items={[
            'Passwords are hashed with bcrypt (irreversible)',
            'Telegram bot tokens are encrypted with AES-256-GCM',
            'API keys are masked in all responses (only last 6 chars visible)',
            'JWT authentication with 24-hour expiry',
            'All communications use HTTPS in production',
          ]}
        />
        <Section
          title="4. DATA RETENTION"
          items={[
            'Equity snapshots: automatically deleted after 90 days',
            'Closed trades: automatically deleted after 90 days',
            'Notification logs: automatically deleted after 90 days',
            'Audit logs: automatically deleted after 1 year',
            'User accounts: retained until manually deleted',
          ]}
        />
        <Section
          title="5. YOUR RIGHTS (PDPA)"
          items={[
            'Right to access: You can export all your data at any time',
            'Right to erasure: You can permanently delete your account and all data',
            'Right to rectification: You can update your profile at any time',
            'Right to data portability: Data export available in JSON format',
          ]}
        />
      </div>

      {/* Actions */}
      <div style={card}>
        <div style={h2}>YOUR DATA RIGHTS</div>

        {/* Export data */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', background: 'var(--bg-card2)', border: '1px solid var(--border2)',
          marginBottom: '10px',
        }}>
          <div>
            <div style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text)', letterSpacing: '.5px', marginBottom: '4px' }}>EXPORT MY DATA</div>
            <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-dim)' }}>Download a copy of all your personal data as JSON</div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px',
              padding: '8px 14px', background: 'var(--cyan)', color: '#0c1422',
              border: '1px solid var(--cyan)', cursor: exporting ? 'not-allowed' : 'pointer',
              opacity: exporting ? .6 : 1, flexShrink: 0,
            }}
          >
            {exporting ? 'EXPORTING...' : '↓ EXPORT'}
          </button>
        </div>

        {/* Delete account */}
        <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--red)', letterSpacing: '.5px', marginBottom: '4px' }}>DELETE MY ACCOUNT</div>
              <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-dim)' }}>Permanently delete your account and all associated data. Cannot be undone.</div>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px',
                padding: '8px 12px', background: 'none',
                border: '1px solid rgba(239,68,68,.5)', color: 'var(--red)',
                cursor: 'pointer', flexShrink: 0, marginLeft: '12px',
              }}
            >
              DELETE
            </button>
          </div>

          {showDeleteConfirm && (
            <div style={{ marginTop: '14px', padding: '12px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)' }}>
              <div style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--red)', letterSpacing: '.5px', marginBottom: '8px' }}>
                ⚠ THIS ACTION IS PERMANENT AND IRREVERSIBLE
              </div>
              <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-dim)', marginBottom: '10px', lineHeight: 1.6 }}>
                All your accounts, trading history, alerts, and settings will be permanently deleted.
                Type <strong style={{ color: 'var(--text)' }}>DELETE</strong> to confirm.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={deleteText}
                  onChange={e => setDeleteText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  style={inp}
                />
                <button
                  onClick={handleDelete}
                  disabled={deleteText !== 'DELETE' || deleting}
                  style={{
                    fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px',
                    padding: '8px 14px',
                    background: deleteText === 'DELETE' && !deleting ? 'var(--red)' : 'rgba(100,116,139,.3)',
                    color: deleteText === 'DELETE' && !deleting ? '#fff' : 'var(--text-dim)',
                    border: '1px solid var(--red)',
                    cursor: deleteText === 'DELETE' && !deleting ? 'pointer' : 'not-allowed',
                    flexShrink: 0,
                  }}
                >
                  {deleting ? 'DELETING...' : 'CONFIRM'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteText(''); }}
                  style={{
                    fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px',
                    padding: '8px 12px', background: 'none',
                    border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
