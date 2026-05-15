import { useState, type FormEvent } from 'react';
import { register } from '../../services/api';

interface Props {
  onBack: () => void;
}

export const SignUpPage = ({ onBack }: Props) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await register({ email, password, name: name || undefined });
      setDone(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Registration failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const inp: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border2)',
    color: 'var(--text-primary)',
    padding: '9px 11px',
    fontSize: '13px',
    fontFamily: "'Share Tech Mono'",
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color .15s',
  };
  const lbl: React.CSSProperties = {
    fontFamily: "'Press Start 2P'", fontSize: '9px',
    color: 'var(--text-muted)', display: 'block',
    marginBottom: '4px', letterSpacing: '1px',
  };

  return (
    <div
      className="auth-screen"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--bg-primary)',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        padding: '16px',
      }}
    >
      <div className="auth-box">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
          <div style={{
            width: '38px', height: '38px',
            background: 'var(--accent-blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--glow-cyan)', flexShrink: 0,
          }}>
            <span style={{ fontFamily: "'Press Start 2P'", fontSize: '13px', color: '#0c1422' }}>D</span>
          </div>
          <div style={{ fontFamily: "'Press Start 2P'", fontSize: '9px', color: 'var(--text-primary)', letterSpacing: '2px' }}>
            DOI DASH
          </div>
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily: "'Share Tech Mono'", fontSize: '10px',
          color: 'var(--text-muted)', textAlign: 'center',
          letterSpacing: '1px', marginBottom: '16px', marginTop: '-12px',
        }}>
          Run fast, Climb high, Hold tight
        </div>

        {/* Title */}
        <div style={{
          fontFamily: "'Press Start 2P'", fontSize: '8px',
          color: 'var(--accent-blue)', letterSpacing: '3px',
          textAlign: 'center', marginBottom: '18px',
        }}>
          SIGN UP
        </div>

        {done ? (
          /* Success state */
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '14px' }}>✅</div>
            <div style={{
              fontFamily: "'Press Start 2P'", fontSize: '7px',
              color: 'var(--success)', letterSpacing: '1px', marginBottom: '12px',
            }}>REGISTRATION SUBMITTED</div>
            <div style={{
              fontFamily: "'Share Tech Mono'", fontSize: '11px',
              color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '20px',
            }}>
              Your account is pending admin approval.<br />
              You will be notified when approved.
            </div>
            <button
              onClick={onBack}
              style={{
                width: '100%', padding: '11px',
                background: 'none', border: '1px solid var(--accent-blue)',
                color: 'var(--accent-blue)', fontFamily: "'Press Start 2P'",
                fontSize: '7px', letterSpacing: '1px', cursor: 'pointer',
              }}
            >
              ← BACK TO LOGIN
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} autoComplete="off">
            {/* Name */}
            <div style={{ marginBottom: '11px' }}>
              <label style={lbl}>NAME (OPTIONAL)</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                style={inp}
                onFocus={e => (e.target.style.borderColor = 'var(--accent-blue)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: '11px' }}>
              <label style={lbl}>EMAIL *</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="trader@example.com"
                required
                style={inp}
                onFocus={e => (e.target.style.borderColor = 'var(--accent-blue)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: '11px' }}>
              <label style={lbl}>PASSWORD *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  required
                  style={{ ...inp, paddingRight: '36px' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent-blue)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  tabIndex={-1}
                  style={{
                    position: 'absolute', right: '10px', top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 0, lineHeight: 1, fontSize: '13px',
                  }}
                >{showPw ? '◉' : '○'}</button>
              </div>
            </div>

            {/* Confirm Password */}
            <div style={{ marginBottom: '11px' }}>
              <label style={lbl}>CONFIRM PASSWORD *</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                required
                style={inp}
                onFocus={e => (e.target.style.borderColor = 'var(--accent-blue)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                fontSize: '10px', color: 'var(--danger)',
                marginBottom: '10px', padding: '7px 10px',
                background: 'rgba(239,68,68,.08)',
                border: '1px solid rgba(239,68,68,.3)',
                fontFamily: "'Share Tech Mono'",
              }}>
                ⚠ {error}
              </div>
            )}

            {/* Info */}
            <div style={{
              fontSize: '10px', color: 'var(--text-muted)',
              marginBottom: '12px', padding: '7px 10px',
              background: 'rgba(56,189,248,.04)',
              border: '1px solid rgba(56,189,248,.15)',
              fontFamily: "'Share Tech Mono'", lineHeight: 1.6,
            }}>
              ℹ Your account will be reviewed by an admin before activation.
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '11px',
                background: loading ? 'rgba(56,189,248,.5)' : 'var(--accent-blue)',
                color: '#050d18',
                fontFamily: "'Press Start 2P'", fontSize: '8px',
                letterSpacing: '1px', border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--glow-cyan)',
                transition: 'opacity .15s',
                marginBottom: '10px',
              }}
            >
              {loading ? 'SUBMITTING...' : 'SUBMIT REQUEST'}
            </button>

            {/* Back */}
            <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'Share Tech Mono'" }}>
              Already have an account?{' '}
              <span
                style={{ color: 'var(--accent-blue)', cursor: 'pointer' }}
                onClick={onBack}
              >LOGIN</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
