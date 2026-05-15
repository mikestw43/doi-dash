import { useState, useEffect, useRef } from 'react';

const TIMEFRAMES = [
  { label: '5M',  value: '5'  },
  { label: '15M', value: '15' },
  { label: '1H',  value: '60' },
  { label: '4H',  value: '240'},
  { label: '1D',  value: 'D'  },
];

// Build a self-contained HTML page for the TradingView widget
function buildWidgetHtml(interval: string) {
  const config = {
    autosize:           true,
    symbol:             'OANDA:XAUUSD',
    interval,
    timezone:           'Asia/Bangkok',
    theme:              'dark',
    style:              '1',
    locale:             'en',
    backgroundColor:    'rgba(10, 14, 26, 1)',
    gridColor:          'rgba(255, 255, 255, 0.04)',
    hide_top_toolbar:   true,
    hide_legend:        true,
    withdateranges:     false,
    hide_side_toolbar:  true,
    allow_symbol_change:false,
    save_image:         false,
    enable_publishing:  false,
    support_host:       'https://www.tradingview.com',
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: rgba(10,14,26,1); overflow: hidden; }
    .tradingview-widget-container { width: 100%; height: 100%; }
    .tradingview-widget-container__widget { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div class="tradingview-widget-container">
    <div class="tradingview-widget-container__widget"></div>
    <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" async>
    ${JSON.stringify(config)}
    </script>
  </div>
</body>
</html>`;
}

export const TradingViewChart = () => {
  const [tf, setTf] = useState('15');
  const [blobUrl, setBlobUrl] = useState<string>('');
  const prevUrl = useRef<string>('');

  useEffect(() => {
    const html = buildWidgetHtml(tf);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    prevUrl.current = url;
    return () => { URL.revokeObjectURL(url); };
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
          <div style={{ width: '1px', height: '14px', background: 'var(--border2)', margin: '0 4px' }} />
          <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '11px', color: 'var(--text-muted)', cursor: 'default' }}>▲</span>
        </div>
      </div>

      {/* ── Chart body — blob iframe ── */}
      <div style={{ height: '200px', background: 'rgba(10,14,26,1)' }}>
        {blobUrl && (
          <iframe
            key={blobUrl}
            src={blobUrl}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="XAUUSD Chart"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        )}
      </div>
    </div>
  );
};
