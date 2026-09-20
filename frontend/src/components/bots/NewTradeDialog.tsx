import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { openTrade } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';

interface Props {
  accountId: string;
  accountName: string;
  currency: string;
  onClose: () => void;
}

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
  padding: '7px 10px', outline: 'none', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
  color: 'var(--text-dim)', letterSpacing: '.5px', marginBottom: '6px',
};

export const NewTradeDialog = ({ accountId, accountName, currency, onClose }: Props) => {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [action, setAction] = useState<'BUY' | 'SELL'>('BUY');
  const [volume, setVolume] = useState('0.01');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [price, setPrice] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [comment, setComment] = useState('OnlyFunds');

  const rawCur = currency || 'USD';

  const handleSubmit = async () => {
    const vol = parseFloat(volume);
    if (!symbol.trim()) { addToast({ type: 'error', title: 'Symbol is required' }); return; }
    if (!vol || vol <= 0) { addToast({ type: 'error', title: 'Volume must be > 0' }); return; }
    if (orderType === 'limit' && (!price || parseFloat(price) <= 0)) { addToast({ type: 'error', title: 'Price is required for limit orders' }); return; }
    setLoading(true);
    try {
      await openTrade(accountId, {
        symbol: symbol.trim(), action, volume: vol,
        price: orderType === 'limit' ? parseFloat(price) : 0,
        sl: parseFloat(sl) || 0, tp: parseFloat(tp) || 0,
        comment: comment || 'OnlyFunds',
      });
      addToast({ type: 'warning', title: 'Trade queued', message: `${action} ${vol} ${symbol.toUpperCase()} sent to EA (~2s)` });
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

  return (
    <Dialog open onClose={onClose} title={`NEW TRADE — ${accountName}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Warning */}
        <div style={{ padding: '10px 12px', background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.3)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          ⚠ คำสั่งจะถูกส่งไปยัง EA และดำเนินการใน MT5 จริง ตรวจสอบพารามิเตอร์ก่อนกด Confirm
        </div>

        {/* Symbol + Action */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={lbl}>SYMBOL</label>
            <input type="text" value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="EURUSD, XAUUSD..." style={inp} autoFocus />
          </div>
          <div>
            <label style={lbl}>ACTION</label>
            <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)' }}>
              <button
                onClick={() => setAction('BUY')}
                style={{ flex: 1, padding: '7px', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', cursor: 'pointer', background: action === 'BUY' ? 'var(--green)' : 'none', color: action === 'BUY' ? '#25272c' : buyColor, border: 'none', letterSpacing: '.5px' }}
              >BUY</button>
              <button
                onClick={() => setAction('SELL')}
                style={{ flex: 1, padding: '7px', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', cursor: 'pointer', background: action === 'SELL' ? 'var(--red)' : 'none', color: action === 'SELL' ? '#fff' : sellColor, border: 'none', borderLeft: '1px solid var(--border2)', letterSpacing: '.5px' }}
              >SELL</button>
            </div>
          </div>
        </div>

        {/* Volume + Order Type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={lbl}>VOLUME (LOTS)</label>
            <input type="number" step="0.01" min="0.01" value={volume} onChange={e => setVolume(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>ORDER TYPE</label>
            <select value={orderType} onChange={e => setOrderType(e.target.value as 'market' | 'limit')} style={{ ...inp }}>
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </select>
          </div>
        </div>

        {/* Limit price */}
        {orderType === 'limit' && (
          <div>
            <label style={lbl}>LIMIT PRICE</label>
            <input type="number" step="0.00001" value={price} onChange={e => setPrice(e.target.value)} placeholder="Entry price" style={inp} />
          </div>
        )}

        {/* SL + TP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={lbl}>STOP LOSS <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)' }}>(0=none)</span></label>
            <input type="number" step="0.00001" value={sl} onChange={e => setSl(e.target.value)} placeholder="0.00000" style={inp} />
          </div>
          <div>
            <label style={lbl}>TAKE PROFIT <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)' }}>(0=none)</span></label>
            <input type="number" step="0.00001" value={tp} onChange={e => setTp(e.target.value)} placeholder="0.00000" style={inp} />
          </div>
        </div>

        {/* Comment */}
        <div>
          <label style={lbl}>COMMENT</label>
          <input type="text" value={comment} onChange={e => setComment(e.target.value)} maxLength={31} style={inp} />
        </div>

        {/* Summary preview */}
        {symbol && parseFloat(volume) > 0 && (
          <div style={{
            padding: '10px 12px',
            background: action === 'BUY' ? 'rgba(52,211,153,.08)' : 'rgba(248,113,113,.08)',
            border: `1px solid ${action === 'BUY' ? 'rgba(52,211,153,.3)' : 'rgba(248,113,113,.3)'}`,
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-dim)',
          }}>
            <span style={{ color: action === 'BUY' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{action}</span>
            {' '}{parseFloat(volume).toFixed(2)} lots{' '}
            <span style={{ color: 'var(--text)' }}>{symbol}</span>
            {orderType === 'limit' && price && ` @ ${price}`}
            {parseFloat(sl) > 0 && <span style={{ color: 'var(--red)' }}> SL:{sl}</span>}
            {parseFloat(tp) > 0 && <span style={{ color: 'var(--green)' }}> TP:{tp}</span>}
            <span style={{ color: 'var(--text-dim)' }}> on {accountName} ({rawCur})</span>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
          <button onClick={onClose} disabled={loading}
            style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '9px 16px', background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', cursor: 'pointer', letterSpacing: '.5px' }}>
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !symbol || !parseFloat(volume)}
            style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '9px 16px', letterSpacing: '.5px',
              background: action === 'BUY' ? 'var(--green)' : 'var(--red)',
              color: action === 'BUY' ? '#25272c' : '#fff',
              border: `1px solid ${action === 'BUY' ? 'var(--green)' : 'var(--red)'}`,
              cursor: (loading || !symbol || !parseFloat(volume)) ? 'not-allowed' : 'pointer',
              opacity: (loading || !symbol || !parseFloat(volume)) ? .5 : 1,
            }}
          >
            {loading ? 'SENDING...' : `CONFIRM ${action}`}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
