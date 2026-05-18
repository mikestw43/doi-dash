import { useRef, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { OverviewStats } from '../../types';
import { formatLots } from '../../utils/formatters';

interface Props {
  stats: OverviewStats;
}

// Flash background when value changes
const useFlash = (value: number) => {
  const prevRef = useRef(value);
  const [flash, setFlash] = useState<'up' | 'dn' | null>(null);
  useEffect(() => {
    if (prevRef.current !== value) {
      setFlash(value > prevRef.current ? 'up' : 'dn');
      prevRef.current = value;
      const t = setTimeout(() => setFlash(null), 600);
      return () => clearTimeout(t);
    }
  }, [value]);
  return flash;
};

// Split number → [integerFormatted, decimalStr]  e.g. -21138.65 → ['-21,138', '65']
function splitNum(val: number, dp = 2): [string, string] {
  const abs = Math.abs(val);
  const [intStr, decStr] = abs.toFixed(dp).split('.');
  return [Number(intStr).toLocaleString('en-US'), decStr];
}

type Modifier = 'cyan' | 'green' | 'red' | 'yellow';

const COLORS: Record<Modifier, { border: string; shadow: string; text: string; rgb: string }> = {
  cyan:   { border: 'var(--accent-blue)', shadow: '4px 4px 0 rgba(56,189,248,.3),  inset 0 0 20px rgba(56,189,248,.04)',  text: 'var(--accent-blue)', rgb: '56,189,248' },
  green:  { border: 'var(--success)',     shadow: '4px 4px 0 rgba(34,197,94,.3),   inset 0 0 20px rgba(34,197,94,.04)',   text: 'var(--success)',     rgb: '34,197,94'  },
  red:    { border: 'var(--danger)',      shadow: '4px 4px 0 rgba(239,68,68,.3),   inset 0 0 20px rgba(239,68,68,.04)',   text: 'var(--danger)',      rgb: '239,68,68'  },
  yellow: { border: 'var(--warning)',     shadow: '4px 4px 0 rgba(250,204,21,.3),  inset 0 0 20px rgba(250,204,21,.04)',  text: 'var(--warning)',     rgb: '250,204,21' },
};

interface KpiCardProps {
  label: string;
  icon?: ReactNode;
  mod?: Modifier;
  value: ReactNode;
  sub?: ReactNode;
  watchValue?: number;  // for flash effect
}

const KpiCard = ({ label, icon = '◇', mod = 'cyan', value, sub, watchValue }: KpiCardProps) => {
  const flash = useFlash(watchValue ?? 0);
  const c = COLORS[mod];
  const flashBg: CSSProperties = flash === 'up'
    ? { backgroundColor: 'rgba(34,197,94,.25)', transition: 'background-color .6s' }
    : flash === 'dn'
    ? { backgroundColor: 'rgba(239,68,68,.25)', transition: 'background-color .6s' }
    : { transition: 'background-color .6s' };

  return (
    <div
      className="kpi-card"
      data-mod={mod}
      style={{
        background: 'var(--bg-card)',
        border: `2px solid ${c.border}`,
        boxShadow: c.shadow,
        padding: '18px 20px',
        position: 'relative',
        minWidth: 0,
        transition: 'transform .15s, box-shadow .15s',
        ...flashBg,
      }}
    >
      {/* Label row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', lineHeight: 1.4 }}>{label}</span>
        <span style={{ fontSize: '18px', color: 'var(--text-muted)', opacity: 0.35, flexShrink: 0, marginLeft: '4px', lineHeight: 1 }}>{icon}</span>
      </div>

      {/* Value — all KPI cards share --fs-disp-lg for consistent main number size */}
      <div className="kpi-val" style={{ fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-lg)', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </div>

      {/* Sub */}
      {sub && (
        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </div>
      )}
    </div>
  );
};

// Currency display: $21,138.97 — decimal inline on the same baseline as the
// integer but at ~55% size so the integer still reads as primary. Inherits
// parent .kpi-val font-size (--fs-disp-lg).
const CurrencyValue = ({ val, color }: { val: number; color: string }) => {
  const [int, dec] = splitNum(val);
  const prefix = val < 0 ? '-$' : '$';
  return (
    <span style={{ color }}>
      {prefix}{int}<span style={{ fontSize: '.55em', color: 'var(--text-muted)' }}>.{dec}</span>
    </span>
  );
};

export const SummaryCards = ({ stats }: Props) => {
  const equityChange = ((stats.totalEquity - stats.totalBalance) / Math.max(stats.totalBalance, 1)) * 100;
  const offlineCount = stats.offlineAccounts ?? (stats.totalAccounts - stats.onlineAccounts);
  const hasOffline   = offlineCount > 0;

  const acctMod:    Modifier = hasOffline ? 'yellow' : 'cyan';
  const equityMod:  Modifier = equityChange > 0 ? 'green' : equityChange < 0 ? 'red' : 'cyan';
  const plMod:      Modifier = stats.totalProfit > 0 ? 'green' : stats.totalProfit < 0 ? 'red' : 'cyan';
  const pendingMod: Modifier = stats.totalPendingOrders > 0 ? 'yellow' : 'cyan';

  return (
    <>
      <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>

        {/* 1 ACCOUNTS */}
        <KpiCard
          label="ACCOUNTS"
          icon="◇"
          mod={acctMod}
          watchValue={stats.onlineAccounts}
          value={
            <span style={{ color: COLORS[acctMod].text }}>
              {stats.onlineAccounts}
              <span style={{ fontSize: '.5em', color: 'var(--text-muted)' }}> / {stats.totalAccounts}</span>
            </span>
          }
          sub={hasOffline
            ? <span style={{ color: 'var(--danger)' }}>■ {offlineCount} offline</span>
            : 'All online'}
        />

        {/* 2 TOTAL BALANCE */}
        <KpiCard
          label="TOTAL BALANCE"
          icon="$"
          mod="cyan"
          watchValue={stats.totalBalance}
          value={<CurrencyValue val={stats.totalBalance} color="var(--text-primary)" />}
          sub="incl. all accounts"
        />

        {/* 3 TOTAL EQUITY */}
        <KpiCard
          label="TOTAL EQUITY"
          icon="○"
          mod={equityMod}
          watchValue={stats.totalEquity}
          value={<CurrencyValue val={stats.totalEquity} color={COLORS[equityMod].text} />}
          sub={
            <span style={{ color: equityChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {equityChange >= 0 ? '▲' : '▼'} {equityChange >= 0 ? '+' : ''}{equityChange.toFixed(2)}% vs balance
            </span>
          }
        />

        {/* 4 TOTAL P/L */}
        <KpiCard
          label="TOTAL P/L"
          icon={<span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: COLORS[plMod].text, opacity: 0.8 }}>P/L</span>}
          mod={plMod}
          watchValue={stats.totalProfit}
          value={<CurrencyValue val={stats.totalProfit} color={COLORS[plMod].text} />}
          sub="Floating unrealized"
        />

        {/* 5 OPEN LOTS */}
        <KpiCard
          label="OPEN LOTS"
          icon="◇"
          mod="cyan"
          watchValue={stats.totalOpenLots}
          value={<span style={{ color: 'var(--accent-blue)' }}>{formatLots(stats.totalOpenLots)}</span>}
          sub={`B:${formatLots(stats.totalBuyLots)} / S:${formatLots(stats.totalSellLots)}`}
        />

        {/* 6 PENDING ORDERS */}
        <KpiCard
          label="PENDING ORDERS"
          icon={<span style={{ color: COLORS[pendingMod].text, opacity: 0.7 }}>□</span>}
          mod={pendingMod}
          watchValue={stats.totalPendingOrders}
          value={<span style={{ color: COLORS[pendingMod].text }}>{stats.totalPendingOrders}</span>}
          sub="total pending"
        />
      </div>

      <style>{`
        /* Hover lift — pixel-art shadow grows + inner glow intensifies. !important
           required because the default shadow is set inline on each card. */
        .kpi-card[data-mod="cyan"]:hover   { transform: translate(-3px, -3px); box-shadow: 6px 6px 0 rgba(56,189,248,.35),  inset 0 0 20px rgba(56,189,248,.06)  !important; }
        .kpi-card[data-mod="green"]:hover  { transform: translate(-3px, -3px); box-shadow: 6px 6px 0 rgba(34,197,94,.35),   inset 0 0 20px rgba(34,197,94,.06)   !important; }
        .kpi-card[data-mod="red"]:hover    { transform: translate(-3px, -3px); box-shadow: 6px 6px 0 rgba(239,68,68,.35),   inset 0 0 20px rgba(239,68,68,.06)   !important; }
        .kpi-card[data-mod="yellow"]:hover { transform: translate(-3px, -3px); box-shadow: 6px 6px 0 rgba(250,204,21,.35),  inset 0 0 20px rgba(250,204,21,.06)  !important; }

        /* Mobile ≤768px: 2 cols, compact cards so all 6 fit one screen.
           Tighter padding + smaller display number + reduced gaps. */
        @media (max-width: 768px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
          .kpi-card { padding: 10px 12px !important; }
          .kpi-card .kpi-val { font-size: 28px !important; }
        }
      `}</style>
    </>
  );
};
