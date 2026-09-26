import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAccounts, openTrade, closePosition, setPositionSLTP, closeAllOrders, waitForCommand,
} from '../../services/api';
import { useTranslation } from '../../i18n/useTranslation';
import type { Account } from '../../types';

/**
 * An order the assistant wrote out, and the button that sends it.
 *
 * The assistant does not place trades. It cannot: nothing it says
 * reaches the EA. What it can do is fill the form in — and the only
 * thing between that and a position in the market is a person reading
 * it and pressing confirm. That is the whole safety model, so the card
 * shows every field that will be sent, in words, and says which account
 * and whether that account is real money.
 */

export interface Draft {
  action: 'open' | 'close' | 'sltp' | 'closeAll';
  account: string;
  symbol?: string;
  side?: 'buy' | 'sell';
  lots?: number;
  orderType?: 'market' | 'limit' | 'stop';
  price?: number;
  sl?: number;
  tp?: number;
  ticket?: number;
}

/** Fenced block, whatever the model labelled it, as long as it holds an
 *  object with an action we know. */
const BLOCK = /```[a-zA-Z]*\s*(\{[\s\S]*?\})\s*```/g;

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Pull the draft out of an answer, and hand back the answer without it.
 *
 * A model that writes two blocks, or a block of something else, gets the
 * first one that parses into an order and nothing more — the rest stays
 * as text, where a person can see it.
 */
export const readDraft = (text: string): { draft: Draft | null; rest: string } => {
  let draft: Draft | null = null;
  let rest = text;

  for (const m of text.matchAll(BLOCK)) {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(m[1]) as Record<string, unknown>; } catch { continue; }

    const action = String(parsed.action ?? '');
    if (!['open', 'close', 'sltp', 'closeAll'].includes(action)) continue;
    if (typeof parsed.account !== 'string') continue;

    draft = {
      action: action as Draft['action'],
      account: parsed.account,
      ...(typeof parsed.symbol === 'string' && { symbol: parsed.symbol }),
      ...(parsed.side === 'buy' || parsed.side === 'sell' ? { side: parsed.side } : {}),
      ...(num(parsed.lots) !== undefined && { lots: num(parsed.lots) }),
      ...(['market', 'limit', 'stop'].includes(String(parsed.orderType))
        ? { orderType: String(parsed.orderType) as Draft['orderType'] } : {}),
      ...(num(parsed.price) !== undefined && { price: num(parsed.price) }),
      ...(num(parsed.sl) !== undefined && { sl: num(parsed.sl) }),
      ...(num(parsed.tp) !== undefined && { tp: num(parsed.tp) }),
      ...(num(parsed.ticket) !== undefined && { ticket: num(parsed.ticket) }),
    };
    rest = text.replace(m[0], '').trim();
    break;
  }

  return { draft, rest };
};

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'waiting' }
  | { kind: 'settled'; ok: boolean; text: string }
  | { kind: 'cancelled' };

