import { useState, useEffect } from 'react';
import { useAccountStore } from '../../stores/accountStore';
import { fetchTradeHistory } from '../../services/api';
import { exportToCSV } from '../../utils/export';
import type { ClosedTrade } from '../../types';

export const TradeHistoryPage = () => {
  const accounts = useAccountStore(s => s.accounts);
  const [accountId, setAccountId] = useState('');
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [sortBy, setSortBy] = useState('closeTime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [trades, setTrades] = useState<ClosedTrade[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fetchTradeHistory({ accountId: accountId || undefined, page, limit, symbol: symbol || undefined, type: type || undefined, sortBy, sortDir })
      .then(res => { setTrades(res.trades); setTotal(res.total); })
      .catch(() => { setTrades([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [accountId, symbol, type, page, sortBy, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

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
      trades.map(t => ({ ticket: t.ticket, symbol: t.symbol, type: t.type, lots: t.lots, openPrice: t.openPrice, closePrice: t.closePrice, profit: t.profit, openTime: t.openTime, closeTime: t.closeTime, sl: t.sl, tp: t.tp, account: t.account?.name || '' })),
      `trade-history-${new Date().toISOString().slice(0, 10)}`,
      [{ key: 'ticket', label: 'Ticket' }, { key: 'symbol', label: 'Symbol' }, { key: 'type', label: 'Type' }, { key: 'lots', label: 'Lots' }, { key: 'openPrice', label: 'Open Price' }, { key: 'closePrice', label: 'Close Price' }, { key: 'profit', label: 'Profit' }, { key: 'openTime', label: 'Open Time' }, { key: 'closeTime', label: 'Close Time' }, { key: 'sl', label: 'SL' }, { key: 'tp', label: 'TP' }, { key: 'account', label: 'Account' }],
    );
  };

  const selStyle: React.CSSProperties = { background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontSize: '11px', padding: '6px 10px', outline: 'none', cursor: 'pointer' };
  const thStyle = (clickable = false): React.CSSProperties => ({
    fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)', letterSpacing: '.5px',
    padding: '9px 8px', textAlign: 'left', borderBottom: '2px solid var(--border2)', fontWeight: 400,
    cursor: clickable ? 'pointer' : 'default', whiteSpace: 'nowrap',
  });
  const thR = (clickable = false): React.CSSProperties => ({ ...thStyle(clickable), textAlign: 'right' });
  const td: React.CSSProperties = { padding: '7px 8px', borderBottom: '1px solid rgba(45,64,96,.3)', fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text)', whiteSpace: 'nowrap' };
  const tdR: React.CSSProperties = { ...td, textAlign: 'right' };

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '7px', height: '7px', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)', flexShrink: 0 }} />
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text)', letterSpacing: '2px' }}>TRADE HISTORY</span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text-dim)', padding: '4px 10px', border: '1px solid var(--border2)' }}>{total}</span>
      </div>

      {/* Filters + Export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <select value={accountId} onChange={e => { setAccountId(e.target.value); setPage(1); }} style={selStyle}>
          <option value="">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input
          type="text" placeholder="Symbol..." value={symbol}
          onChange={e => { setSymbol(e.target.value.toUpperCase()); setPage(1); }}
          style={{ ...selStyle, width: '100px' }}
        />
        <select value={type} onChange={e => { setType(e.target.value); setPage(1); }} style={selStyle}>
          <option value="">All Types</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        <button
          onClick={handleExport}
          disabled={!trades.length}
          style={{ marginLeft: 'auto', fontFamily: "'Press Start 2P'", fontSize: '7px', letterSpacing: '.5px', padding: '7px 12px', background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: trades.length ? 'pointer' : 'not-allowed', opacity: trades.length ? 1 : .3 }}
        >
          ↓ EXPORT CSV
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border2)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-card2)' }}>
              <th style={thStyle(true)} onClick={() => handleSort('ticket')}>TICKET{sortIcon('ticket')}</th>
              <th style={thStyle(true)} onClick={() => handleSort('symbol')}>SYMBOL{sortIcon('symbol')}</th>
              <th style={thStyle()}>TYPE</th>
              <th style={thR()}>LOTS</th>
              <th style={thR()}>OPEN</th>
              <th style={thR()}>CLOSE</th>
              <th style={thR(true)} onClick={() => handleSort('profit')}>PROFIT{sortIcon('profit')}</th>
              <th style={thStyle(true)} onClick={() => handleSort('closeTime')}>CLOSE TIME{sortIcon('closeTime')}</th>
              <th style={thStyle()}>ACCOUNT</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ ...td, textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>Loading...</td></tr>
            ) : trades.length === 0 ? (
              <tr><td colSpan={9} style={{ ...td, textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>No closed trades found.</td></tr>
            ) : (
              trades.map(t => (
                <tr key={t.id}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(45,64,96,.25)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ ...td, color: 'var(--text-dim)' }}>#{t.ticket}</td>
                  <td style={{ ...td, color: 'var(--text)', fontWeight: 700 }}>{t.symbol}</td>
                  <td style={td}>
                    <span style={{
                      fontFamily: "'Press Start 2P'", fontSize: '7px', padding: '3px 6px', letterSpacing: '.5px',
                      border: `1px solid ${t.type === 'BUY' ? 'rgba(34,197,94,.4)' : 'rgba(239,68,68,.4)'}`,
                      color: t.type === 'BUY' ? 'var(--green)' : 'var(--red)',
                      background: t.type === 'BUY' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
                    }}>
                      {t.type}
                    </span>
                  </td>
                  <td style={{ ...tdR, color: 'var(--text-dim)' }}>{t.lots.toFixed(2)}</td>
                  <td style={{ ...tdR, color: 'var(--text-dim)' }}>{t.openPrice.toFixed(5)}</td>
                  <td style={{ ...tdR, color: 'var(--text-dim)' }}>{t.closePrice.toFixed(5)}</td>
                  <td style={{ ...tdR, fontFamily: "'VT323'", fontSize: '20px', lineHeight: 1, color: t.profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {t.profit >= 0 ? '+' : ''}{t.profit.toFixed(2)}
                  </td>
                  <td style={{ ...td, color: 'var(--text-dim)', fontSize: '10px' }}>
                    {new Date(t.closeTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ ...td, color: 'var(--text-dim)' }}>{t.account?.name || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-dim)' }}>
            Page {page} / {totalPages} &nbsp;·&nbsp; {total} trades
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: page > 1 ? 'pointer' : 'not-allowed', padding: '5px 10px', opacity: page > 1 ? 1 : .3, fontFamily: "'Share Tech Mono'", fontSize: '12px' }}>
              ‹
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: page < totalPages ? 'pointer' : 'not-allowed', padding: '5px 10px', opacity: page < totalPages ? 1 : .3, fontFamily: "'Share Tech Mono'", fontSize: '12px' }}>
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
