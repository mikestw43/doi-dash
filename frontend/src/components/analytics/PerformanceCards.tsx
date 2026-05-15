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
      <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-dim)' }}>
        Loading metrics...
      </div>
    );
  }

  if (!metrics || metrics.totalTrades === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-dim)' }}>
        No closed trades to calculate metrics.
      </div>
    );
  }

  interface Card { label: string; symbol: string; value: string; color: string }
  const cards: Card[] = [
    { symbol: '▦', label: 'Total Trades', value: metrics.totalTrades.toString(), color: 'var(--cyan)' },
    { symbol: '◎', label: 'Win Rate',     value: `${metrics.winRate}%`,          color: metrics.winRate >= 50 ? 'var(--green)' : 'var(--red)' },
    { symbol: '≈',  label: 'Profit Factor', value: metrics.profitFactor >= 999 ? '∞' : metrics.profitFactor.toFixed(2), color: metrics.profitFactor >= 1 ? 'var(--green)' : 'var(--red)' },
    { symbol: '↑',  label: 'Avg Profit',  value: `$${metrics.avgProfit.toFixed(2)}`,  color: 'var(--green)' },
    { symbol: '↓',  label: 'Avg Loss',    value: `-$${metrics.avgLoss.toFixed(2)}`,   color: 'var(--red)' },
    { symbol: '⛉',  label: 'Max Drawdown', value: `${metrics.maxDrawdown.toFixed(2)}%`, color: metrics.maxDrawdown > 20 ? 'var(--red)' : 'var(--yellow)' },
  ];

  const metricCard: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border2)',
    padding: '14px 16px', textAlign: 'center', position: 'relative',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
        {cards.map(c => (
          <div key={c.label} style={metricCard}>
            <div style={{ fontSize: '14px', color: c.color, opacity: .7, marginBottom: '6px' }}>{c.symbol}</div>
            <div style={{ fontFamily: "'VT323'", fontSize: '32px', fontWeight: 400, lineHeight: 1, color: c.color }}>{c.value}</div>
            <div style={{ fontFamily: "'Press Start 2P'", fontSize: '6px', color: 'var(--text-dim)', letterSpacing: '.5px', marginTop: '6px' }}>{c.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Gross Profit / Gross Loss row */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ ...metricCard, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
          <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)', letterSpacing: '.5px' }}>GROSS PROFIT</span>
          <span style={{ fontFamily: "'VT323'", fontSize: '26px', color: 'var(--green)' }}>+${metrics.grossProfit.toFixed(2)}</span>
        </div>
        <div style={{ ...metricCard, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
          <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)', letterSpacing: '.5px' }}>GROSS LOSS</span>
          <span style={{ fontFamily: "'VT323'", fontSize: '26px', color: 'var(--red)' }}>-${metrics.grossLoss.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};
