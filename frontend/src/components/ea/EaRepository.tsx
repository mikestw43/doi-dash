import { useEffect, useMemo, useRef, useState } from 'react';
import { IconBookmark, IconDownload, IconPencil, IconTrash } from '../icons';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useTranslation } from '../../i18n/useTranslation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchEaItems, createEaItem, patchEaItem, deleteEaItem,
  addEaUploads, setEaFileLabel, setEaImageCaption, deleteEaFile, deleteEaImage,
  fetchEaImageUrl, downloadEaFile,
  type EaItemDto, type EaImageDto, type EaFileDto, type EaLinkDto,
} from '../../services/api';

// ─── Shape ───────────────────────────────────────────────────────────────────
//
// One entry is a *thing* (an EA, an indicator, a script), not a file: the
// screenshots, the .set presets and the older builds all hang off it. That is
// what keeps "version 1.1 of the reporter" and "the preset that goes with it"
// in the same place instead of two unrelated uploads.

const EA_TYPES = ['MT5 EA', 'MT4 EA', 'Indicator', 'Script', 'Source', 'Other'] as const;
type EaType = typeof EA_TYPES[number];

/** Where an entry stands. Short on purpose: three states people will actually
 *  keep up to date beat seven nobody maintains. */
/** In the order an entry actually moves through them. */
const EA_STATUSES = ['Untest', 'Waiting', 'OK', 'Other'] as const;
type EaStatus = typeof EA_STATUSES[number];

/** What a new entry starts as. Deliberately not EA_STATUSES[0]: the list is
 *  ordered for reading, and reordering it must not quietly change the default. */
const EA_STATUS_DEFAULT: EaStatus = 'OK';

const STATUS_COLORS: Record<string, string> = {
  Untest:  'var(--accent-purple)',   // the one accent nothing else in the app uses
  Waiting: 'var(--warning)',
  OK:      'var(--success)',
  Other:   'var(--text-muted)',
};

const TYPE_COLORS: Record<string, string> = {
  'MT5 EA':    'var(--accent-blue)',
  'MT4 EA':    'var(--cyan)',
  'Indicator': 'var(--success)',
  'Script':    'var(--warning)',
  'Source':    'var(--text-muted)',
  'Other':     'var(--text-muted)',
};

const fmtSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// ─── Small pieces ────────────────────────────────────────────────────────────

const TypeBadge = ({ type }: { type: string }) => (
  <span style={{
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px',
    padding: '2px 7px', whiteSpace: 'nowrap',
    border: `1px solid ${TYPE_COLORS[type] ?? 'var(--text-muted)'}`, borderRadius: 'var(--radius-sm)',
    color: TYPE_COLORS[type] ?? 'var(--text-muted)',
  }}>{type}</span>
);