export const OrderDraftCard = ({ draft }: { draft: Draft }) => {
  const t = useTranslation();
  const [state, setState] = useState<State>({ kind: 'idle' });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
    staleTime: 30_000,
  });

  // The model is told to use the account number, with its #, because that
  // is what appears in front of a person. Match on the digits either way.
  const wanted = draft.account.replace(/[^0-9]/g, '');
  const account = (accounts ?? []).find(a => a.accountNumber.replace(/[^0-9]/g, '') === wanted);

  const lots = draft.lots ?? 0;
  const kind = draft.orderType ?? 'market';
  const noStop = draft.action === 'open' && !draft.sl;

  const what = (): string => {
    if (draft.action === 'close') return `${t('draft.close')} #${draft.ticket}`;
    if (draft.action === 'closeAll') return t('draft.close_all');
    if (draft.action === 'sltp') {
      return `#${draft.ticket} · SL ${draft.sl || '—'} · TP ${draft.tp || '—'}`;
    }
    const side = draft.side === 'sell' ? t('draft.sell') : t('draft.buy');
    const at = kind === 'market' ? t('draft.at_market') : `${kind} @ ${draft.price}`;
    return `${side} ${draft.symbol} ${lots.toFixed(2)} lot · ${at}`;
  };

  const send = async () => {
    if (!account) return;
    setState({ kind: 'sending' });
    try {
      let commandId = '';
      if (draft.action === 'open') {
        const r = await openTrade(account.id, {
          symbol: draft.symbol ?? '',
          action: draft.side === 'sell' ? 'SELL' : 'BUY',
          volume: lots,
          orderType: kind,
          ...(kind !== 'market' && { price: draft.price ?? 0 }),
          ...(draft.sl ? { sl: draft.sl } : {}),
          ...(draft.tp ? { tp: draft.tp } : {}),
        });
        commandId = r.commandId;
      } else if (draft.action === 'close') {
        commandId = (await closePosition(account.id, draft.ticket ?? 0)).commandId;
      } else if (draft.action === 'sltp') {
        commandId = (await setPositionSLTP(account.id, draft.ticket ?? 0, draft.sl ?? 0, draft.tp ?? 0)).commandId;
      } else {
        const r = await closeAllOrders(account.id) as { commandId?: string };
        commandId = r.commandId ?? '';
      }

      setState({ kind: 'waiting' });
      const outcome = commandId ? await waitForCommand(account.id, commandId) : null;
      if (!outcome) {
        setState({ kind: 'settled', ok: true, text: t('draft.sent_no_answer') });
        return;
      }
      setState({
        kind: 'settled',
        ok: outcome.status === 'done',
        text: outcome.result || (outcome.status === 'done' ? t('draft.done') : t('draft.refused')),
      });
    } catch (err) {
      const data = (err as { response?: { data?: { error?: string; message?: string } } }).response?.data;
      setState({ kind: 'settled', ok: false, text: data?.error || data?.message || t('ai.unreachable') });
    }
  };

  const row: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', gap: '12px',
    fontFamily: 'var(--ff-body)', fontSize: '14px', color: 'var(--text-primary)',
    padding: '3px 0',
  };
  const dim: React.CSSProperties = { color: 'var(--text-muted)' };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${state.kind === 'settled' ? (state.ok ? 'var(--success)' : 'var(--danger)') : 'var(--accent-blue)'}`,
      borderRadius: 'var(--radius-sm)', padding: '12px', minWidth: 0,
    }}>
      <div style={{
        fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-micro)', letterSpacing: '1px',
        color: 'var(--accent-blue)', marginBottom: '8px',
      }}>{t('draft.title')}</div>

      <div style={{ ...row, fontSize: '16px', fontWeight: 600 }}>{what()}</div>

      <div style={row}>
        <span style={dim}>{t('draft.account')}</span>
        <span>
          {account ? `${account.name} · #${account.accountNumber}` : `#${draft.account.replace(/[^0-9]/g, '')}`}
          {account && !account.isDemo && (
            <span style={{ color: 'var(--warning)' }}> · {t('draft.live')}</span>
          )}
          {account?.isDemo && <span style={{ color: 'var(--text-muted)' }}> · DEMO</span>}
        </span>
      </div>

      {draft.action === 'open' && (
        <div style={row}>
          <span style={dim}>SL / TP</span>
          <span style={noStop ? { color: 'var(--warning)' } : undefined}>
            {draft.sl ? draft.sl : t('draft.no_sl')} / {draft.tp ? draft.tp : '—'}
          </span>
        </div>
      )}

      {!account && (
        <div style={{
          marginTop: '8px', fontFamily: 'var(--ff-body)', fontSize: '13.5px',
          color: 'var(--danger)', lineHeight: 1.6,
        }}>{t('draft.no_account')}</div>
      )}

      {noStop && account && (
        <div style={{
          marginTop: '8px', fontFamily: 'var(--ff-body)', fontSize: '13px',
          color: 'var(--warning)', lineHeight: 1.6,
        }}>{t('draft.no_sl_warning')}</div>
      )}

      {state.kind === 'settled' && (
        <div style={{
          marginTop: '10px', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
          background: state.ok ? 'rgba(52,211,153,.08)' : 'rgba(248,113,113,.08)',
          color: state.ok ? 'var(--success)' : 'var(--danger)',
          fontFamily: 'var(--ff-body)', fontSize: '14px', lineHeight: 1.6,
        }}>{state.ok ? '✓ ' : '✕ '}{state.text}</div>
      )}

      {state.kind === 'cancelled' && (
        <div style={{
          marginTop: '10px', fontFamily: 'var(--ff-body)', fontSize: '14px', color: 'var(--text-muted)',
        }}>{t('draft.cancelled')}</div>
      )}

      {(state.kind === 'idle' || state.kind === 'sending' || state.kind === 'waiting') && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button
            onClick={() => void send()}
            disabled={!account || state.kind !== 'idle'}
            style={{
              flex: 2, padding: '11px', borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'var(--accent-blue)', color: '#12151a',
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
              cursor: !account || state.kind !== 'idle' ? 'default' : 'pointer',
              opacity: !account || state.kind !== 'idle' ? .55 : 1,
            }}
          >
            {state.kind === 'sending' ? t('draft.sending')
              : state.kind === 'waiting' ? t('draft.waiting')
              : t('draft.confirm')}
          </button>
          <button
            onClick={() => setState({ kind: 'cancelled' })}
            disabled={state.kind !== 'idle'}
            style={{
              flex: 1, padding: '11px', borderRadius: 'var(--radius-sm)',
              background: 'none', border: '1px solid var(--border2)', color: 'var(--text-primary)',
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
              cursor: state.kind !== 'idle' ? 'default' : 'pointer',
            }}
          >{t('common.cancel')}</button>
        </div>
      )}
    </div>
  );
};
