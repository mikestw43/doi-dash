import type { ReactNode } from 'react';
import { Header } from './Header';
import { useUIStore } from '../../stores/uiStore';
import { useTranslation } from '../../i18n/useTranslation';
import { IconHome, IconCandles, IconCalendar, IconBars, IconSpark } from '../icons';
import type { IconProps } from '../icons';

type Page = ReturnType<typeof useUIStore.getState>['currentPage'];

interface NavItem {
  page: Page;
  labelKey: string;
  Icon: (props: IconProps) => ReactNode;
}

// labelKey, not label: the bar is the one piece of chrome on every screen,
// so it is the first thing that has to speak the reader's language.
const NAV_ITEMS: NavItem[] = [
  { page: 'dashboard',     labelKey: 'nav.home',           Icon: IconHome },
  { page: 'trade-history', labelKey: 'nav.trades_short',   Icon: IconCandles },
  { page: 'calendar',      labelKey: 'nav.calendar_short', Icon: IconCalendar },
  { page: 'analytics',     labelKey: 'nav.stats',          Icon: IconBars },
];

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const currentPage = useUIStore(s => s.currentPage);
  const setCurrentPage = useUIStore(s => s.setCurrentPage);
  const setAiOpen = useUIStore(s => s.setAiOpen);
  const t = useTranslation();

  // Almost the same buttons in both shells — the sidebar on desktop, the
  // bottom bar on phones, only one displayed at a time. AI is the exception:
  // on a phone it is the floating button over the content, so it would be in
  // two places at once if it were also in the bar.
  const button = ({ page, labelKey, Icon }: NavItem) => {
    const active = currentPage === page;
    const label = t(labelKey);
    return (
      <button
        key={page}
        onClick={() => setCurrentPage(page)}
        title={label}
        className={active ? 'nav-btn sb-btn-active' : 'nav-btn'}
        style={{
          color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
          border: active ? '1px solid var(--border2)' : '1px solid transparent',
          background: active ? 'rgba(96,165,250,.08)' : 'none',
        }}
      >
        <Icon />
        <span className="sb-label">{label}</span>
      </button>
    );
  };

  const navButtons = NAV_ITEMS.map(button);

  // AI is not a place, so it is not a page: on a phone the floating button
  // opens it, and here — where there is no floating button — this does.
  const sidebarButtons = [
    ...navButtons,
    <button
      key="ai"
      onClick={() => setAiOpen(true)}
      title={t('nav.ai')}
      className="nav-btn"
      style={{ color: 'var(--text-muted)', border: '1px solid transparent', background: 'none' }}
    >
      <IconSpark />
      <span className="sb-label">{t('nav.ai')}</span>
    </button>,
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <Header />

      {/* ── Body: sidebar + content ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <aside className="sidebar-nav">{sidebarButtons}</aside>
        <main className="main-content">{children}</main>
      </div>

      {/* ── Bottom nav (mobile) ──
          It sits in the layout rather than floating over it. Anchored with
          position:fixed it hung above the screen edge on the first paint of
          the installed iOS app and only dropped into place once a scroll made
          Safari recompute the viewport. As the last row of the shell column it
          is wherever the shell ends, with nothing left to get wrong. */}
      <nav className="bottom-nav">{navButtons}</nav>

      <style>{`
        .main-content {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          /* Stated outright, because a box with one axis scrollable cannot
             leave the other visible: it turns into auto on its own, and then
             anything that manages to grow past the screen takes the whole
             page for a ride. Content that really is wider than the phone
             carries its own scroller (the trade history table has one). */
          overflow-x: hidden;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        /* Prevent flex-shrink from clipping children — main scrolls instead */
        .main-content > * { flex-shrink: 0; }
        /* ...but let them be narrower than their widest descendant. A page is
           stretched to this column's width, and a stretched box will not go
           below its own min-content unless told to. The trade history holds a
           700px-wide table in its own horizontal scroller; Safari still counts
           that table towards the page's minimum, so the page grew past the
           screen and .main-content — which scrolls both axes, since a box with
           one axis scrollable cannot leave the other visible — slid sideways,
           taking the summary cards and the filters off the edge with it. */
        .main-content > * { min-width: 0; }

        .nav-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          cursor: pointer;
          position: relative;
          transition: all .15s;
          flex-shrink: 0;
        }
        .nav-btn .sb-label {
          font-family: var(--ff-section);
          letter-spacing: .3px;
          line-height: 1;
          color: currentColor;
        }

        .sidebar-nav {
          width: 48px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 10px 0;
          gap: 4px;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
        }
        .sidebar-nav .nav-btn { width: 34px; height: 34px; }
        .sidebar-nav .nav-btn svg { width: 19px; height: 19px; }
        .sidebar-nav .sb-label { display: none; }

        .bottom-nav { display: none; }

        @media (max-width: 900px) {
          .sidebar-nav { display: none; }

          .bottom-nav {
            display: flex;
            flex-shrink: 0;
            background: var(--bg-secondary);
            border-top: 1px solid var(--border2);
            /* iOS reports a 34pt bottom inset, but the home indicator is only
               a few points tall and sits well inside it. Reserving all of it
               left an empty band under the labels. */
            height: calc(42px + max(env(safe-area-inset-bottom) - 12px, 0px));
            padding-bottom: max(env(safe-area-inset-bottom) - 12px, 0px);
          }
          .bottom-nav .nav-btn {
            flex: 1;
            height: 100%;
            flex-direction: column;
            justify-content: center;
            gap: 2px;
            border: none !important;
            border-radius: 0;
          }
          .bottom-nav .nav-btn svg { width: 21px; height: 21px; }
          .bottom-nav .sb-label {
            display: block;
            font-size: var(--fs-micro);
          }
        }
        @media (max-width: 768px) {
          .main-content {
            padding: 10px !important;
            gap: 10px !important;
          }
        }
      `}</style>
    </div>
  );
};
