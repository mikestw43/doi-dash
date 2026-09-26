import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { fetchAccountSymbols, openTrade } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';
import { useTranslation } from '../../i18n/useTranslation';

interface Props {
  accountId: string;
  accountName: string;
  currency: string;
  onClose: () => void;
}

type OrderType = 'market' | 'limit' | 'stop';

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
  padding: '7px 10px', outline: 'none', boxSizing: 'border-box', minWidth: 0,
};
const lbl: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
  color: 'var(--text-dim)', letterSpacing: '.5px', marginBottom: '6px',
};

export const NewTradeDialog = ({ accountId, accountName, currency, onClose }: Props) => {
  const { addToast } = useUIStore();
  const t = useTranslation();
  const [loading, setLoading] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [action, setAction] = useState<'BUY' | 'SELL'>('BUY');
  const [volume, setVolume] = useState('0.01');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [price, setPrice] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');

  // Suggestions: every symbol this account has held or traded. The box stays
  // a text field on top of them, so an instrument we have never seen can
  // still be typed in full.
  const [known, setKnown] = useState<string[]>([]);
  const [openList, setOpenList] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const rawCur = currency || 'USD';

  useEffect(() => {
    let alive = true;
    fetchAccountSymbols(accountId)
      .then(list => { if (alive) setKnown(list); })
      .catch(() => { /* suggestions are a convenience, not a requirement */ });
    return () => { alive = false; };
  }, [accountId]);

  // Type "xa" and every symbol holding those letters comes up, wherever they
  // sit in the name: a broker's gold is XAUUSD on one server and XAUUSD.v on
  // the next, and someone typing "gold" should not come away empty.
  const matches = useMemo(() => {
    const q = symbol.trim().toUpperCase();
    if (!q) return known.slice(0, 12);
    const starts = known.filter(s => s.toUpperCase().startsWith(q));
    const holds = known.filter(s => !s.toUpperCase().startsWith(q) && s.toUpperCase().includes(q));
    return [...starts, ...holds].slice(0, 12);
  }, [symbol, known]);

  // A click anywhere else closes the list. Without this it survives a tap on
  // the price field and covers it.
  useEffect(() => {
    if (!openList) return;
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenList(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [openList]);

  const pick = (s: string) => { setSymbol(s); setOpenList(false); };

  const onSymbolKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!openList || matches.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(matches[Math.min(highlight, matches.length - 1)]); }
    else if (e.key === 'Escape') { setOpenList(false); }
  };

  const needsPrice = orderType !== 'market';

  const handleSubmit = async () => {
    const vol = parseFloat(volume);
    if (!symbol.trim()) { addToast({ type: 'error', title: 'Symbol is required' }); return; }
    if (!vol || vol <= 0) { addToast({ type: 'error', title: 'Volume must be > 0' }); return; }
    if (needsPrice && (!price || parseFloat(price) <= 0)) {
      addToast({ type: 'error', title: `Price is required for ${orderType} orders` });
      return;
    }
    setLoading(true);
    try {
      await openTrade(accountId, {
        symbol: symbol.trim(), action, volume: vol,
        orderType,
        price: needsPrice ? parseFloat(price) : 0,
        sl: parseFloat(sl) || 0, tp: parseFloat(tp) || 0,
      });
      addToast({
        type: 'warning', title: 'Trade queued',
        message: `${action} ${vol} ${symbol.trim()} sent to EA (~2s)`,
      });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to queue trade';
      addToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const buyColor = action === 'BUY' ? 'var(--green)' : 'var(--text-dim)';
  const sellColor = action === 'SELL' ? 'var(--red)' : 'var(--text-dim)';
  const disabled = loading || !symbol || !parseFloat(volume) || (needsPrice && !parseFloat(price));

  return (
    <Dialog open onClose={onClose} title={`NEW TRADE — ${accountName}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>

        {/* Warning */}
        <div style={{ padding: '10px 12px', background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.3)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          {t('trade.warning')}
        </div>

        {/* Symbol + Action */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div ref={boxRef} style={{ position: 'relative', minWidth: 0 }}>
            <label style={lbl}>{t('trade.symbol')}</label>
            <input
              type="text"
              value={symbol}
              onChange={e => { setSymbol(e.target.value); setOpenList(true); setHighlight(0); }}
              onFocus={() => setOpenList(true)}
              onKeyDown={onSymbolKey}
              placeholder="XAUUSD"
              // Deliberately not upper-cased, here or on the way out: MT5
              // symbol names are case-sensitive and this broker's gold is
              // XAUUSD.v, which XAUUSD.V would not find.
              style={inp}
              autoComplete="off"
              autoFocus
            />
            {openList && known.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40,
                marginTop: '4px', maxHeight: '190px', overflowY: 'auto',
                background: 'var(--bg-card)', border: '1px solid var(--border2)',
                borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 20px rgba(0,0,0,.45)',
              }}>
                {matches.length === 0 && (
                  <div style={{ padding: '8px 10px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)' }}>
                    {t('trade.no_symbols')}
                  </div>
                )}
                {matches.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); pick(s); }}
                    onMouseEnter={() => setHighlight(i)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 10px', border: 'none', cursor: 'pointer',
                      background: i === highlight ? 'var(--bg-input)' : 'transparent',
                      color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
                    }}
                  >{s}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={lbl}>{t('trade.action')}</label>
            <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)' }}>
              <button
                onClick={() => setAction('BUY')}
                style={{ flex: 1, minWidth: 0, padding: '7px', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', cursor: 'pointer', background: action === 'BUY' ? 'var(--green)' : 'none', color: action === 'BUY' ? '#25272c' : buyColor, border: 'none', letterSpacing: '.5px' }}
              >BUY</button>
              <button
                onClick={() => setAction('SELL')}
                style={{ flex: 1, minWidth: 0, padding: '7px', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', cursor: 'pointer', background: action === 'SELL' ? 'var(--red)' : 'none', color: action === 'SELL' ? '#fff' : sellColor, border: 'none', borderLeft: '1px solid var(--border2)', letterSpacing: '.5px' }}
              >SELL</button>
            </div>
          </div>
        </div>

        {/* Volume + Order Type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ minWidth: 0 }}>
            <label style={lbl}>{t('trade.volume')}</label>
            <input type="number" step="0.01" min="0.01" value={volume} onChange={e => setVolume(e.target.value)} style={inp} />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={lbl}>{t('trade.order_type')}</label>
            <select value={orderType} onChange={e => setOrderType(e.target.value as OrderType)} style={inp}>
              <option value="market">{t('trade.market')}</option>
              <option value="limit">{t('trade.limit')}</option>
              <option value="stop">{t('trade.stop')}</option>
            </select>
          </div>
        </div>

        {/* Pending price. A limit waits for the price to come back to it, a
            stop waits for it to break through — so the field says which. */}
        {needsPrice && (
          <div>
            <label style={lbl}>{orderType === 'limit' ? t('trade.limit_price') : t('trade.stop_price')}</label>
            <input type="number" step="0.00001" value={price} onChange={e => setPrice(e.target.value)} placeholder={t('trade.entry_price')} style={inp} />
          </div>
        )}

        {/* SL + TP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ minWidth: 0 }}>
            <label style={lbl}>{t('trade.stop_loss')} <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)' }}>{t('trade.none_zero')}</span></label>
            <input type="number" step="0.00001" value={sl} onChange={e => setSl(e.target.value)} placeholder="0.00000" style={inp} />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={lbl}>{t('trade.take_profit')} <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)' }}>{t('trade.none_zero')}</span></label>
            <input type="number" step="0.00001" value={tp} onChange={e => setTp(e.target.value)} placeholder="0.00000" style={inp} />
          </div>
        </div>

        {/* Summary preview */}
        {symbol && parseFloat(volume) > 0 && (
          <div style={{
            padding: '10px 12px',
            background: action === 'BUY' ? 'rgba(52,211,153,.08)' : 'rgba(248,113,113,.08)',
            border: `1px solid ${action === 'BUY' ? 'rgba(52,211,153,.3)' : 'rgba(248,113,113,.3)'}`,
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-dim)',
            wordBreak: 'break-word',
          }}>
            <span style={{ color: action === 'BUY' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{action}</span>
            {orderType !== 'market' && <span style={{ color: 'var(--text-dim)' }}> {orderType.toUpperCase()}</span>}
            {' '}{parseFloat(volume).toFixed(2)} lots{' '}
            <span style={{ color: 'var(--text)' }}>{symbol.trim()}</span>
            {needsPrice && price && ` @ ${price}`}
            {parseFloat(sl) > 0 && <span style={{ color: 'var(--red)' }}> SL:{sl}</span>}
            {parseFloat(tp) > 0 && <span style={{ color: 'var(--green)' }}> TP:{tp}</span>}
            <span style={{ color: 'var(--text-dim)' }}> on {accountName} ({rawCur})</span>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
          <button onClick={onClose} disabled={loading}
            style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '9px 16px', background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', cursor: 'pointer', letterSpacing: '.5px' }}>
            {t('trade.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={disabled}
            style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '9px 16px', letterSpacing: '.5px',
              background: action === 'BUY' ? 'var(--green)' : 'var(--red)',
              color: action === 'BUY' ? '#25272c' : '#fff',
              border: `1px solid ${action === 'BUY' ? 'var(--green)' : 'var(--red)'}`,
              borderRadius: 'var(--radius-sm)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? .5 : 1,
            }}
          >
            {loading ? t('trade.sending') : `${t('trade.confirm')} ${action}`}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
