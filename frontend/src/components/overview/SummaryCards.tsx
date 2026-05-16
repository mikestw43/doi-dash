import type { OverviewStats } from '../../types';
import { formatCurrency, formatPercent, formatLots } from '../../utils/formatters';
import { FlashNumber } from '../ui/FlashNumber';

interface Props {
  stats: OverviewStats;
}

interface KpiCardProps {
  label: string;
  icon?: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  barWidth?: number;        // 0–100
  barColor?: string;        // CSS variable name like 'var(--accent-blue)'
  variant?: 'default' | 'red' | 'yellow';
}

const KpiCard = ({ label, icon, value, sub, barWidth = 0, barColor = 'var(--accent-blue)', variant = 'default' }: KpiCardProps) => (
  <div className={`kpi-card${variant === 'red' ? ' kpi-red' : variant === 'yellow' ? ' kpi-yellow' : ''}`}>
    {/* Header */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
      <span className="kpi-label" style={{
        fontFamily: "'Press Start 2P'", fontSize: '7px',
        color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px',
      }}>{label}</span>
      {icon && (
        <span className="kpi-icon" style={{ fontSize: '13px', color: 'var(--text-muted)', opacity: .5 }}>{icon}</span>
      )}
    </div>

    {/* Value */}
    <div className="kpi-value" style={{ fontFamily: "'VT323'", fontSize: '38px', fontWeight: 400, lineHeight: 1 }}>
      {value}
    </div>

    {/* Sub */}
    {sub && (
      <div className="kpi-sub" style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-muted)', marginTop: '5px', letterSpacing: '.5px' }}>
        {sub}
      </div>
    )}

    {/* Progress bar */}
    <div style={{ height: '2px', background: 'var(--border-color)', marginTop: '8px' }}>
      <div style={{
        height: '100%', width: `${barWidth}%`,
        background: barColor,
        boxShadow: `0 0 4px ${barColor}`,
        transition: 'width .4s',
      }} />
    </div>
  </div>
);

export const SummaryCards = ({ stats }: Props) => {
  const equityChange = ((stats.totalEquity - stats.totalBalance) / Math.max(stats.totalBalance, 1)) * 100;
  const offlineCount = stats.offlineAccounts || (stats.totalAccounts - stats.onlineAccounts);
  const hasOffline = offlineCount > 0;
  const onlinePct = stats.totalAccounts > 0 ? (stats.onlineAccounts / stats.totalAccounts) * 100 : 100;

  return (
    <div className="summary-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '10px',
    }}>
      {/* ACCOUNTS */}
      <KpiCard
        label="ACCOUNTS"
        icon="◇"
        value={
          <span style={{ color: hasOffline ? 'var(--warning)' : 'var(--accent-blue)' }}>
            {stats.onlineAccounts}
            <span style={{ fontSize: '16px', color: 'var(--text-muted)', fontWeight: 400 }}>
              {' '}/ {stats.totalAccounts}
            </span>
          </span>
        }
        sub={
          hasOffline
            ? <span style={{ color: 'var(--danger)' }}>■ {offlineCount} offline</span>
            : 'All online'
        }
        barWidth={onlinePct}
        barColor="var(--accent-blue)"
      />

      {/* TOTAL BALANCE */}
      <KpiCard
        label="TOTAL BALANCE"
        icon="$"
        value={
          <span style={{ color: 'var(--accent-blue)', fontSize: '24px' }}>
            {formatCurrency(stats.totalBalance)}
          </span>
        }
        sub="USD"
        barWidth={65}
        barColor="var(--accent-blue)"
      />

      {/* TOTAL EQUITY */}
      <KpiCard
        label="TOTAL EQUITY"
        icon="○"
        value={
          <FlashNumber
            value={stats.totalEquity}
            format={(v) => formatCurrency(v)}
            positiveGreen={equityChange >= 0}
            className=""
            style={{ fontFamily: "'VT323'", fontSize: '24px', lineHeight: 1, color: equityChange >= 0 ? 'var(--success)' : 'var(--danger)' }}
          />
        }
        sub={
          <span style={{ color: equityChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {equityChange >= 0 ? '▲' : '▼'} {equityChange >= 0 ? '+' : ''}{formatPercent(equityChange)} vs balance
          </span>
        }
        barWidth={82}
        barColor="var(--success)"
        variant="default"
      />

      {/* TOTAL P/L */}
      <KpiCard
        label="TOTAL P/L"
        icon="P/L"
        value={
          <FlashNumber
            value={stats.totalProfit}
            format={(v) => formatCurrency(v)}
            positiveGreen
            className=""
            style={{ fontFamily: "'VT323'", fontSize: '38px', lineHeight: 1, color: stats.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}
          />
        }
        sub="Floating unrealized"
        barWidth={Math.min(Math.abs(stats.totalProfit / Math.max(stats.totalBalance, 1)) * 100, 100)}
        barColor={stats.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'}
        variant={stats.totalProfit < 0 ? 'red' : 'default'}
      />

      {/* OPEN LOTS */}
      <KpiCard
        label="OPEN LOTS"
        icon="◇"
        value={
          <span style={{ color: 'var(--accent-blue)' }}>
            {formatLots(stats.totalOpenLots)}
          </span>
        }
        sub={`B:${formatLots(stats.totalBuyLots)} / S:${formatLots(stats.totalSellLots)}`}
        barWidth={40}
        barColor="var(--accent-blue)"
      />

      {/* PENDING ORDERS */}
      <KpiCard
        label="PENDING ORDERS"
        icon="□"
        value={
          <span style={{ color: 'var(--warning)', fontSize: '36px' }}>
            {stats.totalPendingOrders}
          </span>
        }
        sub="total pending"
        barWidth={30}
        barColor="var(--warning)"
        variant={stats.totalPendingOrders > 0 ? 'yellow' : 'default'}
      />

      <style>{`
        @media (max-width: 640px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
};
