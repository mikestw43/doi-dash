import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { EconomicEvent } from '../../types';
import { fetchEconomicCalendar } from '../../services/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦', CHF: '🇨🇭',
  CNY: '🇨🇳', CNH: '🇨🇳',
};

interface ImpactCfg {
  label: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
}

const IMPACT_CFG: Record<string, ImpactCfg> = {
  High:           { label: 'HIGH', color: 'var(--red)',     bg: 'rgba(239,68,68,.12)',  border: 'rgba(239,68,68,.35)',  dot: 'var(--red)' },
  Medium:         { label: 'MED',  color: 'var(--orange)',  bg: 'rgba(249,115,22,.12)', border: 'rgba(249,115,22,.35)', dot: 'var(--orange)' },
  Low:            { label: 'LOW',  color: 'var(--warning)', bg: 'rgba(250,204,21,.12)', border: 'rgba(250,204,21,.35)', dot: 'var(--warning)' },
  'Non-Economic': { label: 'N/E',  color: '#475569',        bg: 'rgba(71,85,105,.08)',  border: 'rgba(71,85,105,.2)',   dot: '#334155' },
};

const ALL_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'CNY'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtTime = (dateStr: string) =>
  new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

const fmtDateLabel = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const getImpactCfg = (impact: string): ImpactCfg =>
  IMPACT_CFG[impact] ?? IMPACT_CFG['Low'];

// ─── Shared table styles ──────────────────────────────────────────────────────

const thSt: React.CSSProperties = {
  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)',
  letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left',
  borderBottom: '2px solid var(--border2)', fontWeight: 400, whiteSpace: 'nowrap',
};
const thR: React.CSSProperties = { ...thSt, textAlign: 'right' };
const thC: React.CSSProperties = { ...thSt, textAlign: 'center' };

const tdSt: React.CSSProperties = {
  padding: '7px 10px', borderBottom: '1px solid rgba(45,64,96,.3)',
  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-dim)',
  whiteSpace: 'nowrap',
};
const tdR: React.CSSProperties = { ...tdSt, textAlign: 'right' };
const tdC: React.CSSProperties = { ...tdSt, textAlign: 'center' };

// ─── EventTable ──────────────────────────────────────────────────────────────

interface EventTableProps { events: EconomicEvent[]; now: Date }

