import { useEffect, useState } from 'react';
import { fetchEmailLog, type EmailLogRow } from '../../services/api';
import { formatDayTime } from '../../utils/formatters';

/**
 * What the mail system has been doing.
 *
 * It exists because the server log cannot be read from a phone, and the one
 * question an admin actually has — did that email go out, and if not why —
 * has its answer buried in a file on the droplet. This is that answer, in
 * the app, on whatever screen they happen to have.
 */

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  sent:           { label: 'SENT',       color: 'var(--success)', bg: 'rgba(16,185,129,.10)' },
  failed:         { label: 'FAILED',     color: 'var(--danger)',  bg: 'rgba(248,113,113,.10)' },
  skipped:        { label: 'NOT SENT',   color: 'var(--warning)', bg: 'rgba(251,191,36,.10)' },
  not_configured: { label: 'NO MAILER',  color: 'var(--warning)', bg: 'rgba(251,191,36,.10)' },
};

const KIND: Record<string, string> = {
  approval:        'Account approved',
  rejection:       'Registration rejected',
  reset:           'Password reset',
  'google-notice': 'Signs in with Google',
  other:           'Other',
};

export const EmailLogViewer = () => {
  const [rows, setRows]       = useState<EmailLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setRows(await fetchEmailLog());
      setError('');
    } catch {
      setError('Could not load the email log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const label: React.CSSProperties = {
    fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-micro)',
    color: 'var(--text-muted)', letterSpacing: '1px',
  };

  return (
    <div style={{ padding: '14px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span style={{ ...label, flex: 1 }}>LAST 50 MESSAGES · KEPT 30 DAYS</span>
        <button
          onClick={load}
          style={{
            background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)',
            letterSpacing: '1px', padding: '5px 10px', cursor: 'pointer', flexShrink: 0,
          }}
        >REFRESH</button>
      </div>

      {loading && <div style={{ ...label, padding: '12px 0' }}>LOADING…</div>}
      {error && <div style={{ color: 'var(--danger)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)' }}>{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Nothing yet. Approving a user, rejecting one, or asking for a password
          reset will show up here.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map(r => {
          const s = STATUS[r.status] ?? { label: r.status.toUpperCase(), color: 'var(--text-muted)', bg: 'transparent' };
          return (
            <div
              key={r.id}
              style={{
                border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-input)', padding: '10px 12px', minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', minWidth: 0 }}>
                <span style={{
                  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', letterSpacing: '1px',
                  color: s.color, background: s.bg, border: `1px solid ${s.color}`,
                  borderRadius: '3px', padding: '2px 6px', flexShrink: 0,
                }}>{s.label}</span>
                <span style={{
                  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1,
                }}>{r.to}</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', minWidth: 0 }}>
                <span style={{
                  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1,
                }}>{KIND[r.kind] ?? r.kind}</span>
                <span style={{ ...label, flexShrink: 0 }}>{formatDayTime(r.createdAt)}</span>
              </div>

              {r.detail && r.status !== 'sent' && (
                <div style={{
                  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)', color: 'var(--text-muted)',
                  marginTop: '6px', lineHeight: 1.5, wordBreak: 'break-word',
                }}>{r.detail}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
