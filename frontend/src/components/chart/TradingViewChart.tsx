import { useState } from 'react';

const TIMEFRAMES = [
  { label: '5M',  value: '5'  },
  { label: '15M', value: '15' },
  { label: '1H',  value: '60' },
  { label: '4H',  value: '240'},
  { label: '1D',  value: 'D'  },
];

export const TradingViewChart = () => {
  const [tf, setTf] = useState('15');

  // Build the TradingView widget iframe URL
  const params = new URLSearchParams({
    symbol:             'OANDA:XAUUSD',
    interval:           tf,
    theme:              'dark',
    style:              '1',
    locale:             'en',
    toolbar_bg:         '#0a0e1a',
    enable_publishing:  '0',
    allow_symbol_change:'0',
    save_image:         '0',
    hide_top_toolbar:   '1',
    hide_legend:        '1',
    hide_side_toolbar:  '1',
    withdateranges:     '0',
    backgroundColor:    'rgba(10,14,26,1)',
    gridColor:          'rgba(255,255,255,0.03)',
    timezone:           'Asia/Bangkok',
  });

  const src = `https://www.tradingview.com/widgetembed/?frameElementId=tv_chart&${params.toString()}`;

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
          <div style={{ width: '1px', height: '14px', background: 'var(--border2)', margin: '0 4px' }} />
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-muted)', cursor: 'default' }}>▲</span>
        </div>
      </div>

      {/* ── Chart body — iframe approach ── */}
      <div style={{ height: '200px', position: 'relative', background: '#0a0e1a' }}>
        <iframe
          key={tf}
          src={src}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allow="clipboard-write"
          title="XAUUSD Chart"
        />
      </div>
    </div>
  );
};
