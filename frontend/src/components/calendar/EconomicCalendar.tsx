import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EconomicEvent } from '../../types';
import { fetchEconomicCalendar } from '../../services/api';
import { RefreshCw, AlertCircle, CalendarDays } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦', CHF: '🇨🇭',
  CNY: '🇨🇳', CNH: '🇨🇳',
};

const IMPACT_CFG = {
  High:           { label: 'High', cls: 'bg-danger/20 text-danger border-danger/30',     dot: 'bg-danger' },
  Medium:         { label: 'Med',  cls: 'bg-warning/20 text-warning border-warning/30', dot: 'bg-warning' },
  Low:            { label: 'Low',  cls: 'bg-gray-700 text-gray-400 border-gray-600',    dot: 'bg-gray-500' },
  'Non-Economic': { label: 'N/E',  cls: 'bg-gray-800 text-gray-600 border-gray-700',    dot: 'bg-gray-700' },
} as const;

const ALL_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'CNY'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtTime = (dateStr: string) =>
  new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

const fmtDateLabel = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const impactCfg = (impact: string) =>
  IMPACT_CFG[impact as keyof typeof IMPACT_CFG] ?? IMPACT_CFG['Low'];

// ─── EventTable ──────────────────────────────────────────────────────────────

interface EventTableProps { events: EconomicEvent[]; now: Date }

