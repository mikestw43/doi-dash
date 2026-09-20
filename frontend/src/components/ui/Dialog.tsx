import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export const Dialog = ({ open, onClose, title, children }: DialogProps) => {
  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)' }}
      />
      {/* dialog */}
      <div style={{
        position: 'relative', background: 'var(--bg-card)',
        border: '2px solid var(--border2)',
        width: '100%', maxWidth: '440px',
      }}>
        {/* corner brackets */}
        <div style={{ position: 'absolute', top: '6px', left: '6px', width: '12px', height: '12px', borderTop: '2px solid var(--cyan)', borderLeft: '2px solid var(--cyan)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '6px', right: '6px', width: '12px', height: '12px', borderBottom: '2px solid var(--cyan)', borderRight: '2px solid var(--cyan)', pointerEvents: 'none' }} />

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: '1px solid var(--border2)' }}>
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '1px' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '13px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '18px' }}>{children}</div>
      </div>
    </div>
  );
};
