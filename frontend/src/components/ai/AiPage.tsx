import { useEffect, useRef, useState } from 'react';
import { askAi, fetchAiContext, fetchAiStatus, type AiContext, type AiStatus } from '../../services/api';
import { useTranslation } from '../../i18n/useTranslation';
import { useUIStore } from '../../stores/uiStore';
import { IconSpark } from '../icons';

/**
 * The assistant's room.
 *
 * The screens go in before any model does, so this page has to be honest
 * about that: it asks the server whether a provider is connected and says so
 * in the one place a person would look for an answer, rather than letting
 * the first question fail with a red toast.
 *
 * The screen is mostly the conversation. Everything that is true whether or
 * not anyone is talking — what the assistant can see, whether it is
 * connected, what it cannot do — is one line at the top that opens when
 * tapped. The first version put all of it on the page at once, and the
 * conversation started halfway down.
 *
 * It is a sheet over the page rather than a page of its own, and it closes
 * by being pushed down. The first version put a BACK button in the top left
 * corner — the one place a thumb cannot reach on a phone held in one hand,
 * which is how this app is mostly used. Dragging the handle, flicking it
 * down, tapping the dimmed page behind it and Escape all close it.
 */

interface Message {
  id: number;
  who: 'me' | 'ai';
  text: string;
}

