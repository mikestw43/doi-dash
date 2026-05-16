import { useState, useEffect, useMemo } from 'react';
import { useAccountStore } from '../../stores/accountStore';
import { fetchTradeHistory } from '../../services/api';
import { exportToCSV } from '../../utils/export';
import type { ClosedTrade } from '../../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtNum = (n: number) =>
  Math.abs(n) >= 1000
    ? Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.abs(n).toFixed(2);

/** Compute max peak-to-trough drawdown from a list of profits (chronological order) */
const computeMaxDD = (trades: ClosedTrade[]): number => {
  let peak = 0, dd = 0, cum = 0;
  for (const t of trades) {
    cum += t.profit;
    if (cum > peak) peak = cum;
    const d = peak - cum;
    if (d > dd) dd = d;
  }
  return dd;
};

// ── Shared table styles ──────────────────────────────────────────────────────

const thBase: React.CSSProperties = {
  fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)', letterSpacing: '.5px',
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
  padding: '7px 8px', borderBottom: '1px solid rgba(45,64,96,.3)',
  fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text)', whiteSpace: 'nowrap',
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
  <div style={{
    background: 'var(--bg-card)',
    border: `1px solid var(--border2)`,
    borderTop: `2px solid ${color}`,
    padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: '4px',
  }}>
    <div style={{ fontFamily: "'Press Start 2P'", fontSize: '6px', color: 'var(--text-dim)', letterSpacing: '1px' }}>
      {label}
    </div>
    <div style={{
      fontFamily: "'VT323'", fontSize: '28px', lineHeight: 1,
      color, letterSpacing: '.5px',
    }}>
      {value}
    </div>
    {sub && (
      <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '9px', color: 'var(--text-dim)' }}>
        {sub}
      </div>
    )}
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────────

