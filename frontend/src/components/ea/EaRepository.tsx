import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useTranslation } from '../../i18n/useTranslation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchEaItems, createEaItem, updateEaItem, deleteEaItem,
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

const Btn = ({ label, onClick, tone = 'ghost' }: {
  label: string; onClick: () => void; tone?: 'ghost' | 'primary' | 'danger';
}) => {
  const colors = {
    ghost:   { fg: 'var(--text-dim)',    bd: 'var(--border2)',            bg: 'transparent' },
    primary: { fg: 'var(--accent-blue)', bd: 'var(--accent-blue)',        bg: 'rgba(96,165,250,.1)' },
    danger:  { fg: 'var(--danger)',      bd: 'rgba(248,113,113,.5)',      bg: 'transparent' },
  }[tone];
  return (
    <button
      onClick={onClick}
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

const DetailModal = ({ item, isAdmin, onClose, onEdit, onDelete }: {
  item: EaItemDto; isAdmin: boolean;
  onClose: () => void; onEdit: () => void; onDelete: () => void;
}) => {
  const t = useTranslation();
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

          <section>
            <SectionLabel>{t('ea.images')} · {item.images.length}</SectionLabel>
            {item.images.length === 0 ? (
              <Muted>{t('ea.no_images')}</Muted>
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {item.images.map(img => (
                  <div key={img.id} style={{ textAlign: 'center' }}>
                    <Thumb image={img} size={92} />
                    <div style={{
                      fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
                      color: 'var(--text-dim)', marginTop: '4px', maxWidth: '92px',
                    }}>{img.caption}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

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
                      color: 'var(--text-dim)', marginTop: '2px',
                    }}>{f.label || '—'} · {fmtSize(f.size)} · {f.createdAt}</div>
                  </div>
                  <Btn label={t('ea.download')} onClick={() => { void downloadEaFile(f.id, f.filename); }} />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* admin footer */}
        {isAdmin && (
          <div style={{
            padding: '10px 16px', borderTop: '1px solid var(--border-color)',
            display: 'flex', gap: '8px',
          }}>
            <Btn label={t('ea.edit')} onClick={onEdit} tone="primary" />
            {/* Deleting takes the files with it, so make them say so. */}
            <Btn
              label={t('ea.delete')}
              onClick={() => { if (window.confirm(`${t('ea.delete')} — ${item.name}?`)) onDelete(); }}
              tone="danger"
            />
          </div>
        )}
      </div>
    </div>
  );
};

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

// ─── Add / edit form ─────────────────────────────────────────────────────────

const EaForm = ({ item, onClose }: { item: EaItemDto | null; onClose: () => void }) => {
  const t = useTranslation();
  const qc = useQueryClient();

  const [name, setName] = useState(item?.name ?? '');
  const [type, setType] = useState<string>(item?.type ?? EA_TYPES[0]);
  const [description, setDescription] = useState(item?.description ?? '');
  const [tags, setTags] = useState((item?.tags ?? []).join(', '));
  const [images, setImages] = useState<File[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  /** Labels live beside the picked files so labels[i] describes files[i] —
   *  the same pairing the API expects. */
  const [fileLabels, setFileLabels] = useState<string[]>([]);
  const [removeFileIds, setRemoveFileIds] = useState<string[]>([]);
  const [removeImageIds, setRemoveImageIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('type', type);
      fd.append('description', description);
      fd.append('tags', tags);
      images.forEach(f => fd.append('images', f));
      files.forEach(f => fd.append('files', f));
      fd.append('fileLabels', JSON.stringify(fileLabels));
      if (item) {
        fd.append('removeFileIds', JSON.stringify(removeFileIds));
        fd.append('removeImageIds', JSON.stringify(removeImageIds));
        return updateEaItem(item.id, fd);
      }
      return createEaItem(fd);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ea-items'] }); onClose(); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Save failed'),
  });

  const pickFiles = (picked: FileList | null) => {
    const list = Array.from(picked ?? []);
    setFiles(list);
    setFileLabels(list.map(() => ''));
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        className="ea-form-modal"
        onClick={e => e.stopPropagation()}
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
            {item ? t('ea.edit') : t('ea.add')}
          </div>
          <Btn label={t('ea.close')} onClick={onClose} />
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

          <Field label={t('ea.images')}>
            <input type="file" multiple accept="image/*" onChange={e => setImages(Array.from(e.target.files ?? []))} style={inputStyle} />
          </Field>

          <Field label={t('ea.files')}>
            <input type="file" multiple onChange={e => pickFiles(e.target.files)} style={inputStyle} />
            {files.map((f, i) => (
              <div key={f.name + i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <span style={{
                  flex: 1, minWidth: 0, fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
                  color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{f.name}</span>
                <input
                  value={fileLabels[i] ?? ''}
                  onChange={e => setFileLabels(prev => prev.map((l, j) => (j === i ? e.target.value : l)))}
                  placeholder="Current build / Preset"
                  style={{ ...inputStyle, flex: '0 0 170px' }}
                />
              </div>
            ))}
          </Field>

          {/* Existing attachments, removable one at a time. */}
          {item && (item.files.length > 0 || item.images.length > 0) && (
            <Field label={t('ea.sub_files')}>
              {item.images.map(img => (
                <ExistingRow
                  key={img.id}
                  text={`▦ ${img.filename}`}
                  removed={removeImageIds.includes(img.id)}
                  onToggle={() => setRemoveImageIds(p => p.includes(img.id) ? p.filter(x => x !== img.id) : [...p, img.id])}
                />
              ))}
              {item.files.map(f => (
                <ExistingRow
                  key={f.id}
                  text={`▤ ${f.filename}${f.label ? ` · ${f.label}` : ''}`}
                  removed={removeFileIds.includes(f.id)}
                  onToggle={() => setRemoveFileIds(p => p.includes(f.id) ? p.filter(x => x !== f.id) : [...p, f.id])}
                />
              ))}
            </Field>
          )}

          {error && (
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--danger)' }}>{error}</div>
          )}
        </div>

        <div style={{
          padding: '10px 16px', borderTop: '1px solid var(--border-color)',
          display: 'flex', gap: '8px', justifyContent: 'flex-end',
        }}>
          <Btn label={t('common.cancel')} onClick={onClose} />
          <Btn
            label={save.isPending ? t('common.loading') : t('common.save')}
            onClick={() => { if (name.trim()) save.mutate(); else setError('name'); }}
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

const ExistingRow = ({ text, removed, onToggle }: { text: string; removed: boolean; onToggle: () => void }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px',
    fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
    color: removed ? 'var(--text-dim)' : 'var(--text-primary)',
    textDecoration: removed ? 'line-through' : 'none',
  }}>
    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
    <Btn label={removed ? '↺' : '✕'} onClick={onToggle} tone={removed ? 'ghost' : 'danger'} />
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
  const [open, setOpen] = useState<EaItemDto | null>(null);
  /** undefined = closed, null = adding, an item = editing it. */
  const [editing, setEditing] = useState<EaItemDto | null | undefined>(undefined);

  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<EaItemDto[]>({
    queryKey: ['ea-items'],
    queryFn: fetchEaItems,
  });
  const remove = useMutation({
    mutationFn: deleteEaItem,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ea-items'] }); setOpen(null); },
  });

  const items = data ?? [];
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
          {isAdmin && <Btn label={t('ea.add')} onClick={() => setEditing(null)} tone="primary" />}
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
        <TableView items={filtered} onOpen={setOpen} />
      ) : (
        <CardView items={filtered} onOpen={setOpen} />
      )}

      {open && (
        <DetailModal
          item={open}
          isAdmin={isAdmin}
          onClose={() => setOpen(null)}
          onEdit={() => { setEditing(open); setOpen(null); }}
          onDelete={() => remove.mutate(open.id)}
        />
      )}
      {editing !== undefined && <EaForm item={editing} onClose={() => setEditing(undefined)} />}
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
