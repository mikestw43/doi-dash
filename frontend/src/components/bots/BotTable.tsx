import type { Account } from '../../types';
import { formatLots, formatPercent } from '../../utils/formatters';

interface Props {
  accounts: Account[];
  todayPnlMap: Record<string, number>;
  /** Optional accent — yellow for demo section, blue for live. */
  accent?: 'blue' | 'yellow';
}

const fmtMoney = (v: number) =>
  Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const signedMoney = (v: number) => (v >= 0 ? `+$${fmtMoney(v)}` : `-$${fmtMoney(v)}`);

const ddColor = (dd: number, offline: boolean) => {
  if (offline) return 'var(--danger)';
  if (dd < 5) return 'var(--success)';
  if (dd < 20) return 'var(--warning)';
  return 'var(--danger)';
};

const plColor = (v: number) => (v > 0 ? 'var(--success)' : v < 0 ? 'var(--danger)' : 'var(--text-muted)');

/**
 * Tabular view of accounts.
 * Mobile (≤768px) shows only the 4 essential columns — no horizontal scroll.
 * Desktop adds broker, equity, drawdown%, lots, margin level.
 */
export const BotTable = ({ accounts, todayPnlMap, accent = 'blue' }: Props) => {
  const accentColor = accent === 'yellow' ? 'var(--warning)' : 'var(--accent-blue)';

  const thStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-section)',
    fontSize: 'var(--fs-section)',
    color: 'var(--text-muted)',
    letterSpacing: '1px',
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: `1px solid var(--border2)`,
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-body)',
    fontSize: 'var(--fs-body)',
    color: 'var(--text-primary)',
    padding: '10px',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      className="bot-table-wrap"
      style={{
        background: 'var(--bg-card)',
        border: `2px solid ${accentColor}`,
        boxShadow: accent === 'yellow'
          ? '4px 4px 0 rgba(250,204,21,.25), inset 0 0 20px rgba(250,204,21,.04)'
          : '4px 4px 0 rgba(56,189,248,.3), inset 0 0 20px rgba(56,189,248,.04)',
        marginTop: '10px',
        overflowX: 'auto',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '24px', padding: '8px 4px 8px 10px' }}>{/* status dot */}</th>
            <th style={thStyle}>NAME</th>
            <th className="col-broker" style={thStyle}>BROKER</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>BALANCE</th>
            <th className="col-equity" style={{ ...thStyle, textAlign: 'right' }}>EQUITY</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>TODAY</th>
            <th className="col-floating" style={{ ...thStyle, textAlign: 'right' }}>FLOATING</th>
            <th className="col-dd" style={{ ...thStyle, textAlign: 'right' }}>DD%</th>
            <th className="col-lots" style={{ ...thStyle, textAlign: 'right' }}>LOTS</th>
            <th className="col-ml" style={{ ...thStyle, textAlign: 'right' }}>ML%</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(a => {
            const offline = a.status === 'offline';
            const today = todayPnlMap[a.id] ?? 0;
            return (
              <tr key={a.id} className="bot-row" style={{ opacity: offline ? 0.55 : 1 }}>
                {/* Status dot */}
                <td style={{ ...tdStyle, padding: '10px 4px 10px 10px' }}>
                  <span
                    title={a.status}
                    style={{
                      display: 'inline-block',
                      width: '8px', height: '8px',
                      background: offline ? 'var(--danger)' : 'var(--success)',
                      boxShadow: `0 0 6px ${offline ? 'var(--danger)' : 'var(--success)'}`,
                    }}
                  />
                </td>

                {/* Name + account # below */}
                <td style={tdStyle}>
                  <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-primary)', letterSpacing: '.5px' }}>
                    {a.name}
                  </div>
                  <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', marginTop: '2px' }}>
                    #{a.accountNumber || '—'}
                  </div>
                </td>

                <td className="col-broker" style={{ ...tdStyle, color: 'var(--text-muted)' }}>{a.broker}</td>

                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-display)' }}>
                  ${fmtMoney(a.balance)}
                </td>

                <td className="col-equity" style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-display)' }}>
                  ${fmtMoney(a.equity)}
                </td>

                <td style={{ ...tdStyle, textAlign: 'right', color: plColor(today), fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-display)' }}>
                  {signedMoney(today)}
                </td>

                <td className="col-floating" style={{ ...tdStyle, textAlign: 'right', color: plColor(a.profit), fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-display)' }}>
                  {signedMoney(a.profit)}
                </td>

                <td className="col-dd" style={{ ...tdStyle, textAlign: 'right', color: ddColor(a.drawdown, offline) }}>
                  {formatPercent(a.drawdown)}
                </td>

                <td className="col-lots" style={{ ...tdStyle, textAlign: 'right' }}>
                  {formatLots(a.openLots)}
                </td>

                <td className="col-ml" style={{ ...tdStyle, textAlign: 'right', color: a.marginLevel > 0 && a.marginLevel < 200 ? 'var(--warning)' : 'var(--text-primary)' }}>
                  {a.marginLevel > 0 ? `${a.marginLevel.toFixed(0)}%` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <style>{`
        .bot-table-wrap .bot-row:hover { background: rgba(56,189,248,.04); }
        @media (max-width: 768px) {
          .bot-table-wrap { overflow-x: hidden !important; }
          .bot-table-wrap .col-broker,
          .bot-table-wrap .col-equity,
          .bot-table-wrap .col-floating,
          .bot-table-wrap .col-dd,
          .bot-table-wrap .col-lots,
          .bot-table-wrap .col-ml { display: none !important; }
          .bot-table-wrap th, .bot-table-wrap td { padding: 8px 6px !important; }
        }
      `}</style>
    </div>
  );
};