const StatusBadge = ({ status }: { status: string }) => {
  const c = STATUS_COLORS[status] ?? 'var(--text-muted)';
  return (
    <span style={{
      fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px',
      padding: '2px 8px', whiteSpace: 'nowrap', borderRadius: '999px',
      color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`,
    }}>{status.toUpperCase()}</span>
  );
};

/** A row of type badges — an entry can be more than one thing. */
const TypeBadges = ({ types }: { types: string[] }) => (
  <>{types.map(ty => <TypeBadge key={ty} type={ty} />)}</>
);

/**
 * The question asked before something is destroyed.
 *
 * Replaces window.confirm, which could only put one line of text next to the
 * site's own hostname: it could not show the picture about to go, could not
 * say that the bytes leave the server for good, and labelled the destructive
 * button "OK" in the same blue as every safe button in the browser.
 *
 * Every way out that is not a deliberate press of the one button is a cancel:
 * Escape, the backdrop, and the focus the dialog opens with.
 */
type ConfirmRequest = {
  tone: 'danger' | 'warning';
  title: string;
  /** What is at stake — a thumbnail, a count, a name. */
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
};

const ConfirmDialog = ({ req, onClose }: { req: ConfirmRequest; onClose: () => void }) => {
  const cancelRef = useRef<HTMLDivElement>(null);
  const danger = req.tone === 'danger';
  const accent = danger ? 'var(--danger)' : 'var(--warning)';

  // Capture phase, and the event stops here: the panel and the form underneath
  // both close on Escape, and one keypress must not dismiss two things.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Focus lands on Cancel, so a stray Enter or Space cancels rather than destroys.
  useEffect(() => { cancelRef.current?.querySelector('button')?.focus(); }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 800, background: 'rgba(0,0,0,.62)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-card)', width: '100%', maxWidth: '400px',
          overflow: 'hidden', boxShadow: '0 14px 40px rgba(0,0,0,.55)',
        }}
      >
        <div style={{
          padding: '12px 14px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: '9px',
        }}>
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
              color: accent,
              background: `color-mix(in srgb, ${accent} 16%, transparent)`,
              border: `1px solid color-mix(in srgb, ${accent} 42%, transparent)`,
            }}
          >{danger ? '\u{1F5D1}' : '!'}</span>
          <span style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', fontWeight: 600, color: accent,
          }}>{req.title}</span>
        </div>

        <div style={{
          padding: '13px 14px',
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
          color: 'var(--text-dim)', lineHeight: 1.6,
        }}>{req.body}</div>

        <div style={{
          padding: '11px 14px', borderTop: '1px solid var(--border-color)',
          background: 'rgba(0,0,0,.14)',
          display: 'flex', justifyContent: 'flex-end', gap: '9px',
        }}>
          {/* Cancel first, the way every other footer in the app reads. */}
          <div ref={cancelRef}><Btn label={req.cancelLabel} onClick={onClose} /></div>
          <Btn
            label={req.confirmLabel}
            tone={danger ? 'destroy' : 'warn'}
            onClick={() => { onClose(); req.onConfirm(); }}
          />
        </div>
      </div>
    </div>
  );
};

/** Holds at most one pending question, and the dialog that asks it. */
const useConfirm = () => {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const node = req ? <ConfirmDialog req={req} onClose={() => setReq(null)} /> : null;
  return { confirmNode: node, ask: setReq, asking: req !== null };
};

/** The line that says the bytes are gone, in the colour that means it. */
const Permanent = ({ text }: { text: string }) => (
  <div style={{ color: 'var(--danger)', marginTop: '9px' }}>{text}</div>
);

/** What is about to be destroyed, shown rather than named. */
const ConfirmTarget = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: '10px',
    background: 'var(--bg-input)', border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)', padding: '8px 10px',
  }}>{children}</div>
);

/**
 * The red mark that says "keep an eye on this one".
 *
 * A shape and a colour rather than a word: it sits in front of the name in
 * a table cell and on a card, where there is no room for a label, and it has
 * to read at a glance from across the list. The title carries the meaning for
 * anyone hovering or using a screen reader.
 */
const ImportantMark = ({ label, size = 14 }: { label: string; size?: number }) => (
  <span
    title={label}
    aria-label={label}
    role="img"
    style={{ flexShrink: 0, display: 'inline-flex', color: 'var(--danger)' }}
  >
    <IconBookmark size={size} filled />
  </span>
);

const EA_MAX_STARS = 5;

/** The score in words, for a tooltip and a screen reader — the stars alone are
 *  a picture, and a picture has no name. */
const ratingLabel = (t: (k: string) => string, value: number): string =>
  value ? `${t('ea.rating')} ${value}/${EA_MAX_STARS}` : t('ea.not_rated');

/**
 * The score, read-only.
 *
 * Nothing rated shows five hollow stars rather than nothing at all: a blank
 * cell reads as a rendering fault, while five empty stars say plainly that
 * there is a score to give and nobody has given it.
 */
const Stars = ({ value, size = 13, label }: { value: number; size?: number; label: string }) => (
  <span
    role="img"
    aria-label={label}
    title={label}
    style={{
      display: 'inline-flex', gap: '1px', lineHeight: 1,
      fontSize: `${size}px`, letterSpacing: '1px', whiteSpace: 'nowrap',
    }}
  >
    {Array.from({ length: EA_MAX_STARS }, (_, i) => (
      <span key={i} style={{ color: i < value ? 'var(--warning)' : '#4a4e58' }}>{'★'}</span>
    ))}
  </span>
);

/**
 * The score, set by hand.
 *
 * Pressing the star already at the end of the run clears it. Without that
 * there is no way back to "not rated" once a star has been pressed by
 * accident, and the entry carries a score nobody meant to give it.
 */
const StarPicker = ({ value, onChange, labelFor, clearLabel }: {
  value: number;
  onChange: (next: number) => void;
  labelFor: (n: number) => string;
  clearLabel: string;
}) => (
  <div style={{ display: 'flex', gap: '2px' }}>
    {Array.from({ length: EA_MAX_STARS }, (_, i) => {
      const n = i + 1;
      const on = n <= value;
      const clears = n === value;
      return (
        <button
          key={n}
          type="button"
          onClick={() => onChange(clears ? 0 : n)}
          title={clears ? clearLabel : labelFor(n)}
          aria-label={clears ? clearLabel : labelFor(n)}
          aria-pressed={on}
          style={{
            background: 'none', border: 'none', padding: '1px 2px', cursor: 'pointer',
            fontSize: '21px', lineHeight: 1,
            color: on ? 'var(--warning)' : '#4a4e58',
          }}
        >{'★'}</button>
      );
    })}
  </div>
);

/** One labelled link. A long URL clips rather than wrapping the row. */
const LinkRow = ({ label, href }: { label: string; href: string }) => (
  <MetaRow label={label}>
    {/* noreferrer as well as noopener: the repository is behind a login, and
        its URL has no business reaching whoever is on the other end. */}
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      style={{
        color: 'var(--accent-blue)', textDecoration: 'none', display: 'block',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >{href}</a>
  </MetaRow>
);

/**
 * The link list, edited as a list.
 *
 * A row with a blank URL is dropped on save rather than refused: an empty row
 * left over from pressing "add" is a mistake nobody needs telling about.
 */
const LinkEditor = ({ value, onChange }: {
  value: EaLinkDto[];
  onChange: (next: EaLinkDto[]) => void;
}) => {
  const t = useTranslation();
  const set = (i: number, patch: Partial<EaLinkDto>) =>
    onChange(value.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {value.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={l.label}
            onChange={e => set(i, { label: e.target.value })}
            placeholder={t('ea.link_label_ph')}
            aria-label={`${t('ea.link_label_ph')} ${i + 1}`}
            style={{ ...inputStyle, flex: '0 1 130px', width: 'auto' }}
          />
          <input
            value={l.url}
            onChange={e => set(i, { url: e.target.value })}
            placeholder={'https://…'}
            inputMode="url"
            aria-label={`${t('ea.link')} ${i + 1}`}
            style={{ ...inputStyle, flex: '1 1 180px', width: 'auto' }}
          />
          <Btn
            label={'✕'}
            tone="danger"
            title={`${t('common.cancel')} ${l.label || l.url || i + 1}`}
            onClick={() => onChange(value.filter((_, n) => n !== i))}
          />
        </div>
      ))}
      <div>
        <Btn
          label={t('ea.add_link')}
          tone="primary"
          onClick={() => onChange([...value, { label: '', url: '' }])}
        />
      </div>
    </div>
  );
};

/** A dim label and a value beside it, for the one-line facts about an entry. */
const MetaRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: '8px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)' }}>
    <span style={{ flex: '0 0 74px', color: 'var(--text-dim)' }}>{label}</span>
    <span style={{ flex: 1, minWidth: 0, color: 'var(--text-dim)' }}>{children}</span>
  </div>
);

const TagChip = ({ tag, onClick }: { tag: string; onClick?: () => void }) => (
  <span
    onClick={onClick ? e => { e.stopPropagation(); onClick(); } : undefined}
    style={{
      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
      padding: '1px 6px', whiteSpace: 'nowrap',
      background: 'var(--bg-input)', border: '1px solid var(--border-color)',
      borderRadius: '999px', color: 'var(--text-dim)',
      cursor: onClick ? 'pointer' : 'default',
    }}
  >{tag}</span>
);

/** Renders the uploaded image. The bytes come through axios so the login
 *  check applies, which means a blob URL rather than a plain src. */
const Thumb = ({ image, size = 44 }: { image?: EaImageDto; size?: number }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!image) return;
    let revoked: string | null = null;
    let alive = true;
    fetchEaImageUrl(image.id)
      .then(u => {
        if (alive) { revoked = u; setUrl(u); } else URL.revokeObjectURL(u);
      })
      .catch(() => {/* leave the placeholder in place */});
    return () => { alive = false; if (revoked) URL.revokeObjectURL(revoked); };
  }, [image]);

  return (
    <div
      title={image?.caption || image?.filename}
      style={{
        width: size, height: size, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-input)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-dim)', fontSize: `${Math.round(size / 2.6)}px`,
        overflow: 'hidden',
      }}
    >
      {url
        ? <img src={url} alt={image?.caption ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : (image ? '▤' : '·')}
    </div>
  );
};

/**
 * A screenshot at its own size.
 *
 * The 92px thumbnails in the detail view are enough to tell two screenshots
 * apart and nothing else — a settings panel or an equity curve is unreadable
 * at that size, which is the only reason the screenshot is there. Tapping one
 * opens it here; arrows walk the entry's other images without going back.
 */
const Lightbox = ({
  images, index, onClose, onStep,
}: {
  images: EaImageDto[];
  index: number;
  onClose: () => void;
  onStep: (next: number) => void;
}) => {
  const image = images[index];
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setUrl(null);
    fetchEaImageUrl(image.id)
      .then(u => { if (alive) { made = u; setUrl(u); } else URL.revokeObjectURL(u); })
      .catch(() => {/* the spinner stays; the caption still names the file */});
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [image.id]);

  const step = (d: number) => onStep((index + d + images.length) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className="ea-lightbox"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
        background: 'rgba(0,0,0,.88)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '16px', gap: '12px',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        width: '100%', maxWidth: '1100px', justifyContent: 'center',
      }}>
        {images.length > 1 && (
          <button
            onClick={e => { e.stopPropagation(); step(-1); }}
            style={arrowStyle}
          >{'‹'}</button>
        )}

        {/* Clicking the picture itself must not close it — only the backdrop. */}
        <div onClick={e => e.stopPropagation()} style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {url
            ? <img
                src={url}
                alt={image.caption || image.filename}
                style={{ maxWidth: '100%', maxHeight: '76vh', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }}
              />
            : <span style={{ fontFamily: 'var(--ff-body)', color: 'var(--text-dim)' }}>{'…'}</span>}
        </div>

        {images.length > 1 && (
          <button
            onClick={e => { e.stopPropagation(); step(1); }}
            style={arrowStyle}
          >{'›'}</button>
        )}
      </div>

      {/* Blown up is where the caption is read: the tile below only has room
          for one clipped line, so here it wraps and shows whole, with the
          filename under it for when the caption does not identify the file. */}
      <div onClick={e => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: '90%' }}>
        {image.caption && (
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
            color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.45,
          }}>{image.caption}</div>
        )}
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
          color: 'var(--text-dim)', marginTop: image.caption ? '4px' : 0,
        }}>
          {image.filename}
          {images.length > 1 && <span> · {index + 1}/{images.length}</span>}
        </div>
      </div>

      <button onClick={onClose} style={{ ...arrowStyle, width: 'auto', padding: '6px 16px', fontSize: 'var(--fs-body-sm)' }}>
        {'✕'}
      </button>
    </div>
  );
};

const INLINE_CSS = `
  .ea-inline:hover { border-color: #4a4e58 !important; background: rgba(255,255,255,.03); }
`;

const arrowStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '38px', height: '38px', lineHeight: 1,
  fontSize: '22px', cursor: 'pointer',
  background: 'rgba(255,255,255,.07)', color: 'var(--text-primary)',
  border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
};

const Btn = ({ label, onClick, tone = 'ghost', title, pressed }: {
  /** Text, or an icon for a button that carries no words. */
  label: React.ReactNode;
  onClick: () => void;
  tone?: 'ghost' | 'primary' | 'danger' | 'destroy' | 'warn';
  /** Names the button when the label is a bare glyph or an icon. Several ✕ in
   *  one list are otherwise the same button to a tooltip and a screen reader,
   *  and an icon alone has no name at all. */
  title?: string;
  /** For a toggle whose state is shown elsewhere on screen: assistive tech
   *  cannot see "elsewhere". */
  pressed?: boolean;
}) => {
  const colors = {
    ghost:   { fg: 'var(--text-dim)',    bd: 'var(--border2)',       bg: 'transparent' },
    primary: { fg: 'var(--accent-blue)', bd: 'var(--accent-blue)',   bg: 'rgba(96,165,250,.1)' },
    danger:  { fg: 'var(--danger)',      bd: 'rgba(248,113,113,.5)', bg: 'transparent' },
    // Filled, dark text: the button that actually destroys something must not
    // look like the ones around it, or a fast hand will treat it as one.
    destroy: { fg: '#1b1c1f',            bd: 'var(--danger)',        bg: 'var(--danger)' },
    warn:    { fg: 'var(--warning)',     bd: 'rgba(251,191,36,.5)',  bg: 'transparent' },
  }[tone];
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title ?? (typeof label === 'string' ? label : undefined)}
      aria-pressed={pressed}
      style={{
        fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px',
        padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${colors.bd}`, borderRadius: 'var(--radius-sm)',
        background: colors.bg, color: colors.fg,
      }}
    >{label}</button>
  );
};

// ─── Detail ──────────────────────────────────────────────────────────────────

/**
 * A word you can change where it is written.
 *
 * Reads as plain text until it is clicked; then it is an input, and leaving it
 * saves. There is no Save button because there is nothing else in flight to
 * save with it — one field, one request. Escape puts the old text back.
 */
/**
 * A textarea that is as tall as what is in it.
 *
 * A fixed three rows meant that writing anything longer scrolled the top of
 * it out of sight while you were still typing — you could not read back the
 * line you had just written. It starts at four rows so a short note does not
 * open a crater, grows with the text, and stops at sixteen, after which it
 * scrolls rather than pushing the Save button off the screen. Dragging the
 * corner still works for anyone who wants it bigger still.
 */
const MIN_ROWS = 4;
const MAX_TEXTAREA_PX = 340;

const GrowingTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';                                    // shrink first, or it only ever grows
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_PX ? 'auto' : 'hidden';
  };

  useEffect(fit, [props.value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={MIN_ROWS}
      onInput={fit}
      style={{ ...props.style, resize: 'vertical', lineHeight: 1.5 }}
    />
  );
};

/** The small round control that sits on the corner of a thumbnail — the tile
 *  is 104px, so there is nowhere inside it for a button with a word on it. */
