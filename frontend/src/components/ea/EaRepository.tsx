import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

type EaEntry = {
  version: string;
  tag: string | null;
  tagColor: string;
  date: string;
  filename: string;
  source: string | null;
  size: string;
  platform: 'MT4' | 'MT5';
  features: string[];
  changelog: string;
};

const EA_VERSIONS: EaEntry[] = [];

export const EaRepository = () => {
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

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
            Admin · upload + manage MetaTrader Expert Advisors
          </div>
        </div>
      </div>

      {/* Version list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '1px', padding: '0 4px' }}>
          VERSION HISTORY
        </div>

        {EA_VERSIONS.length === 0 ? (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px dashed var(--border2)',
            padding: '32px 20px',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: '8px' }}>
              NO EA VERSIONS YET
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
              EA upload UI is coming soon. For now, public downloads are available on the Download page.
            </div>
          </div>
        ) : (
          EA_VERSIONS.map((ea, idx) => {
            const expanded = expandedIdx === idx;
            return (
              <div key={ea.filename} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${expanded ? 'var(--border2)' : 'rgba(45,64,96,.5)'}`,
                transition: 'border-color .15s',
              }}>
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
                  <span style={{
                    fontFamily: 'var(--ff-section)', fontSize: '10px',
                    padding: '2px 6px',
                    border: '1px solid var(--border2)',
                    color: 'var(--text-muted)',
                  }}>{ea.platform}</span>
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

                {expanded && (
                  <div style={{
                    borderTop: '1px solid var(--border2)',
                    padding: '14px 16px',
                    display: 'flex', gap: '24px',
                  }}>
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
                        ⬇ {ea.platform === 'MT4' ? '.EX4' : '.EX5'}
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
                          ⬇ {ea.platform === 'MT4' ? '.MQ4' : '.MQ5'}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
