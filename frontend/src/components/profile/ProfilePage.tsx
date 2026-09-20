import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { updateProfile, savePreferences, getProfile, linkGoogle, unlinkGoogle } from '../../services/api';
import { useTranslation } from '../../i18n/useTranslation';
import { ChangePasswordModal } from './ChangePasswordModal';
import { GoogleAuth, googleEnabled } from '../auth/googleAuth';

const PHONE_COUNTRIES = [
  { code: 'TH', dial: '+66', label: 'TH +66' },
  { code: 'US', dial: '+1',  label: 'US +1' },
  { code: 'SG', dial: '+65', label: 'SG +65' },
  { code: 'GB', dial: '+44', label: 'GB +44' },
  { code: 'JP', dial: '+81', label: 'JP +81' },
  { code: 'AU', dial: '+61', label: 'AU +61' },
];

const TIMEZONES = [
  { value: 'Asia/Bangkok',     label: 'Asia/Bangkok (UTC+7)' },
  { value: 'Asia/Singapore',   label: 'Asia/Singapore (UTC+8)' },
  { value: 'Asia/Tokyo',       label: 'Asia/Tokyo (UTC+9)' },
  { value: 'Europe/London',    label: 'Europe/London (UTC+0)' },
  { value: 'America/New_York', label: 'America/New_York (UTC-5)' },
];

/* ── shared styles ────────────────────────────────────── */
const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border2)',
  padding: '18px 20px', marginBottom: '10px',
};
const cardTitle: React.CSSProperties = {
  fontFamily: "'Press Start 2P'", fontSize: 'var(--fs-section)',
  color: 'var(--cyan)', letterSpacing: '1px',
  marginBottom: '14px',
};
const rowStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)',
  gap: '12px', alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px dashed var(--border)',
  wordBreak: 'break-word',
};
const lblStyle: React.CSSProperties = {
  fontFamily: 'var(--ff-micro)', fontSize: 'var(--fs-micro)',
  color: 'var(--text-dim)', letterSpacing: '.5px',
};
const valStyle: React.CSSProperties = {
  fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-body)',
  color: 'var(--text)',
};
const readOnlyStyle: React.CSSProperties = {
  ...valStyle, color: 'var(--text-dim)',
};
const inp: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-input)',
  padding: '7px 9px', outline: 'none', boxSizing: 'border-box',
  width: '100%',
};
const sel: React.CSSProperties = { ...inp, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = {
  fontFamily: "'Press Start 2P'", fontSize: 'var(--fs-section)', letterSpacing: '.5px',
  padding: '9px 16px', background: 'var(--cyan)', color: '#16181c',
  border: '1px solid var(--cyan)', cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  fontFamily: "'Press Start 2P'", fontSize: 'var(--fs-section)', letterSpacing: '.5px',
  padding: '9px 16px', background: 'none', color: 'var(--text)',
  border: '1px solid var(--border2)', cursor: 'pointer',
};
const btnDanger: React.CSSProperties = {
  ...btnGhost, color: 'var(--red)', borderColor: 'rgba(248,113,113,.4)',
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
};

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
};

