import { useState } from 'react';
import type { Order } from '../../types';
import { FlashNumber } from '../ui/FlashNumber';
import { closePosition, setPositionSLTP } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';
import { X, Check, Edit2, TrendingUp, TrendingDown } from 'lucide-react';

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

export const PositionPanel = ({ accountId, orders, currency }: Props) => {
  const { addToast } = useUIStore();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [loadingTicket, setLoadingTicket] = useState<number | null>(null);

  const rawCur = currency || 'USD';
  const fmtNum = (v: number) =>
    Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPrice = (v: number) =>
    v === 0 ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 });

  const handleClose = async (ticket: number, symbol: string) => {
    setLoadingTicket(ticket);
    try {
      await closePosition(accountId, ticket);
      addToast({
        type: 'warning',
        title: 'Close queued',
        message: `Close #${ticket} (${symbol}) sent to EA (~2s)`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to close position';
      addToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setLoadingTicket(null);
    }
  };

  const startEdit = (order: Order) => {
    setEditing({
      ticket: order.ticket,
      sl: order.sl > 0 ? String(order.sl) : '',
      tp: order.tp > 0 ? String(order.tp) : '',
    });
  };

  const cancelEdit = () => setEditing(null);

  const commitEdit = async () => {
    if (!editing) return;
    const sl = parseFloat(editing.sl) || 0;
    const tp = parseFloat(editing.tp) || 0;
    setLoadingTicket(editing.ticket);
    try {
      await setPositionSLTP(accountId, editing.ticket, sl, tp);
      addToast({
        type: 'success',
        title: 'SL/TP queued',
        message: `SL/TP update for #${editing.ticket} sent to EA (~2s)`,
      });
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
      <div className="px-4 py-3 text-center text-xs text-gray-500">
        No open positions
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border2">
            <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left py-2.5 px-3">Symbol</th>
            <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left py-2.5 px-2">Type</th>
            <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-right py-2.5 px-2">Lots</th>
            <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-right py-2.5 px-2">Open</th>
            <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-right py-2.5 px-2">Current</th>
            <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-right py-2.5 px-2">P/L {rawCur}</th>
            <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-right py-2.5 px-2">SL</th>
            <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-right py-2.5 px-2">TP</th>
            <th className="py-2.5 px-2"></th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => {
            const isEdit = editing?.ticket === order.ticket;
            const isLoading = loadingTicket === order.ticket;
            const isBuy = order.type === 'BUY';

            return (
              <tr
                key={order.ticket}
                className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors"
              >
                {/* Symbol */}
                <td className="py-2 px-3 font-tech font-bold text-white">{order.symbol}</td>

                {/* Type badge */}
                <td className="py-2 px-2">
                  <span className={`font-pixel text-[8px] inline-flex items-center gap-0.5 px-1.5 py-0.5 border ${
                    isBuy ? 'border-success/40 text-success bg-success/10' : 'border-danger/40 text-danger bg-danger/10'
                  }`}>
                    {isBuy ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                    {order.type}
                  </span>
                </td>

                {/* Lots */}
                <td className="py-2 px-2 text-right font-tech text-gray-400">
                  {order.lots.toFixed(2)}
                </td>

                {/* Open Price */}
                <td className="py-2 px-2 text-right font-tech text-gray-500">
                  {fmtPrice(order.openPrice)}
                </td>

                {/* Current Price */}
                <td className="py-2 px-2 text-right font-tech text-gray-300">
                  {fmtPrice(order.currentPrice)}
                </td>

                {/* P/L */}
                <td className="py-2 px-2 text-right">
                  <FlashNumber
                    value={order.profit}
                    format={(v) => `${v >= 0 ? '+' : '-'}${fmtNum(v)}`}
                    positiveGreen
                    className="font-display text-xl leading-none"
                  />
                </td>

                {/* SL */}
                <td className="py-2 px-2 text-right">
                  {isEdit ? (
                    <input
                      type="number"
                      step="0.00001"
                      value={editing.sl}
                      onChange={e => setEditing(prev => prev ? { ...prev, sl: e.target.value } : null)}
                      placeholder="0"
                      className="w-20 bg-bg-primary border border-border2 px-1.5 py-0.5 font-tech text-xs text-white text-right focus:outline-none focus:border-accent-blue"
                      autoFocus
                    />
                  ) : (
                    <span className="font-tech text-xs text-gray-500">{fmtPrice(order.sl)}</span>
                  )}
                </td>

                {/* TP */}
                <td className="py-2 px-2 text-right">
                  {isEdit ? (
                    <input
                      type="number"
                      step="0.00001"
                      value={editing.tp}
                      onChange={e => setEditing(prev => prev ? { ...prev, tp: e.target.value } : null)}
                      placeholder="0"
                      className="w-20 bg-bg-primary border border-border2 px-1.5 py-0.5 font-tech text-xs text-white text-right focus:outline-none focus:border-accent-blue"
                    />
                  ) : (
                    <span className="font-tech text-xs text-gray-500">{fmtPrice(order.tp)}</span>
                  )}
                </td>

                {/* Actions */}
                <td className="py-2 px-2">
                  <div className="flex items-center gap-1 justify-end">
                    {isEdit ? (
                      <>
                        <button onClick={commitEdit} disabled={isLoading}
                          className="p-1 text-success hover:bg-success/20 transition-colors disabled:opacity-40" title="Confirm SL/TP">
                          <Check size={12} />
                        </button>
                        <button onClick={cancelEdit}
                          className="p-1 text-gray-500 hover:bg-gray-700 transition-colors" title="Cancel">
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(order)} disabled={isLoading}
                          className="p-1 text-gray-600 hover:text-accent-blue transition-colors disabled:opacity-40" title="Edit SL/TP">
                          <Edit2 size={11} />
                        </button>
                        <button
                          onClick={() => handleClose(order.ticket, order.symbol)}
                          disabled={isLoading}
                          className="font-pixel text-[8px] px-2 py-0.5 text-danger border border-danger/40 hover:bg-danger hover:text-white transition-colors disabled:opacity-40"
                          title="Close position"
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
      <div className="flex items-center gap-4 px-3 py-2 border-t border-border2">
        <span className="font-tech text-xs text-gray-600">{orders.length} position{orders.length !== 1 ? 's' : ''}</span>
        <span className="text-gray-700">|</span>
        <span className="font-pixel text-[8px] text-gray-600">
          TOTAL P/L:{' '}
          <span className={`font-display text-lg leading-none ${
            orders.reduce((s, o) => s + o.profit, 0) >= 0 ? 'text-success' : 'text-danger'
          }`}>
            {orders.reduce((s, o) => s + o.profit, 0) >= 0 ? '+' : '-'}
            {fmtNum(orders.reduce((s, o) => s + o.profit, 0))} {rawCur}
          </span>
        </span>
      </div>
    </div>
  );
};
