import { useState } from 'react';
import { useTranslation } from '../../i18n/useTranslation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  changeUserRole, changeUserStatus, resetUserPassword, setUserAi, fetchAiUsage,
} from '../../services/api';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '../../stores/uiStore';
import { Dialog } from '../ui/Dialog';
import type { UserInfo } from '../../types';
import { formatDateTime } from '../../utils/formatters';

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

const STATUS_META: Record<string, { color: string; labelKey: string }> = {
  active:    { color: 'var(--success)', labelKey: 'status.active' },
  pending:   { color: 'var(--warning)', labelKey: 'status.pending' },
  rejected:  { color: 'var(--danger)',  labelKey: 'status.rejected' },
  suspended: { color: 'var(--warning)', labelKey: 'status.suspended' },
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
  const t = useTranslation();
  const queryClient = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const [resetPw, setResetPw] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [limitDraft, setLimitDraft] = useState<string | null>(null);

  /** What this person has cost so far this month. A limit with no usage
   *  beside it is a number picked out of the air. */
  const usage = useQuery({
    queryKey: ['ai-usage'],
    queryFn: fetchAiUsage,
    enabled: !!user,
    staleTime: 60_000,
  });

  const aiMutation = useMutation({
    mutationFn: ({ id, ...next }: { id: string; enabled?: boolean; dailyLimit?: number }) => setUserAi(id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      addToast({ type: 'success', title: t('ud.ai_saved') });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed';
      addToast({ type: 'error', title: msg });
    },
  });

  const open = !!user;
  const isSelf = user?.id === currentUserId;

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => changeUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      addToast({ type: 'success', title: t('ud.role_updated') });
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
      addToast({ type: 'success', title: v.status === 'suspended' ? t('ud.suspended') : t('ud.reactivated') });
    },
    onError: () => addToast({ type: 'error', title: t('admin.status_failed') }),
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => resetUserPassword(id),
    onSuccess: (data) => {
      setResetPw(data.newPassword);
      setResetConfirm(false);
      setCopied(false);
    },
    onError: () => addToast({ type: 'error', title: t('ud.reset_failed') }),
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
            <div style={cardTitle}>{t('ud.identity')}</div>
            <div style={rowStyle}>
              <span style={lblStyle}>{t('auth.email').toUpperCase()}</span>
              <span style={valStyle}>{user.email}</span>
            </div>
            <div style={rowStyle}>
              <span style={lblStyle}>{t('admin.full_name')}</span>
              <span style={valStyle}>{user.name || '—'}</span>
            </div>
            <div style={rowStyle}>
              <span style={lblStyle}>{t('admin.display_name')}</span>
              <span style={valStyle}>{user.displayName || '—'}</span>
            </div>
            <div style={rowStyle}>
              <span style={lblStyle}>{t('admin.mobile')}</span>
              <span style={valStyle}>{user.mobile ? `${user.phoneCountry || ''} ${user.mobile}`.trim() : '—'}</span>
            </div>
            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={lblStyle}>{t('ud.accounts')}</span>
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
            <div style={cardTitle}>{t('ud.account_info')}</div>
            <div style={rowStyle}>
              <span style={lblStyle}>{t('admin.col_status')}</span>
              <span style={{ ...valStyle, color: s.color }}>● {t(s.labelKey)}</span>
            </div>
            <div style={rowStyle}>
              <span style={lblStyle}>{t('ud.sign_in')}</span>
              <span style={valStyle}>{
                user.signIn === 'google' ? t('ud.signin_google')
                  : user.signIn === 'both' ? t('ud.signin_both')
                  : user.signIn === 'password' ? t('ud.signin_password')
                  : '—'
              }</span>
            </div>
            <div style={rowStyle}>
              <span style={lblStyle}>{t('ud.created')}</span>
              <span style={valStyle}>{formatDateTime(user.createdAt)}</span>
            </div>
            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={lblStyle}>{t('ud.last_login')}</span>
              <span style={valStyle}>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}</span>
            </div>
          </div>

          {/* Admin actions */}
          {!isSelf && (
            <div>
              <div style={cardTitle}>{t('ud.admin_actions')}</div>

              {/* Role */}
              <div style={rowStyle}>
                <span style={lblStyle}>{t('admin.col_role')}</span>
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
                    <option value="user">{t('ud.role_user')}</option>
                    <option value="vip">{t('ud.role_vip')}</option>
                    <option value="admin">{t('ud.role_admin')}</option>
                  </select>
                </div>
              </div>

              {/* The assistant: who may ask, and how often */}
              <div style={rowStyle}>
                <span style={lblStyle}>{t('ud.ai_access')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {user.role === 'admin' ? (
                    <span style={{ ...valStyle, color: 'var(--success)' }}>{t('ud.ai_admin')}</span>
                  ) : (
                    <>
                      <select
                        value={user.aiEnabled ? 'on' : 'off'}
                        onChange={e => aiMutation.mutate({ id: user.id, enabled: e.target.value === 'on' })}
                        disabled={aiMutation.isPending}
                        style={sel}
                      >
                        <option value="off">{t('ud.ai_off')}</option>
                        <option value="on">{t('ud.ai_on')}</option>
                      </select>
                      {user.aiEnabled && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', ...valStyle }}>
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            value={limitDraft ?? String(user.aiDailyLimit ?? 30)}
                            onChange={e => setLimitDraft(e.target.value)}
                            onBlur={() => {
                              const n = Number(limitDraft);
                              setLimitDraft(null);
                              if (limitDraft !== null && Number.isFinite(n) && n !== user.aiDailyLimit) {
                                aiMutation.mutate({ id: user.id, dailyLimit: Math.max(0, Math.round(n)) });
                              }
                            }}
                            style={{ ...sel, width: '74px', cursor: 'text' }}
                          />
                          <span style={{ color: 'var(--text-dim)' }}>{t('ud.ai_per_day')}</span>
                        </label>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* What it has cost this month */}
              {(() => {
                const row = usage.data?.usage.find(u => u.userId === user.id);
                const prices = usage.data?.prices;
                if (!row || !prices) return null;
                const baht = (row.inTokens / 1e6) * prices.inPerM + (row.outTokens / 1e6) * prices.outPerM;
                return (
                  <div style={rowStyle}>
                    <span style={lblStyle}>{t('ud.ai_usage')}</span>
                    <div style={valStyle}>
                      {row.questions} {t('ud.ai_questions')} · {(row.inTokens + row.outTokens).toLocaleString()} tokens
                      {/* A handful of questions costs fractions of a baht,
                          and ฿0.00 reads as free rather than as small. */}
                      <span style={{ color: 'var(--text-dim)' }}>
                        {' · ≈ '}{baht > 0 && baht < 0.01 ? '< ฿0.01' : `฿${baht.toFixed(2)}`}
                      </span>
                      {user.role !== 'admin' && !!user.aiDailyLimit && (
                        <span style={{ color: 'var(--text-dim)' }}> · {t('ud.ai_today')} {row.today}/{user.aiDailyLimit}</span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Suspend / Activate */}
              <div style={rowStyle}>
                <span style={lblStyle}>{t('ud.access')}</span>
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
                <span style={lblStyle}>{t('ud.password')}</span>
                <div>
                  <button
                    onClick={() => setResetConfirm(true)}
                    disabled={resetMutation.isPending}
                    style={btn('var(--accent-blue)', 'rgba(96,165,250,.08)')}
                  >
                    {resetMutation.isPending ? t('ud.resetting') : t('ud.reset_password')}
                  </button>
                </div>
              </div>

              {/* Delete */}
              <div style={{ ...rowStyle, borderBottom: 'none' }}>
                <span style={lblStyle}>{t('ud.danger')}</span>
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
      <Dialog open={resetConfirm} onClose={() => setResetConfirm(false)} title={t('ud.reset_dialog')}>
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
      <Dialog open={!!resetPw} onClose={handleCloseReset} title={t('ud.new_password_dialog')}>
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
