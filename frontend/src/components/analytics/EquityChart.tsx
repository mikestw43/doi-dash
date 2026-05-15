import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { fetchEquityHistory } from '../../services/api';
import type { EquitySnapshot } from '../../types';

type Timeframe = '1D' | '1W' | '1M' | '3M';

interface Props {
  accountId: string;
}

const formatDate = (ts: string, tf: Timeframe) => {
  const d = new Date(ts);
  if (tf === '1D') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const EquityChart = ({ accountId }: Props) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('1M');
  const [data, setData] = useState<EquitySnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    fetchEquityHistory(accountId, timeframe)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [accountId, timeframe]);

  const TF_BUTTONS: Timeframe[] = ['1D', '1W', '1M', '3M'];

  const tfBtn = (active: boolean): React.CSSProperties => ({
    fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px',
    padding: '5px 9px', cursor: 'pointer',
    border: active ? '1px solid var(--cyan)' : '1px solid var(--border2)',
    background: active ? 'rgba(56,189,248,.1)' : 'none',
    color: active ? 'var(--cyan)' : 'var(--text-dim)',
  });

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: '8px', color: 'var(--text)', letterSpacing: '.5px' }}>EQUITY HISTORY</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {TF_BUTTONS.map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)} style={tfBtn(timeframe === tf)}>{tf}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-dim)' }}>
          Loading...
        </div>
      ) : data.length === 0 ? (
        <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center' }}>
          No data yet. Snapshots are recorded every hour.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,64,96,.5)" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) => formatDate(v, timeframe)}
              tick={{ fontSize: 10, fill: '#64748b', fontFamily: "'Share Tech Mono'" }}
              stroke="#2d4060"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#64748b', fontFamily: "'Share Tech Mono'" }}
              stroke="#2d4060"
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #2d4060',
                borderRadius: 0,
                fontFamily: "'Share Tech Mono'",
                fontSize: 11,
              }}
              labelFormatter={(v) => new Date(v as string).toLocaleString()}
              formatter={((value: number | undefined, name: string | undefined) => [
                value != null ? `$${value.toFixed(2)}` : '—',
                name === 'equity' ? 'Equity' : 'Balance',
              ]) as never}
            />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'Share Tech Mono'" }} />
            <Line type="monotone" dataKey="equity" stroke="#38bdf8" strokeWidth={2} dot={false} name="Equity" />
            <Line type="monotone" dataKey="balance" stroke="#64748b" strokeWidth={1.5} dot={false} strokeDasharray="4 4" name="Balance" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