const CornerBtn = ({ onClick, title, pressed, children }: {
  onClick: () => void;
  title: string;
  pressed?: boolean;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-pressed={pressed}
    style={{
      position: 'absolute', top: '-7px', right: '-7px',
      width: '22px', height: '22px', padding: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: '50%', cursor: 'pointer',
      border: `1px solid ${pressed ? 'var(--accent-blue)' : 'var(--border2)'}`,
      background: pressed ? 'rgba(96,165,250,.16)' : 'var(--bg-card)',
      color: pressed ? 'var(--accent-blue)' : 'var(--text-dim)',
    }}
  >{children}</button>
);

/**
 * A note that may run to a paragraph.
 *
 * Kept to two lines until asked otherwise: a file's note can be the whole
 * trading logic, and five of those turn the panel into a wall of text with
 * the files themselves lost in it. The toggle only appears when the text
 * actually overflows — measured, not guessed from its length, because two
 * short lines and one long wrapped one are the same number of characters.
 */
const LongText = ({ text, lines = 2, style }: {
  text: string;
  lines?: number;
  style?: React.CSSProperties;
}) => {
  const t = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text, open, lines]);

  return (
    <>
      <div
        ref={ref}
        style={{
          whiteSpace: 'pre-wrap', overflow: 'hidden',
          ...(open ? {} : {
            display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' as const,
          }),
          ...style,
        }}
      >{text}</div>
      {(overflows || open) && (
        <button
          onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
          style={{
            background: 'none', border: 'none', padding: '2px 0 0', cursor: 'pointer',
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)', color: 'var(--accent-blue)',
          }}
        >{open ? `▴ ${t('ea.show_less')}` : `▾ ${t('ea.show_all')}`}</button>
      )}
    </>
  );
};

