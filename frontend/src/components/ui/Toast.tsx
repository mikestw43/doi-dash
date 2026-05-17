import { useUIStore } from '../../stores/uiStore';

const ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
const COLORS = {
  success: 'var(--green)',
  error:   'var(--red)',
  warning: 'var(--yellow)',
  info:    'var(--cyan)',
};

export const ToastContainer = () => {
  const { toasts, removeToast } = useUIStore();

  return (
    <div style={{
      position: 'fixed', bottom: '16px', right: '16px',
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px',
      maxWidth: '320px', pointerEvents: 'none',
    }}>
      {toasts.map(toast => {
        const c = COLORS[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              background: 'var(--bg-card)', border: `1px solid ${c}55`,
              padding: '11px 14px',
              boxShadow: `4px 4px 0 ${c}33`,
              position: 'relative',
              pointerEvents: 'auto',
            }}
          >
            {/* corner bracket */}
            <div style={{ position: 'absolute', top: '4px', left: '4px', width: '8px', height: '8px', borderTop: `2px solid ${c}`, borderLeft: `2px solid ${c}`, pointerEvents: 'none' }} />
            <span style={{ color: c, fontFamily: 'var(--ff-input)', fontSize: 'var(--fs-input)', flexShrink: 0, marginTop: '1px' }}>
              {ICONS[toast.type]}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)' }}>{toast.title}</div>
              {toast.message && (
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginTop: '3px' }}>
                  {toast.message}
                </div>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0, fontSize: '12px', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
};
