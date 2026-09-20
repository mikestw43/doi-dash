import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  changeUserRole, changeUserStatus, resetUserPassword,
} from '../../services/api';
import { useUIStore } from '../../stores/uiStore';
import { Dialog } from '../ui/Dialog';
import type { UserInfo } from '../../types';

interface Props {
  user: UserInfo | null;
  currentUserId?: string;
  onClose: () => void;
  onDelete: (id: string) => void;
}

const ROLE_COLOR: Record<string, { border: string; color: string; bg: string; label: string }> = {
  admin: { border: 'rgba(96,165,250,.4)',  color: 'var(--accent-blue)', bg: 'rgba(96,165,250,.08)', label: 'ADMIN' },
  vip:   { border: 'rgba(251,191,36,.4)',  color: 'var(--warning)',     bg: 'rgba(251,191,36,.07)', label: 'VIP'   },
  user:  { border: 'var(--border2)',       color: 'var(--text-dim)',    bg: 'none',                 label: 'USER'  },
};

const STATUS_META: Record<string, { color: string; label: string }> = {
  active:    { color: 'var(--success)', label: 'ACTIVE' },
  pending:   { color: 'var(--warning)', label: 'PENDING' },
  rejected:  { color: 'var(--danger)',  label: 'REJECTED' },
  suspended: { color: 'var(--warning)', label: 'SUSPENDED' },
};

const cardTitle: React.CSSProperties = {
  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
  color: 'var(--text-dim)', letterSpacing: '.5px', marginBottom: '10px',
};
const rowStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '120px 1fr',
  gap: '10px', padding: '7px 0',
  borderBottom: '1px dashed var(--border)',
  alignItems: 'center',
};
const lblStyle: React.CSSProperties = {
  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
  color: 'var(--text-dim)', letterSpacing: '.5px',
};
const valStyle: React.CSSProperties = {
  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
  color: 'var(--text)',
};
const sel: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
  padding: '6px 9px', outline: 'none', cursor: 'pointer',
};
const btn = (color: string, bg: string): React.CSSProperties => ({
  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
  padding: '8px 12px', background: bg, color, border: `1px solid ${color}`,
  cursor: 'pointer',
});

