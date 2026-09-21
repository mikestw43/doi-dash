import { useMemo, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useTranslation } from '../../i18n/useTranslation';

// ─── Shape ───────────────────────────────────────────────────────────────────
//
// One entry is a *thing* (an EA, an indicator, a script), not a file: the
// screenshots, the .set presets and the older builds all hang off it. That is
// what keeps "version 1.1 of the reporter" and "the preset that goes with it"
// in the same place instead of two unrelated uploads.

type EaType = 'MT5 EA' | 'MT4 EA' | 'Indicator' | 'Script' | 'Source' | 'Other';

interface EaImage {
  id: string;
  /** Empty in the mock — the real one gets an uploaded URL. */
  url: string;
  caption: string;
}

interface EaFile {
  id: string;
  filename: string;
  /** What this file is for: the build itself, a preset, an older version. */
  label: string;
  size: string;
  uploadedAt: string;
}

interface EaItem {
  id: string;
  name: string;
  type: EaType;
  description: string;
  images: EaImage[];
  files: EaFile[];
  updatedAt: string;
}

const TYPE_COLORS: Record<EaType, string> = {
  'MT5 EA':    'var(--accent-blue)',
  'MT4 EA':    'var(--cyan)',
  'Indicator': 'var(--success)',
  'Script':    'var(--warning)',
  'Source':    'var(--text-muted)',
  'Other':     'var(--text-muted)',
};

// ─── Mock data ───────────────────────────────────────────────────────────────
// Stand-in content so the layout can be judged before the backend exists.
// Delete this block when the API lands.
const MOCK: EaItem[] = [
  {
    id: '1',
    name: 'OnlyFunds Reporter',
    type: 'MT5 EA',
    description:
      'Reports balance, equity, open positions and realized P/L to the OnlyFunds dashboard every 2 seconds. '
      + 'Needs the dashboard URL in the WebRequest whitelist.',
    images: [
      { id: 'i1', url: '', caption: 'Inputs tab' },
      { id: 'i2', url: '', caption: 'Experts log' },
    ],
    files: [
      { id: 'f1', filename: 'OnlyFunds_Reporter_v1.1.ex5', label: 'Current build',   size: '20.5 KB', uploadedAt: '2026-09-21' },
      { id: 'f2', filename: 'OnlyFunds_Reporter_v1.1.mq5', label: 'Source',          size: '15.8 KB', uploadedAt: '2026-09-21' },
      { id: 'f3', filename: 'default.set',                 label: 'Preset',          size: '0.4 KB',  uploadedAt: '2026-09-21' },
      { id: 'f4', filename: 'OnlyFunds_Reporter_v1.0.ex5', label: 'Previous build',  size: '20.1 KB', uploadedAt: '2026-09-20' },
    ],
    updatedAt: '2026-09-21',
  },
  {
    id: '2',
    name: 'HoldBro',
    type: 'MT5 EA',
    description: 'Grid / recovery EA. Presets per account size are attached below.',
    images: [{ id: 'i3', url: '', caption: 'Panel on XAUUSD' }],
    files: [
      { id: 'f5', filename: 'HoldBro_v6.2.0.ex5', label: 'Current build', size: '412 KB', uploadedAt: '2026-09-14' },
      { id: 'f6', filename: 'cent_5k.set',        label: 'Preset · cent 5k', size: '1.1 KB', uploadedAt: '2026-09-14' },
      { id: 'f7', filename: 'cent_50k.set',       label: 'Preset · cent 50k', size: '1.1 KB', uploadedAt: '2026-09-14' },
    ],
    updatedAt: '2026-09-14',
  },
  {
    id: '3',
    name: 'Session Marker',
    type: 'Indicator',
    description: 'Shades the Tokyo / London / New York sessions on any timeframe.',
    images: [],
    files: [
      { id: 'f8', filename: 'SessionMarker.ex5', label: 'Current build', size: '38 KB', uploadedAt: '2026-08-30' },
    ],
    updatedAt: '2026-08-30',
  },
];

// ─── Small pieces ────────────────────────────────────────────────────────────

const TypeBadge = ({ type }: { type: EaType }) => (
  <span style={{
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px',
    padding: '2px 7px', whiteSpace: 'nowrap',
    border: `1px solid ${TYPE_COLORS[type]}`, borderRadius: 'var(--radius-sm)',
    color: TYPE_COLORS[type],
  }}>{type}</span>
);

/** Placeholder tile. The real one renders the uploaded image. */
const Thumb = ({ image, size = 44 }: { image?: EaImage; size?: number }) => (
  <div
    title={image?.caption}
    style={{
      width: size, height: size, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-input)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-sm)',
      color: 'var(--text-dim)', fontSize: `${Math.round(size / 2.6)}px`,
    }}
  >
    {image ? '▤' : '·'}
  </div>
);

