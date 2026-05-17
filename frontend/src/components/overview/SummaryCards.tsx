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

const COLORS: Record<Modifier, { border: string; glow: string; corner: string; text: string }> = {
  cyan:   { border: 'var(--accent-blue)', glow: '0 0 10px rgba(56,189,248,.6)',  corner: 'rgba(56,189,248,.5)',  text: 'var(--accent-blue)' },
  green:  { border: 'var(--success)',     glow: '0 0 8px rgba(34,197,94,.8)',    corner: 'rgba(34,197,94,.6)',   text: 'var(--success)'     },
  red:    { border: 'var(--danger)',      glow: '0 0 10px rgba(239,68,68,.6)',   corner: 'rgba(239,68,68,.6)',   text: 'var(--danger)'      },
  yellow: { border: 'var(--warning)',     glow: '0 0 10px rgba(250,204,21,.5)',  corner: 'rgba(250,204,21,.6)',  text: 'var(--warning)'     },
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
    <div style={{ background: 'var(--bg-card)', border: `1px solid ${c.border}`, boxShadow: c.glow, padding: '14px 16px', position: 'relative', overflow: 'hidden', minWidth: 0, ...flashBg }}>
      {/* Corner TL */}
      <div className="kpi-corner" style={{ position: 'absolute', top: '-1px', left: '-1px', width: '10px', height: '10px', borderTop: `2px solid ${c.corner}`, borderLeft: `2px solid ${c.corner}`, pointerEvents: 'none' }} />
      {/* Corner BR */}
      <div className="kpi-corner" style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '10px', height: '10px', borderBottom: `2px solid ${c.corner}`, borderRight: `2px solid ${c.corner}`, pointerEvents: 'none' }} />

      {/* Label row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', lineHeight: 1.4 }}>{label}</span>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0, marginLeft: '4px' }}>{icon}</span>
      </div>

      {/* Value */}
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

// Currency display with superscript decimal: $21,138⁶⁵
const CurrencyValue = ({ val, color, size = 24 }: { val: number; color: string; size?: number }) => {
  const [int, dec] = splitNum(val);
  const prefix = val < 0 ? '-$' : '$';
  return (
    <span style={{ color, fontSize: `${size}px`, fontFamily: "'VT323'" }}>
      {prefix}{int}<sup style={{ fontSize: `${Math.round(size * 0.6)}px`, color: 'var(--text-muted)', verticalAlign: 'super' }}>.{dec}</sup>
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
      <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>

        {/* 1 ACCOUNTS */}
        <KpiCard
          label="ACCOUNTS"
          icon="◇"
          mod={acctMod}
          watchValue={stats.onlineAccounts}
          value={
            <span style={{ color: COLORS[acctMod].text }}>
              {stats.onlineAccounts}
              <span style={{ fontSize: '16px', color: 'var(--text-muted)' }}> / {stats.totalAccounts}</span>
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
          value={<span style={{ color: COLORS[pendingMod].text, fontSize: 'var(--fs-disp-md)' }}>{stats.totalPendingOrders}</span>}
          sub="total pending"
        />
      </div>

      <style>{`
        /* Tablet 769–1100px: 3 cols */
        @media (min-width: 769px) and (max-width: 1100px) {
          .summary-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        /* Mobile ≤768px: 2 cols, hide corner brackets — kpi-val auto-scales via --fs-disp-lg token */
        @media (max-width: 768px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
          .kpi-corner { display: none !important; }
        }
      `}</style>
    </>
  );
};
