import { useState, useEffect } from 'react';
import { changePassword } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';

interface Props {
  onClose: () => void;
}

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-input)',
  padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-label)', color: 'var(--text-dim)',
  letterSpacing: '.5px', display: 'block', marginBottom: '6px',
};

export const ChangePasswordModal = ({ onClose }: Props) => {
  const addToast = useUIStore(s => s.addToast);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const handleSave = async () => {
    setErr('');
    if (newPw !== confirmPw) { setErr('Passwords do not match'); return; }
    if (newPw.length < 6) { setErr('Min 6 characters required'); return; }
    setSaving(true);
    try {
      await changePassword({ currentPassword: currentPw, newPassword: newPw });
      addToast({ type: 'success', title: 'Password changed' });
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed';
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', border: '2px solid var(--border2)',
          padding: '22px 24px', maxWidth: '420px', width: '100%',
        }}
      >
        <div style={{
          fontFamily: "'Press Start 2P'", fontSize: 'var(--fs-section)', color: 'var(--yellow)',
          letterSpacing: '1px', marginBottom: '18px',
        }}>
          CHANGE PASSWORD
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={lbl}>CURRENT PASSWORD</label>
          <input style={inp} type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="••••••••" />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={lbl}>NEW PASSWORD</label>
          <input style={inp} type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="min 6 characters" />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={lbl}>CONFIRM PASSWORD</label>
          <input style={inp} type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="••••••••" />
        </div>

        {err && (
          <div style={{
            fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-body-sm)', color: 'var(--red)',
            marginBottom: '12px', padding: '7px 10px',
            background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.3)',
          }}>⚠ {err}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            onClick={onClose}
            style={{
              fontFamily: "'Press Start 2P'", fontSize: 'var(--fs-section)', letterSpacing: '.5px',
              padding: '9px 16px', background: 'none', color: 'var(--text)',
              border: '1px solid var(--border2)', cursor: 'pointer',
            }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !currentPw || !newPw || !confirmPw}
            style={{
              fontFamily: "'Press Start 2P'", fontSize: 'var(--fs-section)', letterSpacing: '.5px',
              padding: '9px 16px', background: 'var(--yellow)', color: '#16181c',
              border: '1px solid var(--yellow)',
              cursor: (saving || !currentPw || !newPw || !confirmPw) ? 'not-allowed' : 'pointer',
              opacity: (saving || !currentPw || !newPw || !confirmPw) ? .5 : 1,
            }}
          >
            {saving ? 'SAVING...' : 'CHANGE'}
          </button>
        </div>
      </div>
    </div>
  );
};
