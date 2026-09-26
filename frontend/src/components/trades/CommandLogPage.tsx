import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCommands, type CommandRow } from '../../services/api';
import { useTranslation } from '../../i18n/useTranslation';
import { useUIStore } from '../../stores/uiStore';

/**
 * What was sent to the EAs, and what came back.
 *
 * Every command has been recorded since the dashboard learned to send
 * them, with nowhere to look at them. "Queued" is not an answer when the
 * question is whether the EA picked it up, what the broker said, or
 * which of the several guards refused it — and on the day a trade does
 * not appear in MT5, this page is the difference between knowing why and
 * guessing.
 */

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  done:    { label: 'DONE',    color: 'var(--success)',     bg: 'rgba(52,211,153,.10)' },
  failed:  { label: 'FAILED',  color: 'var(--danger)',      bg: 'rgba(248,113,113,.10)' },
  dropped: { label: 'DROPPED', color: 'var(--warning)',     bg: 'rgba(251,191,36,.10)' },
  sent:    { label: 'SENT',    color: 'var(--accent-blue)', bg: 'rgba(96,165,250,.10)' },
  queued:  { label: 'QUEUED',  color: 'var(--text-dim)',    bg: 'var(--bg-input)' },
};

const TYPE_LABEL: Record<string, string> = {
  OPEN_TRADE: 'cmd.open',
  CLOSE_POSITION: 'cmd.close',
  SET_SLTP: 'cmd.sltp',
  CLOSE_ALL: 'cmd.close_all',
};

const stamp = (iso: string): string => {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;
};

/** How long the EA took to answer, which is the number that says whether
 *  it is listening. */
const took = (row: CommandRow): string | null => {
  if (!row.settledAt) return null;
  const ms = new Date(row.settledAt).getTime() - new Date(row.createdAt).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

export const CommandLogPage = () => {
  const t = useTranslation();
  const setPage = useUIStore(s => s.setCurrentPage);
  const [status, setStatus] = useState<string>('all');
  const [accountId, setAccountId] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['commands', status, accountId],
    queryFn: () => fetchCommands({
      ...(status !== 'all' && { status }),
      ...(accountId !== 'all' && { accountId }),
    }),
    // Something queued is something still happening; keep it moving
    // without making the page feel like it is reloading.
    refetchInterval: 8000,
  });

  const rows = data?.commands ?? [];

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-sm)', padding: '12px', minWidth: 0,
  };
  const chip = (on: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: '999px', cursor: 'pointer',
    fontFamily: 'var(--ff-body)', fontSize: '13px',
    background: on ? 'rgba(96,165,250,.12)' : 'var(--bg-input)',
    border: `1px solid ${on ? 'var(--accent-blue)' : 'var(--border2)'}`,
    color: on ? 'var(--accent-blue)' : 'var(--text-primary)',
  });

  return (
    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={() => setPage('dashboard')}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: 'var(--accent-blue)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
          }}
        >‹ {t('common.back')}</button>
        <div style={{
          fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-section)',
          color: 'var(--text-primary)', letterSpacing: '1px',
        }}>{t('cmd.title')}</div>
      </div>

      <p style={{
        fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
        color: 'var(--text-muted)', lineHeight: 1.6, margin: 0,
      }}>{t('cmd.intro')}</p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {['all', 'done', 'failed', 'dropped', 'queued'].map(s => (
          <button key={s} onClick={() => setStatus(s)} style={chip(status === s)}>
            {s === 'all' ? t('cmd.all') : STATUS[s].label}
          </button>
        ))}
        {(data?.accounts.length ?? 0) > 1 && (
          <select
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            style={{
              marginLeft: 'auto', background: 'var(--bg-input)', border: '1px solid var(--border2)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              fontFamily: 'var(--ff-body)', fontSize: '13px', padding: '7px 10px', cursor: 'pointer',
            }}
          >
            <option value="all">{t('cmd.all_accounts')}</option>
            {data?.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {isLoading && (
        <div style={{ ...card, color: 'var(--text-muted)', fontFamily: 'var(--ff-body)' }}>{t('common.loading')}</div>
      )}

      {!isLoading && rows.length === 0 && (
        <div style={{ ...card, color: 'var(--text-muted)', fontFamily: 'var(--ff-body)', lineHeight: 1.7 }}>
          {t('cmd.none')}
        </div>
      )}

      {rows.map(row => {
        const s = STATUS[row.status] ?? STATUS.queued;
        const elapsed = took(row);
        return (
          <div key={row.commandId} style={{ ...card, borderLeft: `2px solid ${s.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span style={{
                fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-micro)', letterSpacing: '1px',
                padding: '3px 8px', borderRadius: '999px',
                color: s.color, background: s.bg, border: `1px solid ${s.color}`,
              }}>{s.label}</span>
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: '14.5px', color: 'var(--text-primary)' }}>
                {t(TYPE_LABEL[row.type] ?? 'cmd.other')}
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--ff-body)', fontSize: '12px', color: 'var(--text-primary)' }}>
                {stamp(row.createdAt)}
              </span>
            </div>

            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: '14.5px', color: 'var(--text-primary)',
              lineHeight: 1.6, wordBreak: 'break-word',
            }}>{row.detail || '—'}</div>

            {row.result && (
              <div style={{
                marginTop: '6px', fontFamily: 'var(--ff-body)', fontSize: '13.5px',
                color: row.status === 'done' ? 'var(--success)' : row.status === 'queued' ? 'var(--text-dim)' : 'var(--danger)',
                lineHeight: 1.6, wordBreak: 'break-word',
              }}>{row.result}</div>
            )}

            <div style={{
              marginTop: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap',
              fontFamily: 'var(--ff-body)', fontSize: '12px', color: 'var(--text-muted)',
            }}>
              <span>{row.account}{row.accountNumber ? ` · #${row.accountNumber}` : ''}</span>
              {elapsed && <span>{t('cmd.took')} {elapsed}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
