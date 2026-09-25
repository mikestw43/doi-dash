import { useState, useEffect, useMemo } from 'react';
import { useAccountStore } from '../../stores/accountStore';
import { useUIStore } from '../../stores/uiStore';
import { fetchTradeHistory } from '../../services/api';
import { exportToCSV } from '../../utils/export';
import type { ClosedTrade } from '../../types';
import { useTranslation } from '../../i18n/useTranslation';

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
  }}>
    <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '1px' }}>
      {label}
    </div>
    <div style={{
      fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-md)', lineHeight: 1,
      color, letterSpacing: '.5px',
    }}>
      {value}
    </div>
    {sub && (
      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)' }}>
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
        gridTemplateColumns: 'repeat(4, 1fr)',
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

      {/* ── Filters + Export ── */}
      <div className="th-filter-bar" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {/* Row 1: Account + Symbol + Type + Export */}
        <select value={accountId} onChange={e => { setAccountId(e.target.value); setPage(1); }} style={selStyle}>
          <option value="">{t('filter.all_accounts')}</option>
          {accounts.filter(a => !a.isDemo).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <input
          type="text" placeholder={t('filter.symbol')} value={symbol}
          onChange={e => { setSymbol(e.target.value.toUpperCase()); setPage(1); }}
          style={{ ...selStyle, cursor: 'text', width: '90px' }}
          className="th-symbol-input"
        />

        <select value={type} onChange={e => { setType(e.target.value); setPage(1); }} style={selStyle}>
          <option value="">{t('filter.all_types')}</option>
          <option value="BUY">{t('trades.buy')}</option>
          <option value="SELL">{t('trades.sell')}</option>
        </select>

        {/* Date range */}
        <div className="th-date-row" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px', flexShrink: 0 }}>{t('trades.from')}</span>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={dateInputStyle} />
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px', flexShrink: 0 }}>{t('trades.to')}</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} style={dateInputStyle} />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', cursor: 'pointer', padding: '6px 8px', transition: 'all .15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--danger)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)'; }}
            >✕</button>
          )}
        </div>

        {/* Export — right-aligned on desktop, full-width on mobile */}
        <button
          onClick={handleExport}
          disabled={!trades.length}
          className="th-export-btn"
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
            padding: '7px 12px', background: 'none',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            cursor: trades.length ? 'pointer' : 'not-allowed',
            opacity: trades.length ? 1 : .3,
            transition: 'all .15s',
          }}
          onMouseEnter={e => { if (trades.length) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-blue)'; } }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
        >
          ↓ CSV
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
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
                    {new Date(t.closeTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
        @media (max-width: 900px) { .th-summary-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 560px) { .th-summary-grid { grid-template-columns: 1fr !important; } }

        /* Table columns — hide on small screens */
        @media (max-width: 760px) {
          .th-col-price   { display: none !important; }
          .th-col-account { display: none !important; }
        }
        @media (max-width: 540px) {
          .th-col-ticket { display: none !important; }
          .th-col-lots   { display: none !important; }
        }

        /* Filter bar */
        @media (max-width: 600px) {
          .th-filter-bar { flex-direction: column !important; align-items: stretch !important; }
          .th-filter-bar select,
          .th-filter-bar input { width: 100% !important; box-sizing: border-box !important; }
          .th-symbol-input { width: 100% !important; }
          .th-date-row { flex-direction: column !important; align-items: stretch !important; }
          .th-date-row input[type="date"] { width: 100% !important; box-sizing: border-box !important; }
          .th-export-btn { margin-left: 0 !important; width: 100% !important; text-align: center !important; }
        }

        /* Dark calendar icon */
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7) sepia(1) saturate(3) hue-rotate(180deg); opacity: .5; cursor: pointer; }
      `}</style>
    </div>
  );
};
