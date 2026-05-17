import { useState, useEffect } from 'react';
import { fetchPerformanceMetrics } from '../../services/api';
import type { PerformanceMetrics } from '../../types';

interface Props {
  accountId?: string;
}

export const PerformanceCards = ({ accountId }: Props) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchPerformanceMetrics(accountId)
      .then(setMetrics)
      .catch(() => setMetrics(null))
      .finally(() => setLoading(false));
  }, [accountId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-dim)' }}>
        Loading metrics...
      </div>
    );
  }

  if (!metrics || metrics.totalTrades === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-dim)' }}>
        No closed trades to calculate metrics.
      </div>
    );
  }

  interface Card { label: string; symbol: string; value: string; color: string }
  const cards: Card[] = [
    { symbol: '▦', label: 'Total Trades', value: metrics.totalTrades.toString(), color: 'var(--accent-blue)' },
    { symbol: '◎', label: 'Win Rate',     value: `${metrics.winRate}%`,          color: metrics.winRate >= 50 ? 'var(--success)' : 'var(--danger)' },
    { symbol: '≈',  label: 'Profit Factor', value: metrics.profitFactor >= 999 ? '∞' : metrics.profitFactor.toFixed(2), color: metrics.profitFactor >= 1 ? 'var(--success)' : 'var(--danger)' },
    { symbol: '↑',  label: 'Avg Profit',  value: `$${metrics.avgProfit.toFixed(2)}`,  color: 'var(--success)' },
    { symbol: '↓',  label: 'Avg Loss',    value: `-$${metrics.avgLoss.toFixed(2)}`,   color: 'var(--danger)' },
    { symbol: '⛉',  label: 'Max Drawdown', value: `${metrics.maxDrawdown.toFixed(2)}%`, color: metrics.maxDrawdown > 20 ? 'var(--danger)' : 'var(--warning)' },
  ];

  const metricCard: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border2)',
    padding: '14px 16px', textAlign: 'center', position: 'relative',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }} className="perf-grid">
        {cards.map(c => (
          <div key={c.label} style={metricCard}>
            <div style={{ fontSize: '14px', color: c.color, opacity: .7, marginBottom: '6px' }}>{c.symbol}</div>
            <div style={{ fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-md)', fontWeight: 400, lineHeight: 1, color: c.color }}>{c.value}</div>
            <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px', marginTop: '6px' }}>{c.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Gross Profit / Gross Loss row */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ ...metricCard, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px' }}>GROSS PROFIT</span>
          <span style={{ fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', color: 'var(--success)' }}>+${metrics.grossProfit.toFixed(2)}</span>
        </div>
        <div style={{ ...metricCard, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px' }}>GROSS LOSS</span>
          <span style={{ fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', color: 'var(--danger)' }}>-${metrics.grossLoss.toFixed(2)}</span>
        </div>
      </div>
    <style>{`
      @media (max-width: 560px) { .perf-grid { grid-template-columns: repeat(2, 1fr) !important; } }
      @media (max-width: 380px) { .perf-grid { grid-template-columns: 1fr !important; } }
    `}</style>
    </div>
  );
};
