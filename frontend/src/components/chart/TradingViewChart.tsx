import { useEffect, useRef, useState } from 'react';

// Standard TradingView Advanced Chart Widget embed
export const TradingViewChart = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const scriptInjected = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || scriptInjected.current) return;
    scriptInjected.current = true;

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

    return () => {
      container.innerHTML = '';
      scriptInjected.current = false;
    };
  }, []);

  return (
    <div style={{ border: '1px solid var(--border2)', marginBottom: '10px' }}>
      {/* Collapse/expand bar */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'var(--bg-card)',
          border: 'none', borderBottom: collapsed ? 'none' : '1px solid var(--border2)',
          cursor: 'pointer',
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '12px', color: 'var(--accent-blue)', fontWeight: 700 }}>
            XAUUSD
          </span>
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--text-muted)' }}>
            GOLD · TradingView
          </span>
        </div>
        <span style={{
          fontFamily: "'Share Tech Mono'", fontSize: '12px',
          color: 'var(--text-muted)',
          transition: 'transform .2s',
          display: 'inline-block',
          transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
        }}>▲</span>
      </button>

      {/* Chart body — hidden when collapsed */}
      <div
        className="tradingview-widget-container"
        ref={containerRef}
        style={{
          height: collapsed ? '0' : '400px',
          overflow: 'hidden',
          transition: 'height .25s ease',
          width: '100%',
        }}
      >
        <div
          className="tradingview-widget-container__widget"
          style={{ height: '100%', width: '100%' }}
        />
      </div>
    </div>
  );
};
