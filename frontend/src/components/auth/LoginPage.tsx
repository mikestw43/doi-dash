import { useState, type FormEvent } from 'react';
import { login } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await login(email, password);
      setAuth(token, user);
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="auth-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--bg-primary)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
      }}
    >
      <div className="auth-box">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
          <div
            style={{
              width: '38px', height: '38px',
              background: 'var(--accent-blue)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--glow-cyan)',
              flexShrink: 0,
            }}
          >
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
          letterSpacing: '1px', marginBottom: '16px',
          marginTop: '-12px',
        }}>
          Run fast, Climb high, Hold tight
        </div>

        {/* Title */}
        <div style={{
          fontFamily: "'Press Start 2P'", fontSize: '8px',
          color: 'var(--accent-blue)', letterSpacing: '3px',
          textAlign: 'center', marginBottom: '18px',
        }}>
          LOGIN
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          {/* Email */}
          <div style={{ marginBottom: '11px' }}>
            <label style={{
              fontFamily: "'Press Start 2P'", fontSize: '9px',
              color: 'var(--text-muted)', display: 'block',
              marginBottom: '4px', letterSpacing: '1px',
            }}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="trader@example.com"
              autoComplete="off"
              required
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border2)',
                color: 'var(--text-primary)',
                padding: '9px 11px',
                fontSize: '13px',
                fontFamily: "'Share Tech Mono'",
                outline: 'none',
                transition: 'border-color .15s',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent-blue)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '11px' }}>
            <label style={{
              fontFamily: "'Press Start 2P'", fontSize: '9px',
              color: 'var(--text-muted)', display: 'block',
              marginBottom: '4px', letterSpacing: '1px',
            }}>PASSWORD</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border2)',
                  color: 'var(--text-primary)',
                  padding: '9px 36px 9px 11px',
                  fontSize: '13px',
                  fontFamily: "'Share Tech Mono'",
                  outline: 'none',
                  transition: 'border-color .15s',
                }}
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
                  color: 'var(--text-muted)', padding: 0, lineHeight: 1,
                }}
              >
                <span style={{ fontSize: '13px', lineHeight: 1 }}>{showPw ? '◉' : '○'}</span>
              </button>
            </div>
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

          {/* Login button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px',
              background: loading ? 'rgba(56,189,248,.5)' : 'var(--accent-blue)',
              color: '#050d18',
              fontFamily: "'Press Start 2P'", fontSize: '8px',
              letterSpacing: '1px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '6px',
              boxShadow: 'var(--glow-cyan)',
              transition: 'opacity .15s',
            }}
          >
            {loading ? 'CONNECTING...' : 'LOGIN'}
          </button>

        </form>
      </div>
    </div>
  );
};
