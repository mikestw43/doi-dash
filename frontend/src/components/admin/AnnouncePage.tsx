import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'update' | 'maintenance';
  date: string;
  pinned?: boolean;
}

const TYPE_CFG = {
  info:        { label: 'INFO',        color: 'var(--cyan)',   bg: 'rgba(96,165,250,.08)',  icon: '◈' },
  warning:     { label: 'WARNING',     color: 'var(--yellow)', bg: 'rgba(251,191,36,.08)',  icon: '▲' },
  update:      { label: 'UPDATE',      color: 'var(--green)',  bg: 'rgba(52,211,153,.08)',   icon: '▸' },
  maintenance: { label: 'MAINTENANCE', color: 'var(--orange)', bg: 'rgba(251,146,60,.08)', icon: '⚙' },
};

const INITIAL: Announcement[] = [
  {
    id: '1',
    title: 'DOI DASH v2.0 — Full Redesign Live',
    body: 'The dashboard has been fully redesigned with the DOI DASH cyberpunk pixel-art design system. All components now use inline styles, Press Start 2P / VT323 / Share Tech Mono fonts, and the signature cyan glow aesthetic.',
    type: 'update',
    date: '2025-05-15',
    pinned: true,
  },
  {
    id: '2',
    title: 'New EA Reporter — DOI DASH v1.0',
    body: 'The EA has been rebranded and updated. Download the latest DOI_DASH_Reporter.ex5 from EA Repository. Compatible with MetaTrader 5 build 4000+.',
    type: 'update',
    date: '2025-05-15',
  },
  {
    id: '3',
    title: 'Scheduled Maintenance',
    body: 'Backend maintenance may cause brief disconnections. Railway containers restart on new deploys. Save your work before deployment windows.',
    type: 'maintenance',
    date: '2025-05-14',
  },
];

const emptyForm = { title: '', body: '', type: 'info' as Announcement['type'] };

