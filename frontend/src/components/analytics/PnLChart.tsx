import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { fetchDailyPnL } from '../../services/api';
import type { DailyPnL } from '../../types';

type Period = '1M' | '3M' | '6M';

interface Props {
  accountId?: string;
}

export const PnLChart = ({ accountId }: Props) => {
  const [period, setPeriod] = useState<Period>('3M');
  const [data, setData] = useState<DailyPnL[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchDailyPnL(accountId, period)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [accountId, period]);

  const PERIOD_BUTTONS: Period[] = ['1M', '3M', '6M'];

  const totalProfit = data.reduce((s, d) => s + d.profit, 0);
  const totalTrades = data.reduce((s, d) => s + d.trades, 0);

  const pBtn = (active: boolean): React.CSSProperties => ({
    fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px',
    padding: '5px 9px', cursor: 'pointer',
    border: active ? '1px solid var(--cyan)' : '1px solid var(--border2)',
    background: active ? 'rgba(56,189,248,.1)' : 'none',
    color: active ? 'var(--cyan)' : 'var(--text-dim)',
  });

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <div style={{ fontFamily: "'Press Start 2P'", fontSize: '8px', color: 'var(--text)', letterSpacing: '.5px', marginBottom: '4px' }}>DAILY P&L</div>
          <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-dim)' }}>
            {totalTrades} trades · Net:{' '}
            <span style={{ color: totalProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {PERIOD_BUTTONS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={pBtn(period === p)}>{p}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-dim)' }}>
          Loading...
        </div>
      ) : data.length === 0 ? (
        <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-dim)' }}>
          No closed trades yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,64,96,.5)" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => {
                const d = new Date(v);
                return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
              }}
              tick={{ fontSize: 10, fill: '#64748b', fontFamily: "'Share Tech Mono'" }}
              stroke="#2d4060"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#64748b', fontFamily: "'Share Tech Mono'" }}
              stroke="#2d4060"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #2d4060',
                borderRadius: 0,
                fontFamily: "'Share Tech Mono'",
                fontSize: 11,
              }}
              formatter={((value: number | undefined) => [value != null ? `$${value.toFixed(2)}` : '—', 'P&L']) as never}
              labelFormatter={(v) => `Date: ${v}`}
            />
            <Bar dataKey="profit">
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.profit >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
