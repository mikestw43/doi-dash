import { useState, type FormEvent } from 'react';
import { forgotPassword } from '../../services/api';
import { Logo } from '../ui/Logo';

interface Props {
  onBack: () => void;
}

/**
 * Ask for a reset link.
 *
 * The screen never says whether the address has an account. That is the
 * server's answer and this only repeats it: a form that replies "no such
 * user" is a way of finding out who has an account, and this is the last
 * place to be handing that out.
 */
export const ForgotPasswordPage = ({ onBack }: Props) => {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch {
      setError('Could not reach the server. Please try again.');
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
          RESET PASSWORD
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              color: 'var(--success)', letterSpacing: '1px', marginBottom: '12px',
            }}>CHECK YOUR EMAIL</div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
              color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '20px',
            }}>
              If that address has an account, a link to choose a new password
              is on its way. It expires in 30 minutes.
            </div>
            <button onClick={onBack} style={ghost}>← BACK TO LOGIN</button>
          </div>
        ) : (
          <form onSubmit={submit} autoComplete="off">
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
              color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '16px',
            }}>
              Enter the email address you registered with and we will send you
              a link to choose a new password.
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="trader@example.com"
                style={input}
                onFocus={e => (e.target.style.borderColor = 'var(--accent-blue)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
                autoFocus
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
              disabled={loading || !email.trim()}
              style={{
                width: '100%', padding: '11px', marginBottom: '10px',
                background: 'var(--accent-blue)', border: 'none',
                borderRadius: 'var(--radius-sm)', color: '#0d0f13',
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-label)',
                letterSpacing: '1px', cursor: loading ? 'wait' : 'pointer',
                opacity: loading || !email.trim() ? .5 : 1,
              }}
            >
              {loading ? 'SENDING…' : 'SEND RESET LINK'}
            </button>

            <button type="button" onClick={onBack} style={{ ...ghost, border: '1px solid var(--border2)', color: 'var(--text-muted)' }}>
              ← BACK TO LOGIN
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