export const AiSheet = () => {
  const t = useTranslation();
  const open = useUIStore(st => st.aiOpen);
  const setOpen = useUIStore(st => st.setAiOpen);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [ctx, setCtx] = useState<AiContext | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  // How far the sheet has been pushed down, in px, while a finger is on it.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startedAt = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  const close = () => { setDragY(0); setDragging(false); setOpen(false); };

  // Escape closes it, like any other overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  /**
   * Push-down-to-close.
   *
   * A drag starts only when the conversation is already scrolled to the top,
   * or when the finger is on the handle — otherwise every attempt to scroll
   * the messages would drag the sheet instead. Past a third of the way down,
   * or on a quick flick, it closes; anything less springs back.
   */
  const onTouchStart = (e: React.TouchEvent, fromHandle = false) => {
    const touch = e.touches[0];
    if (!touch) return;
    const atTop = (scroller.current?.scrollTop ?? 0) <= 0;
    if (!fromHandle && !atTop) return;
    startY.current = touch.clientY;
    startedAt.current = Date.now();
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dy = touch.clientY - startY.current;
    setDragY(dy > 0 ? dy : 0);
  };

  const onTouchEnd = () => {
    if (!dragging) return;
    const travelled = dragY;
    const ms = Math.max(1, Date.now() - startedAt.current);
    const speed = travelled / ms;           // px per millisecond

    // Two ways to mean it, and a short quick swipe is neither. The first
    // version closed on 60px in under 300ms, which is also what flicking
    // the conversation to scroll it feels like — so the sheet kept leaving
    // when the intent was to read. A throw now has to cover 140px as well
    // as be quick: distance is what separates "away with it" from a flick
    // of the wrist, and it is the part a thumb does on purpose.
    const deliberate = travelled > window.innerHeight * 0.3;
    const thrown = speed > 0.7 && travelled > 140;

    setDragging(false);
    if (deliberate || thrown) close();
    else setDragY(0);
  };

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

  const chips = [t('ai.suggest_today'), t('ai.suggest_risk'), t('ai.suggest_compare'), t('ai.suggest_week')];

  if (!open) return null;

  return (
    <div
      className="ai-backdrop"
      onClick={e => { if (e.target === e.currentTarget) close(); }}
      onTouchEnd={e => { if (e.target === e.currentTarget) close(); }}
      style={{ opacity: dragging ? Math.max(0.25, 1 - dragY / 400) : 1 }}
    >
      <div
        className="ai-sheet"
        onTouchStart={e => onTouchStart(e)}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform .22s cubic-bezier(.2,.8,.3,1)',
        }}
      >
        {/* The handle. Dragging it works wherever the conversation happens to
            be scrolled, which is why it is its own target. */}
        <div
          className="ai-grip"
          onTouchStart={e => onTouchStart(e, true)}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={close}
          role="button"
          aria-label="Close"
        >
          <span />
        </div>

        <div className="ai-scroll" ref={scroller} style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0, flex: 1 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <span style={{
          fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
          color: 'var(--text-dim)', letterSpacing: '2px',
        }}>{t('ai.title')}</span>
        <div style={{ flex: 1 }} />
        {/* A mouse has no swipe, and a keyboard user needs a target. */}
        <button
          onClick={close}
          aria-label="Close"
          style={{
            background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1, flexShrink: 0,
          }}
        >✕</button>
      </div>

      {/* One line for everything that is true whether or not anyone is
          talking. Tap it for the rest. */}
      <button
        onClick={() => setShowDetails(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
          background: 'var(--bg-card)', border: '1px solid var(--border2)',
          borderRadius: 'var(--radius-sm)', padding: '8px 10px',
          cursor: 'pointer', textAlign: 'left', minWidth: 0,
        }}
      >
        {status && !status.configured && (
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--warning)', flexShrink: 0,
          }} />
        )}
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)',
        }}>
          {ctx
            ? `${ctx.openOrders} ${t('ai.sum_open')} · ${ctx.losingOrders} ${t('ai.sum_losing')} · ${ctx.ordersWithoutStop} ${t('ai.sum_nosl')} · ${money(ctx.todayPnl)}`
            : t('ai.watching')}
        </span>
        <span style={{ ...lbl, flexShrink: 0 }}>
          {showDetails ? t('ai.hide_details') : t('ai.details')} {showDetails ? '▴' : '▾'}
        </span>
      </button>

      {showDetails && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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

          {status && !status.configured && (
            <div style={{
              padding: '10px 12px', borderRadius: 'var(--radius-sm)',
              background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.3)',
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
              color: 'var(--text-dim)', lineHeight: 1.6,
            }}>
              <span style={{ color: 'var(--warning)' }}>{t('ai.not_connected')}</span>
              {' — '}{t('ai.not_connected_body')}
            </div>
          )}

          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
            color: 'var(--text-muted)', lineHeight: 1.6,
          }}>{t('ai.disclaimer')}</div>
        </div>
      )}

      {/* The conversation, which is what the screen is for */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0, flex: 1 }}>
        {messages.length === 0 && (
          <div style={{ ...card, borderLeft: '2px solid var(--accent-blue)' }}>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
              color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '12px',
            }}>
              {status && !status.configured ? t('ai.offline_short') : t('ai.greeting')}
            </div>
            <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
              {chips.map(c => (
                <button
                  key={c}
                  onClick={() => send(c)}
                  disabled={busy}
                  style={{
                    fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
                    color: 'var(--text-dim)', background: 'var(--bg-input)',
                    border: '1px solid var(--border2)', borderRadius: '999px',
                    padding: '6px 11px', cursor: busy ? 'default' : 'pointer',
                  }}
                >{c}</button>
              ))}
            </div>
          </div>
        )}

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
      </div>

      <style>{`
        .ai-backdrop {
          /* Above the header (100) and its menus (600): a sheet that leaves
             the header tappable is a sheet you can start a second thing from
             while it is open, and the header also swallowed taps meant for
             the dimmed area behind it. */
          position: fixed; inset: 0; z-index: 900;
          background: rgba(0,0,0,.5);
          display: flex; align-items: flex-end; justify-content: center;
        }
        .ai-sheet {
          width: 100%; max-width: 640px;
          height: 88vh; max-height: 88vh;
          background: var(--bg-primary);
          border: 1px solid var(--border2);
          border-bottom: none;
          border-radius: 16px 16px 0 0;
          box-shadow: 0 -10px 40px rgba(0,0,0,.5);
          display: flex; flex-direction: column;
          overflow: hidden;
          animation: ai-rise .24s cubic-bezier(.2,.8,.3,1);
        }
        @keyframes ai-rise { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .ai-grip {
          padding: 10px 0 6px; display: flex; justify-content: center;
          flex-shrink: 0; cursor: pointer; touch-action: none;
        }
        .ai-grip span {
          width: 42px; height: 4px; border-radius: 2px;
          background: var(--border2); display: block;
        }
        .ai-scroll {
          overflow-y: auto; overscroll-behavior: contain;
          padding: 4px 16px calc(16px + env(safe-area-inset-bottom, 0px));
        }
        /* On a desktop it is a panel, not a sheet: nothing to swipe, and a
           full-height column of chat on a wide screen reads badly. */
        @media (min-width: 768px) {
          .ai-backdrop { align-items: center; }
          .ai-sheet { height: 80vh; border-radius: 12px; border-bottom: 1px solid var(--border2); }
          .ai-grip { display: none; }
        }
      `}</style>
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
