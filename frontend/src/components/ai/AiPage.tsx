import { useEffect, useRef, useState } from 'react';
import { askAi, fetchAiContext, fetchAiStatus, type AiContext, type AiStatus } from '../../services/api';
import { useTranslation } from '../../i18n/useTranslation';
import { IconSpark, IconSend } from '../icons';

/**
 * The assistant's room.
 *
 * The screens go in before any model does, so this page has to be honest
 * about that: it asks the server whether a provider is connected and says so
 * in the one place a person would look for an answer, rather than letting
 * the first question fail with a red toast.
 *
 * The header strip is not decoration. It is the same set of figures the
 * assistant would be handed — accounts, open orders, how many are losing,
 * how many carry no stop — so what it is looking at is visible before it
 * says a word.
 */

interface Message {
  id: number;
  who: 'me' | 'ai';
  text: string;
}

export const AiPage = () => {
  const t = useTranslation();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [ctx, setCtx] = useState<AiContext | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    let alive = true;
    fetchAiStatus().then(s => { if (alive) setStatus(s); }).catch(() => {});
    fetchAiContext().then(c => { if (alive) setCtx(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setDraft('');
    setMessages(m => [...m, { id: nextId.current++, who: 'me', text: question }]);
    setBusy(true);
    try {
      const { reply } = await askAi(question);
      setMessages(m => [...m, { id: nextId.current++, who: 'ai', text: reply }]);
    } catch (err) {
      const answer = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setMessages(m => [...m, {
        id: nextId.current++, who: 'ai',
        text: answer || 'Could not reach the server. Please try again.',
      }]);
    } finally {
      setBusy(false);
    }
  };

  const lbl: React.CSSProperties = {
    fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-micro)',
    color: 'var(--text-muted)', letterSpacing: '1px',
  };
  const card: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-sm)', padding: '12px', minWidth: 0,
  };

  const stat = (label: string, value: string, color?: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...lbl, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{
        fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
        color: color ?? 'var(--text)', marginTop: '2px',
      }}>{value}</div>
    </div>
  );

  const money = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0, flex: 1 }}>

      {/* Section title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '7px', height: '7px', background: 'var(--accent-blue)', flexShrink: 0 }} />
        <span style={{
          fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
          color: 'var(--text)', letterSpacing: '2px',
        }}>{t('ai.title')}</span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
      </div>

      {/* What the assistant is looking at */}
      {ctx && (
        <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {stat(t('ai.ctx_accounts'), `${ctx.online}/${ctx.accounts}`)}
          {stat(t('ai.ctx_open'), String(ctx.openOrders))}
          {stat(t('ai.ctx_today'), money(ctx.todayPnl), ctx.todayPnl < 0 ? 'var(--red)' : 'var(--green)')}
          {stat(t('ai.ctx_losing'), String(ctx.losingOrders), ctx.losingOrders > 0 ? 'var(--red)' : undefined)}
          {stat(t('ai.ctx_nosl'), String(ctx.ordersWithoutStop), ctx.ordersWithoutStop > 0 ? 'var(--warning)' : undefined)}
          {stat(t('ai.ctx_history'), String(ctx.closedTrades30d))}
        </div>
      )}

      {/* Not connected yet — said once, at the top, not as a failed question */}
      {status && !status.configured && (
        <div style={{
          padding: '11px 12px', borderRadius: 'var(--radius-sm)',
          background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.3)',
        }}>
          <div style={{
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-label)',
            color: 'var(--warning)', letterSpacing: '1px', marginBottom: '5px',
          }}>{t('ai.not_connected')}</div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
            color: 'var(--text-dim)', lineHeight: 1.6,
          }}>{t('ai.not_connected_body')}</div>
        </div>
      )}

      {/* Conversation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
        <div style={{ ...card, borderLeft: '2px solid var(--accent-blue)' }}>
          <div style={{ ...lbl, marginBottom: '6px' }}>AI</div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
            color: 'var(--text-dim)', lineHeight: 1.7,
          }}>{t('ai.greeting')}</div>
        </div>

        {messages.map(m => m.who === 'me' ? (
          <div key={m.id} style={{
            marginLeft: '28px', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(96,165,250,.10)', border: '1px solid rgba(96,165,250,.35)',
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)',
            lineHeight: 1.6, wordBreak: 'break-word',
          }}>{m.text}</div>
        ) : (
          <div key={m.id} style={{ ...card, borderLeft: '2px solid var(--accent-blue)' }}>
            <div style={{ ...lbl, marginBottom: '6px' }}>AI</div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
              color: 'var(--text-dim)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{m.text}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Suggested questions — an empty box is harder to start than a menu */}
      <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
        {[t('ai.suggest_today'), t('ai.suggest_risk'), t('ai.suggest_compare'), t('ai.suggest_week')].map(s => (
          <button
            key={s}
            onClick={() => send(s)}
            disabled={busy}
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
              color: 'var(--text-dim)', background: 'var(--bg-card)',
              border: '1px solid var(--border2)', borderRadius: '999px',
              padding: '6px 11px', cursor: busy ? 'default' : 'pointer',
            }}
          >{s}</button>
        ))}
      </div>

      <div style={{
        fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
        color: 'var(--text-muted)', lineHeight: 1.6,
      }}>{t('ai.disclaimer')}</div>

      {/* Composer */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(draft); }}
          placeholder={t('ai.ask_placeholder')}
          style={{
            flex: 1, minWidth: 0, background: 'var(--bg-input)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
            color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
            padding: '10px 12px', outline: 'none',
          }}
        />
        <button
          onClick={() => send(draft)}
          disabled={busy || !draft.trim()}
          title={t('ai.send')}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
            background: 'var(--accent-blue)', color: '#12151a', border: 'none',
            borderRadius: 'var(--radius-sm)', padding: '10px 13px',
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-label)', letterSpacing: '1px',
            cursor: busy || !draft.trim() ? 'default' : 'pointer',
            opacity: busy || !draft.trim() ? .5 : 1,
          }}
        >
          <IconSpark size={14} />
          {t('ai.send')}
        </button>
      </div>
    </div>
  );
};

/**
 * The floating button that opens it, on phones only.
 *
 * It sits above the bottom bar rather than in it: the bar's four buttons are
 * places in the app, and this is an action that can be taken from any of
 * them. It hides itself on the AI page — a button that goes where you
 * already are is just something covering the text.
 */
export const AiFab = ({ onClick, hidden }: { onClick: () => void; hidden?: boolean }) => {
  if (hidden) return null;
  return (
    <button
      onClick={onClick}
      aria-label="AI"
      className="ai-fab"
    >
      <IconSpark size={22} />
      <style>{`
        .ai-fab {
          position: fixed;
          right: 16px;
          /* Clear of the bottom bar, and of the home indicator under it. */
          bottom: calc(68px + env(safe-area-inset-bottom, 0px));
          width: 52px; height: 52px; border-radius: 50%;
          display: none; align-items: center; justify-content: center;
          background: var(--accent-blue);
          color: #10141b;
          border: 1px solid rgba(255,255,255,.18);
          box-shadow: 0 6px 18px rgba(0,0,0,.45);
          cursor: pointer; z-index: 60;
          -webkit-tap-highlight-color: transparent;
        }
        .ai-fab:active { transform: scale(.94); }
        @media (max-width: 767px) {
          .ai-fab { display: flex; }
        }
      `}</style>
    </button>
  );
};
