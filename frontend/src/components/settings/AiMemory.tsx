import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAiMemories, addAiMemory, forgetAiMemory, type AiMemoryRow } from '../../services/api';
import { useTranslation } from '../../i18n/useTranslation';
import { useUIStore } from '../../stores/uiStore';
import { IconTrash } from '../icons';

/**
 * What the assistant is told about you, every time.
 *
 * It does not learn from being talked to — the model answering tomorrow
 * is the one that answered today, with none of it kept. This list is
 * the substitute: a few lines handed over with every question, so the
 * things that are always true do not have to be said again.
 *
 * Short on purpose. Every line is read on every question, so a page of
 * notes is a page of notes paid for each time — and it buries the two
 * lines that matter.
 */

export const AiMemory = () => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const [draft, setDraft] = useState('');

  const { data: memories, isLoading } = useQuery<AiMemoryRow[]>({
    queryKey: ['ai-memories'],
    queryFn: fetchAiMemories,
  });

  const add = useMutation({
    mutationFn: (text: string) => addAiMemory(text),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['ai-memories'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      addToast({ type: 'error', title: t('mem.title'), message: msg ?? 'Could not save' });
    },
  });

  const forget = useMutation({
    mutationFn: (id: string) => forgetAiMemory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-memories'] }),
  });

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-sm)', padding: '16px', minWidth: 0,
  };

  // One line per fact: a box of prose would be read as one blob, and
  // half of it could not be deleted without retyping the rest.
  const lines = draft.split('\n').map(l => l.trim()).filter(Boolean);

  return (
    <div style={card}>
      <div style={{
        fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-section)',
        color: 'var(--text-primary)', letterSpacing: '1px', marginBottom: '8px',
      }}>{t('mem.title')}</div>

      <p style={{
        fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
        color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '14px',
      }}>{t('mem.intro')}</p>

      {isLoading && (
        <div style={{ fontFamily: 'var(--ff-body)', color: 'var(--text-muted)' }}>{t('common.loading')}</div>
      )}

      {memories?.length === 0 && (
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: '14px', color: 'var(--text-muted)',
          lineHeight: 1.7, marginBottom: '14px',
        }}>{t('mem.empty')}</div>
      )}

      {(memories ?? []).map(m => (
        <div key={m.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: '10px',
          padding: '10px 0', borderBottom: '1px dashed var(--border-color)',
        }}>
          <span style={{
            flex: 1, minWidth: 0, fontFamily: 'var(--ff-body)', fontSize: '15px',
            color: 'var(--text-primary)', lineHeight: 1.6, wordBreak: 'break-word',
          }}>
            {m.text}
            {m.source === 'ai' && (
              <span style={{
                marginLeft: '8px', fontSize: 'var(--fs-micro)', color: 'var(--text-muted)',
              }}>· {t('mem.from_ai')}</span>
            )}
          </span>
          <button
            onClick={() => forget.mutate(m.id)}
            aria-label={t('common.delete')}
            title={t('common.delete')}
            style={{
              width: '32px', height: '32px', flexShrink: 0, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
            }}
          ><IconTrash size={16} /></button>
        </div>
      ))}

      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder={t('mem.placeholder')}
        rows={4}
        style={{
          width: '100%', marginTop: '14px', background: 'var(--bg-input)',
          border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)', fontFamily: 'var(--ff-body)', fontSize: '15px',
          lineHeight: 1.6, padding: '10px 12px', outline: 'none', resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />

      <button
        onClick={() => lines.forEach(line => add.mutate(line))}
        disabled={lines.length === 0 || add.isPending}
        style={{
          marginTop: '10px', width: '100%', padding: '11px',
          borderRadius: 'var(--radius-sm)', border: 'none',
          background: 'var(--accent-blue)', color: '#12151a',
          fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
          cursor: lines.length === 0 || add.isPending ? 'default' : 'pointer',
          opacity: lines.length === 0 || add.isPending ? .5 : 1,
        }}
      >
        {add.isPending ? t('common.saving') : lines.length > 1 ? `${t('mem.add')} (${lines.length})` : t('mem.add')}
      </button>
    </div>
  );
};
