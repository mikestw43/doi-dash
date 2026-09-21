import { useState, type FormEvent } from 'react';
import { login, googleLogin } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { SignUpPage } from './SignUpPage';
import { GoogleAuth, googleEnabled } from './googleAuth';
import { Logo } from '../ui/Logo';
import { LanguageToggle } from '../ui/LanguageToggle';

const InfoModal = ({ title, message, onClose }: { title: string; message: string; onClose: () => void }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 99999,
    background: 'rgba(0,0,0,.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
  }} onClick={onClose}>
    <div style={{
      background: 'var(--bg-card)',
      border: '2px solid var(--accent-blue)',
      padding: '24px 28px',
      maxWidth: '340px', width: '100%',
    }} onClick={e => e.stopPropagation()}>
      <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '1px', marginBottom: '14px' }}>
        {title}
      </div>
      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '20px' }}>
        {message}
      </div>
      <button onClick={onClose} style={{
        width: '100%', padding: '9px',
        background: 'none', border: '1px solid var(--accent-blue)',
        color: 'var(--accent-blue)', fontFamily: 'var(--ff-section)',
        fontSize: 'var(--fs-label)', letterSpacing: '1px', cursor: 'pointer',
      }}>OK</button>
    </div>
  </div>
);

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const [showSignUp, setShowSignUp] = useState(false);
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

  /** Sends the OAuth access_token returned by useGoogleLogin to backend.
   *  Backend uses the token to fetch the user's profile from Google's
   *  userinfo endpoint and then mints our own JWT. */
  const finishGoogleLogin = async (accessToken: string) => {
    setError('');
    setLoading(true);
    try {
      const { token, user } = await googleLogin(accessToken);
      setAuth(token, user);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax.response?.data?.error || 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    {modal && <InfoModal title={modal.title} message={modal.message} onClose={() => setModal(null)} />}
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
        {/* Language — first thing on the page for anyone who cannot read the
            rest of it. Before signing in there is no Profile to go to. */}
        <LanguageToggle />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
          <Logo size={38} />
          <div style={{ fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)', color: 'var(--text-primary)', letterSpacing: '2px' }}>
            OnlyFunds
          </div>
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
          color: 'var(--text-muted)', textAlign: 'center',
          letterSpacing: '1px', marginBottom: '16px',
          marginTop: '-12px',
        }}>
          Run fast, Climb high, Hold tight
        </div>

        {/* Title */}
        <div style={{
          fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
          color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '3px',
          textAlign: 'center', marginBottom: '18px',
        }}>
          LOGIN
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          {/* Email */}
          <div style={{ marginBottom: '11px' }}>
            <label style={{
              fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-label)',
              color: 'var(--text-secondary)', fontWeight: 500, display: 'block',
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
                border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                padding: '9px 11px',
                fontSize: '13px',
                fontFamily: 'var(--ff-body)',
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
              fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-label)',
              color: 'var(--text-secondary)', fontWeight: 500, display: 'block',
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
                  border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  padding: '9px 36px 9px 11px',
                  fontSize: '13px',
                  fontFamily: 'var(--ff-body)',
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

          {/* Forgot password */}
          <div style={{ textAlign: 'right', margin: '-4px 0 10px', fontSize: 'var(--fs-body-sm)', fontFamily: 'var(--ff-body)', color: 'var(--text-muted)' }}>
            <span
              style={{ color: 'rgba(96,165,250,.5)', cursor: 'pointer' }}
              onClick={() => setModal({ title: 'FORGOT PASSWORD', message: 'Password reset is managed by your administrator. Please contact your admin to reset your password.' })}
            >Forgot password?</span>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              fontSize: 'var(--fs-micro)', color: 'var(--danger)',
              marginBottom: '10px', padding: '7px 10px',
              background: 'rgba(248,113,113,.08)',
              border: '1px solid rgba(248,113,113,.3)',
              fontFamily: 'var(--ff-body)',
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
              background: loading ? 'rgba(96,165,250,.5)' : 'var(--accent-blue)',
              color: '#212327',
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              letterSpacing: '1px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '6px',
              transition: 'opacity .15s',
            }}
          >
            {loading ? 'CONNECTING...' : 'LOGIN'}
          </button>

          {googleEnabled && (
            <>
              {/* Divider */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                margin: '12px 0', color: 'var(--text-muted)',
                fontSize: 'var(--fs-body-sm)', fontFamily: 'var(--ff-body)',
              }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border2)' }} />
                OR
                <div style={{ flex: 1, height: '1px', background: 'var(--border2)' }} />
              </div>

              {/* Custom retro Google button — GoogleAuth uses the popup flow
                  so Google always shows the standard account picker instead of
                  the FedCM personalized "Continue as X" button. */}
              <GoogleAuth
                onToken={finishGoogleLogin}
                onError={() => setError('Google login failed')}
              >
                {signIn => (
                  <button
                    type="button"
                    onClick={() => signIn()}
                    disabled={loading}
                    style={{
                      width: '100%', padding: '10px',
                      background: 'transparent',
                      border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--ff-input)', fontSize: 'var(--fs-input)',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
                      transition: 'border-color .15s',
                      opacity: loading ? 0.6 : 1,
                    }}
                    onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--text-primary)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border2)')}
                  >
                    <span style={{
                      fontSize: '16px', fontWeight: 700,
                      background: 'linear-gradient(135deg,#4285F4 25%,#EA4335 50%,#FBBC05 75%,#34A853 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      lineHeight: 1,
                    }}>G</span>
                    CONTINUE WITH GOOGLE
                  </button>
                )}
              </GoogleAuth>
            </>
          )}
        </form>

        {/* Footer */}
        <div style={{
          textAlign: 'center', fontSize: '11px',
          color: 'var(--text-muted)', marginTop: '14px',
          fontFamily: 'var(--ff-body)',
        }}>
          No account?{' '}
          <span
            style={{ color: 'var(--accent-blue)', cursor: 'pointer' }}
            onClick={() => setShowSignUp(true)}
          >SIGN UP</span>
        </div>
      </div>
    </div>
    {showSignUp && <SignUpPage onBack={() => setShowSignUp(false)} />}
    </>
  );
};
