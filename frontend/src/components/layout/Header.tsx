import { useState, useEffect, useRef } from 'react';
import { useAccountStore } from '../../stores/accountStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';

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

// ── Ticker data ─────────────────────────────────────────────────────────────
const TICKER_ITEMS = [
  { sym: 'EURUSD', price: '1.0872',    chg: '0.12', up: false },
  { sym: 'OXY',    price: '104.32',    chg: '0.09', up: true  },
  { sym: 'GBPUSD', price: '1.2913',    chg: '0.88', up: true  },
  { sym: 'USDJPY', price: '148.23',    chg: '0.21', up: false },
  { sym: 'BTCUSD', price: '82,441',    chg: '1.54', up: true  },
  { sym: 'SP500',  price: '5,628.35',  chg: '0.43', up: true  },
  { sym: 'NASDAQ', price: '17,849.4',  chg: '0.61', up: true  },
  { sym: 'XAUUSD', price: '3,154.82',  chg: '0.34', up: true  },
];
const TICKER_DOUBLED = [...TICKER_ITEMS, ...TICKER_ITEMS];

// ── Header ──────────────────────────────────────────────────────────────────
export const Header = () => {
  const [time, setTime] = useState(getLocalTime);
  const [activeSessions, setActiveSessions] = useState(getActiveSessions);
  const [showMenu, setShowMenu] = useState(false);
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
      {/* ══ TOP NAV ══ */}
      <nav style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border2)',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: '0 16px',
        height: '54px',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        {/* Left: Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px',
            background: 'var(--accent-blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--glow-cyan)',
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: "'Press Start 2P'", fontSize: '13px', color: '#0c1422' }}>D</span>
          </div>
          <div>
            <div style={{
              fontFamily: "'Press Start 2P'", fontSize: '9px',
              color: 'var(--text-primary)', letterSpacing: '2px',
              textShadow: '0 0 12px rgba(56,189,248,.8)',
            }}>DOI DASH</div>
            <div style={{
              fontFamily: "'Press Start 2P'", fontSize: '5px',
              color: 'var(--text-muted)', letterSpacing: '.5px',
              opacity: .5, marginTop: '3px',
            }}>Run fast, Climb high, Hold tight</div>
          </div>
        </div>

        {/* Center: Clock + Sessions */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{
            fontFamily: "'VT323'", fontSize: '34px', fontWeight: 400,
            color: 'var(--warning)', letterSpacing: '2px', lineHeight: 1,
          }}>
            {time}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
            {SESSIONS.map((s, i) => {
              const active = activeSessions.has(s.name);
              return (
                <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '9px', opacity: .35 }}>·</span>}
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontFamily: "'Press Start 2P'", fontSize: '5px',
                    letterSpacing: '.4px',
                    color: active ? 'var(--success)' : 'var(--text-muted)',
                    transition: 'color .4s',
                  }}>
                    <span style={{
                      width: '5px', height: '5px', borderRadius: '50%',
                      background: 'currentColor',
                      boxShadow: active ? '0 0 6px var(--success)' : 'none',
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
          <div style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            padding: '5px 10px',
            border: '1px solid var(--border2)',
            background: 'var(--bg-tertiary)',
            color: wsConnected ? 'var(--success)' : 'var(--danger)',
            cursor: 'default',
          }}>
            {/* Bars */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '16px' }}>
              {[5, 8, 12, 16].map((h, i) => (
                <div key={i} style={{
                  width: '4px', height: `${h}px`,
                  borderRadius: '1px 1px 0 0',
                  background: wsConnected ? (i < 3 ? 'currentColor' : 'rgba(34,197,94,.3)') : (i < 1 ? 'currentColor' : 'rgba(239,68,68,.3)'),
                }} />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <div style={{ fontFamily: "'Press Start 2P'", fontSize: '5px', letterSpacing: '.5px', lineHeight: 1 }}>
                {wsConnected ? 'LIVE' : 'OFF'}
              </div>
              <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '9px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {wsConnected ? '12ms' : '—'}
              </div>
            </div>
          </div>

          {/* Profile button */}
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              onClick={() => setShowMenu(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '3px 8px 3px 4px',
                border: '1px solid var(--border2)',
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
                background: 'rgba(56,189,248,.08)',
                border: '1px solid rgba(56,189,248,.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Press Start 2P'", fontSize: '6px',
                color: 'var(--accent-blue)', flexShrink: 0,
              }}>
                {initials}
              </div>
              <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-primary)', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '8px', display: 'inline-block', transform: showMenu ? 'rotate(180deg)' : 'none', transition: 'transform .2s', lineHeight: 1 }}>▾</span>
            </button>

            {/* Dropdown menu */}
            {showMenu && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                zIndex: 600,
                background: 'var(--bg-card)',
                border: '1px solid var(--border2)',
                minWidth: '220px',
                boxShadow: '4px 4px 0 rgba(0,0,0,.5)',
              }}>
                {/* User info */}
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '38px', height: '38px',
                    background: 'rgba(56,189,248,.08)',
                    border: '1px solid var(--accent-blue)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Press Start 2P'", fontSize: '9px',
                    color: 'var(--accent-blue)', flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.2 }}>
                      {user?.name || 'User'}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {user?.email}
                    </div>
                    <span style={{
                      fontFamily: "'Press Start 2P'", fontSize: '6px',
                      padding: '2px 5px', display: 'inline-block', marginTop: '5px',
                      border: '1px solid var(--accent-blue)',
                      color: 'var(--accent-blue)',
                      background: 'rgba(56,189,248,.08)',
                    }}>
                      {(user?.role || 'user').toUpperCase()}
                    </span>
                  </div>
                </div>

                <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

                {/* User menu items */}
                {([
                  { symbol: '◈', label: 'Profile', page: 'profile' as const },
                  { symbol: '⚙', label: 'Settings', page: 'profile' as const },
                ] as { symbol: string; label: string; page: ReturnType<typeof useUIStore.getState>['currentPage'] }[]).map(({ symbol, label, page }) => (
                  <button
                    key={label}
                    onClick={() => { setCurrentPage(page); setShowMenu(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '9px',
                      width: '100%', padding: '8px 14px',
                      fontFamily: "'Share Tech Mono'", fontSize: '12px',
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

                {/* Download EA */}
                <a
                  href="/ea/DOI_DASH_Reporter.ex5"
                  download
                  onClick={() => setShowMenu(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '9px',
                    width: '100%', padding: '8px 14px',
                    fontFamily: "'Share Tech Mono'", fontSize: '12px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer', background: 'none', border: 'none',
                    textDecoration: 'none', transition: 'background .1s',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,.04)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'none')}
                >
                  <span style={{ fontSize: '13px', lineHeight: 1 }}>⬇</span>
                  Download EA
                </a>

                {user?.role === 'admin' && (
                  <>
                    <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
                    <div style={{ padding: '5px 14px 2px', fontFamily: "'Press Start 2P'", fontSize: '6px', color: 'var(--text-muted)', letterSpacing: '1px' }}>
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
                          fontFamily: "'Share Tech Mono'", fontSize: '12px',
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
                    fontFamily: "'Share Tech Mono'", fontSize: '12px',
                    color: 'var(--danger)',
                    cursor: 'pointer', background: 'none', border: 'none',
                    transition: 'background .1s', textAlign: 'left',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,.08)')}
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

      {/* ══ TICKER BAR ══ */}
      <div style={{
        background: '#040c16',
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
          {TICKER_DOUBLED.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '0 16px',
              borderRight: '1px solid var(--border-color)',
            }}>
              <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '.5px' }}>
                {item.sym}
              </span>
              <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                {item.price}
              </span>
              <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: item.up ? 'var(--success)' : 'var(--danger)' }}>
                {item.up ? '▲' : '▼'}{item.chg}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