const EventTable = ({ events, now }: EventTableProps) => (
  <div className="evt-wrap" style={{
    background: 'var(--bg-card)',
    border: '2px solid var(--accent-blue)',
    boxShadow: '4px 4px 0 rgba(56,189,248,.3), inset 0 0 20px rgba(56,189,248,.04)',
  }}>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'var(--bg-card2)' }}>
          <th style={{ ...thSt, width: '52px' }}>TIME</th>
          <th style={{ ...thSt, width: '48px' }}>CCY</th>
          <th style={{ ...thC, width: '24px', padding: '9px 4px' }} aria-label="Impact" />
          <th className="evcol-event" style={{ ...thSt, width: '40%' }}>EVENT</th>
          <th className="evcol-actual" style={{ ...thR, width: '70px' }}>
            <span className="lbl-full">ACTUAL</span>
            <span className="lbl-short">ACT</span>
          </th>
          <th className="evcol-forecast" style={{ ...thR, width: '70px' }}>
            <span className="lbl-full">FORECAST</span>
            <span className="lbl-short">FCST</span>
          </th>
          <th className="evcol-prev" style={{ ...thR, width: '70px' }}>PREV</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event, i) => {
          const past   = new Date(event.date) < now;
          const cfg    = getImpactCfg(event.impact);
          const isHigh = event.impact === 'High';
          // No row-level opacity now — per-cell color (white for upcoming,
          // dim for past) does the visual separation on its own. Mixing
          // opacity 0.45 with text-dim made past rows nearly invisible.
          const rowOpacity = past ? 0.7 : 1;

          return (
            <tr
              key={`${event.date}-${i}`}
              style={{ opacity: rowOpacity }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLTableRowElement).style.background =
                  isHigh && !past ? 'rgba(239,68,68,.05)' : 'rgba(45,64,96,.2)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
              }}
            >
              {/* TIME — VT323 display font (Press Start 2P overlapped at this
                  size). Upcoming events render bright white so they pop. */}
              <td style={{
                ...tdSt,
                padding: '7px 4px',
                fontFamily: 'var(--ff-display)',
                fontSize: '17px',
                lineHeight: 1,
                color: past ? 'var(--text-dim)' : 'var(--text)',
              }}>
                {fmtTime(event.date)}
              </td>
              <td style={{ ...tdSt, paddingRight: '2px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="evcol-flag" style={{ fontSize: '13px', lineHeight: 1 }}>{CURRENCY_FLAGS[event.country] ?? '🏳️'}</span>
                  {/* CCY — VT323, same color logic as TIME. */}
                  <span style={{
                    fontFamily: 'var(--ff-display)',
                    fontSize: '20px',
                    lineHeight: 1,
                    color: past ? 'var(--text-dim)' : 'var(--text)',
                  }}>{event.country}</span>
                </span>
              </td>
              <td style={{ ...tdC, padding: '7px 2px' }}>
                {/* Colored square — sole indicator. Color encodes High/Medium/Low. */}
                <span
                  title={cfg.label}
                  style={{
                    display: 'inline-block',
                    width: '12px', height: '12px',
                    background: cfg.dot,
                    border: `1px solid ${cfg.border}`,
                  }}
                />
              </td>
              <td className="evcol-event" style={{
                ...tdSt,
                fontFamily: 'var(--ff-display)',
                fontSize: '17px',
                lineHeight: 1.15,
                color: past ? 'var(--text-dim)' : (isHigh ? 'var(--text)' : 'var(--text-primary)'),
              }}>
                {event.title}
              </td>
              {/* ACTUAL — green if beat forecast, red if missed (sentiment from
                  Investing.com), else white when present / dim when empty. */}
              <td style={{
                ...tdR,
                padding: '7px 4px',
                fontFamily: 'var(--ff-display)',
                fontSize: '17px',
                lineHeight: 1,
                color: !event.actual
                  ? '#334155'
                  : event.actualSentiment === 'better'
                    ? 'var(--success)'
                    : event.actualSentiment === 'worse'
                      ? 'var(--danger)'
                      : 'var(--text)',
              }}>
                {event.actual || '—'}
              </td>
              {/* FORECAST — same font, bright white for upcoming / dim for past. */}
              <td style={{
                ...tdR,
                padding: '7px 4px',
                fontFamily: 'var(--ff-display)',
                fontSize: '17px',
                lineHeight: 1,
                color: past ? 'var(--text-dim)' : 'var(--text)',
              }}>
                {event.forecast || '—'}
              </td>
              <td className="evcol-prev" style={{
                ...tdR,
                padding: '7px 4px',
                fontFamily: 'var(--ff-display)',
                fontSize: '17px',
                lineHeight: 1,
                color: '#475569',
              }}>
                {event.previous || '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>

    <style>{`
      .evt-wrap { overflow-x: hidden; }
      .evt-wrap table { table-layout: fixed; width: 100%; }

      /* EVENT cell is the only one that wraps — other cells stay nowrap so
         numbers and badges don't break visually. */
      .evt-wrap .evcol-event {
        white-space: normal !important;
        word-break: break-word;
        line-height: 1.3;
      }

      /* Default (desktop): full header labels, short hidden. */
      .evt-wrap .lbl-short { display: none; }

      @media (max-width: 768px) {
        /* Hide flag emoji inside CCY cell + the entire PREV column */
        .evt-wrap .evcol-flag { display: none !important; }
        .evt-wrap .evcol-prev { display: none !important; }

        /* Swap header labels to compact form: ACTUAL→ACT, FORECAST→FCST */
        .evt-wrap .lbl-full  { display: none !important; }
        .evt-wrap .lbl-short { display: inline !important; }

        /* Narrow the abbreviated columns so EVENT gets the freed pixels */
        .evt-wrap .evcol-actual,
        .evt-wrap .evcol-forecast { width: 42px !important; }

        /* Headers stay compact (fs-section is 8px on both viewports). */
        .evt-wrap th { font-size: var(--fs-section) !important; }

        /* NOTE: removed global td font-size + padding overrides that were
           clobbering the inline 20px VT font and the per-cell padding. Each
           cell now controls its own font and padding via inline style. */
      }
    `}</style>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const EconomicCalendar = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<EconomicEvent[]>({
    queryKey: ['economic-calendar'],
    queryFn: () => fetchEconomicCalendar(false),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });

  /** Manual refresh — bypass backend 30-min cache and seed the query
   *  cache with the fresh payload. Using useMutation gives us a real
   *  pending flag for the button's disabled / spinner state. */
  const refreshMutation = useMutation<EconomicEvent[]>({
    mutationFn: () => fetchEconomicCalendar(true),
    onSuccess: (fresh) => {
      queryClient.setQueryData(['economic-calendar'], fresh);
    },
  });
  const refreshing = refreshMutation.isPending;
  const handleRefresh = () => {
    if (!refreshing) refreshMutation.mutate();
  };

  const [viewMode,  setViewMode]  = useState<'today' | 'week'>('today');
  const [selected,  setSelected]  = useState<string[]>([]);
  const [minImpact, setMinImpact] = useState<'all' | 'medium' | 'high'>('all');

  const now = new Date();

  const filtered = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd   = new Date(todayStart.getTime() + 86_400_000);
    const dow        = now.getDay();
    const weekStart  = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - (dow === 0 ? 6 : dow - 1));
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

    return data
      .filter(e => {
        const d = new Date(e.date);
        if (viewMode === 'today' ? (d < todayStart || d >= todayEnd) : (d < weekStart || d >= weekEnd)) return false;
        if (selected.length > 0 && !selected.includes(e.country)) return false;
        if (minImpact === 'high'   && e.impact !== 'High') return false;
        if (minImpact === 'medium' && (e.impact === 'Low' || e.impact === 'Non-Economic')) return false;
        return true;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data, viewMode, selected, minImpact]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayHighCount = useMemo(() => {
    if (!data || !Array.isArray(data)) return 0;
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const e = new Date(s.getTime() + 86_400_000);
    return data.filter(ev => { const d = new Date(ev.date); return d >= s && d < e && ev.impact === 'High'; }).length;
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Loading ────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '28px', height: '28px', border: '2px solid var(--cyan)', borderTopColor: 'transparent',
          borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-dim)' }}>
          Loading economic calendar...
        </p>
      </div>
    </div>
  );

  // ─── Error ───────────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚠</div>
        <p style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--red)', marginBottom: '8px', letterSpacing: '.5px' }}>
          FAILED TO LOAD CALENDAR
        </p>
        <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginBottom: '16px' }}>
          Could not reach ForexFactory. Check network connectivity.
        </p>
        <button
          onClick={handleRefresh}
          style={{
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
            padding: '9px 16px', background: 'var(--cyan)', color: '#0c1422',
            border: '1px solid var(--cyan)', cursor: 'pointer',
          }}
        >
          TRY AGAIN
        </button>
      </div>
    </div>
  );

  const grouped = viewMode === 'week'
    ? filtered.reduce<Record<string, EconomicEvent[]>>((acc, ev) => {
        const label = fmtDateLabel(ev.date);
        if (!acc[label]) acc[label] = [];
        acc[label].push(ev);
        return acc;
      }, {})
    : null;

  const tabBtn = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
    padding: '6px 12px', cursor: 'pointer',
    border: active ? '1px solid var(--success)' : '1px solid transparent',
    background: active ? 'rgba(34,197,94,.08)' : 'none',
    color: active ? 'var(--success)' : 'var(--text-dim)',
    transition: 'all .15s',
  });

  const impactBtn = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
    padding: '5px 10px', cursor: 'pointer',
    border: active ? '1px solid var(--cyan)' : '1px solid var(--border2)',
    background: active ? 'rgba(56,189,248,.1)' : 'none',
    color: active ? 'var(--cyan)' : 'var(--text-dim)',
  });

  const ccyBtn = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
    display: 'inline-flex', alignItems: 'center', gap: '3px',
    padding: '4px 7px', cursor: 'pointer',
    border: active ? '1px solid rgba(56,189,248,.6)' : '1px solid var(--border2)',
    background: active ? 'rgba(56,189,248,.1)' : 'none',
    color: active ? 'var(--cyan)' : 'var(--text-dim)',
  });

  return (
    <div>
      {/* ── Header — single row: dot, title, HIGH badge, refresh icon (right) ── */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '7px', height: '7px', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text)', letterSpacing: '2px', textShadow: '0 0 12px rgba(56,189,248,.8)' }}>
            ECONOMIC CALENDAR
          </span>
          {todayHighCount > 0 && (
            <span style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '3px 8px', border: '1px solid rgba(239,68,68,.4)', color: 'var(--red)',
              flexShrink: 0,
            }}>
              <span style={{ width: '5px', height: '5px', background: 'var(--red)', display: 'inline-block' }} />
              {todayHighCount} HIGH TODAY
            </span>
          )}
          {/* Refresh — icon-only, pushed to the far right of the title row. */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title={refreshing ? 'Refreshing…' : 'Refresh calendar (bypass cache)'}
            style={{
              marginLeft: 'auto', flexShrink: 0,
              width: '28px', height: '28px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', lineHeight: 1,
              background: 'none', border: '1px solid var(--border2)',
              color: refreshing ? 'var(--text-dim)' : 'var(--text)',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? .5 : 1,
              padding: 0,
              animation: refreshing ? 'spin 1s linear infinite' : undefined,
            }}
          >
            ↻
          </button>
        </div>
        <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginLeft: '15px' }}>
          ForexFactory · cached 30min · local timezone
        </p>
      </div>

      {/* ── Filters ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-start',
        marginBottom: '14px', padding: '12px',
        background: 'var(--bg-card)',
        border: '2px solid var(--accent-blue)',
        boxShadow: '4px 4px 0 rgba(56,189,248,.3), inset 0 0 20px rgba(56,189,248,.04)',
      }}>
        {/* Today / Week tabs */}
        <div style={{ display: 'flex', border: '1px solid var(--border2)', flexShrink: 0 }}>
          <button onClick={() => setViewMode('today')} style={tabBtn(viewMode === 'today')}>TODAY</button>
          <button
            onClick={() => setViewMode('week')}
            style={{ ...tabBtn(viewMode === 'week'), borderLeft: '1px solid var(--border2)' }}
          >THIS WEEK</button>
        </div>

        {/* Currency chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px', marginRight: '2px' }}>
            CUR:
          </span>
          {ALL_CURRENCIES.map(cur => (
            <button
              key={cur}
              onClick={() => setSelected(p => p.includes(cur) ? p.filter(c => c !== cur) : [...p, cur])}
              style={ccyBtn(selected.includes(cur))}
            >
              {cur}
            </button>
          ))}
          {selected.length > 0 && (
            <button
              onClick={() => setSelected([])}
              style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '.5px', marginLeft: '2px' }}
            >
              ✕ CLEAR
            </button>
          )}
        </div>

        {/* Impact filter */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginLeft: 'auto' }}>
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px', marginRight: '2px' }}>
            IMPACT:
          </span>
          {(['all', 'medium', 'high'] as const).map(key => (
            <button key={key} onClick={() => setMinImpact(key)} style={impactBtn(minImpact === key)}>
              {key === 'all' ? 'ALL' : key === 'medium' ? 'MED+' : 'HIGH'}
            </button>
          ))}
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginLeft: '10px' }}>
            {filtered.length} events
          </span>
        </div>
      </div>

      {/* ── Events ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: '28px', marginBottom: '12px', color: 'var(--text-dim)' }}>📅</div>
          <p style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px' }}>
            NO EVENTS MATCH FILTERS
          </p>
        </div>
      ) : viewMode === 'today' ? (
        <EventTable events={filtered} now={now} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {Object.entries(grouped!).map(([dateLabel, evs]) => {
            const highCount = evs.filter(e => e.impact === 'High').length;
            return (
              <div key={dateLabel}>
                {/* Date separator */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px',
                }}>
                  <span style={{
                    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text)',
                    letterSpacing: '.5px', padding: '4px 10px',
                    border: '1px solid var(--border2)', background: 'var(--bg-card2)',
                  }}>{dateLabel}</span>
                  {highCount > 0 && (
                    <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--red)' }}>
                      {highCount} high impact
                    </span>
                  )}
                  <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
                </div>
                <EventTable events={evs} now={now} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
