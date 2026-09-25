import { useState, useEffect, useMemo } from 'react';
import { useAccountStore } from '../../stores/accountStore';
import { useUIStore } from '../../stores/uiStore';
import { fetchTradeHistory, fetchTradedSymbols } from '../../services/api';
import { exportToCSV } from '../../utils/export';
import type { ClosedTrade } from '../../types';
import { useTranslation } from '../../i18n/useTranslation';
import { IconFilter, IconDownload } from '../icons';
import { formatDayTime } from '../../utils/formatters';
import { DateField } from '../ui/DateField';

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtNum = (n: number) =>
  Math.abs(n) >= 1000
    ? Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.abs(n).toFixed(2);

/** Compute max peak-to-trough drawdown from a list of profits (chronological order) */
const computeMaxDD = (trades: ClosedTrade[]): number => {
  let peak = 0, dd = 0, cum = 0;
  for (const t of trades) {
    cum += t.profitUsd;   // same unit as the total beside it
    if (cum > peak) peak = cum;
    const d = peak - cum;
    if (d > dd) dd = d;
  }
  return dd;
};

// ── Shared table styles ──────────────────────────────────────────────────────

const thBase: React.CSSProperties = {
  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px',
  padding: '9px 8px', textAlign: 'left', borderBottom: '2px solid var(--border2)', fontWeight: 400,
  whiteSpace: 'nowrap',
};
const thR = (clickable = false): React.CSSProperties => ({
  ...thBase, textAlign: 'right', cursor: clickable ? 'pointer' : 'default',
});
const thL = (clickable = false): React.CSSProperties => ({
  ...thBase, cursor: clickable ? 'pointer' : 'default',
});
const tdBase: React.CSSProperties = {
  padding: '7px 8px', borderBottom: '1px solid rgba(42,45,52,.3)',
  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)', whiteSpace: 'nowrap',
};
const tdR: React.CSSProperties = { ...tdBase, textAlign: 'right' };

/** YYYY-MM-DD for a Date as the user's own clock reads it — the date inputs
 *  speak local dates, so building the presets in UTC would shift them a day. */
const localDay = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** The ranges MT5's own history filter offers, which is what people already
 *  reach for — a tap each, instead of two date pickers. The custom range stays
 *  for everything they do not cover. */
const PERIODS: { key: string; label: string; days: number }[] = [
  { key: 'today', label: 'TODAY', days: 0 },
  { key: '7d',    label: '7D',    days: 7 },
  { key: '30d',   label: '30D',   days: 30 },
  { key: '3m',    label: '3M',    days: 90 },
  { key: '6m',    label: '6M',    days: 180 },
  { key: '1y',    label: '1Y',    days: 365 },
];

const periodRange = (days: number): { from: string; to: string } => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: localDay(from), to: localDay(to) };
};

// ── Summary card ─────────────────────────────────────────────────────────────

interface SumCardProps {
  label: string;
  value: string;
  color: string;
  sub?: string;
}
const SumCard = ({ label, value, color, sub }: SumCardProps) => (
  // Same treatment as the KPI cards: neutral panel, state on the left edge.
  // A plain figure carries no state, so its edge stays the border colour.
  <div style={{
    background: 'var(--bg-card)',
    border: '1px solid var(--border2)',
    borderLeft: `2px solid ${color === 'var(--text-primary)' ? 'var(--border2)' : color}`,
    borderRadius: 'var(--radius-card)',
    padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: '4px',
  }} className="th-sum-card">
    <div className="th-sum-label" style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '1px' }}>
      {label}
    </div>
    <div className="th-sum-value" style={{
      fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-md)', lineHeight: 1,
      color, letterSpacing: '.5px',
    }}>
      {value}
    </div>
    {sub && (
      <div className="th-sum-sub" style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)' }}>
        {sub}
      </div>
    )}
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────────

