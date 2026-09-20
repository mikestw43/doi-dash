import { useQuery } from '@tanstack/react-query';
import { fetchHeatmapOrders } from '../../services/api';
import type { HeatmapOrder } from '../../types';
import { formatLots } from '../../utils/formatters';

const getBlockStyle = (profit: number) => {
  if (profit > 0)  return { border: 'rgba(52,211,153,.3)',  bg: 'rgba(52,211,153,.06)',  color: 'var(--green)' };
  if (profit < 0)  return { border: 'rgba(248,113,113,.3)',  bg: 'rgba(248,113,113,.06)',  color: 'var(--red)' };
  return               { border: 'rgba(251,191,36,.3)',  bg: 'rgba(251,191,36,.06)', color: 'var(--yellow)' };
};

export const OrdersHeatmap = () => {
  const { data: orders = [], isLoading } = useQuery<HeatmapOrder[]>({
    queryKey: ['heatmap-orders'],
    queryFn: fetchHeatmapOrders,
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

  if (orders.length === 0) {
    return (
      <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}>
        No open orders
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '6px' }}>
      {orders.map(order => {
        const s = getBlockStyle(order.profit);
        return (
          <div
            key={order.ticket}
            style={{ border: `1px solid ${s.border}`, background: s.bg, padding: '8px 10px', minHeight: '80px' }}
          >
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text)', marginBottom: '4px' }}>
              {order.symbol} {order.type}
            </div>
            <div style={{ fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', color: s.color, lineHeight: 1 }}>
              {order.profit >= 0 ? '+' : ''}{order.profit.toFixed(0)}
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginTop: '4px' }}>
              {formatLots(order.lots)} lots · {order.accountName}
            </div>
          </div>
        );
      })}
    </div>
  );
};
