import { useState } from 'react';
import type { Order } from '../../types';
import { FlashNumber } from '../ui/FlashNumber';
import { closePosition, setPositionSLTP } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';

interface Props {
  accountId: string;
  accountName: string;
  orders: Order[];
  currency: string;
}

interface EditState {
  ticket: number;
  sl: string;
  tp: string;
}

const fmtNum = (v: number) =>
  Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPrice = (v: number) =>
  v === 0 ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 });

export const PositionPanel = ({ accountId, orders, currency }: Props) => {
  const { addToast } = useUIStore();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [loadingTicket, setLoadingTicket] = useState<number | null>(null);

  const rawCur = currency || 'USD';

  const handleClose = async (ticket: number, symbol: string) => {
    setLoadingTicket(ticket);
    try {
      await closePosition(accountId, ticket);
      addToast({ type: 'warning', title: 'Close queued', message: `Close #${ticket} (${symbol}) sent to EA (~2s)` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to close position';
      addToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setLoadingTicket(null);
    }
  };

  const startEdit = (order: Order) => {
    setEditing({ ticket: order.ticket, sl: order.sl > 0 ? String(order.sl) : '', tp: order.tp > 0 ? String(order.tp) : '' });
  };

  const cancelEdit = () => setEditing(null);

  const commitEdit = async () => {
    if (!editing) return;
    const sl = parseFloat(editing.sl) || 0;
    const tp = parseFloat(editing.tp) || 0;
    setLoadingTicket(editing.ticket);
    try {
      await setPositionSLTP(accountId, editing.ticket, sl, tp);
      addToast({ type: 'success', title: 'SL/TP queued', message: `SL/TP update for #${editing.ticket} sent to EA (~2s)` });
      setEditing(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set SL/TP';
      addToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setLoadingTicket(null);
    }
  };

  if (orders.length === 0) {
    return (
      <div style={{ padding: '12px 16px', textAlign: 'center', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)' }}>
        No open positions
      </div>
    );
  }

  const totalPL = orders.reduce((s, o) => s + o.profit, 0);

  const thStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)',
    letterSpacing: '.5px', padding: '8px 8px', textAlign: 'left',
    borderBottom: '1px solid var(--border2)', fontWeight: 400,
  };
  const thR: React.CSSProperties = { ...thStyle, textAlign: 'right' };
  const tdStyle: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid rgba(45,64,96,.4)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)' };
  const tdR: React.CSSProperties = { ...tdStyle, textAlign: 'right' };

  const inputStyle: React.CSSProperties = {
    width: '72px', background: 'var(--bg-input)', border: '1px solid var(--border2)',
    color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
    padding: '3px 6px', textAlign: 'right', outline: 'none',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '580px' }}>
        <thead>
          <tr>
            <th style={thStyle}>Symbol</th>
            <th style={thStyle}>Type</th>
            <th style={thR}>Lots</th>
            <th style={thR}>Open</th>
            <th style={thR}>Current</th>
            <th style={thR}>P/L {rawCur}</th>
            <th style={thR}>SL</th>
            <th style={thR}>TP</th>
            <th style={{ ...thStyle, width: '80px' }}></th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => {
            const isEdit = editing?.ticket === order.ticket;
            const isLoading = loadingTicket === order.ticket;
            const isBuy = order.type === 'BUY';

            return (
              <tr key={order.ticket} style={{ transition: 'background .12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(45,64,96,.3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={tdStyle}>
                  <span style={{ color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontWeight: 700 }}>{order.symbol}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{
                    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                    padding: '3px 6px', letterSpacing: '.5px',
                    border: `1px solid ${isBuy ? 'rgba(34,197,94,.4)' : 'rgba(239,68,68,.4)'}`,
                    color: isBuy ? 'var(--green)' : 'var(--red)',
                    background: isBuy ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
                  }}>
                    {order.type}
                  </span>
                </td>
                <td style={{ ...tdR, color: 'var(--text-dim)' }}>{order.lots.toFixed(2)}</td>
                <td style={{ ...tdR, color: 'var(--text-dim)' }}>{fmtPrice(order.openPrice)}</td>
                <td style={{ ...tdR, color: 'var(--cyan)' }}>{fmtPrice(order.currentPrice)}</td>

                {/* P/L */}
                <td style={tdR}>
                  <FlashNumber
                    value={order.profit}
                    format={(v) => `${v >= 0 ? '+' : '-'}${fmtNum(v)}`}
                    positiveGreen
                    style={{ fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', lineHeight: 1 }}
                  />
                </td>

                {/* SL */}
                <td style={tdR}>
                  {isEdit ? (
                    <input
                      type="number" step="0.00001"
                      value={editing.sl}
                      onChange={e => setEditing(prev => prev ? { ...prev, sl: e.target.value } : null)}
                      placeholder="0"
                      style={inputStyle}
                      autoFocus
                    />
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>{fmtPrice(order.sl)}</span>
                  )}
                </td>

                {/* TP */}
                <td style={tdR}>
                  {isEdit ? (
                    <input
                      type="number" step="0.00001"
                      value={editing.tp}
                      onChange={e => setEditing(prev => prev ? { ...prev, tp: e.target.value } : null)}
                      placeholder="0"
                      style={inputStyle}
                    />
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>{fmtPrice(order.tp)}</span>
                  )}
                </td>

                {/* Actions */}
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    {isEdit ? (
                      <>
                        <button
                          onClick={commitEdit}
                          disabled={isLoading}
                          title="Confirm SL/TP"
                          style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: '13px', opacity: isLoading ? .4 : 1 }}
                        >✓</button>
                        <button
                          onClick={cancelEdit}
                          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '13px' }}
                        >✕</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(order)}
                          disabled={isLoading}
                          title="Edit SL/TP"
                          style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '10px', padding: '2px 5px', opacity: isLoading ? .4 : 1 }}
                        >✎</button>
                        <button
                          onClick={() => handleClose(order.ticket, order.symbol)}
                          disabled={isLoading}
                          title="Close position"
                          style={{
                            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                            padding: '3px 6px', letterSpacing: '.5px',
                            color: 'var(--red)', border: '1px solid rgba(239,68,68,.4)',
                            background: 'none', cursor: 'pointer', opacity: isLoading ? .4 : 1,
                          }}
                        >
                          {isLoading ? '...' : 'CLOSE'}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Summary row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderTop: '1px solid var(--border2)' }}>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)' }}>
          {orders.length} position{orders.length !== 1 ? 's' : ''}
        </span>
        <span style={{ color: 'var(--border2)' }}>|</span>
        <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)' }}>
          TOTAL P/L:{' '}
          <span style={{ fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', lineHeight: 1, color: totalPL >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {totalPL >= 0 ? '+' : '-'}{fmtNum(totalPL)} {rawCur}
          </span>
        </span>
      </div>
    </div>
  );
};