const EventTable = ({ events, now }: EventTableProps) => (
  <div className="bg-bg-secondary border border-border2 overflow-hidden">
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border2 bg-bg-primary/50">
          <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left py-2.5 px-3 w-14">Time</th>
          <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left py-2.5 px-2 w-16">Cur</th>
          <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left py-2.5 px-2">Event</th>
          <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-center py-2.5 px-2 w-16">Impact</th>
          <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-right py-2.5 px-2 w-16">Actual</th>
          <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-right py-2.5 px-2 w-16">Forecast</th>
          <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-right py-2.5 px-3 w-16">Prev</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event, i) => {
          const past   = new Date(event.date) < now;
          const cfg    = impactCfg(event.impact);
          const isHigh = event.impact === 'High';

          return (
            <tr
              key={`${event.date}-${i}`}
              className={`border-b border-gray-800/40 transition-colors
                ${isHigh && !past ? 'hover:bg-danger/5' : 'hover:bg-gray-800/20'}
                ${past ? 'opacity-50' : ''}`}
            >
              <td className="py-2 px-3 font-tech text-gray-400 whitespace-nowrap">
                {fmtTime(event.date)}
              </td>
              <td className="py-2 px-2">
                <span className="flex items-center gap-1">
                  <span className="text-sm leading-none">{CURRENCY_FLAGS[event.country] ?? '🏳️'}</span>
                  <span className="font-tech text-gray-300">{event.country}</span>
                </span>
              </td>
              <td className="py-2 px-2">
                <span className={`font-tech ${isHigh && !past ? 'text-white' : 'text-gray-400'}`}>{event.title}</span>
              </td>
              <td className="py-2 px-2 text-center">
                <span className={`font-pixel text-[8px] inline-flex items-center gap-1 px-1.5 py-0.5 border ${cfg.cls}`}>
                  <span className={`w-1.5 h-1.5 flex-shrink-0 ${cfg.dot}`} />
                  {cfg.label}
                </span>
              </td>
              <td className={`py-2 px-2 text-right font-tech ${event.actual ? 'text-white font-bold' : 'text-gray-700'}`}>
                {event.actual || '—'}
              </td>
              <td className="py-2 px-2 text-right font-tech text-gray-500">{event.forecast || '—'}</td>
              <td className="py-2 px-3 text-right font-tech text-gray-600">{event.previous || '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const EconomicCalendar = () => {
  const { data, isLoading, error, refetch, isFetching } = useQuery<EconomicEvent[]>({
    queryKey: ['economic-calendar'],
    queryFn: fetchEconomicCalendar,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });

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
        if (minImpact === 'high'   && e.impact !== 'High')              return false;
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

  // ─── Loading ─────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading economic calendar...</p>
      </div>
    </div>
  );

  // ─── Error ───────────────────────────────────────────────────────────────
  if (error) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <AlertCircle size={36} className="text-danger mx-auto mb-3" />
        <p className="text-sm text-danger mb-2">Failed to load calendar data</p>
        <p className="text-xs text-gray-500 mb-4">Could not reach ForexFactory. Check network connectivity.</p>
        <button onClick={() => refetch()} className="px-4 py-2 rounded-lg bg-accent-blue hover:bg-blue-600 text-white text-xs font-medium transition-colors">
          Try again
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

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-3">
            <CalendarDays size={15} className="text-accent-blue" />
            <h2 className="font-pixel text-[11px] text-accent-blue tracking-wider">Economic Calendar</h2>
            {todayHighCount > 0 && (
              <span className="font-pixel text-[8px] flex items-center gap-1 px-2 py-0.5 border border-danger/40 text-danger">
                <span className="w-1.5 h-1.5 bg-danger animate-pulse" />
                {todayHighCount} HIGH TODAY
              </span>
            )}
          </div>
          <p className="font-tech text-[10px] text-gray-700 mt-1 ml-6">
            ForexFactory · cached 30min · local timezone
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-ghost flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
          REFRESH
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-start mb-5 p-3 bg-bg-secondary border border-border2">
        {/* Today / Week */}
        <div className="flex gap-1 border border-border2 p-0.5">
          {(['today', 'week'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`font-pixel text-[8px] px-3 py-1.5 transition-colors ${viewMode === m ? 'bg-accent-blue text-bg-primary' : 'text-gray-500 hover:text-gray-200'}`}>
              {m === 'today' ? 'TODAY' : 'THIS WEEK'}
            </button>
          ))}
        </div>

        {/* Currency chips */}
        <div className="flex flex-wrap gap-1 items-center">
          <span className="font-pixel text-[8px] text-gray-600 mr-1">CUR:</span>
          {ALL_CURRENCIES.map(cur => (
            <button key={cur} onClick={() => setSelected(p => p.includes(cur) ? p.filter(c => c !== cur) : [...p, cur])}
              className={`font-pixel text-[8px] flex items-center gap-0.5 px-2 py-0.5 border transition-colors ${
                selected.includes(cur)
                  ? 'border-accent-blue/60 text-accent-blue bg-accent-blue/10'
                  : 'border-gray-800 text-gray-600 hover:text-gray-300 hover:border-gray-600'
              }`}>
              <span className="text-xs leading-none">{CURRENCY_FLAGS[cur] ?? ''}</span>
              <span>{cur}</span>
            </button>
          ))}
          {selected.length > 0 && (
            <button onClick={() => setSelected([])} className="font-pixel text-[8px] text-gray-600 hover:text-danger ml-1">✕ CLEAR</button>
          )}
        </div>

        {/* Impact */}
        <div className="flex gap-1 items-center">
          <span className="font-pixel text-[8px] text-gray-600">IMPACT:</span>
          {([['all','ALL'],['medium','MED+'],['high','HIGH']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setMinImpact(key)}
              className={`font-pixel text-[8px] px-2.5 py-0.5 border transition-colors ${
                minImpact === key ? 'border-accent-blue text-accent-blue bg-accent-blue/10' : 'border-gray-800 text-gray-600 hover:text-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto font-tech text-xs text-gray-600 self-center">
          {filtered.length} events
        </div>
      </div>

      {/* ── Events ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <CalendarDays size={28} className="mx-auto mb-3 text-gray-700" />
          <p className="font-tech text-sm text-gray-600">No events match your filters</p>
        </div>
      ) : viewMode === 'today' ? (
        <EventTable events={filtered} now={now} />
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped!).map(([dateLabel, evs]) => (
            <div key={dateLabel}>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-pixel text-[9px] text-gray-400 tracking-wider">{dateLabel}</span>
                <span className="font-tech text-[10px] text-danger">{evs.filter(e => e.impact === 'High').length} high</span>
              </div>
              <EventTable events={evs} now={now} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
