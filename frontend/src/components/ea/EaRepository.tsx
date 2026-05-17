import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

const EA_VERSIONS = [
  {
    version: 'DOI DASH Reporter',
    tag: 'LATEST',
    tagColor: 'var(--green)',
    date: '2025-05-15',
    filename: 'DOI_DASH_Reporter.ex5',
    source: 'DOI_DASH_Reporter.mq5',
    size: '15.3 KB',
    features: [
      'Push account data every 2s via HTTP POST',
      'Reports equity, balance, profit, orders, pending',
      'Closed deals history sync',
      'Drawdown protection command support',
      'Close All / Open Trade / Set SL-TP commands',
      'API Key authentication',
    ],
    changelog: 'Initial DOI DASH release — rebranded from SENTINEL Reporter',
  },
  {
    version: 'SENTINEL Reporter v1.61',
    tag: 'STABLE',
    tagColor: 'var(--cyan)',
    date: '2025-03-13',
    filename: 'SENTINEL_Reporter_1.61.ex5',
    source: 'SENTINEL_Reporter_1.61.mq5',
    size: '52.1 KB',
    features: [
      'Push interval configurable (2–30s)',
      'Closed deals batch upload',
      'Command queue polling',
      'Telegram alert support',
    ],
    changelog: 'Bug fixes for large closed-deals payloads',
  },
  {
    version: 'SENTINEL Reporter v1.6',
    tag: null,
    tagColor: '',
    date: '2025-03-13',
    filename: 'SENTINEL_Reporter_1.6.ex5',
    source: null,
    size: '52.2 KB',
    features: ['Drawdown protection commands', 'Multi-account support'],
    changelog: 'Added drawdown protection & close-all command',
  },
  {
    version: 'SENTINEL Reporter v1.5',
    tag: null,
    tagColor: '',
    date: '2025-03-13',
    filename: 'SENTINEL_Reporter_1.5.ex5',
    source: 'SENTINEL_Reporter_1.5.mq5',
    size: '37.1 KB',
    features: ['Equity snapshots', 'Pending orders reporting'],
    changelog: 'Added equity snapshots and pending order sync',
  },
];

const INSTALL_STEPS = [
  { step: '01', text: 'Open MetaTrader 5 → File → Open Data Folder' },
  { step: '02', text: 'Navigate to MQL5 → Experts' },
  { step: '03', text: 'Copy .ex5 file into the Experts folder' },
  { step: '04', text: 'Restart MetaTrader 5 or refresh Navigator' },
  { step: '05', text: 'Drag EA onto any chart, set your API Key in settings' },
  { step: '06', text: 'Set ServerURL to your backend URL, enable AutoTrading' },
];

export const EaRepository = () => {
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Page header */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border2)',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)', color: 'var(--cyan)', letterSpacing: '1px' }}>
            EA REPOSITORY
          </div>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', marginTop: '6px' }}>
            MetaTrader 5 Expert Advisor — DOI DASH Reporter
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <a
            href="/ea/DOI_DASH_Reporter.ex5"
            download
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '8px 16px',
              background: 'rgba(56,189,248,.1)',
              border: '1px solid var(--cyan)',
              color: 'var(--cyan)',
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              cursor: 'pointer',
              textDecoration: 'none',
              letterSpacing: '.5px',
            }}
          >
            ⬇ DOWNLOAD EX5
          </a>
          {isAdmin && (
            <a
              href="/ea/DOI_DASH_Reporter.mq5"
              download
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '8px 16px',
                background: 'rgba(56,189,248,.05)',
                border: '1px solid var(--border2)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                cursor: 'pointer',
                textDecoration: 'none',
                letterSpacing: '.5px',
              }}
            >
              ⬇ SOURCE MQ5
            </a>
          )}
        </div>
      </div>

      {/* EA Version list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '1px', padding: '0 4px' }}>
          VERSION HISTORY
        </div>
        {EA_VERSIONS.map((ea, idx) => {
          const expanded = expandedIdx === idx;
          return (
            <div key={ea.filename} style={{
              background: 'var(--bg-card)',
              border: `1px solid ${expanded ? 'var(--border2)' : 'rgba(45,64,96,.5)'}`,
              transition: 'border-color .15s',
            }}>
              {/* Row header */}
              <button
                onClick={() => setExpandedIdx(expanded ? null : idx)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px',
                  cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left',
                }}
              >
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)', flex: 1 }}>
                  {ea.version}
                </span>
                {ea.tag && (
                  <span style={{
                    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                    padding: '3px 7px',
                    border: `1px solid ${ea.tagColor}`,
                    color: ea.tagColor,
                    background: `${ea.tagColor}15`,
                  }}>{ea.tag}</span>
                )}
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
                  {ea.date}
                </span>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
                  {ea.size}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
              </button>

              {/* Expanded detail */}
              {expanded && (
                <div style={{
                  borderTop: '1px solid var(--border2)',
                  padding: '14px 16px',
                  display: 'flex', gap: '24px',
                }}>
                  {/* Features */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: '10px' }}>
                      FEATURES
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {ea.features.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                          <span style={{ color: 'var(--green)', fontSize: '10px', flexShrink: 0, marginTop: '1px' }}>▸</span>
                          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{
                      marginTop: '12px', padding: '8px 12px',
                      background: 'rgba(56,189,248,.04)', border: '1px solid rgba(56,189,248,.15)',
                      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)',
                    }}>
                      {ea.changelog}
                    </div>
                  </div>
                  {/* Download buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '160px' }}>
                    <a
                      href={`/ea/${ea.filename}`}
                      download
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                        padding: '9px 14px',
                        background: 'rgba(56,189,248,.08)', border: '1px solid var(--cyan)',
                        color: 'var(--cyan)', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                        cursor: 'pointer', textDecoration: 'none', letterSpacing: '.5px',
                      }}
                    >
                      ⬇ .EX5
                    </a>
                    {ea.source && isAdmin && (
                      <a
                        href={`/ea/${ea.source}`}
                        download
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                          padding: '9px 14px',
                          background: 'none', border: '1px solid var(--border2)',
                          color: 'var(--text-muted)', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                          cursor: 'pointer', textDecoration: 'none', letterSpacing: '.5px',
                        }}
                      >
                        ⬇ .MQ5
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
          {INSTALL_STEPS.map(({ step, text }) => (
            <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <span style={{
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                color: 'var(--cyan)', flexShrink: 0, marginTop: '2px',
              }}>{step}</span>
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
