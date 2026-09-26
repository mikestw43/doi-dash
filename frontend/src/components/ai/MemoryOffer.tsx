import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { addAiMemory } from '../../services/api';
import { useTranslation } from '../../i18n/useTranslation';

/**
 * The assistant asking to keep something.
 *
 * It cannot learn from the conversation, so this is the nearest thing:
 * a line added to the short list that is read to it before every future
 * question. Kept as a question rather than something it does quietly —
 * a list that grows on its own is one nobody trusts or prunes.
 */
export const MemoryOffer = ({ text }: { text: string }) => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const [state, setState] = useState<'asking' | 'saved' | 'dismissed'>('asking');

  if (state === 'dismissed') return null;

  if (state === 'saved') {
    return (
      <div style={{
        marginTop: '10px', fontFamily: 'var(--ff-body)', fontSize: '13.5px',
        color: 'var(--success)', lineHeight: 1.6,
      }}>✓ {t('mem.saved')} — {text}</div>
    );
  }

  return (
    <div style={{
      marginTop: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-input)', border: '1px dashed var(--border2)',
    }}>
      <div style={{
        fontFamily: 'var(--ff-label)', fontSize: 'var(--fs-micro)', letterSpacing: '1px',
        color: 'var(--text-muted)', marginBottom: '6px',
      }}>{t('mem.offer')}</div>
      <div style={{
        fontFamily: 'var(--ff-body)', fontSize: '15px', color: 'var(--text-primary)',
        lineHeight: 1.6, marginBottom: '10px',
      }}>{text}</div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => {
            void addAiMemory(text, 'ai')
              .then(() => queryClient.invalidateQueries({ queryKey: ['ai-memories'] }))
              .catch(() => {});
            setState('saved');
          }}
          style={{
            flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent-blue)', color: '#12151a',
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
            cursor: 'pointer',
          }}
        >{t('mem.save')}</button>
        <button
          onClick={() => setState('dismissed')}
          style={{
            flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)',
            background: 'none', border: '1px solid var(--border2)', color: 'var(--text-primary)',
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
            cursor: 'pointer',
          }}
        >{t('mem.dismiss')}</button>
      </div>
    </div>
  );
};