const InlineText = ({
  value, placeholder, onSave, style, multiline, clampLines, startOpen, onLeave,
}: {
  value: string;
  placeholder: string;
  onSave: (next: string) => Promise<unknown>;
  style?: React.CSSProperties;
  multiline?: boolean;
  /** Fold the read view to this many lines, with a toggle. For notes that can
   *  run long — without it a paragraph pushes everything else off the screen. */
  clampLines?: number;
  /** Open for typing the moment it appears: the row's pencil was the click
   *  that asked for this, and asking for a second one on the text is a step
   *  that does nothing. */
  startOpen?: boolean;
  /** Fired on ✓ and on ✕, so the row can close itself with the field. */
  onLeave?: () => void;
}) => {
  const t = useTranslation();
  const [editing, setEditing] = useState(Boolean(startOpen));
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // A change made elsewhere (another field's save refetches the entry) must
  // not be overwritten by a stale draft sitting in a field nobody is using.
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const commit = async () => {
    setEditing(false);
    onLeave?.();
    const next = draft.trim();
    if (next === value) return;
    setBusy(true);
    try {
      await onSave(next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      setDraft(value);   // the server did not take it; show what it still has
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => { setDraft(value); setEditing(false); onLeave?.(); };

  if (editing) {
    const props = {
      autoFocus: true,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
        if (e.key === 'Enter' && !multiline) { e.preventDefault(); void commit(); }
      },
      style: { ...inputStyle, ...style, width: '100%' },
    };
    return (
      <span style={{ display: 'block' }}>
        {multiline
          ? <GrowingTextarea {...props} />
          : <input {...props} />}
        {/*
          Saving is a press, not a side effect of clicking elsewhere.
          onBlur used to commit, which meant a click anywhere on the panel
          wrote to the server without being asked to — and left nothing to
          press if you changed your mind halfway through typing.
          onMouseDown fires before the input loses focus, so a press on either
          button is read even though the field is about to blur.
        */}
        <span style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button
            onMouseDown={e => { e.preventDefault(); void commit(); }}
            title={t('common.save')}
            aria-label={t('common.save')}
            style={{ ...miniBtn, color: 'var(--success)', borderColor: 'rgba(52,211,153,.5)' }}
          >{'✓'}</button>
          <button
            onMouseDown={e => { e.preventDefault(); cancel(); }}
            title={t('common.cancel')}
            aria-label={t('common.cancel')}
            style={{ ...miniBtn, color: 'var(--text-dim)', borderColor: 'var(--border2)' }}
          >{'✕'}</button>
        </span>
      </span>
    );
  }

  const tick = saved
    ? <span style={{ color: 'var(--success)', fontSize: 'var(--fs-micro)', marginLeft: '7px' }}>{'✓'}</span>
    : null;

  const shell: React.CSSProperties = {
    display: 'block', maxWidth: '100%',
    padding: '2px 6px', margin: '-2px -6px',
    borderRadius: 'var(--radius-sm)',
    border: '1px dashed transparent',
    cursor: 'text',
    color: value ? undefined : 'var(--text-dim)',
    fontStyle: value ? undefined : 'italic',
    opacity: busy ? .5 : 1,
    ...style,
  };

  // The folded view owns its own overflow, so the shell must not clip it — and
  // the toggle inside it stops the click, or opening the note would start an edit.
  if (clampLines && value) {
    return (
      <span onClick={() => setEditing(true)} title={t('ea.click_to_edit')} className="ea-inline" style={shell}>
        <LongText text={value} lines={clampLines} />
        {tick}
      </span>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title={t('ea.click_to_edit')}
      className="ea-inline"
      style={{
        ...shell,
        display: 'inline-block',
        whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {value || placeholder}
      {tick}
    </span>
  );
};

const DetailModal = ({ item, isAdmin, onClose, onEdit, onDelete, keysBusy }: {
  item: EaItemDto; isAdmin: boolean;
  onClose: () => void; onEdit: () => void; onDelete: () => void;
  /** True while a form is layered over this, so Escape belongs to the form. */
  keysBusy?: boolean;
}) => {
  const t = useTranslation();
  const qc = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  /** Which screenshot is open full size, or null. */
  const [zoom, setZoom] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null | undefined>(null);
  const [error, setError] = useState('');
  const { confirmNode, ask, asking } = useConfirm();

  /**
   * Deleting is off until it is asked for.
   *
   * This screen is mostly read: open the entry, look at a screenshot, take a
   * file. A row of ✕ live through all of that is a thumb-width away from
   * losing an upload on a phone — and the reader who only wanted to look had
   * no use for them anyway. The controls appear when MANAGE is pressed and go
   * away again when it is pressed a second time or the entry is closed.
   */
  /**
   * An admin edits where the thing is, with nothing to switch on first.
   *
   * There used to be a MANAGE mode hiding every ✕ behind a toggle, because a
   * row of live deletes is a thumb-width away from losing an upload. The
   * confirmation dialog does that job now — it shows the thumbnail, says the
   * bytes go for good, and cancels on Escape, the backdrop or its own default
   * focus. A second gate on top of it guarded nothing and left two different
   * ways to edit one entry, which is one more than anybody can keep straight.
   */
  const canEdit = isAdmin;
  /**
   * Which one attachment is open for changes, by id.
   *
   * Scoped to the row rather than the whole panel: the old MANAGE armed every
   * ✕ on the screen at once, and having none of them armed makes opening an
   * entry to look at it exactly as safe as it should be. A pencil on the row
   * arms that row and nothing else, and it is next to the thing it unlocks
   * rather than in a banner above everything.
   */
  const [editingId, setEditingId] = useState<string | null>(null);
  const isOpen = (id: string) => canEdit && editingId === id;

  const refresh = () => qc.invalidateQueries({ queryKey: ['ea-items'] });

  /** Every change here is its own request; this is what turns each one into a
   *  fresh list without a page the reader has to reload. */
  const after = async <T,>(p: Promise<T>): Promise<T> => {
    const out = await p;
    await refresh();
    return out;
  };

  const upload = async (field: 'images' | 'files', picked: File[]) => {
    const tooBig = picked.filter(f => f.size > MAX_FILE_BYTES);
    const ok = picked.filter(f => f.size <= MAX_FILE_BYTES).slice(0, MAX_FILES_PER_SAVE);
    setError(tooBig.length ? `${t('ea.too_big')} ${tooBig.map(f => f.name).join(', ')}` : '');
    if (!ok.length) return;

    const fd = new FormData();
    ok.forEach(f => fd.append(field, f));
    setProgress(0);
    try {
      await after(addEaUploads(item.id, fd, setProgress));
      addToast({ type: 'success', title: t('ea.saved_edit'), message: `${ok.length} ${t('ea.uploaded_suffix')}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setProgress(null);
    }
  };

  /**
   * Deleting an attachment takes the bytes with it and there is no Cancel to
   * fall back on any more, so each one asks first — showing the thumbnail for
   * an image, because a filename alone cannot tell you it is the right one.
   */
  const confirmRemoveImage = (img: EaImageDto) => ask({
    tone: 'danger',
    title: t('ea.confirm_delete_image'),
    cancelLabel: t('common.cancel'),
    confirmLabel: t('ea.delete'),
    onConfirm: () => { void after(deleteEaImage(img.id)); },
    body: (
      <>
        <ConfirmTarget>
          <Thumb image={img} size={44} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {img.filename}
            </div>
            <div style={{ fontSize: 'var(--fs-micro)', marginTop: '2px' }}>
              {img.caption ? `${img.caption} · ` : ''}{fmtSize(img.size)}
            </div>
          </div>
        </ConfirmTarget>
        <Permanent text={t('ea.confirm_permanent')} />
      </>
    ),
  });

  const confirmRemoveFile = (f: EaFileDto) => ask({
    tone: 'danger',
    title: t('ea.confirm_delete_file'),
    cancelLabel: t('common.cancel'),
    confirmLabel: t('ea.delete'),
    onConfirm: () => { void after(deleteEaFile(f.id)); },
    body: (
      <>
        <ConfirmTarget>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {f.filename}
            </div>
            <div style={{ fontSize: 'var(--fs-micro)', marginTop: '2px' }}>
              {f.label ? `${f.label} · ` : ''}{fmtSize(f.size)}
            </div>
          </div>
        </ConfirmTarget>
        <Permanent text={t('ea.confirm_permanent')} />
      </>
    ),
  });

  /**
   * Escape closes it. A click on the dark surround does not.
   *
   * This stopped being somewhere you only look the moment captions, notes and
   * uploads moved onto it: dismissing a working screen on a click that landed
   * a few pixels wide is the kind of thing that only ever happens by mistake.
   * The lightbox and any form layered over this take the key first.
   */
  useEffect(() => {
    if (keysBusy || zoom !== null || asking) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keysBusy, zoom, asking, onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        className="ea-detail-modal"
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-card)',
          width: '100%', maxWidth: '620px', maxHeight: '100%',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <style>{INLINE_CSS}</style>

        {/* header */}
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'flex-start', gap: '10px',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Status belongs with the name — it says how this one is doing.
                The types are a classification, so they get their own line. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '9px',
              flexWrap: 'wrap', marginBottom: '6px',
            }}>
              {item.important && <ImportantMark label={t('ea.important')} size={17} />}
              <div style={{
                fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)',
                color: 'var(--text-primary)',
              }}>{item.name}</div>
              <StatusBadge status={item.status} />
              <Stars value={item.rating} size={15} label={ratingLabel(t, item.rating)} />
            </div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
              <TypeBadges types={item.type} />
            </div>
          </div>
          {/*
            Outside the MANAGE gate on purpose: that gate exists because a
            stray ✕ destroys a file, and this only toggles a mark — one more
            click puts it back.

            Always the hollow outline, never the filled red one. The filled
            bookmark in front of the name is where the state is read, and two
            red bookmarks a few pixels apart in the same row read as two
            different things when they are one. This is the control; the mark
            beside the name is the answer. aria-pressed carries the state for
            anyone who cannot see that the mark is there.
          */}
          {isAdmin && (
            <Btn
              label={<IconBookmark size={15} />}
              title={item.important ? t('ea.unmark_hint') : t('ea.mark_hint')}
              pressed={item.important}
              onClick={() => { void after(patchEaItem(item.id, { important: !item.important })); }}
            />
          )}
          {/* Up here, next to the name, the status and the links it changes —
              at the foot of the panel it was a long way from its own subject.
              Images and files are not in it; those are edited where they are. */}
          {isAdmin && <Btn label={t('ea.edit')} onClick={onEdit} tone="primary" />}
          <Btn label={t('ea.close')} onClick={onClose} />
        </div>

        {/* body */}
        <div style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* pre-wrap, because the field that writes this is a textarea: people
              paste numbered rules into it, and without this every line ran
              together into one paragraph. The text was always stored whole —
              only the rendering threw the breaks away. */}
          <p style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
            color: 'var(--text-primary)', lineHeight: 1.6, margin: 0,
            whiteSpace: 'pre-wrap',
          }}>{item.description}</p>

          {/* Provenance: who wrote it and where it came from. Both optional,
              and a row only appears once there is something in it. */}
          {(item.developer || item.links.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {item.developer && (
                <MetaRow label={t('ea.developer')}>
                  <span style={{ color: 'var(--text-primary)' }}>{item.developer}</span>
                </MetaRow>
              )}
              {/* Labelled where a label was given, so the row says what the
                  link is instead of making you open it to find out. */}
              {item.links.map((l, i) => (
                <LinkRow key={`${l.url}-${i}`} label={l.label || t('ea.link')} href={l.url} />
              ))}
            </div>
          )}

          {item.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {item.tags.map(tag => <TagChip key={tag} tag={tag} />)}
            </div>
          )}

          {/* ── Images ──
              Managed here rather than in a form: a thumbnail you can see is
              the only safe thing to aim a delete at, and a caption is worth
              nothing if it cannot be fixed after the fact. */}
          <section>
            <SectionLabel>{t('ea.images')} · {item.images.length}</SectionLabel>
            {item.images.length === 0 && !canEdit ? (
              <Muted>{t('ea.no_images')}</Muted>
            ) : (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {item.images.map((img, i) => (
                  <div key={img.id} style={{ width: '104px', position: 'relative' }}>
                    <div onClick={() => setZoom(i)} title={t('ea.zoom_hint')} style={{ cursor: 'zoom-in' }}>
                      <Thumb image={img} size={104} />
                    </div>
                    {canEdit && (
                      <CornerBtn
                        onClick={() => setEditingId(isOpen(img.id) ? null : img.id)}
                        title={isOpen(img.id) ? t('ea.done_editing') : `${t('ea.edit')} ${img.filename}`}
                        pressed={isOpen(img.id)}
                      ><IconPencil size={12} /></CornerBtn>
                    )}
                    <div
                      className="ea-cap"
                      title={img.caption || img.filename}
                      style={{
                        fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
                        color: 'var(--text-dim)', marginTop: '6px', textAlign: 'center',
                        ...(isOpen(img.id) ? {} : {
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }),
                      }}
                    >
                      {isOpen(img.id)
                        ? <InlineText
                            startOpen
                            value={img.caption}
                            placeholder={t('ea.add_caption')}
                            onSave={next => after(setEaImageCaption(img.id, next))}
                            onLeave={() => setEditingId(null)}
                          />
                        : (img.caption || <span style={{ color: 'var(--text-muted)' }}>{img.filename}</span>)}
                    </div>
                    {isOpen(img.id) && (
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '6px' }}>
                        <Btn
                          label={<IconTrash size={14} />}
                          tone="danger"
                          title={`${t('ea.delete')} ${img.filename}`}
                          onClick={() => confirmRemoveImage(img)}
                        />
                      </div>
                    )}
                  </div>
                ))}

                {canEdit && (
                  <div style={{ width: '104px' }}>
                    <DropZone images compact accept="image/*" hint="" onAdd={f => { void upload('images', f); }} />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Files ── */}
          <section>
            <SectionLabel>{t('ea.files')} · {item.files.length}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {item.files.map(f => (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '8px 10px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
                      color: 'var(--text-primary)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{f.filename}</div>
                    <div
                      className="ea-note"
                      style={{
                        fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
                        color: 'var(--text-dim)', marginTop: '4px',
                      }}
                    >
                      {isOpen(f.id)
                        ? <InlineText
                            startOpen
                            multiline
                            value={f.label}
                            placeholder={t('ea.add_note')}
                            onSave={next => after(setEaFileLabel(f.id, next))}
                            onLeave={() => setEditingId(null)}
                          />
                        : (f.label
                            ? <LongText text={f.label} />
                            : <span>{canEdit ? t('ea.add_note') : '—'}</span>)}
                    </div>
                    <div style={{
                      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
                      color: 'var(--text-dim)', marginTop: '4px',
                    }}>
                      {fmtSize(f.size)} · {f.createdAt}
                    </div>
                  </div>
                  {/* An arrow instead of the word: three buttons of text on one
                      row crowded out the filename on a narrow screen. */}
                  <Btn
                    label={<IconDownload size={15} />}
                    title={`${t('ea.download')} ${f.filename}`}
                    onClick={() => { void downloadEaFile(f.id, f.filename); }}
                  />
                  {canEdit && (
                    <Btn
                      label={<IconPencil size={15} />}
                      title={isOpen(f.id) ? t('ea.done_editing') : `${t('ea.edit')} ${f.filename}`}
                      pressed={isOpen(f.id)}
                      tone={isOpen(f.id) ? 'primary' : 'ghost'}
                      onClick={() => setEditingId(isOpen(f.id) ? null : f.id)}
                    />
                  )}
                  {isOpen(f.id) && (
                    <Btn
                      label={<IconTrash size={15} />}
                      tone="danger"
                      title={`${t('ea.delete')} ${f.filename}`}
                      onClick={() => confirmRemoveFile(f)}
                    />
                  )}
                </div>
              ))}

              {canEdit && (
                <DropZone hint={t('ea.drop_files_hint')} onAdd={f => { void upload('files', f); }} />
              )}
            </div>
          </section>

          {progress !== null && <ProgressBar progress={progress} t={t} />}
          {error && (
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--danger)' }}>{error}</div>
          )}
        </div>

        {/* admin footer */}
        {isAdmin && (
          <div style={{
            padding: '10px 16px', borderTop: '1px solid var(--border-color)',
            display: 'flex', gap: '8px',
          }}>
            {/* The one thing on this screen that cannot be undone, kept at the
                far end of it, away from everything used while reading. */}
            <Btn
              label={t('ea.delete')}
              title={`${t('ea.delete')} ${item.name}`}
              onClick={() => ask({
                tone: 'danger',
                title: t('ea.confirm_delete_item'),
                cancelLabel: t('common.cancel'),
                confirmLabel: t('ea.confirm_delete_all'),
                onConfirm: onDelete,
                body: (
                  <>
                    <ConfirmTarget>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'var(--text-primary)' }}>
                          {item.important ? '★ ' : ''}{item.name}
                        </div>
                        <div style={{ fontSize: 'var(--fs-micro)', marginTop: '2px' }}>
                          {item.type.join(' · ')} · {item.status.toUpperCase()}
                        </div>
                      </div>
                    </ConfirmTarget>
                    {/* Counted, not just mentioned: the attachments go too,
                        and the old one-line confirm never said so. */}
                    {(item.images.length > 0 || item.files.length > 0) && (
                      <div style={{ marginTop: '9px' }}>
                        {t('ea.confirm_goes_too')}
                        <ul style={{ margin: '5px 0 0', paddingLeft: '17px' }}>
                          {item.images.length > 0 && (
                            <li style={{ color: 'var(--text-primary)' }}>
                              {item.images.length} {t('ea.images')}
                            </li>
                          )}
                          {item.files.length > 0 && (
                            <li style={{ color: 'var(--text-primary)' }}>
                              {item.files.length} {t('ea.files')}
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    <Permanent text={t('ea.confirm_permanent_all')} />
                  </>
                ),
              })}
              tone="danger"
            />
          </div>
        )}
      </div>

      {zoom !== null && item.images[zoom] && (
        <Lightbox
          images={item.images}
          index={zoom}
          onStep={setZoom}
          onClose={() => setZoom(null)}
        />
      )}

      {confirmNode}
    </div>
  );
};

/** Shared by the create form and the detail view — both upload. */
const ProgressBar = ({ progress, t }: { progress: number | undefined; t: (k: string) => string }) => (
  <div>
    <div style={{
      display: 'flex', justifyContent: 'space-between', marginBottom: '4px',
      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)', color: 'var(--text-dim)',
    }}>
      <span>{(progress ?? 0) >= 1 ? t('ea.finishing') : t('ea.uploading')}</span>
      {typeof progress === 'number' && <span>{Math.round(progress * 100)}%</span>}
    </div>
    <div style={{ height: '4px', borderRadius: '999px', overflow: 'hidden', background: 'var(--bg-input)' }}>
      <div
        className={typeof progress === 'number' ? undefined : 'ea-progress-idle'}
        style={{
          height: '100%', background: 'var(--accent-blue)',
          width: typeof progress === 'number' ? `${Math.round(progress * 100)}%` : '35%',
          transition: 'width .2s linear',
        }}
      />
    </div>
    <style>{`
      @keyframes ea-progress-slide {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(300%); }
      }
      .ea-progress-idle { animation: ea-progress-slide 1.1s ease-in-out infinite; }
    `}</style>
  </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)',
    color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '8px',
  }}>{children}</div>
);

const Muted = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)',
  }}>{children}</div>
);

// ─── Picking files ───────────────────────────────────────────────────────────

/** Mirrors the API's own limits, so an over-size pick is refused here with a
 *  readable message instead of coming back as a 500 after the upload. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES_PER_SAVE = 20;

/**
 * A file waiting to be uploaded.
 *
 * `key` is generated once and never reused: rows are removed one at a time,
 * and keying on the name would make two same-named files from different
 * folders collide and swap their labels.
 */
interface Picked {
  key: string;
  file: File;
  /** What it is: a file's label ("Current build"), or an image's caption.
   *  Typed while picking, optional, and editable afterwards either way. */
  label: string;
}

let pickSeq = 0;
const toPicked = (file: File): Picked => ({ key: `p${++pickSeq}`, file, label: '' });

/**
 * Same file twice — dropped once, then picked again — is one file.
 *
 * Name and size only. lastModified looks like the stronger test but is not
 * one: a File built from a copy, a download or a drag out of an archive gets
 * the time it was built, so the same bytes dropped twice can disagree — and
 * two genuinely different files sharing a name *and* a byte count would be
 * indistinguishable in the list anyway.
 */
const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size;

/**
 * Drop a file on it, or click it and choose.
 *
 * The plain <input type=file multiple> it replaces could only ever hold one
 * pick: choosing a second time replaced everything chosen the first time, so
 * an entry's screenshots had to be selected in a single trip through the file
 * dialog or not at all. This one appends, which is also what makes dropping
 * useful — you can drag in a folder's worth, then drag in one more.
 */
const DropZone = ({
  accept, hint, images, compact, onAdd,
}: {
  accept?: string;
  hint: string;
  /** Marks it as the images zone — only changes the glyph. */
  images?: boolean;
  /** Thumbnail-sized, for sitting at the end of a row of pictures. */
  compact?: boolean;
  onAdd: (files: File[]) => void;
}) => {
  const t = useTranslation();
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (picked.length) onAdd(picked);
    // Let the same file be chosen again after it has been removed: without
    // this the input still holds it and fires no change event.
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragEnter={e => { e.preventDefault(); setOver(true); }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={e => {
        // Moving over a child fires dragleave on the parent; ignore those.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={e => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      style={{
        padding: compact ? '8px 6px' : '16px 12px',
        height: compact ? '104px' : undefined,
        display: compact ? 'flex' : undefined,
        flexDirection: compact ? 'column' : undefined,
        alignItems: compact ? 'center' : undefined,
        justifyContent: compact ? 'center' : undefined,
        border: `1px dashed ${over ? 'var(--accent-blue)' : 'var(--border2)'}`,
        borderRadius: 'var(--radius-sm)',
        background: over ? 'var(--accent-bg)' : 'var(--bg-input)',
        color: over ? 'var(--accent-blue)' : 'var(--text-dim)',
        textAlign: 'center', cursor: 'pointer',
        transition: 'border-color .15s, background .15s, color .15s',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        onChange={e => take(e.target.files)}
        onClick={e => e.stopPropagation()}
        style={{ display: 'none' }}
      />
      <div style={{
        fontFamily: 'var(--ff-body)',
        fontSize: compact ? '17px' : 'var(--fs-body-sm)',
        color: over ? 'var(--accent-blue)' : 'var(--text-secondary)',
        lineHeight: compact ? 1.1 : undefined,
      }}>
        {compact ? '＋' : `${images ? '▦' : '▤'}  ${t('ea.drop_hint')}`}
      </div>
      <div style={{
        fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
        color: 'var(--text-dim)', marginTop: '4px',
      }}>
        {compact ? t('ea.add_image') : hint}
      </div>
    </div>
  );
};

/** A picked image, shown as what it actually is. */
/**
 * One picked image, with its caption box underneath.
 *
 * The caption is typed here, while the picture is still on screen and you can
 * still remember which one it is — an hour later "screenshot_04.png" tells you
 * nothing. It stays optional: left blank, the entry falls back to the filename.
 *
 * The box is narrow, so what is typed will not fit in it. That is fine here:
 * the caption is read in full in the lightbox, and the tile only has to prove
 * that something was written.
 */
const PickedThumb = ({ file, caption, onCaption, onRemove }: {
  file: File;
  caption: string;
  onCaption: (next: string) => void;
  onRemove: () => void;
}) => {
  const t = useTranslation();
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  return (
    <div style={{ position: 'relative', width: '112px' }}>
      <div style={{
        width: '112px', height: '84px', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
        border: '1px solid var(--border2)', background: 'var(--bg-tertiary)',
      }}>
        {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <button
        onClick={onRemove}
        title={`${t('common.cancel')} ${file.name}`}
        aria-label={`${t('common.cancel')} ${file.name}`}
        style={{
          position: 'absolute', top: '-6px', right: '-6px',
          width: '19px', height: '19px', lineHeight: 1,
          borderRadius: '50%', cursor: 'pointer',
          border: '1px solid var(--border2)', background: 'var(--bg-card)',
          color: 'var(--danger)', fontSize: '11px', padding: 0,
        }}
      >
        {'✕'}
      </button>
      <div
        title={file.name}
        style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)', color: 'var(--text-dim)',
          marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {fmtSize(file.size)}
      </div>
      <input
        value={caption}
        onChange={e => onCaption(e.target.value)}
        placeholder={t('ea.add_caption')}
        title={caption || t('ea.add_caption')}
        aria-label={`${t('ea.add_caption')} — ${file.name}`}
        style={{ ...inputStyle, width: '100%', marginTop: '4px', padding: '4px 6px', fontSize: 'var(--fs-micro)' }}
      />
    </div>
  );
};

// ─── Add / edit form ─────────────────────────────────────────────────────────

// ─── New entry ───────────────────────────────────────────────────────────────

/**
 * The only form left.
 *
 * Creating an entry is the one moment a form earns its place: nothing exists
 * yet, so the name, the type and the first uploads genuinely do belong to one
 * transaction with one Save. Everything after creation is edited in place on
 * the detail view, a field at a time.
 */
const EaForm = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslation();
  const qc = useQueryClient();
  const addToast = useUIStore(s => s.addToast);

  const [name, setName] = useState('');
  const [type, setType] = useState<string[]>([EA_TYPES[0]]);
  const [status, setStatus] = useState<string>(EA_STATUS_DEFAULT);
  const [description, setDescription] = useState('');
  const [developer, setDeveloper] = useState('');
  const [links, setLinks] = useState<EaLinkDto[]>([]);
  const [important, setImportant] = useState(false);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState('');
  const [images, setImages] = useState<Picked[]>([]);
  const [files, setFiles] = useState<Picked[]>([]);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null | undefined>(null);
  const { confirmNode, ask, asking } = useConfirm();

  /**
   * Add to what is already picked, refusing what the API would refuse anyway.
   *
   * Dropping is a two-second gesture, so it is the one people repeat — which
   * makes silently swallowing a duplicate, or an over-size file that only
   * fails on Save, much worse here than in a file dialog.
   */
  const addTo = (
    set: React.Dispatch<React.SetStateAction<Picked[]>>,
    other: Picked[],
  ) => (incoming: File[]) => {
    const tooBig = incoming.filter(f => f.size > MAX_FILE_BYTES);
    set(prev => {
      const room = MAX_FILES_PER_SAVE - prev.length - other.length;
      const fresh = incoming
        .filter(f => f.size <= MAX_FILE_BYTES)
        .filter(f => !prev.some(p => sameFile(p.file, f)));
      setError(
        tooBig.length ? `${t('ea.too_big')} ${tooBig.map(f => f.name).join(', ')}`
        : fresh.length > room ? t('ea.too_many')
        : '',
      );
      return [...prev, ...fresh.slice(0, Math.max(0, room)).map(toPicked)];
    });
  };

  const removeAt = (set: React.Dispatch<React.SetStateAction<Picked[]>>, key: string) =>
    set(prev => prev.filter(p => p.key !== key));

  const save = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('type', type.join(','));
      fd.append('status', status);
      fd.append('description', description);
      fd.append('developer', developer);
      fd.append('links', JSON.stringify(links.filter(l => l.url.trim())));
      fd.append('important', String(important));
      fd.append('rating', String(rating));
      fd.append('tags', tags);
      images.forEach(p => fd.append('images', p.file));
      files.forEach(p => fd.append('files', p.file));
      // Parallel to the uploads above: captions[i] describes images[i], and
      // labels[i] describes files[i].
      fd.append('imageCaptions', JSON.stringify(images.map(p => p.label)));
      fd.append('fileLabels', JSON.stringify(files.map(p => p.label)));
      setProgress(0);
      return createEaItem(fd, setProgress);
    },
    onSuccess: () => {
      setProgress(null);
      void qc.invalidateQueries({ queryKey: ['ea-items'] });
      const n = images.length + files.length;
      addToast({
        type: 'success',
        title: t('ea.saved_new'),
        message: n ? `${n} ${t('ea.uploaded_suffix')}` : undefined,
      });
      onClose();
    },
    onError: (e: unknown) => {
      setProgress(null);
      setError(e instanceof Error ? e.message : 'Save failed');
    },
  });

  const dirty = Boolean(name || description || tags || images.length || files.length);

  /**
   * Closing throws away whatever has been typed, so ask first — and never let
   * a stray click on the backdrop do it silently.
   *
   * Amber, not red: nothing leaves the server here, only the typing is lost,
   * and a question that looks identical to the one asked before a permanent
   * delete teaches people to dismiss both without reading.
   */
  const requestClose = () => {
    if (!dirty) { onClose(); return; }
    ask({
      tone: 'warning',
      title: t('ea.discard_title'),
      cancelLabel: t('ea.discard_keep'),
      confirmLabel: t('ea.discard_go'),
      onConfirm: onClose,
      body: (
        <>
          {t('ea.discard_body')}
          <div style={{ color: 'var(--text-muted)', marginTop: '5px' }}>
            {t('ea.discard_nothing_deleted')}
          </div>
        </>
      ),
    });
  };

  useEffect(() => {
    if (asking) return;   // the question on top owns the key while it is up
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /**
   * A file dropped anywhere but the drop zone is swallowed.
   *
   * A browser's default for a dropped file is to open it, which navigates away
   * from the page — so one miss by a few pixels while the form is filled in
   * would throw the whole entry away. Cancelling both events is what makes a
   * miss a no-op; a drop that lands on the zone is handled there first and
   * only reaches this as an already-cancelled event.
   */
  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        className="ea-form-modal"
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-card)', width: '100%', maxWidth: '560px', maxHeight: '100%',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <div style={{ flex: 1, fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)', color: 'var(--text-primary)' }}>
            {t('ea.add')}
          </div>
          <Btn label={t('ea.close')} onClick={requestClose} />
        </div>

        <div style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Field label={t('ea.name')}>
            <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          </Field>

          <Field label={`${t('ea.type')} — ${t('ea.type_multi_hint')}`}>
            <MultiPick options={EA_TYPES} value={type} onChange={setType} />
          </Field>

          <Field label={t('ea.status')}>
            <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
              {EA_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </Field>

          <Field label={t('ea.description')}>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>

          <Field label={t('ea.rating')}>
            <StarPicker
              value={rating}
              onChange={setRating}
              labelFor={n => `${t('ea.rating')} ${n}/${EA_MAX_STARS}`}
              clearLabel={t('ea.clear_rating')}
            />
          </Field>

          <Field label={t('ea.developer')}>
            <input
              value={developer}
              onChange={e => setDeveloper(e.target.value)}
              placeholder={t('ea.developer_ph')}
              style={inputStyle}
            />
          </Field>

          <Field label={t('ea.links')}>
            <LinkEditor value={links} onChange={setLinks} />
          </Field>

          <Field label={t('ea.important')}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)',
            }}>
              <input
                type="checkbox"
                checked={important}
                onChange={e => setImportant(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--danger)', cursor: 'pointer' }}
              />
              {t('ea.important_hint')}
            </label>
          </Field>

          <Field label={`${t('ea.tags')} — reporter, gold, production`}>
            <input value={tags} onChange={e => setTags(e.target.value)} style={inputStyle} />
          </Field>

          <Field label={`${t('ea.images')}${images.length ? ` · ${images.length}` : ''}`}>
            <DropZone
              images
              accept="image/*"
              hint={t('ea.drop_images_hint')}
              onAdd={addTo(setImages, files)}
            />
            {images.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                {images.map(p => (
                  <PickedThumb
                    key={p.key}
                    file={p.file}
                    caption={p.label}
                    onCaption={next => setImages(prev => prev.map(q => (q.key === p.key ? { ...q, label: next } : q)))}
                    onRemove={() => removeAt(setImages, p.key)}
                  />
                ))}
              </div>
            )}
          </Field>

          <Field label={`${t('ea.files')}${files.length ? ` · ${files.length}` : ''}`}>
            <DropZone hint={t('ea.drop_files_hint')} onAdd={addTo(setFiles, images)} />
            {files.map(p => (
              <div key={p.key} style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap',
              }}>
                <span style={{
                  flex: '1 1 130px', minWidth: 0, fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
                  color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {p.file.name}
                  <span style={{ color: 'var(--text-dim)' }}> · {fmtSize(p.file.size)}</span>
                </span>
                <input
                  value={p.label}
                  onChange={e => setFiles(prev => prev.map(q => (q.key === p.key ? { ...q, label: e.target.value } : q)))}
                  placeholder={t('ea.file_label_ph')}
                  style={{ ...inputStyle, flex: '1 1 165px', width: 'auto' }}
                />
                <Btn
                  label={'✕'}
                  onClick={() => removeAt(setFiles, p.key)}
                  tone="danger"
                  title={`${t('common.cancel')} ${p.file.name}`}
                />
              </div>
            ))}
          </Field>

          {error && (
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--danger)' }}>{error}</div>
          )}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)' }}>
          {save.isPending && <div style={{ marginBottom: '9px' }}><ProgressBar progress={progress ?? undefined} t={t} /></div>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Btn label={t('common.cancel')} onClick={requestClose} />
            <Btn
              label={save.isPending ? t('common.loading') : t('common.save')}
              onClick={() => {
                if (save.isPending) return;
                if (!name.trim()) { setError(t('ea.name_required')); return; }
                if (!type.length) { setError(t('ea.type_required')); return; }
                save.mutate();
              }}
              tone="primary"
            />
          </div>
        </div>
      </div>

      {confirmNode}
    </div>
  );
};

// ─── Edit the text ───────────────────────────────────────────────────────────

/**
 * Four fields, and no way to reach a file from here.
 *
 * The form this replaces held the uploads too, which is what made a stray
 * click expensive: closing it lost the typing, and one wrong ✕ lost a file.
 * With the attachments managed on the detail view, Cancel here means only
 * "forget what I typed", which is what a Cancel should mean.
 */
const EaTextForm = ({ item, onClose }: { item: EaItemDto; onClose: () => void }) => {
  const t = useTranslation();
  const qc = useQueryClient();
  const addToast = useUIStore(s => s.addToast);

  const [name, setName] = useState(item.name);
  const [type, setType] = useState<string[]>(item.type);
  const [status, setStatus] = useState(item.status);
  const [description, setDescription] = useState(item.description);
  const [developer, setDeveloper] = useState(item.developer);
  const [links, setLinks] = useState<EaLinkDto[]>(item.links);
  const [important, setImportant] = useState(item.important);
  const [rating, setRating] = useState(item.rating);
  const [tags, setTags] = useState(item.tags.join(', '));
  const [error, setError] = useState('');
  const { confirmNode, ask, asking } = useConfirm();

  const save = useMutation({
    mutationFn: () =>
      patchEaItem(item.id, {
        name, type, status, description, developer, important, rating, tags,
        links: links.filter(l => l.url.trim()),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ea-items'] });
      addToast({ type: 'success', title: t('ea.saved_edit') });
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Save failed'),
  });

  const dirty = name !== item.name || type.join(',') !== item.type.join(',')
    || status !== item.status || description !== item.description
    || developer !== item.developer
    || JSON.stringify(links) !== JSON.stringify(item.links)
    || important !== item.important || rating !== item.rating
    || tags !== item.tags.join(', ');

  const requestClose = () => {
    if (!dirty) { onClose(); return; }
    ask({
      tone: 'warning',
      title: t('ea.discard_title'),
      cancelLabel: t('ea.discard_keep'),
      confirmLabel: t('ea.discard_go'),
      onConfirm: onClose,
      body: (
        <>
          {t('ea.discard_body')}
          <div style={{ color: 'var(--text-muted)', marginTop: '5px' }}>
            {t('ea.discard_nothing_deleted')}
          </div>
        </>
      ),
    });
  };

  useEffect(() => {
    if (asking) return;   // the question on top owns the key while it is up
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div
        className="ea-form-modal"
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-card)', width: '100%', maxWidth: '460px', maxHeight: '100%',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <div style={{ flex: 1, fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)', color: 'var(--text-primary)' }}>
            {t('ea.edit')}
          </div>
          <Btn label={t('ea.close')} onClick={requestClose} />
        </div>

        <div style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Field label={t('ea.name')}>
            <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          </Field>
          <Field label={`${t('ea.type')} — ${t('ea.type_multi_hint')}`}>
            <MultiPick options={EA_TYPES} value={type} onChange={setType} />
          </Field>

          <Field label={t('ea.status')}>
            <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
              {EA_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </Field>
          <Field label={t('ea.description')}>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
          <Field label={t('ea.rating')}>
            <StarPicker
              value={rating}
              onChange={setRating}
              labelFor={n => `${t('ea.rating')} ${n}/${EA_MAX_STARS}`}
              clearLabel={t('ea.clear_rating')}
            />
          </Field>

          <Field label={t('ea.developer')}>
            <input
              value={developer}
              onChange={e => setDeveloper(e.target.value)}
              placeholder={t('ea.developer_ph')}
              style={inputStyle}
            />
          </Field>

          <Field label={t('ea.links')}>
            <LinkEditor value={links} onChange={setLinks} />
          </Field>

          <Field label={t('ea.important')}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)',
            }}>
              <input
                type="checkbox"
                checked={important}
                onChange={e => setImportant(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--danger)', cursor: 'pointer' }}
              />
              {t('ea.important_hint')}
            </label>
          </Field>

          <Field label={`${t('ea.tags')} — reporter, gold, production`}>
            <input value={tags} onChange={e => setTags(e.target.value)} style={inputStyle} />
          </Field>

          {/* Says where the files went, so the first visit after the change is
              not spent hunting for them. */}
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
            color: 'var(--text-dim)', lineHeight: 1.6,
          }}>
            {t('ea.files_moved_hint')}
          </div>

          {error && (
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--danger)' }}>{error}</div>
          )}
        </div>

        <div style={{
          padding: '10px 16px', borderTop: '1px solid var(--border-color)',
          display: 'flex', gap: '8px', justifyContent: 'flex-end',
        }}>
          <Btn label={t('common.cancel')} onClick={requestClose} />
          <Btn
            label={save.isPending ? t('common.loading') : t('common.save')}
            onClick={() => {
              if (save.isPending) return;
              if (!name.trim()) { setError(t('ea.name_required')); return; }
              if (!type.length) { setError(t('ea.type_required')); return; }
              save.mutate();
            }}
            tone="primary"
          />
        </div>
      </div>

      {confirmNode}
    </div>
  );
};

/** The ✓ and ✕ beside a field being edited. Square, so the pair reads as one
 *  control rather than two words competing with the text above them. */
const miniBtn: React.CSSProperties = {
  width: '24px', height: '22px', lineHeight: 1, padding: 0, cursor: 'pointer',
  fontSize: '11px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border2)', background: 'var(--bg-card)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-input)',
  padding: '7px 10px',
  background: 'var(--bg-input)', color: 'var(--text-primary)',
  border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
};

/**
 * Pick one or more.
 *
 * A row of toggles rather than a <select multiple>: that control needs a
 * ctrl-click to add a second value, which nobody discovers, and on a phone it
 * is barely operable at all. Here what is on is visibly on.
 */
const MultiPick = ({ options, value, onChange }: {
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
}) => (
  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
    {options.map(opt => {
      const on = value.includes(opt);
      return (
        <button
          key={opt}
          type="button"
          aria-pressed={on}
          onClick={() => onChange(on ? value.filter(v => v !== opt) : [...value, opt])}
          style={{
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px',
            padding: '5px 11px', cursor: 'pointer', borderRadius: '999px', whiteSpace: 'nowrap',
            border: `1px solid ${on ? (TYPE_COLORS[opt] ?? 'var(--accent-blue)') : 'var(--border2)'}`,
            color: on ? (TYPE_COLORS[opt] ?? 'var(--accent-blue)') : 'var(--text-dim)',
            background: on ? 'rgba(255,255,255,.05)' : 'transparent',
            transition: 'all .12s',
          }}
        >
          {on ? '✓ ' : ''}{opt}
        </button>
      );
    })}
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div style={{
      fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)',
      color: 'var(--text-dim)', letterSpacing: '.5px', marginBottom: '5px',
    }}>{label}</div>
    {children}
  </div>
);

// ─── Page ────────────────────────────────────────────────────────────────────

export const EaRepository = () => {
  const t = useTranslation();
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  // Reuses the dashboard's card/table preference so the two lists agree.
  const viewMode = useUIStore(s => s.botViewMode);
  const setViewMode = useUIStore(s => s.setBotViewMode);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | EaType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | EaStatus>('all');
  const [tagFilter, setTagFilter] = useState<'all' | string>('all');
  const [onlyImportant, setOnlyImportant] = useState(false);
  /** '' = any, 'none' = not rated yet, or a floor like '4' for four and up. */
  const [ratingFilter, setRatingFilter] = useState('');
  /**
   * The open entry is held by id, not by value.
   *
   * Every inline edit on the detail view refetches the list; a snapshot taken
   * when the row was clicked would keep showing the caption, the file or the
   * name as they were before the change that was just made.
   */
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingTextOf, setEditingTextOf] = useState<EaItemDto | null>(null);

  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<EaItemDto[]>({
    queryKey: ['ea-items'],
    queryFn: fetchEaItems,
  });
  const remove = useMutation({
    mutationFn: deleteEaItem,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ea-items'] }); setOpenId(null); },
  });

  const items = data ?? [];
  const open = items.find(i => i.id === openId) ?? null;
  const filtered = useMemo(() => items.filter(i => {
    if (typeFilter !== 'all' && !i.type.includes(typeFilter)) return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (tagFilter !== 'all' && !i.tags.includes(tagFilter)) return false;
    if (onlyImportant && !i.important) return false;
    if (ratingFilter === 'none' && i.rating !== 0) return false;
    if (ratingFilter && ratingFilter !== 'none' && i.rating < Number(ratingFilter)) return false;
    const q = search.trim().toLowerCase();
    return !q
      || i.name.toLowerCase().includes(q)
      || i.description.toLowerCase().includes(q)
      || i.developer.toLowerCase().includes(q)
      || i.tags.some(tag => tag.toLowerCase().includes(q));
  }), [items, search, typeFilter, statusFilter, tagFilter, onlyImportant, ratingFilter]);

  const types = [...new Set(items.flatMap(i => i.type))];
  const tags = [...new Set(items.flatMap(i => i.tags))].sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* ── Header ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '7px', height: '7px', background: 'var(--accent-blue)', flexShrink: 0 }} />
          <span style={{
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
            color: 'var(--text-primary)', letterSpacing: '2px',
          }}>{t('ea.title')}</span>
          {/* States plainly what this account may do, rather than hiding the
              buttons and leaving a viewer wondering. */}
          <span style={{
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px',
            padding: '2px 7px', borderRadius: 'var(--radius-sm)',
            border: `1px solid ${isAdmin ? 'var(--accent-blue)' : 'var(--border2)'}`,
            color: isAdmin ? 'var(--accent-blue)' : 'var(--text-dim)',
          }}>{isAdmin ? t('ea.admin_only') : t('ea.view_only')}</span>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
          {isAdmin && <Btn label={t('ea.add')} onClick={() => setAdding(true)} tone="primary" />}
        </div>
        <p style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
          color: 'var(--text-dim)', marginLeft: '15px',
        }}>{t('ea.subtitle')}</p>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('ea.search')}
          style={{
            flex: '1 1 140px', minWidth: 0,
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-input)',
            padding: '6px 10px',
            background: 'var(--bg-input)', color: 'var(--text-primary)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
          }}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as 'all' | EaType)}
          style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-input)',
            padding: '6px 10px',
            background: 'var(--bg-input)', color: 'var(--text-primary)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
          }}
        >
          <option value="all">{t('ea.all_types')}</option>
          {types.map(ty => <option key={ty} value={ty}>{ty}</option>)}
        </select>
        {/* A mark you cannot filter by only helps on the page you are already
            looking at. One button, because it has two states, not a list. */}
        <button
          onClick={() => setOnlyImportant(v => !v)}
          title={t('ea.only_important')}
          aria-label={t('ea.only_important')}
          aria-pressed={onlyImportant}
          style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-input)',
            padding: '7px 11px', cursor: 'pointer', whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center',
            background: onlyImportant ? 'color-mix(in srgb, var(--danger) 16%, transparent)' : 'var(--bg-input)',
            color: onlyImportant ? 'var(--danger)' : 'var(--text-dim)',
            border: `1px solid ${onlyImportant ? 'color-mix(in srgb, var(--danger) 45%, transparent)' : 'var(--border2)'}`,
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <IconBookmark size={15} filled={onlyImportant} />
        </button>
        {/* A status nobody can filter by is a label, not a status. */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | EaStatus)}
          style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-input)',
            padding: '6px 10px',
            background: 'var(--bg-input)', color: 'var(--text-primary)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
          }}
        >
          <option value="all">{t('ea.all_statuses')}</option>
          {EA_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
        </select>
        {/* A score you cannot filter by only helps on the page already open. */}
        <select
          value={ratingFilter}
          onChange={e => setRatingFilter(e.target.value)}
          aria-label={t('ea.rating')}
          style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-input)',
            padding: '6px 10px',
            background: 'var(--bg-input)', color: 'var(--text-primary)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
          }}
        >
          <option value="">{t('ea.all_ratings')}</option>
          <option value="5">{'★★★★★'}</option>
          <option value="4">{'★★★★+'}</option>
          <option value="3">{'★★★+'}</option>
          <option value="none">{t('ea.not_rated')}</option>
        </select>
        <select
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-input)',
            padding: '6px 10px',
            background: 'var(--bg-input)', color: 'var(--text-primary)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
          }}
        >
          <option value="all">{t('ea.all_tags')}</option>
          {tags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
        </select>
        <Btn
          label={viewMode === 'card' ? `▤ ${t('filter.table')}` : `▦ ${t('filter.cards')}`}
          onClick={() => setViewMode(viewMode === 'card' ? 'table' : 'card')}
        />
      </div>

      {/* ── List ── */}
      {isLoading ? (
        <Muted>{t('common.loading')}</Muted>
      ) : error ? (
        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--danger)' }}>
          {(error as Error).message}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px dashed var(--border2)',
          borderRadius: 'var(--radius-card)', padding: '36px 20px', textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
            color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '6px',
          }}>{items.length === 0 ? t('ea.empty') : t('ea.no_match')}</div>
          {items.length === 0 && <Muted>{t('ea.empty_hint')}</Muted>}
        </div>
      ) : viewMode === 'table' ? (
        <TableView items={filtered} onOpen={item => setOpenId(item.id)} />
      ) : (
        <CardView items={filtered} onOpen={item => setOpenId(item.id)} />
      )}

      {open && (
        <DetailModal
          item={open}
          isAdmin={isAdmin}
          onClose={() => setOpenId(null)}
          keysBusy={Boolean(editingTextOf)}
          onEdit={() => setEditingTextOf(open)}
          onDelete={() => remove.mutate(open.id)}
        />
      )}
      {/* Layered over the detail view rather than replacing it: the four
          fields are a detour, and coming back should land where you were. */}
      {editingTextOf && (
        <EaTextForm item={editingTextOf} onClose={() => setEditingTextOf(null)} />
      )}
      {adding && <EaForm onClose={() => setAdding(false)} />}
    </div>
  );
};

// ─── Views ───────────────────────────────────────────────────────────────────

interface ViewProps {
  items: EaItemDto[];
  onOpen: (item: EaItemDto) => void;
}

const TableView = ({ items, onOpen }: ViewProps) => {
  const t = useTranslation();
  return (
    <div className="ea-wrap">
      <table>
        <thead>
          <tr>
            <th className="ea-col-name">{t('ea.name')}</th>
            <th className="ea-col-status">{t('ea.status')}</th>
            <th className="ea-col-perf">{t('ea.rating')}</th>
            <th className="ea-col-type">{t('ea.type')}</th>
            <th className="ea-col-desc">{t('ea.description')}</th>
            <th className="ea-col-tags">{t('ea.tags')}</th>
            <th className="ea-col-count">{t('ea.files')}</th>
            <th className="ea-col-count">{t('ea.images')}</th>
            <th className="ea-col-date">{t('ea.updated')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="ea-row" onClick={() => onOpen(item)}>
              <td className="ea-col-name">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%' }}>
                  {item.important && <ImportantMark label={t('ea.important')} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </span>
                </span>
              </td>
              <td className="ea-col-status"><StatusBadge status={item.status} /></td>
              <td className="ea-col-perf">
                <Stars value={item.rating} label={ratingLabel(t, item.rating)} />
              </td>
              <td className="ea-col-type">
                <span style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <TypeBadges types={item.type} />
                </span>
              </td>
              <td className="ea-col-desc"><span className="ea-desc">{item.description}</span></td>
              <td className="ea-col-tags">
                <span style={{ display: 'inline-flex', gap: '4px' }}>
                  {item.tags.map(tag => <TagChip key={tag} tag={tag} />)}
                </span>
              </td>
              <td className="ea-col-count">{item.files.length}</td>
              <td className="ea-col-count">{item.images.length}</td>
              <td className="ea-col-date">{item.updatedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <style>{`
        .ea-wrap {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-card);
          overflow: hidden;
        }
        .ea-wrap table { width: 100%; table-layout: fixed; border-collapse: collapse; }
        .ea-wrap th {
          font-family: var(--ff-section); font-size: var(--fs-micro);
          color: var(--text-dim); letter-spacing: .5px; font-weight: 400;
          text-align: left; padding: 8px 10px; white-space: nowrap;
          background: var(--bg-card2); border-bottom: 1px solid var(--border2);
        }
        .ea-wrap td {
          padding: 9px 10px;
          font-family: var(--ff-body); font-size: var(--fs-body-sm);
          color: var(--text-primary);
          border-bottom: 1px solid rgba(42,45,52,.35);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ea-wrap .ea-row { cursor: pointer; }
        .ea-wrap .ea-row:hover td { background: rgba(42,45,52,.25); }
        /* Full strength, not the dim grey the other secondary text uses: this
           is the one cell you actually read to tell two entries apart, and at
           11px over a dark row the dim grey was hard work. */
        .ea-wrap .ea-desc { color: var(--text-primary); }

        /* Status has its own column on purpose: it answers "how is this one
           doing", which is a different question from "what is this one", and
           a column of its own is what makes it scannable straight down. */
        .ea-wrap .ea-col-name   { width: 18%; }
        .ea-wrap .ea-col-status { width: 8%; }
        .ea-wrap .ea-col-perf   { width: 9%; }
        .ea-wrap .ea-col-type   { width: 12%; }
        .ea-wrap .ea-col-desc   { width: 21%; }
        .ea-wrap .ea-col-tags   { width: 12%; }
        .ea-wrap .ea-col-count { width: 6%; text-align: right; }
        .ea-wrap .ea-col-date  { width: 11%; color: var(--text-dim); }

        @media (max-width: 768px) {
          /* Description and the counts are what a phone can afford to lose;
             the name, its type and when it last moved are what you scan for. */
          .ea-wrap .ea-col-desc,
          .ea-wrap .ea-col-tags,
          .ea-wrap .ea-col-perf,
          .ea-wrap .ea-col-count { display: none; }
          .ea-wrap th, .ea-wrap td { padding: 7px 8px; }
          .ea-wrap .ea-col-name   { width: 36%; }
          .ea-wrap .ea-col-status { width: 18%; }
          .ea-wrap .ea-col-type   { width: 24%; }
          .ea-wrap .ea-col-date   { width: 22%; }
        }
      `}</style>
    </div>
  );
};

const CardView = ({ items, onOpen }: ViewProps) => {
  const t = useTranslation();
  return (
    <div className="ea-grid">
      {items.map(item => (
        <div key={item.id} className="ea-card" onClick={() => onOpen(item)}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <Thumb image={item.images[0]} size={52} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Status rides the top-right corner of every card, so it sits in
                  the same place on all of them and reads at a glance. A flex
                  sibling rather than an absolute badge: the name keeps its
                  ellipsis and can never run underneath it. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {item.important && <ImportantMark label={t('ea.important')} />}
                <div style={{
                  flex: 1, minWidth: 0,
                  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
                  color: 'var(--text-primary)', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{item.name}</div>
                <StatusBadge status={item.status} />
              </div>
              <div style={{ marginTop: '5px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <Stars value={item.rating} label={ratingLabel(t, item.rating)} />
                <TypeBadges types={item.type} />
              </div>
            </div>
          </div>

          <p className="ea-card-desc">{item.description}</p>

          {item.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {item.tags.map(tag => <TagChip key={tag} tag={tag} />)}
            </div>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            paddingTop: '8px', borderTop: '1px solid var(--border-color)',
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)', color: 'var(--text-dim)',
          }}>
            <span>▤ {item.files.length} {t('ea.files')}</span>
            <span>▦ {item.images.length} {t('ea.images')}</span>
            <span style={{ marginLeft: 'auto' }}>{item.updatedAt}</span>
          </div>
        </div>
      ))}

      <style>{`
        .ea-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 10px;
        }
        .ea-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-card);
          padding: 12px;
          display: flex; flex-direction: column; gap: 10px;
          cursor: pointer;
          transition: border-color .15s;
        }
        .ea-card:hover { border-color: var(--accent-blue); }
        /* Full strength, like the same text in the table: it is what tells
           two entries apart, and the dim grey was hard work over a dark card. */
        .ea-card-desc {
          margin: 0;
          font-family: var(--ff-body); font-size: var(--fs-body-sm);
          color: var(--text-primary); line-height: 1.45;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden;
        }
        @media (max-width: 768px) {
          .ea-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};
