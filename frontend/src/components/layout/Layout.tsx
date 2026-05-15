import type { ReactNode } from 'react';
import { Header } from './Header';
import { useUIStore } from '../../stores/uiStore';

// SVG icons matching the mockup exactly
const IconHome = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1" y="1" width="6.5" height="6.5"/>
    <rect x="10.5" y="1" width="6.5" height="6.5"/>
    <rect x="1" y="10.5" width="6.5" height="6.5"/>
    <rect x="10.5" y="10.5" width="6.5" height="6.5"/>
  </svg>
);

const IconTrades = () => (
  <svg width="17" height="13" viewBox="0 0 17 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
    <line x1="0" y1="1" x2="17" y2="1"/>
    <line x1="0" y1="6.5" x2="17" y2="6.5"/>
    <line x1="0" y1="12" x2="17" y2="12"/>
  </svg>
);

const IconCalendar = () => (
  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1" y="3" width="15" height="13"/>
    <line x1="1" y1="7" x2="16" y2="7"/>
    <line x1="5" y1="1" x2="5" y2="5"/>
    <line x1="12" y1="1" x2="12" y2="5"/>
  </svg>
);

const IconStats = () => (
  <svg width="17" height="15" viewBox="0 0 17 15" fill="currentColor">
    <rect x="0" y="9" width="4" height="6"/>
    <rect x="6.5" y="4" width="4" height="11"/>
    <rect x="13" y="0" width="4" height="15"/>
  </svg>
);

type Page = ReturnType<typeof useUIStore.getState>['currentPage'];

interface NavItem {
  page: Page;
  label: string;
  Icon: () => JSX.Element;
}

const NAV_ITEMS: NavItem[] = [
  { page: 'dashboard',     label: 'HOME',     Icon: IconHome },
  { page: 'trade-history', label: 'TRADES',   Icon: IconTrades },
  { page: 'calendar',      label: 'CALENDAR', Icon: IconCalendar },
  { page: 'analytics',     label: 'STATS',    Icon: IconStats },
];

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const currentPage = useUIStore(s => s.currentPage);
  const setCurrentPage = useUIStore(s => s.setCurrentPage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <Header />

      {/* ── Body: sidebar + content ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar (desktop) ── */}
        <aside
          className="sidebar-nav"
          style={{
            width: '48px',
            background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '10px 0',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          {NAV_ITEMS.map(({ page, label, Icon }) => {
            const active = currentPage === page;
            return (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                title={label}
                className={active ? 'sb-btn-active' : ''}
                style={{
                  width: '34px', height: '34px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '15px',
                  color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  border: active ? '1px solid var(--border2)' : '1px solid transparent',
                  background: active ? 'rgba(56,189,248,.08)' : 'none',
                  position: 'relative',
                  transition: 'all .15s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                }}
              >
                <Icon />
                {/* Mobile label (shown in bottom nav) */}
                <span className="sb-label" style={{
                  display: 'none',
                  fontFamily: "'Press Start 2P'", fontSize: '5px',
                  letterSpacing: '.3px', lineHeight: 1,
                  color: 'currentColor',
                }}>{label}</span>
              </button>
            );
          })}
        </aside>

        {/* ── Main content ── */}
        <main
          className="main-content"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {children}
        </main>
      </div>

      {/* ── Bottom nav (mobile, ≤900px) ── */}
      <style>{`
        @media (max-width: 900px) {
          .sidebar-nav {
            position: fixed !important;
            bottom: 0 !important; left: 0 !important; right: 0 !important;
            width: 100% !important; height: 56px !important;
            flex-direction: row !important;
            align-items: stretch !important;
            border-right: none !important;
            border-top: 1px solid var(--border2) !important;
            padding: 0 !important;
            gap: 0 !important;
            z-index: 200 !important;
          }
          .sidebar-nav button {
            flex: 1 !important;
            height: 100% !important;
            width: auto !important;
            flex-direction: column !important;
            justify-content: center !important;
            gap: 4px !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .sidebar-nav button .sb-label {
            display: block !important;
          }
          .main-content {
            padding-bottom: 70px !important;
          }
        }
        @media (max-width: 768px) {
          .main-content {
            padding: 10px !important;
            padding-bottom: 70px !important;
            gap: 10px !important;
          }
        }
      `}</style>
    </div>
  );
};