export const TradeHistoryPage = () => {
  const t = useTranslation();
  const accounts = useAccountStore(s => s.accounts);

  // An account card can send us here already filtered to itself. The handoff
  // is read once and cleared, so coming back later opens on every account.
  const handoffAccountId = useUIStore(s => s.tradeHistoryAccountId);
  const clearHandoff = useUIStore(s => s.clearTradeHistoryAccount);

  // Filters
  const [accountId, setAccountId] = useState(handoffAccountId ?? '');
  useEffect(() => {
    if (handoffAccountId) {
      setAccountId(handoffAccountId);
      setPage(1);
      clearHandoff();
    }
  }, [handoffAccountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [symbol,    setSymbol]    = useState('');
  const [type,      setType]      = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');

  // On a phone the five filters cost 296px of an 726px screen and are used
  // once in a while, so they fold away behind a button and say, as chips,
  // what is currently filtering the list.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customDates, setCustomDates] = useState(false);

  // Pagination / sort
  const [page, setPage]       = useState(1);
  const [limit]               = useState(25);
  const [sortBy, setSortBy]   = useState('closeTime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Table data
  const [trades, setTrades]   = useState<ClosedTrade[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);

  // Stats data (all matching trades, no page limit)
  const [allTrades, setAllTrades]       = useState<ClosedTrade[]>([]);
  // Offered in the symbol filter. Deliberately not derived from the rows on
  // screen: those are already filtered by symbol, so picking one would leave
  // the list with a single option and no way back.
  const [symbols, setSymbols] = useState<string[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  // ── Fetch table (paginated) ──
  const load = () => {
    setLoading(true);
    fetchTradeHistory({
      accountId: accountId || undefined,
      page, limit, symbol: symbol || undefined,
      type: type || undefined,
      sortBy, sortDir,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then(res => { setTrades(res.trades); setTotal(res.total); })
      .catch(() => { setTrades([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  // ── Fetch all trades for stats (whenever filters except sort/page change) ──
  const loadStats = () => {
    setStatsLoading(true);
    fetchTradeHistory({
      accountId: accountId || undefined,
      page: 1, limit: 9999,
      symbol: symbol || undefined,
      type: type || undefined,
      sortBy: 'closeTime', sortDir: 'asc',
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then(res => setAllTrades(res.trades))
      .catch(() => setAllTrades([]))
      .finally(() => setStatsLoading(false));
  };

  useEffect(() => {
    setPage(1);
    loadStats();
  }, [accountId, symbol, type, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which account is selected changes what has been traded, so the list is
  // fetched again; a symbol no longer on offer is dropped rather than left
  // filtering the page to nothing.
  useEffect(() => {
    let live = true;
    fetchTradedSymbols(accountId || undefined)
      .then(list => {
        if (!live) return;
        setSymbols(list);
        if (symbol && !list.includes(symbol)) { setSymbol(''); setPage(1); }
      })
      .catch(() => { if (live) setSymbols([]); });
    return () => { live = false; };
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [accountId, symbol, type, page, sortBy, sortDir, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed stats ──
  /**
   * Everything here is `profitUsd` — profit, swap and commission together,
   * converted. Summing the raw `profit` column added a cent account's figures
   * to a dollar account's as though they were the same unit, and left out the
   * swap and commission that the calendar counts, so the card labelled USD was
   * neither USD nor a total of anything.
   */
  const stats = useMemo(() => {
    if (!allTrades.length) return { wins: 0, winRate: 0, totalProfit: 0, maxDD: 0 };
    const wins = allTrades.filter(t => t.profitUsd > 0).length;
    const winRate = (wins / allTrades.length) * 100;
    const totalProfit = allTrades.reduce((s, t) => s + t.profitUsd, 0);
    const maxDD = computeMaxDD(allTrades);
    return { wins, winRate, totalProfit, maxDD };
  }, [allTrades]);

  const totalPages = Math.ceil(total / limit) || 1;

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
    setPage(1);
  };
  const sortIcon = (col: string) => sortBy !== col ? '' : sortDir === 'asc' ? ' ↑' : ' ↓';

  /**
   * Exports everything the filters select, not the page on screen.
   *
   * It used to export `trades`, which is one page — 25 rows out of a filtered
   * 41 — under a filename that claimed to be the lot. And it carried only the
   * raw `profit`, leaving out the swap, the commission, the currency and the
   * USD figure, so the file could not be added up either.
   */
  const handleExport = () => {
    const rows = allTrades.length ? allTrades : trades;
    if (!rows.length) return;
    exportToCSV(
      rows.map(t => ({
        ticket: t.ticket, symbol: t.symbol, type: t.type, lots: t.lots,
        openPrice: t.openPrice, closePrice: t.closePrice,
        profit: t.profit, swap: t.swap, commission: t.commission,
        net: t.net, profitUsd: t.profitUsd, currency: t.currency,
        openTime: t.openTime, closeTime: t.closeTime, sl: t.sl, tp: t.tp,
        account: t.account?.name || '',
      })),
      `trade-history-${new Date().toISOString().slice(0, 10)}`,
      [
        { key: 'ticket', label: 'Ticket' }, { key: 'symbol', label: 'Symbol' },
        { key: 'type', label: 'Type' }, { key: 'lots', label: 'Lots' },
        { key: 'openPrice', label: 'Open Price' }, { key: 'closePrice', label: 'Close Price' },
        { key: 'profit', label: 'Profit' }, { key: 'swap', label: 'Swap' },
        { key: 'commission', label: 'Commission' }, { key: 'net', label: 'Net' },
        { key: 'currency', label: 'Currency' }, { key: 'profitUsd', label: 'Net USD' },
        { key: 'openTime', label: 'Open Time' },
        { key: 'closeTime', label: 'Close Time' }, { key: 'sl', label: 'SL' },
        { key: 'tp', label: 'TP' }, { key: 'account', label: 'Account' },
      ],
    );
  };

  const activePeriod = PERIODS.find(p => {
    const r = periodRange(p.days);
    return r.from === dateFrom && r.to === dateTo;
  });
  const applyPeriod = (days: number) => {
    const r = periodRange(days);
    setDateFrom(r.from); setDateTo(r.to); setCustomDates(false); setPage(1);
  };

  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (accountId) {
    const a = accounts.find(x => x.id === accountId);
    activeFilters.push({ key: 'account', label: a?.name ?? t('filter.all_accounts'), clear: () => { setAccountId(''); setPage(1); } });
  }
  if (symbol) activeFilters.push({ key: 'symbol', label: symbol, clear: () => { setSymbol(''); setPage(1); } });
  if (type)   activeFilters.push({ key: 'type',   label: type,   clear: () => { setType(''); setPage(1); } });
  if (dateFrom || dateTo) {
    activeFilters.push({
      key: 'dates',
      label: activePeriod ? activePeriod.label : `${dateFrom || '…'} → ${dateTo || '…'}`,
      clear: () => { setDateFrom(''); setDateTo(''); setCustomDates(false); setPage(1); },
    });
  }

  const selStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
    padding: '6px 10px', outline: 'none', cursor: 'pointer',
  };
  const dateInputStyle: React.CSSProperties = {
    ...selStyle, cursor: 'text', colorScheme: 'dark',
  };

  const winRateColor = statsLoading ? 'var(--text-dim)'
    : stats.winRate >= 60 ? 'var(--success)'
    : stats.winRate >= 45 ? 'var(--warning)'
    : 'var(--danger)';

  const profitColor = statsLoading ? 'var(--text-dim)'
    : stats.totalProfit > 0 ? 'var(--success)'
    : stats.totalProfit < 0 ? 'var(--danger)'
    : 'var(--text-dim)';

  const exportButton = (cls: string, extra: React.CSSProperties = {}) => (
    <button
      onClick={handleExport}
      disabled={!trades.length}
      className={cls}
      style={{
        fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
        padding: '7px 12px', background: 'none',
        border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
        color: 'var(--text-muted)',
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        cursor: trades.length ? 'pointer' : 'not-allowed',
        opacity: trades.length ? 1 : .3,
        transition: 'all .15s',
        ...extra,
      }}
      onMouseEnter={e => { if (trades.length) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-blue)'; } }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
    >
      <IconDownload size={13} /> CSV
    </button>
  );

  return (
    <div>
      {/* ── Section header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <div style={{ width: '7px', height: '7px', background: 'var(--accent-blue)',flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-primary)', letterSpacing: '2px' }}>{t('trades.title').toUpperCase()}</span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
        <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', padding: '4px 10px', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)' }}>
          {total} {t('trades.count')}
        </span>
      </div>

      {/* ── Summary cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '8px',
        marginBottom: '12px',
      }}
        className="th-summary-grid"
      >
        <SumCard
          label={t('analytics.total_trades').toUpperCase()}
          value={statsLoading ? '...' : String(total)}
          color="var(--text-primary)"
          sub={`${stats.wins} ${t('trades.wins')}`}
        />
        <SumCard
          label={t('analytics.win_rate').toUpperCase()}
          value={statsLoading ? '...' : `${stats.winRate.toFixed(1)}%`}
          color={winRateColor}
          sub={`${allTrades.length} ${t('trades.analyzed')}`}
        />
        <SumCard
          label={t('trades.total_profit').toUpperCase()}
          value={statsLoading ? '...' : `${stats.totalProfit >= 0 ? '+' : '-'}${fmtNum(stats.totalProfit)}`}
          color={profitColor}
          sub={`USD · ${t('trades.all_filtered')}`}
        />
        <SumCard
          label={t('analytics.max_drawdown').toUpperCase()}
          value={statsLoading ? '...' : stats.maxDD > 0 ? `-${fmtNum(stats.maxDD)}` : '0.00'}
          color={stats.maxDD > 0 ? 'var(--danger)' : 'var(--text-dim)'}
          sub={t('trades.peak_to_trough')}
        />
      </div>

      {/* ── Filter toggle (phones only) ── */}
      <div className="th-filter-toggle" style={{ display: 'none', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <button
          onClick={() => setFiltersOpen(o => !o)}
          aria-expanded={filtersOpen}
          style={{
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
            padding: '7px 12px', background: 'none',
            border: `1px solid ${activeFilters.length ? 'var(--accent-blue)' : 'var(--border2)'}`,
            borderRadius: 'var(--radius-sm)',
            color: activeFilters.length ? 'var(--accent-blue)' : 'var(--text-muted)',
            cursor: 'pointer', transition: 'all .15s',
            display: 'inline-flex', alignItems: 'center', gap: '6px',
          }}
        >
          <IconFilter size={14} /> {t('trades.filters').toUpperCase()}
          {activeFilters.length > 0 && ` (${activeFilters.length})`}
        </button>
        {exportButton('', { marginLeft: 'auto' })}
      </div>

      {/* What is filtering the list, while the panel that set it is closed. */}
      {!filtersOpen && activeFilters.length > 0 && (
        <div className="th-filter-chips" style={{ display: 'none', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
          {activeFilters.map(f => (
            <button
              key={f.key}
              onClick={f.clear}
              style={{
                fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
                padding: '3px 8px', background: 'rgba(96,165,250,.10)',
                border: '1px solid var(--border2)', borderRadius: '999px',
                color: 'var(--text)', cursor: 'pointer', maxWidth: '100%',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {f.label} ✕
            </button>
          ))}
        </div>
      )}

      {/* ── Filters + Export ── */}
      <div
        className={`th-filter-bar${filtersOpen ? ' th-filter-bar-open' : ''}`}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}
      >
        {/* Row 1: Account + Symbol + Type + Export */}
        <select value={accountId} onChange={e => { setAccountId(e.target.value); setPage(1); }} style={selStyle}>
          <option value="">{t('filter.all_accounts')}</option>
          {accounts.filter(a => !a.isDemo).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        {/* What has actually been traded, rather than a box that asks people to
            spell their own EAs' symbols from memory and answers an empty list
            when they get it wrong. */}
        <select
          value={symbol}
          onChange={e => { setSymbol(e.target.value); setPage(1); }}
          style={selStyle}
          className="th-symbol-input"
        >
          <option value="">{t('filter.all_symbols')}</option>
          {symbols.map(sym => <option key={sym} value={sym}>{sym}</option>)}
        </select>

        <select value={type} onChange={e => { setType(e.target.value); setPage(1); }} style={selStyle}>
          <option value="">{t('filter.all_types')}</option>
          <option value="BUY">{t('trades.buy')}</option>
          <option value="SELL">{t('trades.sell')}</option>
        </select>

        {/* Period — MT5 offers these same ranges in its own history filter and
            they are what people reach for, so they are one tap each here
            rather than two date pickers. The pickers stay behind CUSTOM, for
            the ranges the presets do not cover. */}
        <div className="th-period-row" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {PERIODS.map(p => {
            const on = activePeriod?.key === p.key;
            return (
              <button
                key={p.key}
                onClick={() => (on ? (setDateFrom(''), setDateTo(''), setPage(1)) : applyPeriod(p.days))}
                aria-pressed={on}
                style={{
                  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
                  padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--accent-blue)' : 'var(--border2)'}`,
                  background: on ? 'rgba(96,165,250,.12)' : 'none',
                  color: on ? 'var(--accent-blue)' : 'var(--text-muted)',
                  transition: 'all .15s',
                }}
              >
                {p.label}
              </button>
            );
          })}
          <button
            onClick={() => setCustomDates(o => !o)}
            aria-pressed={customDates || (!!(dateFrom || dateTo) && !activePeriod)}
            style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
              padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              border: `1px solid ${customDates || (!!(dateFrom || dateTo) && !activePeriod) ? 'var(--accent-blue)' : 'var(--border2)'}`,
              background: customDates || (!!(dateFrom || dateTo) && !activePeriod) ? 'rgba(96,165,250,.12)' : 'none',
              color: customDates || (!!(dateFrom || dateTo) && !activePeriod) ? 'var(--accent-blue)' : 'var(--text-muted)',
              transition: 'all .15s',
            }}
          >
            {t('trades.custom').toUpperCase()}
          </button>
        </div>

        {(customDates || (!!(dateFrom || dateTo) && !activePeriod)) && (
          /* One row: two dates read as a range, and on a phone they do not
             cost two rows of a panel that is already the tallest thing on the
             page. Each opens a calendar of our own — see DateField for why not
             the native one. */
          <div className="th-date-row" style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: '1 1 100%' }}>
            <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px', flexShrink: 0 }}>{t('trades.from')}</span>
            <DateField
              value={dateFrom}
              onChange={v => { setDateFrom(v); setPage(1); }}
              placeholder={t('trades.any_date')}
              style={dateInputStyle}
            />
            <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px', flexShrink: 0 }}>{t('trades.to')}</span>
            <DateField
              value={dateTo}
              onChange={v => { setDateTo(v); setPage(1); }}
              placeholder={t('trades.any_date')}
              style={dateInputStyle}
            />
          </div>
        )}

        {/* Export — right-aligned on desktop; on a phone it moves up beside
            the filter button so it stays reachable while the filters are
            folded away. */}
        {exportButton('th-export-btn', { marginLeft: 'auto' })}
      </div>

      {/* ── The list, as a phone wants it ──
          MT5 gives each closed trade two lines — what and how much on the
          first, where it came from and when on the second — which fits a
          phone far better than four narrowed columns, and brings back the
          lots, the ticket and the two prices that the table has to hide at
          this width. The sort the table header carries lives in the chips
          above it. */}
      <div className="th-list" style={{ display: 'none', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', color: 'var(--text-dim)', letterSpacing: '.5px' }}>
            {t('trades.sort_by').toUpperCase()}
          </span>
          {([
            ['closeTime', t('trades.close_time')],
            ['profit',    t('trades.profit')],
            ['symbol',    t('trades.symbol')],
          ] as const).map(([key, label]) => {
            const on = sortBy === key;
            return (
              <button
                key={key}
                onClick={() => handleSort(key)}
                aria-pressed={on}
                style={{
                  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px',
                  padding: '4px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--accent-blue)' : 'var(--border2)'}`,
                  background: on ? 'rgba(96,165,250,.10)' : 'none',
                  color: on ? 'var(--accent-blue)' : 'var(--text-muted)',
                }}
              >
                {label.toUpperCase()}{on ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : ''}
              </button>
            );
          })}
          {/* A list is always in some order, so there is no "unsorted" to go
              back to — what there is, is the order the page opens in. This
              says so, and only appears once you have left it. */}
          {(sortBy !== 'closeTime' || sortDir !== 'desc') && (
            <button
              onClick={() => { setSortBy('closeTime'); setSortDir('desc'); setPage(1); }}
              style={{
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px',
                padding: '4px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: '1px solid var(--border2)', background: 'none', color: 'var(--text-dim)',
              }}
            >
              {t('trades.reset_sort').toUpperCase()} {'\u2715'}
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--ff-body)' }}>Loading...</div>
        ) : trades.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)' }}>
            <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', marginBottom: '6px' }}>{t('trades.no_trades_found')}</div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}>{t('trades.adjust_filters')}</div>
          </div>
        ) : trades.map(tr => (
          <div
            key={tr.id}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border2)',
              borderLeft: `2px solid ${tr.profit >= 0 ? 'var(--success)' : 'var(--danger)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '8px 10px',
              display: 'flex', flexDirection: 'column', gap: '3px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{
                fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
                fontWeight: 700, letterSpacing: '.5px', color: 'var(--text)',
              }}>
                {tr.symbol}
              </span>
              {/* Same size as the symbol beside it: the side and the volume are
                  as much a part of what the trade was, and at the micro size
                  they read as a footnote to it. */}
              <span style={{
                fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
                fontWeight: 700, letterSpacing: '.5px', whiteSpace: 'nowrap',
                color: tr.type === 'BUY' ? 'var(--success)' : 'var(--danger)',
              }}>
                {tr.type.toLowerCase()} {tr.lots.toFixed(2)}
              </span>
              <span style={{
                marginLeft: 'auto', textAlign: 'right', whiteSpace: 'nowrap',
                fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', lineHeight: 1,
                color: tr.profit >= 0 ? 'var(--success)' : 'var(--danger)',
              }}>
                {/* fmtNum drops the sign, so the row has to carry it. */}
                {tr.profit >= 0 ? '+' : '-'}{fmtNum(tr.profit)}
              </span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: '8px',
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)', color: 'var(--text-dim)',
            }}>
              <span style={{ whiteSpace: 'nowrap' }}>
                {tr.openPrice.toFixed(2)} {'\u2192'} {tr.closePrice.toFixed(2)}
              </span>
              <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{formatDayTime(tr.closeTime)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="th-table-wrap" style={{
        overflowX: 'auto',
        // The sixteen columns scroll inside this box; they must never widen
        // the page around it.
        minWidth: 0, maxWidth: '100%',
        background: 'var(--bg-card)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
      }}>
        <table className="th-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-card2)' }}>
              <th style={thL(true)} className="th-col-ticket" onClick={() => handleSort('ticket')}>{t('trades.ticket').toUpperCase()}{sortIcon('ticket')}</th>
              <th style={thL(true)} onClick={() => handleSort('symbol')}>{t('trades.symbol').toUpperCase()}{sortIcon('symbol')}</th>
              <th style={thL()}>{t('trades.type').toUpperCase()}</th>
              <th style={thR()} className="th-col-lots">{t('trades.lots').toUpperCase()}</th>
              <th style={thR()} className="th-col-price">{t('trades.open_price').toUpperCase()}</th>
              <th style={thR()} className="th-col-price">{t('trades.close_price').toUpperCase()}</th>
              <th style={thR(true)} onClick={() => handleSort('profit')}>{t('trades.profit').toUpperCase()}{sortIcon('profit')}</th>
              <th style={thL(true)} onClick={() => handleSort('closeTime')}>{t('trades.close_time').toUpperCase()}{sortIcon('closeTime')}</th>
              <th style={thL()} className="th-col-account">{t('trades.account').toUpperCase()}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ ...tdBase, textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>
                  Loading...
                </td>
              </tr>
            ) : trades.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ ...tdBase, textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                  <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', marginBottom: '8px' }}>{t('trades.no_trades_found')}</div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}>{t('trades.adjust_filters')}</div>
                </td>
              </tr>
            ) : (
              trades.map(t => (
                <tr
                  key={t.id}
                  onMouseEnter={e => ((e.currentTarget as HTMLTableRowElement).style.background = 'rgba(42,45,52,.25)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                >
                  <td style={{ ...tdBase, color: 'var(--text-dim)' }} className="th-col-ticket">#{t.ticket}</td>
                  <td style={{ ...tdBase, fontWeight: 700, letterSpacing: '.5px' }}>{t.symbol}</td>
                  <td style={tdBase}>
                    <span style={{
                      fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                      padding: '3px 6px', letterSpacing: '.5px',
                      border: `1px solid ${t.type === 'BUY' ? 'rgba(52,211,153,.4)' : 'rgba(248,113,113,.4)'}`,
                      color: t.type === 'BUY' ? 'var(--success)' : 'var(--danger)',
                      background: t.type === 'BUY' ? 'rgba(52,211,153,.08)' : 'rgba(248,113,113,.08)',
                    }}>
                      {t.type}
                    </span>
                  </td>
                  <td style={{ ...tdR, color: 'var(--text-dim)' }} className="th-col-lots">{t.lots.toFixed(2)}</td>
                  <td style={{ ...tdR, color: 'var(--text-dim)' }} className="th-col-price">{t.openPrice.toFixed(5)}</td>
                  <td style={{ ...tdR, color: 'var(--text-dim)' }} className="th-col-price">{t.closePrice.toFixed(5)}</td>
                  <td style={{
                    ...tdR,
                    fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', lineHeight: 1,
                    color: t.profit >= 0 ? 'var(--success)' : 'var(--danger)',
                  }}>
                    {t.profit >= 0 ? '+' : ''}{t.profit.toFixed(2)}
                  </td>
                  <td style={{ ...tdBase, color: 'var(--text-dim)', fontSize: 'var(--fs-micro)' }}>
                    {formatDayTime(t.closeTime)}
                  </td>
                  <td style={{ ...tdBase, color: 'var(--text-dim)' }} className="th-col-account">{t.account?.name || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)' }}>
            Page {page} / {totalPages} &nbsp;·&nbsp; {total} trades
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { label: '«', target: 1, disabled: page <= 1 },
              { label: '‹', target: page - 1, disabled: page <= 1 },
              { label: '›', target: page + 1, disabled: page >= totalPages },
              { label: '»', target: totalPages, disabled: page >= totalPages },
            ].map(btn => (
              <button
                key={btn.label}
                onClick={() => !btn.disabled && setPage(btn.target)}
                disabled={btn.disabled}
                style={{
                  background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-dim)', cursor: btn.disabled ? 'not-allowed' : 'pointer',
                  padding: '5px 10px', opacity: btn.disabled ? .3 : 1,
                  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { if (!btn.disabled) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-blue)'; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)'; }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        /* Summary grid */
        @media (max-width: 900px) { .th-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
        /* Four figures stacked one per row filled half the screen before the
           first trade. Two by two says the same thing in a third of the
           space. */
        @media (max-width: 560px) {
          .th-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 6px !important; }
          .th-sum-card  { padding: 8px 10px !important; gap: 2px !important; }
          .th-sum-value { font-size: var(--fs-disp-sm) !important; }
          .th-sum-sub   { font-size: var(--fs-micro) !important; }
        }

        /* The 700px floor is for the full sixteen columns. Below 760px most of
           them are hidden and only four are left, which need about 250px — but
           the floor stayed, so the table was three times wider than anything
           in it. Its wrapper scrolled to cover the difference, and Safari
           counted that width towards the page, which then slid sideways and
           carried the cards and filters off the screen. With the floor lifted
           the columns that are actually shown decide the width, and there is
           nothing left to scroll. */
        @media (max-width: 760px) {
          .th-table { min-width: 0 !important; }
        }
        /* Four columns of nowrap content still want a few pixels more than a
           360px phone has; the horizontal padding is the cheapest of them. */
        @media (max-width: 400px) {
          .th-table th, .th-table td { padding-left: 5px !important; padding-right: 5px !important; }
        }
        /* The narrowest phones still cannot hold four columns of nowrap text
           at the body size; a point smaller costs less than a scrollbar. */
        @media (max-width: 340px) {
          .th-table td { font-size: 12px !important; }
          .th-table th { font-size: 9px !important; }
          .th-table th, .th-table td { padding-left: 3px !important; padding-right: 3px !important; }
        }

        /* Table columns — hide on small screens */
        @media (max-width: 760px) {
          .th-col-price   { display: none !important; }
          .th-col-account { display: none !important; }
        }
        @media (max-width: 540px) {
          .th-col-ticket { display: none !important; }
          .th-col-lots   { display: none !important; }
        }

        /* The date fields are three selects of our own now (see DateParts), so
           the native control's intrinsic width — which used to drag this page
           sideways on a phone — is not in the page at all. Every control here
           still has to be allowed to shrink to the column it is given. */
        .th-filter-bar, .th-date-row, .th-period-row { min-width: 0; }
        .th-filter-bar select,
        .th-filter-bar input { min-width: 0; max-width: 100%; }

        /* The phone gets the two-line list instead of the narrowed table. */
        @media (max-width: 600px) {
          .th-list       { display: flex !important; }
          .th-table-wrap { display: none !important; }
        }

        /* Filter bar */
        @media (max-width: 600px) {
          /* The five filters cost 296px of a 726px screen and are used once in
             a while; the list is what the page is for. They fold away behind a
             button, which keeps the export within reach and says how many
             filters are on, and the chips below it name them. */
          .th-filter-toggle { display: flex !important; }
          .th-filter-chips  { display: flex !important; }
          .th-filter-bar    { display: none !important; }
          .th-filter-bar.th-filter-bar-open { display: flex !important; }
          .th-filter-bar .th-export-btn { display: none !important; }

          .th-filter-bar { flex-direction: column !important; align-items: stretch !important; }
          .th-filter-bar select,
          .th-filter-bar input { width: 100% !important; box-sizing: border-box !important; }
          .th-symbol-input { width: 100% !important; }
          .th-export-btn { margin-left: 0 !important; width: 100% !important; text-align: center !important; }
        }

        /* Dark calendar icon */
      `}</style>
    </div>
  );
};
