import { useState, useEffect, type FormEvent } from 'react';
import { checkResetToken, resetPassword } from '../../services/api';
import { Logo } from '../ui/Logo';

interface Props {
  token: string;
  /** Clears the token from the address bar and returns to the login screen. */
  onDone: () => void;
}

/**
 * Choose a new password, from the link in the email.
 *
 * The link is checked before the form is shown. An expired link that only
 * says so after a password has been typed twice is a small cruelty, and the
 * check costs one request.
 */
export const ResetPasswordPage = ({ token, onDone }: Props) => {
  const [state, setState]     = useState<'checking' | 'ready' | 'expired' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    let live = true;
    checkResetToken(token)
      .then(r => { if (live) setState(r.valid ? 'ready' : 'expired'); })
      .catch(() => { if (live) setState('expired'); });
    return () => { live = false; };
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('The two passwords do not match'); return; }
    setError('');
    setLoading(true);
    try {
      await resetPassword(token, password);
      setState('done');
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax.response?.data?.error || 'Could not reset the password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const input: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    background: 'var(--bg-input)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text)',
    fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
    outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s',
  };
  const lbl: React.CSSProperties = {
    fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-label)',
    color: 'var(--text-muted)', display: 'block',
    marginBottom: '4px', letterSpacing: '1px',
  };
  const ghost: React.CSSProperties = {
    width: '100%', padding: '11px', background: 'none',
    border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)',
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-label)',
    letterSpacing: '1px', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
  };
  const note: React.CSSProperties = {
    fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
    color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '20px',
  };

  return (
    <div
      className="auth-screen"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--bg-primary)', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', padding: '16px',
      }}
    >
      <div className="auth-box">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
          <Logo size={38} />
          <div style={{ fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)', color: 'var(--text-primary)', letterSpacing: '2px' }}>
            OnlyFunds
          </div>
        </div>

        <div style={{
          fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
          color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '3px',
          textAlign: 'center', marginBottom: '18px',
        }}>
          CHOOSE A NEW PASSWORD
        </div>

        {state === 'checking' && (
          <div style={{ ...note, textAlign: 'center' }}>Checking your link…</div>
        )}

        {state === 'expired' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              color: 'var(--danger)', letterSpacing: '1px', marginBottom: '12px',
            }}>LINK NO LONGER VALID</div>
            <div style={note}>
              This link has expired or has already been used.<br />
              Ask for a new one from the login screen.
            </div>
            <button onClick={onDone} style={ghost}>← BACK TO LOGIN</button>
          </div>
        )}

        {state === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              color: 'var(--success)', letterSpacing: '1px', marginBottom: '12px',
            }}>PASSWORD CHANGED</div>
            <div style={note}>You can sign in with your new password now.</div>
            <button onClick={onDone} style={ghost}>SIGN IN</button>
          </div>
        )}

        {state === 'ready' && (
          <form onSubmit={submit} autoComplete="off">
            <div style={{ marginBottom: '11px' }}>
              <label style={lbl}>NEW PASSWORD</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  style={{ ...input, paddingRight: '38px' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent-blue)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', right: '10px', top: '50%',
                    transform: 'translateY(-50%)', background: 'none',
                    border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                    padding: 0, lineHeight: 1, fontSize: '13px',
                  }}
                >{showPw ? '◉' : '○'}</button>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>CONFIRM PASSWORD</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Type it again"
                style={input}
                onFocus={e => (e.target.style.borderColor = 'var(--accent-blue)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
              />
            </div>

            {error && (
              <div style={{
                fontSize: 'var(--fs-micro)', color: 'var(--danger)',
                marginBottom: '10px', padding: '7px 10px',
                background: 'rgba(248,113,113,.08)',
                border: '1px solid rgba(248,113,113,.3)',
                fontFamily: 'var(--ff-body)',
              }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || !password || !confirm}
              style={{
                width: '100%', padding: '11px', marginBottom: '10px',
                background: 'var(--accent-blue)', border: 'none',
                borderRadius: 'var(--radius-sm)', color: '#0d0f13',
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-label)',
                letterSpacing: '1px', cursor: loading ? 'wait' : 'pointer',
                opacity: loading || !password || !confirm ? .5 : 1,
              }}
            >
              {loading ? 'SAVING…' : 'SET NEW PASSWORD'}
            </button>

            <button type="button" onClick={onDone} style={{ ...ghost, border: '1px solid var(--border2)', color: 'var(--text-muted)' }}>
              CANCEL
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
