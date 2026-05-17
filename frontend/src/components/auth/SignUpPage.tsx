import { useState, type FormEvent } from 'react';
import { register } from '../../services/api';

// Common country codes
const COUNTRY_CODES = [
  { code: '+66', flag: '🇹🇭', name: 'Thailand' },
  { code: '+1',  flag: '🇺🇸', name: 'USA / Canada' },
  { code: '+44', flag: '🇬🇧', name: 'UK' },
  { code: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: '+65', flag: '🇸🇬', name: 'Singapore' },
  { code: '+60', flag: '🇲🇾', name: 'Malaysia' },
  { code: '+62', flag: '🇮🇩', name: 'Indonesia' },
  { code: '+63', flag: '🇵🇭', name: 'Philippines' },
  { code: '+84', flag: '🇻🇳', name: 'Vietnam' },
  { code: '+86', flag: '🇨🇳', name: 'China' },
  { code: '+81', flag: '🇯🇵', name: 'Japan' },
  { code: '+82', flag: '🇰🇷', name: 'South Korea' },
  { code: '+91', flag: '🇮🇳', name: 'India' },
  { code: '+971', flag: '🇦🇪', name: 'UAE' },
  { code: '+7',  flag: '🇷🇺', name: 'Russia' },
  { code: '+49', flag: '🇩🇪', name: 'Germany' },
  { code: '+33', flag: '🇫🇷', name: 'France' },
  { code: '+55', flag: '🇧🇷', name: 'Brazil' },
];

interface Props {
  onBack: () => void;
}

export const SignUpPage = ({ onBack }: Props) => {
  const [name, setName]               = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail]             = useState('');
  const [phoneCountry, setPhoneCountry] = useState('+66');
  const [mobile, setMobile]           = useState('');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [agreed, setAgreed]           = useState(false);
  const [showPw, setShowPw]           = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [done, setDone]               = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!agreed) { setError('Please agree to the Terms & Conditions'); return; }
    setLoading(true);
    try {
      await register({
        email,
        password,
        name: name || displayName || undefined,
        mobile: mobile ? mobile : undefined,
        phoneCountry: mobile ? phoneCountry : undefined,
      });
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
    fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)',
    color: 'var(--text-muted)', display: 'block',
    marginBottom: '4px', letterSpacing: '1px',
  };
  const focusOn  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.target.style.borderColor = 'var(--accent-blue)');
  const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.target.style.borderColor = 'var(--border2)');

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
          <div style={{ fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)', color: 'var(--text-primary)', letterSpacing: '2px' }}>
            DOI DASH
          </div>
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
          color: 'var(--text-muted)', textAlign: 'center',
          letterSpacing: '1px', marginBottom: '16px', marginTop: '-12px',
        }}>
          Run fast, Climb high, Hold tight
        </div>

        {/* Title */}
        <div style={{
          fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
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
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              color: 'var(--success)', letterSpacing: '1px', marginBottom: '12px',
            }}>REGISTRATION SUBMITTED</div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
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

            {/* Full Name */}
            <div style={{ marginBottom: '11px' }}>
              <label style={lbl}>FULL NAME *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your full name"
                required
                style={inp}
                onFocus={focusOn}
                onBlur={focusOff}
              />
            </div>

            {/* Display Name */}
            <div style={{ marginBottom: '11px' }}>
              <label style={lbl}>DISPLAY NAME <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', opacity: .6 }}>(optional)</span></label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Nickname / alias"
                style={inp}
                onFocus={focusOn}
                onBlur={focusOff}
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
                onFocus={focusOn}
                onBlur={focusOff}
              />
            </div>

            {/* Mobile */}
            <div style={{ marginBottom: '11px' }}>
              <label style={lbl}>MOBILE <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', opacity: .6 }}>(optional)</span></label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select
                  value={phoneCountry}
                  onChange={e => setPhoneCountry(e.target.value)}
                  style={{
                    ...inp,
                    width: 'auto', flexShrink: 0,
                    padding: '9px 8px',
                    cursor: 'pointer',
                  }}
                  onFocus={focusOn}
                  onBlur={focusOff}
                >
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  value={mobile}
                  onChange={e => setMobile(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0812345678"
                  style={{ ...inp, flex: 1 }}
                  onFocus={focusOn}
                  onBlur={focusOff}
                />
              </div>
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
                  onFocus={focusOn}
                  onBlur={focusOff}
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
                onFocus={focusOn}
                onBlur={focusOff}
              />
            </div>

            {/* Terms & Conditions */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                cursor: 'pointer',
              }}>
                <div
                  onClick={() => setAgreed(a => !a)}
                  style={{
                    width: '16px', height: '16px', flexShrink: 0, marginTop: '1px',
                    border: `2px solid ${agreed ? 'var(--accent-blue)' : 'var(--border2)'}`,
                    background: agreed ? 'var(--accent-blue)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                >
                  {agreed && <span style={{ color: '#0c1422', fontSize: '11px', fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
                </div>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  I agree to the{' '}
                  <span style={{ color: 'var(--accent-blue)', textDecoration: 'underline', cursor: 'pointer' }}>
                    Terms &amp; Conditions
                  </span>
                  {' '}and{' '}
                  <span style={{ color: 'var(--accent-blue)', textDecoration: 'underline', cursor: 'pointer' }}>
                    Privacy Policy
                  </span>
                </span>
              </label>
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
              disabled={loading || !agreed}
              style={{
                width: '100%', padding: '11px',
                background: (loading || !agreed) ? 'rgba(56,189,248,.4)' : 'var(--accent-blue)',
                color: '#050d18',
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                letterSpacing: '1px', border: 'none',
                cursor: (loading || !agreed) ? 'not-allowed' : 'pointer',
                boxShadow: agreed ? 'var(--glow-cyan)' : 'none',
                transition: 'all .15s',
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
