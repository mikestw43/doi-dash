import { useEffect, useRef, useState } from 'react';

const TIMEFRAMES = [
  { label: '5M',  value: '5'  },
  { label: '15M', value: '15' },
  { label: '1H',  value: '60' },
  { label: '4H',  value: '240'},
  { label: '1D',  value: 'D'  },
];

export const TradingViewChart = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState('15');
  const widgetKey = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    widgetKey.current += 1;

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = '100%';
    widgetDiv.style.width = '100%';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: 'OANDA:XAUUSD',
      interval: tf,
      timezone: 'Asia/Bangkok',
      theme: 'dark',
      style: '1',
      locale: 'en',
      toolbar_bg: '#0a0e1a',
      enable_publishing: false,
      allow_symbol_change: false,
      save_image: false,
      backgroundColor: '#0a0e1a',
      gridColor: 'rgba(255,255,255,0.03)',
      hide_top_toolbar: true,
      hide_legend: true,
      withdateranges: false,
      hide_side_toolbar: true,
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);

    return () => { container.innerHTML = ''; };
  }, [tf]);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border2)',
      overflow: 'hidden',
    }}>
      {/* ── Chart header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 12px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
      }}>
        {/* Left: symbol + price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '13px', color: 'var(--accent-blue)', fontWeight: 700, letterSpacing: '.5px' }}>
            XAUUSD
          </span>
          <span style={{ fontFamily: "'VT323'", fontSize: '22px', color: 'var(--warning)', lineHeight: 1 }}>
            3,154.82
          </span>
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: 'var(--success)', letterSpacing: '.5px' }}>
            ▲ +18.64 (0.34%)
          </span>
        </div>

        {/* Right: timeframe buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {TIMEFRAMES.map(t => (
            <button
              key={t.value}
              onClick={() => setTf(t.value)}
              style={{
                padding: '3px 8px',
                fontFamily: "'Press Start 2P'", fontSize: '6px',
                letterSpacing: '.3px',
                border: tf === t.value ? '1px solid var(--accent-blue)' : '1px solid transparent',
                color: tf === t.value ? 'var(--accent-blue)' : 'var(--text-muted)',
                background: tf === t.value ? 'rgba(56,189,248,.08)' : 'none',
                cursor: 'pointer',
                transition: 'all .1s',
              }}
            >
              {t.label}
            </button>
          ))}
          {/* collapse placeholder — not in mockup but keep for expand */}
          <div style={{ width: '1px', height: '14px', background: 'var(--border2)', margin: '0 4px' }} />
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-muted)', cursor: 'default' }}>▲</span>
        </div>
      </div>

      {/* ── Chart body ── */}
      <div style={{ height: '200px', position: 'relative', background: '#0a0e1a' }}>
        <div
          ref={containerRef}
          className="tradingview-widget-container"
          style={{ height: '100%', width: '100%' }}
        />
      </div>
    </div>
  );
};
