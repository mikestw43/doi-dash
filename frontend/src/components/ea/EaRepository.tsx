import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useTranslation } from '../../i18n/useTranslation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchEaItems, createEaItem, patchEaItem, deleteEaItem,
  addEaUploads, setEaFileLabel, setEaImageCaption, deleteEaFile, deleteEaImage,
  fetchEaImageUrl, downloadEaFile,
  type EaItemDto, type EaImageDto,
} from '../../services/api';

// ─── Shape ───────────────────────────────────────────────────────────────────
//
// One entry is a *thing* (an EA, an indicator, a script), not a file: the
// screenshots, the .set presets and the older builds all hang off it. That is
// what keeps "version 1.1 of the reporter" and "the preset that goes with it"
// in the same place instead of two unrelated uploads.

const EA_TYPES = ['MT5 EA', 'MT4 EA', 'Indicator', 'Script', 'Source', 'Other'] as const;
type EaType = typeof EA_TYPES[number];

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

      <div onClick={e => e.stopPropagation()} style={{
        fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
        color: 'var(--text-dim)', textAlign: 'center', maxWidth: '90%',
      }}>
        {image.caption || image.filename}
        {images.length > 1 && <span> · {index + 1}/{images.length}</span>}
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

const Btn = ({ label, onClick, tone = 'ghost', title }: {
  label: string; onClick: () => void; tone?: 'ghost' | 'primary' | 'danger';
  /** Names the button when the label is a bare glyph. Several ✕ in one list
   *  are otherwise the same button to a tooltip and to a screen reader. */
  title?: string;
}) => {
  const colors = {
    ghost:   { fg: 'var(--text-dim)',    bd: 'var(--border2)',            bg: 'transparent' },
    primary: { fg: 'var(--accent-blue)', bd: 'var(--accent-blue)',        bg: 'rgba(96,165,250,.1)' },
    danger:  { fg: 'var(--danger)',      bd: 'rgba(248,113,113,.5)',      bg: 'transparent' },
  }[tone];
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title ?? label}
      style={{
        fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)', letterSpacing: '.5px',
        padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
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
const InlineText = ({
  value, placeholder, onSave, style, multiline,
}: {
  value: string;
  placeholder: string;
  onSave: (next: string) => Promise<unknown>;
  style?: React.CSSProperties;
  multiline?: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // A change made elsewhere (another field's save refetches the entry) must
  // not be overwritten by a stale draft sitting in a field nobody is using.
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const commit = async () => {
    setEditing(false);
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

  if (editing) {
    const props = {
      autoFocus: true,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: () => { void commit(); },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        if (e.key === 'Enter' && !multiline) (e.target as HTMLElement).blur();
      },
      style: { ...inputStyle, ...style, width: '100%' },
    };
    return multiline
      ? <textarea {...props} rows={3} style={{ ...props.style, resize: 'vertical' }} />
      : <input {...props} />;
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title={t_editHint}
      className="ea-inline"
      style={{
        display: 'inline-block', maxWidth: '100%',
        padding: '2px 6px', margin: '-2px -6px',
        borderRadius: 'var(--radius-sm)',
        border: '1px dashed transparent',
        cursor: 'text', whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
        color: value ? undefined : 'var(--text-dim)',
        fontStyle: value ? undefined : 'italic',
        opacity: busy ? .5 : 1,
        ...style,
      }}
    >
      {value || placeholder}
      {saved && <span style={{ color: 'var(--success)', fontSize: 'var(--fs-micro)', marginLeft: '7px' }}>{'✓'}</span>}
    </span>
  );
};

/** Set once, in English, because it is a mouse tooltip on a desktop only. */
const t_editHint = 'Click to edit';

const DetailModal = ({ item, isAdmin, onClose, onEdit, onDelete }: {
  item: EaItemDto; isAdmin: boolean;
  onClose: () => void; onEdit: () => void; onDelete: () => void;
}) => {
  const t = useTranslation();
  const qc = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  /** Which screenshot is open full size, or null. */
  const [zoom, setZoom] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null | undefined>(null);
  const [error, setError] = useState('');

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

  /** Deleting a file takes the bytes with it and there is no Cancel to fall
   *  back on any more, so each one asks. */
  const confirmRemove = (label: string, run: () => Promise<unknown>) => {
    if (window.confirm(`${t('ea.delete')} — ${label}?`)) void after(run());
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        className="ea-detail-modal"
        onClick={e => e.stopPropagation()}
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
            <div style={{
              fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-title)',
              color: 'var(--text-primary)', marginBottom: '6px',
            }}>{item.name}</div>
            <TypeBadge type={item.type} />
          </div>
          <Btn label={t('ea.close')} onClick={onClose} />
        </div>

        {/* body */}
        <div style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
            color: 'var(--text-primary)', lineHeight: 1.6, margin: 0,
          }}>{item.description}</p>

          {item.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {item.tags.map(tag => <TagChip key={tag} tag={tag} />)}
            </div>
          )}

          {/* ── Images ──
              Admins manage them here rather than in a form: a thumbnail you
              can see is the only safe thing to aim a delete at, and a caption
              is worth nothing if it cannot be fixed after the fact. */}
          <section>
            <SectionLabel>{t('ea.images')} · {item.images.length}</SectionLabel>
            {item.images.length === 0 && !isAdmin ? (
              <Muted>{t('ea.no_images')}</Muted>
            ) : (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {item.images.map((img, i) => (
                  <div key={img.id} style={{ width: '104px', position: 'relative' }}>
                    <div onClick={() => setZoom(i)} title={t('ea.zoom_hint')} style={{ cursor: 'zoom-in' }}>
                      <Thumb image={img} size={104} />
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => confirmRemove(img.filename, () => deleteEaImage(img.id))}
                        title={`${t('ea.delete')} ${img.filename}`}
                        aria-label={`${t('ea.delete')} ${img.filename}`}
                        style={{
                          position: 'absolute', top: '-7px', right: '-7px',
                          width: '20px', height: '20px', lineHeight: 1, padding: 0,
                          borderRadius: '50%', cursor: 'pointer', fontSize: '11px',
                          border: '1px solid var(--border2)', background: 'var(--bg-card)',
                          color: 'var(--danger)',
                        }}
                      >{'✕'}</button>
                    )}
                    <div style={{
                      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
                      color: 'var(--text-dim)', marginTop: '6px', textAlign: 'center',
                    }}>
                      {isAdmin
                        ? <InlineText
                            value={img.caption}
                            placeholder={t('ea.add_caption')}
                            onSave={next => after(setEaImageCaption(img.id, next))}
                          />
                        : img.caption}
                    </div>
                  </div>
                ))}

                {isAdmin && (
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
                  display: 'flex', alignItems: 'center', gap: '10px',
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
                    <div style={{
                      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
                      color: 'var(--text-dim)', marginTop: '3px',
                    }}>
                      {isAdmin
                        ? <InlineText
                            value={f.label}
                            placeholder={t('ea.add_note')}
                            onSave={next => after(setEaFileLabel(f.id, next))}
                          />
                        : (f.label || '—')}
                      {' · '}{fmtSize(f.size)} · {f.createdAt}
                    </div>
                  </div>
                  <Btn label={t('ea.download')} onClick={() => { void downloadEaFile(f.id, f.filename); }} />
                  {isAdmin && (
                    <Btn
                      label={'✕'}
                      tone="danger"
                      title={`${t('ea.delete')} ${f.filename}`}
                      onClick={() => confirmRemove(f.filename, () => deleteEaFile(f.id))}
                    />
                  )}
                </div>
              ))}

              {isAdmin && (
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
            {/* Text only. Files are handled above, one at a time, so nothing
                in this form can lose an upload. */}
            <Btn label={t('ea.edit_text')} onClick={onEdit} tone="primary" />
            <Btn
              label={t('ea.delete')}
              onClick={() => { if (window.confirm(`${t('ea.delete')} — ${item.name}?`)) onDelete(); }}
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
  /** Only files carry one — "Current build", "Preset · gold". Images do not. */
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
const PickedThumb = ({ file, onRemove }: { file: File; onRemove: () => void }) => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  return (
    <div style={{ position: 'relative', width: '62px' }}>
      <div style={{
        width: '62px', height: '62px', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
        border: '1px solid var(--border2)', background: 'var(--bg-tertiary)',
      }}>
        {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <button
        onClick={onRemove}
        title={file.name}
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
      <div style={{
        fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)', color: 'var(--text-dim)',
        marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {fmtSize(file.size)}
      </div>
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
  const [type, setType] = useState<string>(EA_TYPES[0]);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [images, setImages] = useState<Picked[]>([]);
  const [files, setFiles] = useState<Picked[]>([]);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null | undefined>(null);

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
      fd.append('type', type);
      fd.append('description', description);
      fd.append('tags', tags);
      images.forEach(p => fd.append('images', p.file));
      files.forEach(p => fd.append('files', p.file));
      // Parallel to the uploads above: labels[i] describes files[i].
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

  /** Closing throws away whatever has been typed, so ask first — and never
   *  let a stray click on the backdrop do it silently. */
  const requestClose = () => {
    if (!dirty || window.confirm(t('ea.discard_confirm'))) onClose();
  };

  useEffect(() => {
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

          <Field label={t('ea.type')}>
            <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
              {EA_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
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
                  <PickedThumb key={p.key} file={p.file} onRemove={() => removeAt(setImages, p.key)} />
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
              onClick={() => { if (!save.isPending && name.trim()) save.mutate(); else if (!name.trim()) setError('name'); }}
              tone="primary"
            />
          </div>
        </div>
      </div>
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
  const [type, setType] = useState(item.type);
  const [description, setDescription] = useState(item.description);
  const [tags, setTags] = useState(item.tags.join(', '));
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => patchEaItem(item.id, { name, type, description, tags }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ea-items'] });
      addToast({ type: 'success', title: t('ea.saved_edit') });
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Save failed'),
  });

  const dirty = name !== item.name || type !== item.type
    || description !== item.description || tags !== item.tags.join(', ');

  const requestClose = () => {
    if (!dirty || window.confirm(t('ea.discard_confirm'))) onClose();
  };

  useEffect(() => {
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
            {t('ea.edit_text')}
          </div>
          <Btn label={t('ea.close')} onClick={requestClose} />
        </div>

        <div style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Field label={t('ea.name')}>
            <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t('ea.type')}>
            <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
              {EA_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
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
            onClick={() => { if (!save.isPending && name.trim()) save.mutate(); else if (!name.trim()) setError('name'); }}
            tone="primary"
          />
        </div>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-input)',
  padding: '7px 10px',
  background: 'var(--bg-input)', color: 'var(--text-primary)',
  border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
};

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
  const [tagFilter, setTagFilter] = useState<'all' | string>('all');
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
    if (typeFilter !== 'all' && i.type !== typeFilter) return false;
    if (tagFilter !== 'all' && !i.tags.includes(tagFilter)) return false;
    const q = search.trim().toLowerCase();
    return !q
      || i.name.toLowerCase().includes(q)
      || i.description.toLowerCase().includes(q)
      || i.tags.some(tag => tag.toLowerCase().includes(q));
  }), [items, search, typeFilter, tagFilter]);

  const types = [...new Set(items.map(i => i.type))];
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
              <td className="ea-col-name">{item.name}</td>
              <td className="ea-col-type"><TypeBadge type={item.type} /></td>
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
        .ea-wrap .ea-desc { color: var(--text-dim); }

        .ea-wrap .ea-col-name  { width: 20%; }
        .ea-wrap .ea-col-type  { width: 12%; }
        .ea-wrap .ea-col-desc  { width: 28%; }
        .ea-wrap .ea-col-tags  { width: 18%; }
        .ea-wrap .ea-col-count { width: 7%; text-align: right; }
        .ea-wrap .ea-col-date  { width: 12%; color: var(--text-dim); }

        @media (max-width: 768px) {
          /* Description and the counts are what a phone can afford to lose;
             the name, its type and when it last moved are what you scan for. */
          .ea-wrap .ea-col-desc,
          .ea-wrap .ea-col-tags,
          .ea-wrap .ea-col-count { display: none; }
          .ea-wrap th, .ea-wrap td { padding: 7px 8px; }
          .ea-wrap .ea-col-name { width: 46%; }
          .ea-wrap .ea-col-type { width: 28%; }
          .ea-wrap .ea-col-date { width: 26%; }
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
              <div style={{
                fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
                color: 'var(--text-primary)', fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{item.name}</div>
              <div style={{ marginTop: '5px' }}><TypeBadge type={item.type} /></div>
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
        .ea-card-desc {
          margin: 0;
          font-family: var(--ff-body); font-size: var(--fs-body-sm);
          color: var(--text-dim); line-height: 1.45;
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
