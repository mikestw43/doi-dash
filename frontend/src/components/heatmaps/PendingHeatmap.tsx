import { useQuery } from '@tanstack/react-query';
import { fetchHeatmapPending } from '../../services/api';
import type { HeatmapPending, PendingOrderType } from '../../types';
import { formatLots } from '../../utils/formatters';

const TYPE_COLORS: Record<PendingOrderType, { border: string; bg: string; color: string }> = {
  BUY_LIMIT:       { border: 'rgba(56,189,248,.3)',  bg: 'rgba(56,189,248,.06)',  color: 'var(--cyan)' },
  SELL_LIMIT:      { border: 'rgba(239,68,68,.3)',   bg: 'rgba(239,68,68,.06)',   color: 'var(--red)' },
  BUY_STOP:        { border: 'rgba(56,189,248,.3)',  bg: 'rgba(56,189,248,.06)',  color: 'var(--cyan)' },
  SELL_STOP:       { border: 'rgba(249,115,22,.3)',  bg: 'rgba(249,115,22,.06)', color: 'var(--orange)' },
  BUY_STOP_LIMIT:  { border: 'rgba(56,189,248,.3)',  bg: 'rgba(56,189,248,.06)',  color: 'var(--cyan)' },
  SELL_STOP_LIMIT: { border: 'rgba(249,115,22,.3)',  bg: 'rgba(249,115,22,.06)', color: 'var(--orange)' },
};

export const PendingHeatmap = () => {
  const { data: pending = [], isLoading } = useQuery<HeatmapPending[]>({
    queryKey: ['heatmap-pending'],
    queryFn: fetchHeatmapPending,
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '6px' }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} style={{ height: '80px', background: 'var(--bg-card2)', border: '1px solid var(--border2)' }} />
        ))}
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}>
        No pending orders
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '6px' }}>
      {pending.map(order => {
        const s = TYPE_COLORS[order.type] ?? TYPE_COLORS.BUY_LIMIT;
        return (
          <div
            key={order.ticket}
            style={{ border: `1px solid ${s.border}`, background: s.bg, padding: '8px 10px', minHeight: '80px', color: s.color }}
          >
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', marginBottom: '4px' }}>
              {order.type.replace(/_/g, ' ')} {order.symbol}
            </div>
            <div style={{ fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', lineHeight: 1 }}>
              ×{formatLots(order.lots)}
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginTop: '4px' }}>
              @ {order.openPrice} · {order.accountName}
            </div>
          </div>
        );
      })}
    </div>
  );
};
