import { useQuery } from '@tanstack/react-query';
import { fetchHeatmapAccounts } from '../../services/api';
import type { HeatmapAccount } from '../../types';
import { formatCurrency, formatPercent } from '../../utils/formatters';
import { CardSkeleton } from '../ui/Skeleton';

const getHeatColor = (dd: number): { bg: string; text: string } => {
  if (dd < 10) return { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' };
  if (dd < 20) return { bg: 'rgba(234,179,8,0.15)', text: '#eab308' };
  if (dd < 30) return { bg: 'rgba(249,115,22,0.15)', text: '#f97316' };
  return { bg: 'rgba(239,68,68,0.2)', text: '#ef4444' };
};

export const AccountHeatmap = () => {
  const { data: accounts = [], isLoading } = useQuery<HeatmapAccount[]>({
    queryKey: ['heatmap-accounts'],
    queryFn: fetchHeatmapAccounts,
    refetchInterval: 5000,
  });

  if (isLoading) return <CardSkeleton />;
  if (accounts.length === 0) return <p className="text-gray-500 text-sm text-center py-8">No accounts data</p>;

  const maxBalance = Math.max(...accounts.map(a => a.balance));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-pixel text-[9px] text-gray-500 tracking-widest uppercase">Account Health</h3>
        <div className="flex items-center gap-3">
          <span className="font-pixel text-[8px] flex items-center gap-1 text-success"><span className="w-2 h-2" style={{ background: 'rgba(34,197,94,0.5)' }} /> DD &lt;10%</span>
          <span className="font-pixel text-[8px] flex items-center gap-1 text-warning"><span className="w-2 h-2" style={{ background: 'rgba(234,179,8,0.5)' }} /> 10-30%</span>
          <span className="font-pixel text-[8px] flex items-center gap-1 text-danger"><span className="w-2 h-2" style={{ background: 'rgba(239,68,68,0.5)' }} /> &gt;30%</span>
        </div>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {accounts.map(acc => {
          const { bg, text } = getHeatColor(acc.drawdown);
          const relSize = (acc.balance / maxBalance);
          return (
            <div
              key={acc.id}
              className="p-3 border transition-all cursor-default hover:scale-[1.01]"
              style={{
                background: bg,
                borderColor: `${text}44`,
                minHeight: `${80 + relSize * 60}px`,
              }}
            >
              <div className="flex items-start justify-between mb-1">
                <span className="font-tech text-sm text-white truncate">{acc.name}</span>
                <span className={`ml-2 shrink-0 w-1.5 h-1.5 mt-1 ${acc.status === 'online' ? 'bg-success' : 'bg-gray-600'}`} />
              </div>
              <div className="font-tech text-[10px] text-gray-600 mb-2">{acc.broker}</div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-pixel text-[8px] text-gray-600">BAL</span>
                  <span className="font-tech text-xs text-white">{formatCurrency(acc.balance, acc.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-pixel text-[8px] text-gray-600">EQT</span>
                  <span className="font-tech text-xs" style={{ color: text }}>{formatCurrency(acc.equity, acc.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-pixel text-[8px] text-gray-600">DD</span>
                  <span className="font-display text-lg leading-none font-semibold" style={{ color: text }}>{formatPercent(acc.drawdown)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-pixel text-[8px] text-gray-600">P/L</span>
                  <span className={`font-tech text-xs ${acc.profit >= 0 ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(acc.profit, acc.currency)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