export const ProfilePage = () => {
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  const setAuth = useAuthStore(s => s.setAuth);
  const setCurrentPage = useUIStore(s => s.setCurrentPage);
  const addToast = useUIStore(s => s.addToast);
  const language = useUIStore(s => s.language);
  const setLanguage = useUIStore(s => s.setLanguage);
  const t = useTranslation();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const finishGoogleLink = async (accessToken: string) => {
    setGoogleBusy(true);
    try {
      const updated = await linkGoogle(accessToken);
      if (token) setAuth(token, updated);
      addToast({ type: 'success', title: 'Google linked' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to link Google';
      addToast({ type: 'error', title: msg });
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    setGoogleBusy(true);
    try {
      const updated = await unlinkGoogle();
      if (token) setAuth(token, updated);
      addToast({ type: 'success', title: 'Google unlinked' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to unlink Google';
      addToast({ type: 'error', title: msg });
    } finally {
      setGoogleBusy(false);
    }
  };

  // Edit form state
  const [fullName, setFullName] = useState(user?.name || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phoneCountry, setPhoneCountry] = useState(user?.phoneCountry || 'TH');
  const [mobile, setMobile] = useState(user?.mobile || '');
  const [timezone, setTimezone] = useState(user?.timezone || 'Asia/Bangkok');
  const [lang, setLang] = useState(language);

  // Fetch fresh profile on mount (in case user object is stale from older login)
  useEffect(() => {
    getProfile().then(fresh => {
      if (token && fresh) setAuth(token, fresh);
    }).catch(() => { /* silent */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync edit form when user object updates
  useEffect(() => {
    setFullName(user?.name || '');
    setDisplayName(user?.displayName || '');
    setEmail(user?.email || '');
    setPhoneCountry(user?.phoneCountry || 'TH');
    setMobile(user?.mobile || '');
    setTimezone(user?.timezone || 'Asia/Bangkok');
  }, [user]);

  useEffect(() => { setLang(language); }, [language]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const emailChanged = trimmedEmail && trimmedEmail !== (user?.email || '').toLowerCase();
      const updated = await updateProfile({
        name: fullName,
        displayName,
        mobile,
        phoneCountry,
        timezone,
        ...(emailChanged && { email: trimmedEmail }),
      });
      if (token) setAuth(token, updated);
      if (lang !== language) {
        await savePreferences({ language: lang });
        setLanguage(lang);
      } else {
        await savePreferences({ timezone });
      }
      addToast({ type: 'success', title: t('profile.saved') || 'Profile updated' });
      setEditing(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update';
      addToast({ type: 'error', title: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFullName(user?.name || '');
    setDisplayName(user?.displayName || '');
    setPhoneCountry(user?.phoneCountry || 'TH');
    setMobile(user?.mobile || '');
    setTimezone(user?.timezone || 'Asia/Bangkok');
    setLang(language);
    setEditing(false);
  };

  const initials = (user?.displayName || user?.name || user?.email || 'U')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const headerName = user?.displayName || user?.name || user?.email?.split('@')[0] || 'User';
  const isAdmin = user?.role === 'admin';
  const tzLabel = TIMEZONES.find(z => z.value === timezone)?.label || timezone;
  const phoneLabel = (() => {
    if (!user?.mobile) return '—';
    const dial = PHONE_COUNTRIES.find(c => c.code === user.phoneCountry)?.dial || '';
    return `${dial} ${user.mobile}`.trim();
  })();

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      {/* Back bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <button
          onClick={() => setCurrentPage('dashboard')}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', color: 'var(--cyan)',
            fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-label)',
            letterSpacing: '.5px', cursor: 'pointer',
          }}
        >
          ‹ BACK
        </button>
        <span style={{ width: '6px', height: '6px', background: 'var(--cyan)',}} />
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: 'var(--fs-title)', color: 'var(--cyan)', letterSpacing: '2px',}}>
          PROFILE
        </span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border2)' }} />
      </div>

      {/* Header card */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: '60px', height: '60px',
          background: 'rgba(96,165,250,.08)',
          border: '2px solid var(--cyan)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Press Start 2P'", fontSize: '16px',
          color: 'var(--cyan)', flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Share Tech Mono'", fontSize: '16px',
            color: 'var(--text)', marginBottom: '6px', fontWeight: 600,
          }}>
            {headerName}
          </div>
          <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', lineHeight: 1.6 }}>
            <span style={{
              fontFamily: 'var(--ff-micro)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px',
              padding: '2px 6px', marginRight: '8px',
              border: `1px solid ${isAdmin ? 'rgba(96,165,250,.4)' : 'var(--border2)'}`,
              color: isAdmin ? 'var(--cyan)' : 'var(--text-dim)',
              background: isAdmin ? 'rgba(96,165,250,.08)' : 'none',
              verticalAlign: 'middle',
            }}>
              {(user?.role || 'user').toUpperCase()}
            </span>
            {user?.email}
            <br />
            Member since {fmtDate(user?.createdAt)}
            {user?.lastLoginAt && (
              <>
                {' '}·{' '}Last login {fmtDateTime(user?.lastLoginAt)}
              </>
            )}
          </div>
        </div>
        {!editing && (
          <button style={btnGhost} onClick={() => setEditing(true)}>EDIT PROFILE</button>
        )}
      </div>

      {/* Personal Info */}
      <div style={card}>
        <div style={cardTitle}>PERSONAL INFO</div>

        <div style={rowStyle}>
          <span style={lblStyle}>FULL NAME</span>
          {editing ? (
            <input style={inp} value={fullName} onChange={e => setFullName(e.target.value)} />
          ) : (
            <span style={valStyle}>{user?.name || '—'}</span>
          )}
        </div>

        <div style={rowStyle}>
          <span style={lblStyle}>DISPLAY NAME</span>
          {editing ? (
            <div>
              <input style={inp} value={displayName} onChange={e => setDisplayName(e.target.value)} />
              <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginTop: '4px' }}>
                Shown in top menu · short name or nickname
              </div>
            </div>
          ) : (
            <span style={valStyle}>{user?.displayName || '—'}</span>
          )}
        </div>

        <div style={rowStyle}>
          <span style={lblStyle}>EMAIL</span>
          {editing ? (
            <input
              type="email"
              style={inp}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          ) : (
            <span style={valStyle}>{user?.email}</span>
          )}
        </div>

        <div style={rowStyle}>
          <span style={lblStyle}>MOBILE</span>
          {editing ? (
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '6px' }}>
              <select style={sel} value={phoneCountry} onChange={e => setPhoneCountry(e.target.value)}>
                {PHONE_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <input style={inp} value={mobile} onChange={e => setMobile(e.target.value)} placeholder="812345678" />
            </div>
          ) : (
            <span style={valStyle}>{phoneLabel}</span>
          )}
        </div>

        <div style={rowStyle}>
          <span style={lblStyle}>ROLE</span>
          <span style={{
            fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-label)', letterSpacing: '.5px',
            padding: '3px 8px', display: 'inline-block',
            border: `1px solid ${isAdmin ? 'rgba(96,165,250,.4)' : 'var(--border2)'}`,
            color: isAdmin ? 'var(--cyan)' : 'var(--text-dim)',
            background: isAdmin ? 'rgba(96,165,250,.08)' : 'none',
            width: 'fit-content',
          }}>
            {(user?.role || 'user').toUpperCase()}
          </span>
        </div>

        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={lblStyle}>MEMBER SINCE</span>
          <span style={readOnlyStyle}>{fmtDate(user?.createdAt)}</span>
        </div>
      </div>

      {/* Preferences */}
      <div style={card}>
        <div style={cardTitle}>PREFERENCES</div>

        <div style={rowStyle}>
          <span style={lblStyle}>LANGUAGE</span>
          {editing ? (
            <select style={sel} value={lang} onChange={e => setLang(e.target.value as 'en' | 'th')}>
              <option value="en">English (EN)</option>
              <option value="th">ภาษาไทย (TH)</option>
            </select>
          ) : (
            <span style={valStyle}>{language === 'th' ? 'ภาษาไทย (TH)' : 'English (EN)'}</span>
          )}
        </div>

        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={lblStyle}>TIMEZONE</span>
          {editing ? (
            <select style={sel} value={timezone} onChange={e => setTimezone(e.target.value)}>
              {TIMEZONES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
          ) : (
            <span style={valStyle}>{tzLabel}</span>
          )}
        </div>
      </div>

      {/* Security */}
      <div style={card}>
        <div style={cardTitle}>SECURITY</div>
        <div style={{ ...rowStyle, borderBottom: googleEnabled ? '1px dashed var(--border)' : 'none' }}>
          <span style={lblStyle}>PASSWORD</span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <span style={readOnlyStyle}>{user?.hasPassword === false ? '— (Google-only account)' : '••••••••••••'}</span>
            <button style={btnGhost} onClick={() => setShowPwModal(true)}>
              {user?.hasPassword === false ? 'SET PASSWORD' : 'CHANGE PASSWORD'}
            </button>
          </div>
        </div>

        {googleEnabled && (
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <span style={lblStyle}>GOOGLE</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              {user?.hasGoogleLinked ? (
                <>
                  <span style={{ ...valStyle, color: 'var(--green)' }}>✓ LINKED</span>
                  <button
                    style={{ ...btnDanger, opacity: googleBusy || !user?.hasPassword ? 0.5 : 1, cursor: googleBusy || !user?.hasPassword ? 'not-allowed' : 'pointer' }}
                    disabled={googleBusy || !user?.hasPassword}
                    onClick={handleUnlinkGoogle}
                    title={!user?.hasPassword ? 'Set a password before unlinking — otherwise you will be locked out' : ''}
                  >
                    {googleBusy ? 'WORKING...' : 'UNLINK'}
                  </button>
                </>
              ) : (
                <>
                  <span style={readOnlyStyle}>Not linked</span>
                  <GoogleAuth
                    onToken={finishGoogleLink}
                    onError={() => addToast({ type: 'error', title: 'Google sign-in failed' })}
                  >
                    {signIn => (
                      <button
                        style={{ ...btnGhost, opacity: googleBusy ? 0.5 : 1, cursor: googleBusy ? 'not-allowed' : 'pointer' }}
                        disabled={googleBusy}
                        onClick={() => signIn()}
                      >
                        {googleBusy ? 'LINKING...' : 'LINK GOOGLE'}
                      </button>
                    )}
                  </GoogleAuth>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit action bar */}
      {editing && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
          padding: '4px 0 16px',
        }}>
          <button style={btnDanger} onClick={handleCancel}>CANCEL</button>
          <button style={btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? 'SAVING...' : 'SAVE CHANGES'}
          </button>
        </div>
      )}

      {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}
    </div>
  );
};