const Btn = ({ label, onClick, tone = 'ghost' }: {
  label: string; onClick: () => void; tone?: 'ghost' | 'primary' | 'danger';
}) => {
  const colors = {
    ghost:   { fg: 'var(--text-dim)',    bd: 'var(--border2)',            bg: 'transparent' },
    primary: { fg: 'var(--accent-blue)', bd: 'var(--accent-blue)',        bg: 'rgba(96,165,250,.1)' },
    danger:  { fg: 'var(--danger)',      bd: 'rgba(248,113,113,.5)',      bg: 'transparent' },
  }[tone];
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px',
        padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
        border: `1px solid ${colors.bd}`, borderRadius: 'var(--radius-sm)',
        background: colors.bg, color: colors.fg,
      }}
    >{label}</button>
  );
};

// ─── Detail ──────────────────────────────────────────────────────────────────

const DetailModal = ({ item, isAdmin, onClose }: {
  item: EaItem; isAdmin: boolean; onClose: () => void;
}) => {
  const t = useTranslation();
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-card)',
          width: '100%', maxWidth: '620px', maxHeight: '100%',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* header */}
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'flex-start', gap: '10px',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)',
              color: 'var(--text-primary)', marginBottom: '6px',
            }}>{item.name}</div>
            <TypeBadge type={item.type} />
          </div>
          <Btn label={t('ea.close')} onClick={onClose} />
        </div>

        {/* body */}
        <div style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
            color: 'var(--text-primary)', lineHeight: 1.6, margin: 0,
          }}>{item.description}</p>

          <section>
            <SectionLabel>{t('ea.images')} · {item.images.length}</SectionLabel>
            {item.images.length === 0 ? (
              <Muted>{t('ea.no_images')}</Muted>
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {item.images.map(img => (
                  <div key={img.id} style={{ textAlign: 'center' }}>
                    <Thumb image={img} size={92} />
                    <div style={{
                      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
                      color: 'var(--text-dim)', marginTop: '4px', maxWidth: '92px',
                    }}>{img.caption}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionLabel>{t('ea.files')} · {item.files.length}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {item.files.map(f => (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 10px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
                      color: 'var(--text-primary)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{f.filename}</div>
                    <div style={{
                      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
                      color: 'var(--text-dim)', marginTop: '2px',
                    }}>{f.label} · {f.size} · {f.uploadedAt}</div>
                  </div>
                  <Btn label={t('ea.download')} onClick={() => {}} />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* admin footer */}
        {isAdmin && (
          <div style={{
            padding: '10px 16px', borderTop: '1px solid var(--border-color)',
            display: 'flex', gap: '8px',
          }}>
            <Btn label={t('ea.edit')} onClick={() => {}} tone="primary" />
            <Btn label={t('ea.delete')} onClick={() => {}} tone="danger" />
          </div>
        )}
      </div>
    </div>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)',
    color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '8px',
  }}>{children}</div>
);

const Muted = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)',
  }}>{children}</div>
);

// ─── Page ────────────────────────────────────────────────────────────────────

export const EaRepository = () => {
  const t = useTranslation();
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  // Reuses the dashboard's card/table preference so the two lists agree.
  const viewMode = useUIStore(s => s.botViewMode);
  const setViewMode = useUIStore(s => s.setBotViewMode);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | EaType>('all');
  const [open, setOpen] = useState<EaItem | null>(null);

  const items = MOCK;
  const filtered = useMemo(() => items.filter(i => {
    if (typeFilter !== 'all' && i.type !== typeFilter) return false;
    const q = search.trim().toLowerCase();
    return !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q);
  }), [items, search, typeFilter]);

  const types = [...new Set(items.map(i => i.type))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* ── Header ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '7px', height: '7px', background: 'var(--accent-blue)', flexShrink: 0 }} />
          <span style={{
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
            color: 'var(--text-primary)', letterSpacing: '2px',
          }}>{t('ea.title')}</span>
          {/* States plainly what this account may do, rather than hiding the
              buttons and leaving a viewer wondering. */}
          <span style={{
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px',
            padding: '2px 7px', borderRadius: 'var(--radius-sm)',
            border: `1px solid ${isAdmin ? 'var(--accent-blue)' : 'var(--border2)'}`,
            color: isAdmin ? 'var(--accent-blue)' : 'var(--text-dim)',
          }}>{isAdmin ? t('ea.admin_only') : t('ea.view_only')}</span>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
          {isAdmin && <Btn label={t('ea.add')} onClick={() => {}} tone="primary" />}
        </div>
        <p style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
          color: 'var(--text-dim)', marginLeft: '15px',
        }}>{t('ea.subtitle')}</p>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('ea.search')}
          style={{
            flex: '1 1 140px', minWidth: 0,
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-input)',
            padding: '6px 10px',
            background: 'var(--bg-input)', color: 'var(--text-primary)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
          }}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as 'all' | EaType)}
          style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-input)',
            padding: '6px 10px',
            background: 'var(--bg-input)', color: 'var(--text-primary)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
          }}
        >
          <option value="all">{t('ea.all_types')}</option>
          {types.map(ty => <option key={ty} value={ty}>{ty}</option>)}
        </select>
        <Btn
          label={viewMode === 'card' ? `▤ ${t('filter.table')}` : `▦ ${t('filter.cards')}`}
          onClick={() => setViewMode(viewMode === 'card' ? 'table' : 'card')}
        />
      </div>

      {/* ── List ── */}
      {filtered.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px dashed var(--border2)',
          borderRadius: 'var(--radius-card)', padding: '36px 20px', textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
            color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '6px',
          }}>{items.length === 0 ? t('ea.empty') : t('ea.no_match')}</div>
          {items.length === 0 && <Muted>{t('ea.empty_hint')}</Muted>}
        </div>
      ) : viewMode === 'table' ? (
        <TableView items={filtered} onOpen={setOpen} />
      ) : (
        <CardView items={filtered} onOpen={setOpen} />
      )}

      {open && <DetailModal item={open} isAdmin={isAdmin} onClose={() => setOpen(null)} />}
    </div>
  );
};

