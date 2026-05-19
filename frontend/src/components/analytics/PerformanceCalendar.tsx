import { useState, useEffect, useMemo } from 'react';
import { fetchDailyPnL } from '../../services/api';
import type { DailyPnL } from '../../types';

interface Props {
  accountId?: string;
}

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Cell formatter — designed to fit ~6 characters per cell so the bigger
 * VT font doesn't overflow the day box. Backend already returns USD.
 *   < $1000: 2 decimals, e.g. +$23.45 / -$8.50
 *   ≥ $1000 < $1M: 1 decimal with 'k', e.g. +$1.2k / -$12.4k
 *   ≥ $1M: 2 decimals with 'M', e.g. +$1.25M
 */
const fmtCell = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '-';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
};

/** Monthly P/L total — full precision with thousands separator. USD. */
const fmtFull = (n: number): string => {
  const sign = n >= 0 ? '+' : '-';
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const heatClass = (pnl: number): string => {
  const abs = Math.abs(pnl);
  if (pnl > 0)  return abs > 1200 ? 'pcal-p3' : abs > 500 ? 'pcal-p2' : 'pcal-p1';
  if (pnl < 0) return abs > 1200 ? 'pcal-l3' : abs > 500 ? 'pcal-l2' : 'pcal-l1';
  return '';
};

const heatBg = (cls: string): string => {
  switch (cls) {
    case 'pcal-p1': return 'rgba(34,197,94,.05)';
    case 'pcal-p2': return 'rgba(34,197,94,.12)';
    case 'pcal-p3': return 'rgba(34,197,94,.22)';
    case 'pcal-l1': return 'rgba(239,68,68,.05)';
    case 'pcal-l2': return 'rgba(239,68,68,.12)';
    case 'pcal-l3': return 'rgba(239,68,68,.22)';
    default: return 'transparent';
  }
};

const heatBorder = (cls: string): string => {
  if (cls === 'pcal-p3') return 'rgba(34,197,94,.18)';
  if (cls === 'pcal-l3') return 'rgba(239,68,68,.18)';
  return 'var(--border)';
};

export const PerformanceCalendar = ({ accountId }: Props) => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [data, setData] = useState<DailyPnL[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch 6M of data — covers most navigation; user can navigate back ~6 months
  useEffect(() => {
    setLoading(true);
    fetchDailyPnL(accountId || undefined, '6M')
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [accountId]);

  // Build pnl-by-date map for current month
  const dayMap = useMemo(() => {
    const m = new Map<number, number>();
    const ymPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    for (const d of data) {
      if (d.date.startsWith(ymPrefix)) {
        const day = parseInt(d.date.slice(8, 10), 10);
        m.set(day, d.profit);
      }
    }
    return m;
  }, [data, year, month]);

  // Per-month stats
  const stats = useMemo(() => {
    const vals = Array.from(dayMap.values());
    const total = vals.reduce((s, v) => s + v, 0);
    const wins = vals.filter(v => v > 0).length;
    const losses = vals.filter(v => v < 0).length;
    const best = vals.length ? Math.max(...vals) : 0;
    const worst = vals.length ? Math.min(...vals) : 0;
    return { total, wins, losses, best, worst };
  }, [dayMap]);

  // Calendar cells
  const grid = useMemo(() => {
    const firstDow = new Date(year, month, 1).getDay();
    const startCol = (firstDow + 6) % 7; // Monday-first
    const dim = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startCol; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let r = 0; r < cells.length / 7; r++) {
      rows.push(cells.slice(r * 7, r * 7 + 7));
    }
    return rows;
  }, [year, month]);

  const todayKey = today.getFullYear() === year && today.getMonth() === month ? today.getDate() : -1;

  const changeMonth = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m < 0) { m = 11; y -= 1; }
    else if (m > 11) { m = 0; y += 1; }
    setMonth(m); setYear(y);
  };

  /* ── Styles ───────────────────────────────────── */
  const hdrStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '8px', flexWrap: 'wrap', marginBottom: '12px',
  };
  const navBtn: React.CSSProperties = {
    width: '26px', height: '26px', border: '1px solid var(--border2)',
    color: 'var(--text)', cursor: 'pointer', fontSize: '13px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', transition: 'border-color .15s',
  };
  const monthLbl: React.CSSProperties = {
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
    color: 'var(--text-primary)', letterSpacing: '1px',
    minWidth: '88px', textAlign: 'center',
  };
  const pstatLbl: React.CSSProperties = {
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
    color: 'var(--text-dim)', letterSpacing: '.5px',
    display: 'block', marginBottom: '3px',
  };
  const pstatVal: React.CSSProperties = {
    fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', lineHeight: 1,
    display: 'block',
  };
  const totalWrap: React.CSSProperties = {
    fontSize: '10px', color: 'var(--text-dim)', fontFamily: "'Share Tech Mono'",
    display: 'flex', alignItems: 'center', gap: '6px',
  };

  const thStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
    color: 'var(--text-dim)', padding: '9px 4px',
    textAlign: 'center', borderBottom: '2px solid var(--border2)',
    letterSpacing: '.5px', fontWeight: 400,
  };
  const thWeek: React.CSSProperties = {
    ...thStyle, color: 'var(--accent-blue)',
    borderLeft: '1px solid var(--border2)', minWidth: '60px',
  };

  const tdBase: React.CSSProperties = {
    padding: '5px 7px', textAlign: 'left',
    border: '1px solid var(--border)',
    verticalAlign: 'top', height: '70px', position: 'relative',
  };

  /* ── Render ───────────────────────────────────── */
  return (
    <div>
      {/* Header: month nav + stats + total */}
      <div style={hdrStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => changeMonth(-1)}
            style={navBtn}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text)'; }}
          >
            ◁
          </button>
          <div style={monthLbl}>{MONTHS_SHORT[month]} {year}</div>
          <button
            onClick={() => changeMonth(1)}
            style={navBtn}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text)'; }}
          >
            ▷
          </button>
        </div>

        {/* Per-day stats */}
        <div className="perf-stats-row" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <span style={pstatLbl}>WIN DAYS</span>
            <span style={{ ...pstatVal, color: 'var(--success)' }}>{stats.wins}</span>
          </div>
          <div>
            <span style={pstatLbl}>LOSS DAYS</span>
            <span style={{ ...pstatVal, color: 'var(--danger)' }}>{stats.losses}</span>
          </div>
          <div>
            <span style={pstatLbl}>BEST DAY</span>
            <span style={{ ...pstatVal, color: 'var(--success)' }}>{fmtCell(stats.best)}</span>
          </div>
          <div>
            <span style={pstatLbl}>WORST DAY</span>
            <span style={{ ...pstatVal, color: 'var(--danger)' }}>{fmtCell(stats.worst)}</span>
          </div>
        </div>

        {/* Monthly P&L total */}
        <div style={totalWrap}>
          <span>MONTHLY P&amp;L</span>
          <span style={{
            fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', lineHeight: 1,
            color: stats.total > 0 ? 'var(--success)' : stats.total < 0 ? 'var(--danger)' : 'var(--text-dim)',
          }}>
            {dayMap.size > 0 ? fmtFull(stats.total) : '—'}
          </span>
        </div>
      </div>

      {/* Calendar table */}
      <div className="pcal-wrap" style={{ overflowX: 'auto' }}>
        <table className="pcal" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: 'var(--bg-card2)' }}>
              <th className="pcal-th" style={thStyle}>MON</th>
              <th className="pcal-th" style={thStyle}>TUE</th>
              <th className="pcal-th" style={thStyle}>WED</th>
              <th className="pcal-th" style={thStyle}>THU</th>
              <th className="pcal-th" style={thStyle}>FRI</th>
              <th className="pcal-th" style={thStyle}>SAT</th>
              <th className="pcal-th" style={thStyle}>SUN</th>
              <th className="pcal-th pcal-th-wk" style={thWeek}>WEEK</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((row, ri) => {
              let weekSum = 0;
              let hasDay = false;
              const dayCells = row.map((day, ci) => {
                if (day === null) {
                  return <td key={ci} className="pcal-td pcal-empty" style={{ ...tdBase, border: '1px solid transparent', background: 'transparent' }} />;
                }
                const pnl = dayMap.get(day);
                if (pnl !== undefined) { weekSum += pnl; hasDay = true; }
                const heat = pnl !== undefined ? heatClass(pnl) : '';
                const isToday = day === todayKey;
                const bg = isToday ? 'rgba(56,189,248,.07)' : heatBg(heat);
                const border = isToday
                  ? '2px solid var(--accent-blue)'
                  : `1px solid ${heatBorder(heat)}`;
                const pnlColor = pnl !== undefined
                  ? (pnl > 0 ? 'var(--success)' : pnl < 0 ? 'var(--danger)' : 'var(--text-dim)')
                  : 'var(--text-dim)';
                return (
                  <td key={ci} className="pcal-td" style={{
                    ...tdBase,
                    background: bg,
                    border,
                    boxShadow: isToday ? 'inset 0 0 16px rgba(56,189,248,.18)' : undefined,
                  }}>
                    <span className="pcal-dn" style={{
                      display: 'block', fontFamily: "'Share Tech Mono'",
                      fontSize: '9px', color: 'var(--text-dim)',
                      lineHeight: 1, marginBottom: '6px',
                    }}>
                      {day}
                    </span>
                    {pnl !== undefined && (
                      <span className="pcal-pnl" style={{
                        display: 'block', fontFamily: "'VT323'",
                        fontSize: '26px', lineHeight: 1, color: pnlColor,
                      }}>
                        {fmtCell(pnl)}
                      </span>
                    )}
                  </td>
                );
              });
              const weekColor = weekSum > 0 ? 'var(--success)' : weekSum < 0 ? 'var(--danger)' : 'var(--text-dim)';
              return (
                <tr key={ri}>
                  {dayCells}
                  <td className="pcal-td pcal-wk-sum" style={{
                    ...tdBase,
                    background: 'var(--bg-card2)',
                    borderLeft: '2px solid var(--border2)',
                    textAlign: 'center', verticalAlign: 'middle',
                    padding: '0 6px', minWidth: '62px',
                  }}>
                    <span className="pcal-wk-lbl" style={{
                      display: 'block',
                      fontFamily: "'Press Start 2P'",
                      fontSize: '5px', color: 'rgba(56,189,248,.5)',
                      letterSpacing: '.3px', marginBottom: '4px',
                    }}>
                      WEEK
                    </span>
                    <span className="pcal-pnl" style={{
                      display: 'block', fontFamily: "'VT323'",
                      fontSize: '26px', lineHeight: 1, color: weekColor,
                    }}>
                      {hasDay ? fmtCell(weekSum) : '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: '14px', alignItems: 'center',
        marginTop: '10px', paddingTop: '8px',
        borderTop: '1px solid var(--border)', flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px' }}>
          HEAT:
        </span>
        {[
          { bg: 'rgba(34,197,94,.22)', label: 'Strong profit' },
          { bg: 'rgba(34,197,94,.12)', label: 'Profit' },
          { bg: 'rgba(34,197,94,.05)', label: 'Small profit' },
          { bg: 'rgba(239,68,68,.05)', label: 'Small loss' },
          { bg: 'rgba(239,68,68,.12)', label: 'Loss' },
          { bg: 'rgba(239,68,68,.22)', label: 'Strong loss' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)' }}>
            <span style={{ width: '11px', height: '11px', background: item.bg, border: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }} />
            {item.label}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginLeft: '8px' }}>
          <span style={{ width: '11px', height: '11px', background: 'rgba(56,189,248,.07)', border: '1px solid var(--accent-blue)', flexShrink: 0 }} />
          Today
        </div>
      </div>

      {loading && data.length === 0 && (
        <div style={{ textAlign: 'center', padding: '12px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)' }}>
          Loading...
        </div>
      )}

      {/* ── Mobile responsive — drop horizontal scroll, shrink cells ── */}
      <style>{`
        @media (max-width: 768px) {
          .pcal-wrap { overflow-x: visible !important; }
          .pcal { min-width: 0 !important; table-layout: fixed !important; }
          .pcal-th { padding: 4px 1px !important; font-size: 5px !important; letter-spacing: 0 !important; }
          .pcal-td { padding: 3px 3px !important; height: 52px !important; }
          .pcal-td.pcal-wk-sum { min-width: 0 !important; padding: 2px 2px !important; }
          .pcal-dn { font-size: 7px !important; margin-bottom: 3px !important; }
          .pcal-pnl { font-size: 17px !important; }
          .pcal-wk-lbl { font-size: 4px !important; margin-bottom: 2px !important; }
        }
        @media (max-width: 480px) {
          .pcal-td { padding: 2px 2px !important; height: 44px !important; }
          .pcal-dn { font-size: 6px !important; }
          .pcal-pnl { font-size: 14px !important; }
        }
      `}</style>
    </div>
  );
};
