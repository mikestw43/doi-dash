import type { OverviewStats } from '../../types';
import { formatCurrency, formatPercent, formatLots } from '../../utils/formatters';
import { FlashNumber } from '../ui/FlashNumber';

interface Props {
  stats: OverviewStats;
}

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
}

// Clean card matching reference style — no pixel shadow, no corner brackets, no progress bar
// Bottom border accent line shows the card's color theme
const KpiCard = ({ label, value, sub, accent = 'var(--accent-blue)' }: KpiCardProps) => (
  <div style={{
    background: 'var(--bg-card)',
    border: '1px solid var(--border2)',
    borderBottom: `2px solid ${accent}`,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  }}>
    {/* Label */}
    <div style={{
      fontFamily: "'Share Tech Mono'", fontSize: '10px',
      color: 'var(--text-muted)', textTransform: 'uppercase',
      letterSpacing: '0.5px', marginBottom: '6px',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>{label}</div>

    {/* Value — VT323 for numbers, inherits size from .kpi-val */}
    <div className="kpi-val" style={{
      fontFamily: "'VT323'", fontSize: '32px', lineHeight: 1.1,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>{value}</div>

    {/* Sub */}
    {sub && (
      <div style={{
        fontFamily: "'Share Tech Mono'", fontSize: '10px',
        color: 'var(--text-muted)', marginTop: '4px',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{sub}</div>
    )}
  </div>
);

export const SummaryCards = ({ stats }: Props) => {
  const equityChange = ((stats.totalEquity - stats.totalBalance) / Math.max(stats.totalBalance, 1)) * 100;
  const offlineCount = stats.offlineAccounts || (stats.totalAccounts - stats.onlineAccounts);
  const hasOffline = offlineCount > 0;

  return (
    <>
      {/* PC: 6 cards in a single row. Mobile: 2 cols */}
      <div className="summary-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '8px',
      }}>

        {/* ACCOUNTS */}
        <KpiCard
          label="ACCOUNTS"
          accent={hasOffline ? 'var(--warning)' : 'var(--accent-blue)'}
          value={
            <span style={{ color: hasOffline ? 'var(--warning)' : 'var(--accent-blue)' }}>
              {stats.onlineAccounts}
              <span style={{ fontSize: '18px', color: 'var(--text-muted)' }}> / {stats.totalAccounts}</span>
            </span>
          }
          sub={hasOffline
            ? <span style={{ color: 'var(--danger)' }}>■ {offlineCount} offline</span>
            : 'All online'}
        />

        {/* TOTAL BALANCE */}
        <KpiCard
          label="TOTAL BALANCE"
          accent="var(--accent-blue)"
          value={<span style={{ color: 'var(--accent-blue)' }}>{formatCurrency(stats.totalBalance)}</span>}
          sub="incl. all accounts"
        />

        {/* TOTAL EQUITY */}
        <KpiCard
          label="TOTAL EQUITY"
          accent={equityChange >= 0 ? 'var(--success)' : 'var(--danger)'}
          value={
            <FlashNumber
              value={stats.totalEquity}
              format={(v) => formatCurrency(v)}
              positiveGreen={equityChange >= 0}
              className=""
              style={{ color: equityChange >= 0 ? 'var(--success)' : 'var(--danger)' }}
            />
          }
          sub={
            <span style={{ color: equityChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {equityChange >= 0 ? '▲' : '▼'} {equityChange >= 0 ? '+' : ''}{formatPercent(equityChange)} vs balance
            </span>
          }
        />

        {/* FLOATING P/L */}
        <KpiCard
          label="FLOATING P/L"
          accent={stats.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'}
          value={
            <FlashNumber
              value={stats.totalProfit}
              format={(v) => formatCurrency(v)}
              positiveGreen
              className=""
              style={{ color: stats.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}
            />
          }
          sub="Unrealized"
        />

        {/* OPEN LOTS */}
        <KpiCard
          label="OPEN LOTS"
          accent="var(--accent-blue)"
          value={<span style={{ color: 'var(--accent-blue)' }}>{formatLots(stats.totalOpenLots)}</span>}
          sub={`B:${formatLots(stats.totalBuyLots)} / S:${formatLots(stats.totalSellLots)}`}
        />

        {/* PENDING */}
        <KpiCard
          label="PENDING"
          accent={stats.totalPendingOrders > 0 ? 'var(--warning)' : 'var(--border2)'}
          value={
            <span style={{ color: stats.totalPendingOrders > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
              {stats.totalPendingOrders}
            </span>
          }
          sub="total pending"
        />
      </div>

      <style>{`
        /* Mobile: 2 columns, smaller value font */
        @media (max-width: 768px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 6px !important; }
          .kpi-val { font-size: 26px !important; }
        }
        /* Mid tablet: 3 columns */
        @media (min-width: 769px) and (max-width: 1100px) {
          .summary-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
      `}</style>
    </>
  );
};
