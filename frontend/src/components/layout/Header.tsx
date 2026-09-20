import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccountStore } from '../../stores/accountStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { NotificationBell } from './NotificationBell';
import { fetchMarketQuotes, fetchTickerSymbols } from '../../services/api';
import type { MarketQuote } from '../../services/api';

// ── Clock + session logic ───────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');

const getLocalTime = (): string => {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

// UTC session ranges [start, end) in minutes
const SESSIONS = [
  { name: 'TOKYO',    start: 0,    end: 9 * 60 },
  { name: 'LONDON',   start: 8 * 60, end: 17 * 60 },
  { name: 'NEW YORK', start: 13 * 60, end: 22 * 60 },
];

const getActiveSessions = (): Set<string> => {
  const now = new Date();
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const active = new Set<string>();
  SESSIONS.forEach(s => {
    if (utcMins >= s.start && utcMins < s.end) active.add(s.name);
  });
  return active;
};

// ── Ticker helpers ───────────────────────────────────────────────────────────
interface TickerItem {
  sym: string;
  price: string;
  chgPct: number | null;
  up: boolean | null;
}

const formatTickerPrice = (price: number): string => {
  if (price >= 10000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (price >= 100)   return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 10)    return price.toFixed(3);
  return price.toFixed(5);
};

const quotesToTicker = (quotes: MarketQuote[]): TickerItem[] =>
  quotes.map(q => ({
    sym: q.sym,
    price: formatTickerPrice(q.price),
    chgPct: q.chgPct,
    up: q.up,
  }));

// Default ticker symbols — overridable per user via Settings → Ticker.
// US30 / USOIL / XAGUSD (spot silver) require paid TwelveData tiers;
// SLV ETF is the free silver proxy.
const DEFAULT_TICKER_SYMBOLS = [
  'BTCUSD', 'XAUUSD', 'SLV', 'EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY',
];

const TICKER_FALLBACK: TickerItem[] = DEFAULT_TICKER_SYMBOLS.map(sym => ({
  sym, price: '—', chgPct: null, up: null,
}));

// ── Header ──────────────────────────────────────────────────────────────────
export const Header = () => {
  const [time, setTime] = useState(getLocalTime);
  const [activeSessions, setActiveSessions] = useState(getActiveSessions);
  const [showMenu, setShowMenu] = useState(false);
  const [tickerItems, setTickerItems] = useState<TickerItem[]>(TICKER_FALLBACK);

  // User's preferred symbol list (synced via backend). Falls back to the
  // default list above when the API hasn't responded yet.
  const { data: tickerPrefs } = useQuery<{ symbols: string[] }>({
    queryKey: ['ticker-symbols'],
    queryFn: fetchTickerSymbols,
    staleTime: 60_000,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const wsConnected = useAccountStore(s => s.wsConnected);
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const setCurrentPage = useUIStore(s => s.setCurrentPage);

  // clock tick
  useEffect(() => {
    const id = setInterval(() => {
      setTime(getLocalTime());
      setActiveSessions(getActiveSessions());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // live market quotes — fetch on mount then every 10 s. Filter + order
  // the backend payload by the user's preferred symbol list so the bar
  // shows exactly what they picked in Settings.
  useEffect(() => {
    const wanted = tickerPrefs?.symbols && tickerPrefs.symbols.length > 0
      ? tickerPrefs.symbols
      : DEFAULT_TICKER_SYMBOLS;

    const load = () => {
      fetchMarketQuotes()
        .then(quotes => {
          if (!quotes.length) return;
          const bySym = new Map(quotes.map(q => [q.sym, q]));
          const ordered = wanted
            .map(sym => bySym.get(sym))
            .filter((q): q is MarketQuote => Boolean(q));
          if (ordered.length) setTickerItems(quotesToTicker(ordered));
        })
        .catch(() => { /* keep current items on error */ });
    };
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [tickerPrefs?.symbols]);

  // close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // user initials
  const initials = (user?.name || user?.email || 'U')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const displayName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'User';

  return (
    <>
      {/* ══ TOP NAV ══
          paddingTop + height both use env(safe-area-inset-top) so the
          nav bar background extends under the iPhone notch/Dynamic Island
          while logo + menu button stay below it (still tappable). */}
      <nav className="header-nav" style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border2)',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: 'env(safe-area-inset-top) 12px 0',
        height: 'calc(54px + env(safe-area-inset-top))',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        {/* Left: Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div className="header-logo-box" style={{
            width: '36px', height: '36px',
            background: 'var(--accent-blue)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'var(--ff-section)', fontSize: '13px', color: '#25272c' }}>D</span>
          </div>
          <div className="header-logo-text">
            <div style={{
              fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)',
              color: 'var(--text-primary)', letterSpacing: '2px',
            }}>DOI DASH</div>
            <div className="header-subtitle" style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              color: 'var(--text-muted)', letterSpacing: '.5px',
              opacity: .5, marginTop: '3px',
            }}>Run fast, Climb high, Hold tight</div>
          </div>
        </div>

        {/* Center: Clock + Sessions */}
        <div className="header-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{
            fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-md)', fontWeight: 600,
            color: 'var(--text-primary)', letterSpacing: '1px', lineHeight: 1,
          }}>
            {time}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
            {SESSIONS.map((s, i) => {
              const active = activeSessions.has(s.name);
              return (
                <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-micro)', opacity: .35 }}>·</span>}
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                    letterSpacing: '.4px',
                    color: active ? 'var(--success)' : 'var(--text-muted)',
                    transition: 'color .4s',
                  }}>
                    <span style={{
                      width: '5px', height: '5px', borderRadius: '50%',
                      background: 'currentColor',
                      transition: 'box-shadow .4s',
                    }} />
                    {s.name}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Right: WiFi + Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>

          {/* WiFi widget */}
          <div
            className="header-wifi"
            title={wsConnected ? 'Connected · ~12ms' : 'Disconnected'}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '5px 10px',
              border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-tertiary)',
              color: wsConnected ? 'var(--success)' : 'var(--danger)',
              cursor: 'default',
            }}
          >
            {/* Bars */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '16px' }}>
              {[5, 8, 12, 16].map((h, i) => (
                <div key={i} style={{
                  width: '4px', height: `${h}px`,
                  borderRadius: '1px 1px 0 0',
                  background: wsConnected ? (i < 3 ? 'currentColor' : 'rgba(52,211,153,.3)') : (i < 1 ? 'currentColor' : 'rgba(248,113,113,.3)'),
                }} />
              ))}
            </div>
            <div className="header-wifi-info" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px', lineHeight: 1 }}>
                {wsConnected ? 'LIVE' : 'OFF'}
              </div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {wsConnected ? '12ms' : '—'}
              </div>
            </div>
          </div>

          {/* Notifications bell */}
          <NotificationBell />

          {/* Profile button */}
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              onClick={() => setShowMenu(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '3px 8px 3px 4px',
                border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', height: '30px',
                background: 'none',
                transition: 'border-color .15s',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border2)')}
            >
              {/* Avatar */}
              <div style={{
                width: '22px', height: '22px',
                background: 'rgba(96,165,250,.08)',
                border: '1px solid rgba(96,165,250,.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                color: 'var(--accent-blue)', flexShrink: 0,
              }}>
                {initials}
              </div>
              <span className="header-username" style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-primary)', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-label)', display: 'inline-block', transform: showMenu ? 'rotate(180deg)' : 'none', transition: 'transform .2s', lineHeight: 1 }}>▾</span>
            </button>

            {/* Dropdown menu */}
            {showMenu && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                zIndex: 600,
                background: 'var(--bg-card)',
                border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
                minWidth: '220px',
              }}>
                {/* User info */}
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '38px', height: '38px',
                    background: 'rgba(96,165,250,.08)',
                    border: '1px solid var(--accent-blue)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)',
                    color: 'var(--accent-blue)', flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.2 }}>
                      {user?.name || 'User'}
                    </div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {user?.email}
                    </div>
                    <span style={{
                      fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                      padding: '2px 5px', display: 'inline-block', marginTop: '5px',
                      border: '1px solid var(--accent-blue)',
                      color: 'var(--accent-blue)',
                      background: 'rgba(96,165,250,.08)',
                    }}>
                      {(user?.role || 'user').toUpperCase()}
                    </span>
                  </div>
                </div>

                <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

                {/* User menu items */}
                {([
                  { symbol: '◈', label: 'Profile', page: 'profile' as const },
                  { symbol: '⚙', label: 'Settings', page: 'settings' as const },
                ] as { symbol: string; label: string; page: ReturnType<typeof useUIStore.getState>['currentPage'] }[]).map(({ symbol, label, page }) => (
                  <button
                    key={label}
                    onClick={() => { setCurrentPage(page); setShowMenu(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '9px',
                      width: '100%', padding: '8px 14px',
                      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer', background: 'none', border: 'none',
                      transition: 'background .1s', textAlign: 'left',
                    }}
                    onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.04)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}
                  >
                    <span style={{ fontSize: '13px', lineHeight: 1 }}>{symbol}</span>
                    {label}
                  </button>
                ))}

                {/* Download EA — navigates to the public Download page (MT4 + MT5) */}
                <button
                  onClick={() => { setCurrentPage('download'); setShowMenu(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '9px',
                    width: '100%', padding: '8px 14px',
                    fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer', background: 'none', border: 'none',
                    transition: 'background .1s', textAlign: 'left',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.04)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}
                >
                  <span style={{ fontSize: '13px', lineHeight: 1 }}>⬇</span>
                  Download EA
                </button>

                {user?.role === 'admin' && (
                  <>
                    <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
                    <div style={{ padding: '5px 14px 2px', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '1px' }}>
                      ADMIN
                    </div>
                    {([
                      { symbol: '◫', label: 'User Management', page: 'admin' as const },
                      { symbol: '▦', label: 'EA Repository', page: 'ea-repository' as const },
                      { symbol: '▣', label: 'Announce', page: 'announce' as const },
                    ] as { symbol: string; label: string; page: ReturnType<typeof useUIStore.getState>['currentPage'] }[]).map(({ symbol, label, page }) => (
                      <button
                        key={label}
                        onClick={() => { setCurrentPage(page); setShowMenu(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '9px',
                          width: '100%', padding: '8px 14px',
                          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer', background: 'none', border: 'none',
                          transition: 'background .1s', textAlign: 'left',
                        }}
                        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.04)')}
                        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}
                      >
                        <span style={{ fontSize: '13px', lineHeight: 1 }}>{symbol}</span>
                        {label}
                      </button>
                    ))}
                  </>
                )}

                <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

                <button
                  onClick={() => { logout(); setShowMenu(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '9px',
                    width: '100%', padding: '8px 14px',
                    fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
                    color: 'var(--danger)',
                    cursor: 'pointer', background: 'none', border: 'none',
                    transition: 'background .1s', textAlign: 'left',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,.08)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}
                >
                  <span style={{ fontSize: '13px', lineHeight: 1 }}>⏻</span>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ══ MOBILE RESPONSIVE ══ */}
      <style>{`
        @media (max-width: 768px) {
          .header-nav {
            grid-template-columns: auto 1fr !important;
            /* env() keeps the nav background under the notch while pushing
               logo + menu button into the tappable area below it. */
            padding: env(safe-area-inset-top) 10px 0 !important;
            height: calc(48px + env(safe-area-inset-top)) !important;
          }
          .header-center { display: none !important; }
          /* Keep wifi widget visible on mobile but compact: bars only, hide LIVE/12ms text */
          .header-wifi { padding: 4px 6px !important; gap: 0 !important; }
          .header-wifi-info { display: none !important; }
          .header-username { display: none !important; }
          .header-subtitle { display: none !important; }
        }
        @media (max-width: 400px) {
          .header-logo-text { display: none !important; }
          .header-logo-box  { width: 30px !important; height: 30px !important; }
          .header-logo-box span { font-size: 11px !important; }
        }
      `}</style>

      {/* ══ TICKER BAR ══ */}
      <div style={{
        background: '#25272c',
        borderBottom: '1px solid var(--border-color)',
        height: '28px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          animation: 'ticker 32s linear infinite',
          whiteSpace: 'nowrap',
        }}
          onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.animationPlayState = 'paused')}
          onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.animationPlayState = 'running')}
        >
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '0 16px',
              borderRight: '1px solid var(--border-color)',
            }}>
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', letterSpacing: '.5px' }}>
                {item.sym}
              </span>
              {/* Price + change use VT323 to match the number style elsewhere
                  on the dashboard. Symbol stays Share Tech Mono (it's a label). */}
              <span style={{ fontFamily: 'var(--ff-display)', fontSize: '18px', lineHeight: 1, color: 'var(--text-primary)' }}>
                {item.price}
              </span>
              {item.chgPct !== null ? (
                <span style={{ fontFamily: 'var(--ff-display)', fontSize: '15px', lineHeight: 1, color: (item.up ?? true) ? 'var(--success)' : 'var(--danger)' }}>
                  {(item.up ?? true) ? '▲' : '▼'}{Math.abs(item.chgPct).toFixed(2)}%
                </span>
              ) : (
                item.price !== '—' && (
                  <span style={{ fontFamily: 'var(--ff-display)', fontSize: '15px', lineHeight: 1, color: 'var(--text-dim)' }}>—</span>
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
