import { useEffect, useRef, useState } from 'react';

export const TradingViewChart = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Default collapsed on mobile so it doesn't dominate the screen
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);

  // Re-inject widget every time chart becomes visible
  // so TradingView always initialises into a correctly-sized container
  useEffect(() => {
    if (collapsed) return;

    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';

    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.cssText = 'width:100%;height:100%;';
    container.appendChild(inner);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: 'OANDA:XAUUSD',
      interval: '15',
      timezone: 'Asia/Bangkok',
      theme: 'dark',
      style: '1',
      locale: 'en',
      allow_symbol_change: true,
      calendar: false,
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);

    // Dispatch resize after transition so widget fills container correctly
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 300);

    return () => {
      clearTimeout(timer);
      if (container) container.innerHTML = '';
    };
  }, [collapsed]); // runs on expand AND on first mount

  const handleToggle = () => setCollapsed(c => !c);

  return (
    <div style={{ border: '1px solid var(--border2)', marginBottom: '10px' }}>
      {/* Collapse / expand bar */}
      <button
        onClick={handleToggle}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'var(--bg-card)',
          border: 'none',
          borderBottom: collapsed ? 'none' : '1px solid var(--border2)',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--accent-blue)', fontWeight: 700 }}>
            XAUUSD
          </span>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)' }}>
            GOLD · TradingView
          </span>
        </div>
        <span style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)',
          display: 'inline-block',
          transition: 'transform .25s',
          transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
        }}>▲</span>
      </button>

      {/* Chart body */}
      <div
        className="tradingview-widget-container"
        ref={containerRef}
        style={{
          height: collapsed ? '0' : '400px',
          overflow: 'hidden',
          transition: 'height .25s ease',
          width: '100%',
        }}
      />
    </div>
  );
};
