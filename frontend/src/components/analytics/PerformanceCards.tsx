import { useState, useEffect } from 'react';
import { fetchPerformanceMetrics } from '../../services/api';
import type { PerformanceMetrics } from '../../types';
import { TrendingUp, TrendingDown, Target, Activity, BarChart3, Shield } from 'lucide-react';

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
    return <div className="text-sm text-gray-500 text-center py-8">Loading metrics...</div>;
  }

  if (!metrics || metrics.totalTrades === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-8">
        No closed trades to calculate metrics.
      </div>
    );
  }

  const cards = [
    {
      icon: BarChart3,
      label: 'Total Trades',
      value: metrics.totalTrades.toString(),
      color: 'text-accent-blue',
    },
    {
      icon: Target,
      label: 'Win Rate',
      value: `${metrics.winRate}%`,
      color: metrics.winRate >= 50 ? 'text-success' : 'text-danger',
    },
    {
      icon: Activity,
      label: 'Profit Factor',
      value: metrics.profitFactor >= 999 ? '∞' : metrics.profitFactor.toFixed(2),
      color: metrics.profitFactor >= 1 ? 'text-success' : 'text-danger',
    },
    {
      icon: TrendingUp,
      label: 'Avg Profit',
      value: `$${metrics.avgProfit.toFixed(2)}`,
      color: 'text-success',
    },
    {
      icon: TrendingDown,
      label: 'Avg Loss',
      value: `-$${metrics.avgLoss.toFixed(2)}`,
      color: 'text-danger',
    },
    {
      icon: Shield,
      label: 'Max Drawdown',
      value: `${metrics.maxDrawdown.toFixed(2)}%`,
      color: metrics.maxDrawdown > 20 ? 'text-danger' : 'text-warning',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <div key={c.label} className="card text-center">
          <c.icon size={14} className={`${c.color} mx-auto mb-2 opacity-70`} />
          <div className={`font-display text-3xl leading-none ${c.color}`}>{c.value}</div>
          <div className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase mt-1.5">{c.label}</div>
        </div>
      ))}
      {/* Extra row: Gross Profit / Gross Loss */}
      <div className="col-span-2 sm:col-span-3 lg:col-span-6 flex gap-3">
        <div className="card flex-1 flex items-center justify-between">
          <span className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase">Gross Profit</span>
          <span className="font-display text-2xl text-success">
            +${metrics.grossProfit.toFixed(2)}
          </span>
        </div>
        <div className="card flex-1 flex items-center justify-between">
          <span className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase">Gross Loss</span>
          <span className="font-display text-2xl text-danger">
            -${metrics.grossLoss.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};