export const UserDetailDialog = ({ user, currentUserId, onClose, onDelete }: Props) => {
  const queryClient = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const [resetPw, setResetPw] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const open = !!user;
  const isSelf = user?.id === currentUserId;

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => changeUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      addToast({ type: 'success', title: 'Role updated' });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed';
      addToast({ type: 'error', title: msg });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) => changeUserStatus(id, status),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      addToast({ type: 'success', title: v.status === 'suspended' ? 'User suspended' : 'User reactivated' });
    },
    onError: () => addToast({ type: 'error', title: 'Failed to update status' }),
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => resetUserPassword(id),
    onSuccess: (data) => {
      setResetPw(data.newPassword);
      setResetConfirm(false);
      setCopied(false);
    },
    onError: () => addToast({ type: 'error', title: 'Failed to reset password' }),
  });

  if (!user) return null;

  const r = ROLE_COLOR[user.role] || ROLE_COLOR.user;
  const s = STATUS_META[user.status] || STATUS_META.active;
  const isSuspended = user.status === 'suspended';

  const handleCopy = () => {
    if (!resetPw) return;
    navigator.clipboard.writeText(resetPw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCloseReset = () => {
    setResetPw(null);
    setCopied(false);
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} title={`USER: ${user.email}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Identity card */}
          <div>
            <div style={cardTitle}>IDENTITY</div>
            <div style={rowStyle}>
              <span style={lblStyle}>EMAIL</span>
              <span style={valStyle}>{user.email}</span>
            </div>
            <div style={rowStyle}>
              <span style={lblStyle}>FULL NAME</span>
              <span style={valStyle}>{user.name || '—'}</span>
            </div>
            <div style={rowStyle}>
              <span style={lblStyle}>DISPLAY NAME</span>
              <span style={valStyle}>{user.displayName || '—'}</span>
            </div>
            <div style={rowStyle}>
              <span style={lblStyle}>MOBILE</span>
              <span style={valStyle}>{user.mobile ? `${user.phoneCountry || ''} ${user.mobile}`.trim() : '—'}</span>
            </div>
            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={lblStyle}>ACCOUNTS</span>
              <span style={{ ...valStyle, fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', color: 'var(--accent-blue)' }}>
                {user._count.accounts}
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginLeft: '8px' }}>
                  / {user.role === 'user' ? '1' : '∞'}
                </span>
              </span>
            </div>
          </div>

          {/* Status & timestamps */}
          <div>
            <div style={cardTitle}>ACCOUNT INFO</div>
            <div style={rowStyle}>
              <span style={lblStyle}>STATUS</span>
              <span style={{ ...valStyle, color: s.color }}>● {s.label}</span>
            </div>
            <div style={rowStyle}>
              <span style={lblStyle}>CREATED</span>
              <span style={valStyle}>{new Date(user.createdAt).toLocaleString()}</span>
            </div>
            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={lblStyle}>LAST LOGIN</span>
              <span style={valStyle}>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}</span>
            </div>
          </div>

          {/* Admin actions */}
          {!isSelf && (
            <div>
              <div style={cardTitle}>ADMIN ACTIONS</div>

              {/* Role */}
              <div style={rowStyle}>
                <span style={lblStyle}>ROLE</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
                    padding: '3px 8px', border: `1px solid ${r.border}`, color: r.color, background: r.bg,
                  }}>{r.label}</span>
                  <select
                    value={user.role}
                    onChange={e => roleMutation.mutate({ id: user.id, role: e.target.value })}
                    disabled={roleMutation.isPending}
                    style={sel}
                  >
                    <option value="user">User (limit: 1)</option>
                    <option value="vip">VIP (unlimited)</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              {/* Suspend / Activate */}
              <div style={rowStyle}>
                <span style={lblStyle}>ACCESS</span>
                <div>
                  {isSuspended ? (
                    <button
                      onClick={() => statusMutation.mutate({ id: user.id, status: 'active' })}
                      disabled={statusMutation.isPending}
                      style={btn('var(--success)', 'rgba(52,211,153,.08)')}
                    >
                      ACTIVATE
                    </button>
                  ) : (
                    <button
                      onClick={() => statusMutation.mutate({ id: user.id, status: 'suspended' })}
                      disabled={statusMutation.isPending}
                      style={btn('var(--warning)', 'rgba(251,191,36,.08)')}
                    >
                      SUSPEND
                    </button>
                  )}
                </div>
              </div>

              {/* Reset password */}
              <div style={rowStyle}>
                <span style={lblStyle}>PASSWORD</span>
                <div>
                  <button
                    onClick={() => setResetConfirm(true)}
                    disabled={resetMutation.isPending}
                    style={btn('var(--accent-blue)', 'rgba(96,165,250,.08)')}
                  >
                    {resetMutation.isPending ? 'RESETTING...' : 'RESET PASSWORD'}
                  </button>
                </div>
              </div>

              {/* Delete */}
              <div style={{ ...rowStyle, borderBottom: 'none' }}>
                <span style={lblStyle}>DANGER ZONE</span>
                <div>
                  <button
                    onClick={() => onDelete(user.id)}
                    style={btn('var(--danger)', 'rgba(248,113,113,.08)')}
                  >
                    DELETE USER
                  </button>
                </div>
              </div>
            </div>
          )}

          {isSelf && (
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
              color: 'var(--text-dim)', padding: '10px',
              background: 'rgba(42,45,52,.2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
            }}>
              ⓘ This is your own account. Use Profile page to manage your own settings.
            </div>
          )}
        </div>
      </Dialog>

      {/* Reset password confirmation */}
      <Dialog open={resetConfirm} onClose={() => setResetConfirm(false)} title="RESET PASSWORD?">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)', lineHeight: 1.6 }}>
            Generate a new random password for <span style={{ color: 'var(--accent-blue)' }}>{user.email}</span>?<br />
            <span style={{ color: 'var(--warning)', fontSize: 'var(--fs-micro)' }}>
              ⚠ The current password will stop working immediately. You'll see the new password once — copy and share it securely.
            </span>
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setResetConfirm(false)}
              style={{ flex: 1, fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '10px', background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', cursor: 'pointer' }}>
              CANCEL
            </button>
            <button
              onClick={() => resetMutation.mutate(user.id)}
              disabled={resetMutation.isPending}
              style={{ flex: 1, fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '10px', background: 'var(--accent-blue)', color: '#25272c', border: '1px solid var(--accent-blue)', cursor: 'pointer', opacity: resetMutation.isPending ? .5 : 1 }}
            >
              {resetMutation.isPending ? '...' : 'GENERATE'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Show generated password */}
      <Dialog open={!!resetPw} onClose={handleCloseReset} title="NEW PASSWORD GENERATED">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)', lineHeight: 1.6 }}>
            New password for <span style={{ color: 'var(--accent-blue)' }}>{user.email}</span>:
          </p>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: '18px',
            color: 'var(--accent-blue)', letterSpacing: '2px',
            padding: '14px', background: 'var(--bg-input)',
            border: '1px solid var(--accent-blue)', textAlign: 'center',
            wordBreak: 'break-all',
          }}>
            {resetPw}
          </div>
          <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--warning)', lineHeight: 1.5 }}>
            ⚠ This is shown only once. Copy now and share with the user via a secure channel (e.g. Telegram, Signal).
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleCopy}
              style={{ flex: 1, fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '10px', background: copied ? 'var(--success)' : 'var(--accent-blue)', color: '#25272c', border: `1px solid ${copied ? 'var(--success)' : 'var(--accent-blue)'}`, cursor: 'pointer' }}>
              {copied ? '✓ COPIED' : '📋 COPY'}
            </button>
            <button onClick={handleCloseReset}
              style={{ flex: 1, fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '10px', background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', cursor: 'pointer' }}>
              CLOSE
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
};
