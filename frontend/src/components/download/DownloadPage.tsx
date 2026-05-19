import { useState } from 'react';

/** Platform-specific download card data — keep filenames in sync with frontend/public/ea/. */
const PLATFORMS = [
  {
    key: 'MT5' as const,
    label: 'MetaTrader 5',
    badge: 'RECOMMENDED',
    badgeColor: 'var(--green)',
    version: 'v1.3',
    filename: 'DOI_DASH_Reporter_v1.3.ex5',
    ext: '.EX5',
    dataFolderPath: 'MQL5 → Experts',
  },
  {
    key: 'MT4' as const,
    label: 'MetaTrader 4',
    badge: 'NEW',
    badgeColor: 'var(--cyan)',
    version: 'v1.3',
    filename: 'DOI_DASH_Reporter_v1.3.ex4',
    ext: '.EX4',
    dataFolderPath: 'MQL4 → Experts',
  },
];

const SERVER_URL = 'https://doi-dash-production.up.railway.app';

const INSTALL_STEPS = [
  'Open MetaTrader → File → Open Data Folder',
  'Navigate to MQL5/Experts (MT5) or MQL4/Experts (MT4)',
  'Copy the downloaded .ex5 / .ex4 into the Experts folder',
  'Restart MetaTrader or refresh Navigator',
  'Drag EA onto any chart, set your API Key',
  'Enable AutoTrading, add ServerURL to WebRequest whitelist',
];

export const DownloadPage = () => {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SERVER_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard API blocked — reveal so user can copy manually
      setRevealed(true);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Page header */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border2)',
        padding: '16px 20px',
      }}>
        <div style={{ fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)', color: 'var(--cyan)', letterSpacing: '1px' }}>
          DOWNLOAD EA
        </div>
        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', marginTop: '6px' }}>
          DOI DASH Reporter — pick your MetaTrader platform
        </div>
      </div>

      {/* Platform download cards — both shown side-by-side (no tab switching) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '12px',
      }}>
        {PLATFORMS.map(p => (
          <div key={p.key} style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border2)',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}>
            {/* Top row: label + badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-section)',
                color: 'var(--text-primary)', letterSpacing: '1px',
              }}>
                {p.label.toUpperCase()} {p.version}
              </span>
              <span style={{
                fontFamily: 'var(--ff-section)', fontSize: '10px',
                padding: '2px 6px',
                border: `1px solid ${p.badgeColor}`,
                color: p.badgeColor,
                background: `${p.badgeColor}15`,
              }}>{p.badge}</span>
            </div>

            {/* Filename */}
            <div style={{
              fontFamily: 'var(--ff-mono)', fontSize: 'var(--fs-body-sm)',
              color: 'var(--text-muted)',
              wordBreak: 'break-all',
            }}>
              {p.filename}
            </div>

            {/* Download button */}
            <a
              href={`/ea/${p.filename}`}
              download
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px 20px',
                background: 'rgba(56,189,248,.1)', border: '1px solid var(--cyan)',
                color: 'var(--cyan)', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                cursor: 'pointer', textDecoration: 'none', letterSpacing: '1px',
              }}
            >
              ⬇ DOWNLOAD {p.ext}
            </a>
          </div>
        ))}
      </div>

      {/* Installation guide */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border2)',
        padding: '16px 20px',
      }}>
        <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: '14px' }}>
          INSTALLATION GUIDE
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {INSTALL_STEPS.map((text, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <span style={{
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                color: 'var(--cyan)', flexShrink: 0, marginTop: '2px',
              }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>{text}</span>
            </div>
          ))}
        </div>

        {/* WebRequest whitelist — URL is blurred until copy is pressed */}
        <div style={{
          marginTop: '16px',
          padding: '10px 14px',
          background: 'rgba(250,204,21,.05)',
          border: '1px solid rgba(250,204,21,.25)',
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)',
        }}>
          <div style={{ color: 'var(--warning)', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '1px', marginBottom: '6px' }}>
            ⚠ WEBREQUEST WHITELIST
          </div>
          Tools → Options → Expert Advisors → Allow WebRequest for listed URL:

          <div style={{
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}>
            <span
              style={{
                fontFamily: 'var(--ff-mono)',
                color: 'var(--cyan)',
                wordBreak: 'break-all',
                flex: 1,
                minWidth: 0,
                userSelect: revealed ? 'text' : 'none',
                filter: revealed ? 'none' : 'blur(5px)',
                transition: 'filter .2s',
                cursor: revealed ? 'text' : 'pointer',
              }}
              onClick={() => setRevealed(true)}
              title={revealed ? '' : 'Click to reveal'}
            >
              {SERVER_URL}
            </span>
            <button
              onClick={handleCopy}
              style={{
                padding: '6px 12px',
                background: copied ? 'rgba(34,197,94,.15)' : 'rgba(56,189,248,.08)',
                border: `1px solid ${copied ? 'var(--green)' : 'var(--cyan)'}`,
                color: copied ? 'var(--green)' : 'var(--cyan)',
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                letterSpacing: '.5px',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all .15s',
              }}
            >
              {copied ? '✓ COPIED' : '⧉ COPY'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