export const AnnouncePage = () => {
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';

  const [announcements, setAnnouncements] = useState<Announcement[]>(INITIAL);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handlePost = () => {
    if (!form.title.trim() || !form.body.trim()) return;
    const now = new Date().toISOString().slice(0, 10);
    const newAnn: Announcement = {
      id: Math.random().toString(36).slice(2),
      title: form.title,
      body: form.body,
      type: form.type,
      date: now,
    };
    setAnnouncements(prev => [newAnn, ...prev]);
    setForm(emptyForm);
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    setAnnouncements(prev => prev.filter(a => a.id !== id));
    setDeleteId(null);
  };

  const pinned = announcements.filter(a => a.pinned);
  const regular = announcements.filter(a => !a.pinned);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border2)',
        padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)', color: 'var(--cyan)', letterSpacing: '1px' }}>
            ANNOUNCEMENTS
          </div>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', marginTop: '6px' }}>
            System updates, maintenance notices & release notes
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm(p => !p)}
            style={{
              padding: '8px 16px',
              background: showForm ? 'rgba(248,113,113,.1)' : 'rgba(96,165,250,.1)',
              border: `1px solid ${showForm ? 'var(--red)' : 'var(--cyan)'}`,
              color: showForm ? 'var(--red)' : 'var(--cyan)',
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              cursor: 'pointer', letterSpacing: '.5px',
            }}
          >
            {showForm ? '✕ CANCEL' : '+ POST'}
          </button>
        )}
      </div>

      {/* Post form (admin only) */}
      {isAdmin && showForm && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--cyan)',
          padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px',
        }}>
          <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--cyan)', letterSpacing: '1px' }}>
            NEW ANNOUNCEMENT
          </div>

          {/* Type selector */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {(Object.keys(TYPE_CFG) as Announcement['type'][]).map(t => {
              const cfg = TYPE_CFG[t];
              const active = form.type === t;
              return (
                <button
                  key={t}
                  onClick={() => setForm(p => ({ ...p, type: t }))}
                  style={{
                    padding: '5px 12px',
                    border: `1px solid ${active ? cfg.color : 'var(--border2)'}`,
                    background: active ? cfg.bg : 'none',
                    color: active ? cfg.color : 'var(--text-muted)',
                    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                    cursor: 'pointer', letterSpacing: '.5px',
                  }}
                >
                  {cfg.icon} {cfg.label}
                </button>
              );
            })}
          </div>

          <input
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="Title..."
            style={{
              background: 'var(--bg-card2)', border: '1px solid var(--border2)',
              color: 'var(--text)', fontFamily: 'var(--ff-input)', fontSize: 'var(--fs-input)',
              padding: '9px 12px', outline: 'none',
            }}
          />
          <textarea
            value={form.body}
            onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
            placeholder="Message body..."
            rows={4}
            style={{
              background: 'var(--bg-card2)', border: '1px solid var(--border2)',
              color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
              padding: '9px 12px', outline: 'none', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handlePost}
              style={{
                padding: '9px 20px',
                background: 'rgba(52,211,153,.1)', border: '1px solid var(--green)',
                color: 'var(--green)', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                cursor: 'pointer', letterSpacing: '.5px',
              }}
            >
              ▸ POST
            </button>
          </div>
        </div>
      )}

      {/* Pinned */}
      {pinned.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '1px', padding: '0 4px' }}>
            PINNED
          </div>
          {pinned.map(a => <AnnCard key={a.id} ann={a} isAdmin={isAdmin} onDelete={setDeleteId} />)}
        </div>
      )}

      {/* Regular */}
      {regular.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pinned.length > 0 && (
            <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '1px', padding: '0 4px' }}>
              RECENT
            </div>
          )}
          {regular.map(a => <AnnCard key={a.id} ann={a} isAdmin={isAdmin} onDelete={setDeleteId} />)}
        </div>
      )}

      {announcements.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          fontFamily: 'var(--ff-input)', fontSize: 'var(--fs-input)', color: 'var(--text-muted)',
        }}>
          No announcements yet
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 800,
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--red)',
            padding: '24px 28px', minWidth: '320px',
          }}>
            <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--red)', marginBottom: '12px' }}>
              DELETE ANNOUNCEMENT
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', marginBottom: '20px' }}>
              This action cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteId(null)} style={{
                padding: '8px 16px', background: 'none', border: '1px solid var(--border2)',
                color: 'var(--text-muted)', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', cursor: 'pointer',
              }}>CANCEL</button>
              <button onClick={() => handleDelete(deleteId)} style={{
                padding: '8px 16px', background: 'rgba(248,113,113,.1)', border: '1px solid var(--red)',
                color: 'var(--red)', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', cursor: 'pointer',
              }}>DELETE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AnnCard = ({ ann, isAdmin, onDelete }: {
  ann: Announcement;
  isAdmin: boolean;
  onDelete: (id: string) => void;
}) => {
  const cfg = TYPE_CFG[ann.type];
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border2)',
      borderLeft: `3px solid ${cfg.color}`,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <span style={{ fontSize: '16px', color: cfg.color, flexShrink: 0, marginTop: '2px' }}>{cfg.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <span style={{ fontFamily: 'var(--ff-input)', fontSize: 'var(--fs-input)', color: 'var(--text)', fontWeight: 600 }}>
              {ann.title}
            </span>
            {ann.pinned && (
              <span style={{
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '2px 6px',
                border: '1px solid var(--yellow)', color: 'var(--yellow)', background: 'rgba(251,191,36,.06)',
              }}>PINNED</span>
            )}
            <span style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '2px 6px',
              border: `1px solid ${cfg.color}`, color: cfg.color, background: cfg.bg,
            }}>{cfg.label}</span>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {ann.date}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {ann.body}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => onDelete(ann.id)}
            style={{
              padding: '4px 8px', background: 'none', border: '1px solid transparent',
              color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--red)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(248,113,113,.3)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};