// ─── Views ───────────────────────────────────────────────────────────────────

interface ViewProps {
  items: EaItem[];
  onOpen: (item: EaItem) => void;
}

const TableView = ({ items, onOpen }: ViewProps) => {
  const t = useTranslation();
  return (
    <div className="ea-wrap">
      <table>
        <thead>
          <tr>
            <th className="ea-col-name">{t('ea.name')}</th>
            <th className="ea-col-type">{t('ea.type')}</th>
            <th className="ea-col-desc">{t('ea.description')}</th>
            <th className="ea-col-count">{t('ea.files')}</th>
            <th className="ea-col-count">{t('ea.images')}</th>
            <th className="ea-col-date">{t('ea.updated')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="ea-row" onClick={() => onOpen(item)}>
              <td className="ea-col-name">{item.name}</td>
              <td className="ea-col-type"><TypeBadge type={item.type} /></td>
              <td className="ea-col-desc"><span className="ea-desc">{item.description}</span></td>
              <td className="ea-col-count">{item.files.length}</td>
              <td className="ea-col-count">{item.images.length}</td>
              <td className="ea-col-date">{item.updatedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <style>{`
        .ea-wrap {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-card);
          overflow: hidden;
        }
        .ea-wrap table { width: 100%; table-layout: fixed; border-collapse: collapse; }
        .ea-wrap th {
          font-family: var(--ff-section); font-size: var(--fs-micro);
          color: var(--text-dim); letter-spacing: .5px; font-weight: 400;
          text-align: left; padding: 8px 10px; white-space: nowrap;
          background: var(--bg-card2); border-bottom: 1px solid var(--border2);
        }
        .ea-wrap td {
          padding: 9px 10px;
          font-family: var(--ff-body); font-size: var(--fs-body-sm);
          color: var(--text-primary);
          border-bottom: 1px solid rgba(42,45,52,.35);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ea-wrap .ea-row { cursor: pointer; }
        .ea-wrap .ea-row:hover td { background: rgba(42,45,52,.25); }
        .ea-wrap .ea-desc { color: var(--text-dim); }

        .ea-wrap .ea-col-name  { width: 22%; }
        .ea-wrap .ea-col-type  { width: 14%; }
        .ea-wrap .ea-col-desc  { width: 38%; }
        .ea-wrap .ea-col-count { width: 8%; text-align: right; }
        .ea-wrap .ea-col-date  { width: 14%; color: var(--text-dim); }

        @media (max-width: 768px) {
          /* Description and the counts are what a phone can afford to lose;
             the name, its type and when it last moved are what you scan for. */
          .ea-wrap .ea-col-desc, .ea-wrap .ea-col-count { display: none; }
          .ea-wrap th, .ea-wrap td { padding: 7px 8px; }
          .ea-wrap .ea-col-name { width: 46%; }
          .ea-wrap .ea-col-type { width: 28%; }
          .ea-wrap .ea-col-date { width: 26%; }
        }
      `}</style>
    </div>
  );
};

const CardView = ({ items, onOpen }: ViewProps) => {
  const t = useTranslation();
  return (
    <div className="ea-grid">
      {items.map(item => (
        <div key={item.id} className="ea-card" onClick={() => onOpen(item)}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <Thumb image={item.images[0]} size={52} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
                color: 'var(--text-primary)', fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{item.name}</div>
              <div style={{ marginTop: '5px' }}><TypeBadge type={item.type} /></div>
            </div>
          </div>

          <p className="ea-card-desc">{item.description}</p>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            paddingTop: '8px', borderTop: '1px solid var(--border-color)',
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)', color: 'var(--text-dim)',
          }}>
            <span>▤ {item.files.length} {t('ea.files')}</span>
            <span>▦ {item.images.length} {t('ea.images')}</span>
            <span style={{ marginLeft: 'auto' }}>{item.updatedAt}</span>
          </div>
        </div>
      ))}

      <style>{`
        .ea-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 10px;
        }
        .ea-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-card);
          padding: 12px;
          display: flex; flex-direction: column; gap: 10px;
          cursor: pointer;
          transition: border-color .15s;
        }
        .ea-card:hover { border-color: var(--accent-blue); }
        .ea-card-desc {
          margin: 0;
          font-family: var(--ff-body); font-size: var(--fs-body-sm);
          color: var(--text-dim); line-height: 1.45;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden;
        }
        @media (max-width: 768px) {
          .ea-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};
