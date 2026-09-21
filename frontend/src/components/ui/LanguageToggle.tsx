import { useUIStore } from '../../stores/uiStore';

interface Props {
  /** 'pill' floats over the login screen; 'row' sits inside the account menu. */
  variant?: 'pill' | 'row';
}

const LANGS = [
  { code: 'en' as const, label: 'EN' },
  { code: 'th' as const, label: 'TH' },
];

/**
 * EN / TH switch.
 *
 * Lives outside Profile on purpose: the people who need it are the ones who
 * cannot read the English label on the way to Profile — and before signing in
 * they cannot reach Profile at all.
 */
export const LanguageToggle = ({ variant = 'pill' }: Props) => {
  const language = useUIStore(s => s.language);
  const setLanguage = useUIStore(s => s.setLanguage);

  const buttons = (
    <div style={{
      display: 'inline-flex',
      border: '1px solid var(--border2)',
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
    }}>
      {LANGS.map(({ code, label }, i) => {
        const active = language === code;
        return (
          <button
            key={code}
            onClick={() => setLanguage(code)}
            aria-pressed={active}
            style={{
              fontFamily: 'var(--ff-section)',
              fontSize: 'var(--fs-micro)',
              letterSpacing: '.5px',
              padding: '5px 10px',
              cursor: 'pointer',
              border: 'none',
              borderLeft: i === 0 ? 'none' : '1px solid var(--border2)',
              borderRadius: 0,
              background: active ? 'rgba(96,165,250,.12)' : 'transparent',
              color: active ? 'var(--accent-blue)' : 'var(--text-dim)',
              transition: 'all .15s',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  if (variant === 'row') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 14px',
      }}>
        <span style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
          color: 'var(--text-dim)',
        }}>
          ภาษา / Language
        </span>
        {buttons}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
      {buttons}
    </div>
  );
};
