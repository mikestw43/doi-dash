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

const FEATURES = [
  'Push account data every 2s via HTTP POST',
  'Reports equity, balance, today P/L, open + pending orders',
  'Closed deals history sync for trade-history page',
  'API Key authentication — one EA per account',
];

export const DownloadPage = () => {
  const [tab, setTab] = useState<'MT5' | 'MT4'>('MT5');
  const active = PLATFORMS.find(p => p.key === tab)!;

  const installSteps = [
    { step: '01', text: `Open ${active.label} → File → Open Data Folder` },
    { step: '02', text: `Navigate to ${active.dataFolderPath}` },
    { step: '03', text: `Copy ${active.ext.toLowerCase()} file into the Experts folder` },
    { step: '04', text: `Restart ${active.label} or refresh Navigator` },
    { step: '05', text: 'Drag EA onto any chart, set your API Key in settings' },
    { step: '06', text: 'Enable AutoTrading, add ServerURL to WebRequest whitelist' },
  ];

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
          DOI DASH Reporter — choose your MetaTrader platform
        </div>
      </div>

      {/* Platform tabs */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {PLATFORMS.map(p => {
          const isActive = p.key === tab;
          return (
            <button
              key={p.key}
              onClick={() => setTab(p.key)}
              style={{
                flex: 1,
                padding: '14px 16px',
                background: isActive ? 'var(--bg-card)' : 'rgba(56,189,248,.03)',
                border: `1px solid ${isActive ? 'var(--cyan)' : 'var(--border2)'}`,
                color: isActive ? 'var(--cyan)' : 'var(--text-muted)',
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                letterSpacing: '1px',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                transition: 'all .15s',
              }}
            >
              <span>{p.label.toUpperCase()}</span>
              <span style={{
                fontFamily: 'var(--ff-section)', fontSize: '10px',
                padding: '2px 6px',
                border: `1px solid ${p.badgeColor}`,
                color: p.badgeColor,
                background: `${p.badgeColor}15`,
              }}>{p.badge}</span>
            </button>
          );
        })}
      </div>

      {/* Active platform card */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border2)',
        padding: '20px',
        display: 'flex',
        gap: '24px',
        flexWrap: 'wrap',
      }}>
        {/* Left: details */}
        <div style={{ flex: 1, minWidth: '260px' }}>
          <div style={{ fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-section)', color: 'var(--text-primary)', letterSpacing: '1px' }}>
            DOI DASH REPORTER {active.version} — {active.label.toUpperCase()}
          </div>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', marginTop: '4px' }}>
            File: <span style={{ fontFamily: 'var(--ff-mono)' }}>{active.filename}</span>
          </div>

          <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '1px', marginTop: '18px', marginBottom: '8px' }}>
            FEATURES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: 'var(--green)', fontSize: '10px', flexShrink: 0, marginTop: '2px' }}>▸</span>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: download button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '200px', alignSelf: 'center' }}>
          <a
            href={`/ea/${active.filename}`}
            download
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '14px 22px',
              background: 'rgba(56,189,248,.1)', border: '1px solid var(--cyan)',
              color: 'var(--cyan)', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              cursor: 'pointer', textDecoration: 'none', letterSpacing: '1px',
            }}
          >
            ⬇ DOWNLOAD {active.ext}
          </a>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', textAlign: 'center' }}>
            Free · No registration
          </div>
        </div>
      </div>

      {/* Installation guide */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border2)',
        padding: '16px 20px',
      }}>
        <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: '14px' }}>
          INSTALLATION GUIDE — {active.label.toUpperCase()}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {installSteps.map(({ step, text }) => (
            <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <span style={{
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                color: 'var(--cyan)', flexShrink: 0, marginTop: '2px',
              }}>{step}</span>
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>{text}</span>
            </div>
          ))}
        </div>

        {/* WebRequest whitelist note — applies to both MT4 + MT5 */}
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
          <div style={{ fontFamily: 'var(--ff-mono)', color: 'var(--cyan)', marginTop: '4px', wordBreak: 'break-all' }}>
            https://doi-dash-production.up.railway.app
          </div>
        </div>
      </div>
    </div>
  );
};