export const TradeHistoryPage = () => {
  const accounts = useAccountStore(s => s.accounts);

  // Filters
  const [accountId, setAccountId] = useState('');
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
  const stats = useMemo(() => {
    if (!allTrades.length) return { wins: 0, winRate: 0, totalProfit: 0, maxDD: 0 };
    const wins = allTrades.filter(t => t.profit > 0).length;
    const winRate = (wins / allTrades.length) * 100;
    const totalProfit = allTrades.reduce((s, t) => s + t.profit, 0);
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

  const handleExport = () => {
    if (!trades.length) return;
    exportToCSV(
      trades.map(t => ({
        ticket: t.ticket, symbol: t.symbol, type: t.type, lots: t.lots,
        openPrice: t.openPrice, closePrice: t.closePrice, profit: t.profit,
        openTime: t.openTime, closeTime: t.closeTime, sl: t.sl, tp: t.tp,
        account: t.account?.name || '',
      })),
      `trade-history-${new Date().toISOString().slice(0, 10)}`,
      [
        { key: 'ticket', label: 'Ticket' }, { key: 'symbol', label: 'Symbol' },
        { key: 'type', label: 'Type' }, { key: 'lots', label: 'Lots' },
        { key: 'openPrice', label: 'Open Price' }, { key: 'closePrice', label: 'Close Price' },
        { key: 'profit', label: 'Profit' }, { key: 'openTime', label: 'Open Time' },
        { key: 'closeTime', label: 'Close Time' }, { key: 'sl', label: 'SL' },
        { key: 'tp', label: 'TP' }, { key: 'account', label: 'Account' },
      ],
    );
  };

  const selStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border2)',
    color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontSize: '11px',
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
        <div style={{ width: '7px', height: '7px', background: 'var(--accent-blue)', boxShadow: '0 0 6px var(--accent-blue)', flexShrink: 0 }} />
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-primary)', letterSpacing: '2px' }}>TRADE HISTORY</span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-muted)', padding: '4px 10px', border: '1px solid var(--border2)' }}>
          {total} TRADES
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
          label="TOTAL TRADES"
          value={statsLoading ? '...' : String(total)}
          color="var(--accent-blue)"
          sub={`${stats.wins} wins`}
        />
        <SumCard
          label="WIN RATE"
          value={statsLoading ? '...' : `${stats.winRate.toFixed(1)}%`}
          color={winRateColor}
          sub={`${allTrades.length} trades analyzed`}
        />
        <SumCard
          label="TOTAL PROFIT"
          value={statsLoading ? '...' : `${stats.totalProfit >= 0 ? '+' : '-'}${fmtNum(stats.totalProfit)}`}
          color={profitColor}
          sub="USD · all filtered trades"
        />
        <SumCard
          label="MAX DRAWDOWN"
          value={statsLoading ? '...' : stats.maxDD > 0 ? `-${fmtNum(stats.maxDD)}` : '0.00'}
          color={stats.maxDD > 0 ? 'var(--danger)' : 'var(--text-dim)'}
          sub="peak-to-trough"
        />
      </div>

      {/* ── Filters + Export ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {/* Account */}
        <select value={accountId} onChange={e => { setAccountId(e.target.value); setPage(1); }} style={selStyle}>
          <option value="">All Accounts</option>
          {accounts.filter(a => !a.isDemo).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        {/* Symbol */}
        <input
          type="text" placeholder="Symbol..." value={symbol}
          onChange={e => { setSymbol(e.target.value.toUpperCase()); setPage(1); }}
          style={{ ...selStyle, cursor: 'text', width: '90px' }}
        />

        {/* Type */}
        <select value={type} onChange={e => { setType(e.target.value); setPage(1); }} style={selStyle}>
          <option value="">All Types</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>

        {/* Date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontFamily: "'Press Start 2P'", fontSize: '6px', color: 'var(--text-dim)', letterSpacing: '.5px', flexShrink: 0 }}>FROM</span>
          <input
            type="date" value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            style={dateInputStyle}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontFamily: "'Press Start 2P'", fontSize: '6px', color: 'var(--text-dim)', letterSpacing: '.5px', flexShrink: 0 }}>TO</span>
          <input
            type="date" value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            style={dateInputStyle}
          />
        </div>

        {/* Clear dates */}
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            style={{
              fontFamily: "'Press Start 2P'", fontSize: '6px',
              background: 'none', border: '1px solid var(--border2)',
              color: 'var(--text-dim)', cursor: 'pointer', padding: '6px 8px',
              transition: 'all .15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--danger)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)'; }}
          >
            ✕ CLEAR DATES
          </button>
        )}

        {/* Export */}
        <button
          onClick={handleExport}
          disabled={!trades.length}
          style={{
            marginLeft: 'auto',
            fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px',
            padding: '7px 12px', background: 'none',
            border: '1px solid var(--border2)',
            color: 'var(--text-muted)',
            cursor: trades.length ? 'pointer' : 'not-allowed',
            opacity: trades.length ? 1 : .3,
            transition: 'all .15s',
          }}
          onMouseEnter={e => { if (trades.length) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-blue)'; } }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
        >
          ↓ EXPORT CSV
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border2)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-card2)' }}>
              <th style={thL(true)} onClick={() => handleSort('ticket')}>TICKET{sortIcon('ticket')}</th>
              <th style={thL(true)} onClick={() => handleSort('symbol')}>SYMBOL{sortIcon('symbol')}</th>
              <th style={thL()}>TYPE</th>
              <th style={thR()}>LOTS</th>
              <th style={thR()}>OPEN</th>
              <th style={thR()}>CLOSE</th>
              <th style={thR(true)} onClick={() => handleSort('profit')}>PROFIT{sortIcon('profit')}</th>
              <th style={thL(true)} onClick={() => handleSort('closeTime')}>CLOSE TIME{sortIcon('closeTime')}</th>
              <th style={thL()}>ACCOUNT</th>
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
                  <div style={{ fontFamily: "'Press Start 2P'", fontSize: '8px', marginBottom: '8px' }}>NO TRADES FOUND</div>
                  <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '11px' }}>Try adjusting your filters</div>
                </td>
              </tr>
            ) : (
              trades.map(t => (
                <tr
                  key={t.id}
                  onMouseEnter={e => ((e.currentTarget as HTMLTableRowElement).style.background = 'rgba(45,64,96,.25)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                >
                  <td style={{ ...tdBase, color: 'var(--text-dim)' }}>#{t.ticket}</td>
                  <td style={{ ...tdBase, fontWeight: 700, letterSpacing: '.5px' }}>{t.symbol}</td>
                  <td style={tdBase}>
                    <span style={{
                      fontFamily: "'Press Start 2P'", fontSize: '7px',
                      padding: '3px 6px', letterSpacing: '.5px',
                      border: `1px solid ${t.type === 'BUY' ? 'rgba(34,197,94,.4)' : 'rgba(239,68,68,.4)'}`,
                      color: t.type === 'BUY' ? 'var(--success)' : 'var(--danger)',
                      background: t.type === 'BUY' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
                    }}>
                      {t.type}
                    </span>
                  </td>
                  <td style={{ ...tdR, color: 'var(--text-dim)' }}>{t.lots.toFixed(2)}</td>
                  <td style={{ ...tdR, color: 'var(--text-dim)' }}>{t.openPrice.toFixed(5)}</td>
                  <td style={{ ...tdR, color: 'var(--text-dim)' }}>{t.closePrice.toFixed(5)}</td>
                  <td style={{
                    ...tdR,
                    fontFamily: "'VT323'", fontSize: '20px', lineHeight: 1,
                    color: t.profit >= 0 ? 'var(--success)' : 'var(--danger)',
                  }}>
                    {t.profit >= 0 ? '+' : ''}{t.profit.toFixed(2)}
                  </td>
                  <td style={{ ...tdBase, color: 'var(--text-dim)', fontSize: '10px' }}>
                    {new Date(t.closeTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ ...tdBase, color: 'var(--text-dim)' }}>{t.account?.name || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-dim)' }}>
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
                  background: 'none', border: '1px solid var(--border2)',
                  color: 'var(--text-dim)', cursor: btn.disabled ? 'not-allowed' : 'pointer',
                  padding: '5px 10px', opacity: btn.disabled ? .3 : 1,
                  fontFamily: "'Share Tech Mono'", fontSize: '12px',
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
        @media (max-width: 900px) { .th-summary-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 560px) { .th-summary-grid { grid-template-columns: 1fr !important; } }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7) sepia(1) saturate(3) hue-rotate(180deg); opacity: .5; cursor: pointer; }
      `}</style>
    </div>
  );
};
