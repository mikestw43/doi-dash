import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTickerSymbols, saveTickerSymbols } from '../../services/api';

/** Catalog of available ticker symbols, grouped for the picker UI. */
const CATALOG: { group: string; items: { sym: string; label: string }[] }[] = [
  {
    group: 'Crypto',
    items: [
      { sym: 'BTCUSD', label: 'BTC' },
      { sym: 'ETHUSD', label: 'ETH' },
    ],
  },
  {
    group: 'Metals',
    items: [
      { sym: 'XAUUSD', label: 'Gold' },
      { sym: 'SLV',    label: 'Silver (ETF)' },
    ],
  },
  {
    group: 'Forex',
    items: [
      { sym: 'EURUSD', label: 'EU' },
      { sym: 'GBPUSD', label: 'GU' },
      { sym: 'USDJPY', label: 'UJ' },
      { sym: 'GBPJPY', label: 'GJ' },
    ],
  },
];

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '2px solid var(--accent-blue)',
  padding: '20px 22px',
};
const cardTitle: React.CSSProperties = {
  fontFamily: 'var(--ff-section)',
  fontSize: 'var(--fs-section)',
  color: 'var(--accent-blue)',
  letterSpacing: '1px',
  marginBottom: '14px',
};
const groupLabel: React.CSSProperties = {
  fontFamily: 'var(--ff-section)',
  fontSize: 'var(--fs-section)',
  color: 'var(--text-muted)',
  letterSpacing: '.5px',
  marginBottom: '8px',
  display: 'block',
};

const chip = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  fontFamily: 'var(--ff-body)',
  fontSize: 'var(--fs-body-sm)',
  letterSpacing: '.5px',
  border: active ? '1px solid var(--accent-blue)' : '1px solid var(--border2)',
  background: active ? 'rgba(96,165,250,.12)' : 'transparent',
  color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
  cursor: 'pointer',
  transition: 'all .15s',
  userSelect: 'none',
});

export const TickerSettings = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<{ symbols: string[] }>({
    queryKey: ['ticker-symbols'],
    queryFn: fetchTickerSymbols,
  });

  // Local working copy so users can toggle multiple chips then Save.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (data?.symbols) setSelected(new Set(data.symbols));
  }, [data?.symbols]);

  const toggle = (sym: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  };

  const remoteList = useMemo(() => data?.symbols ?? [], [data?.symbols]);
  const localList = useMemo(() => [...selected], [selected]);
  const dirty = useMemo(() => {
    if (localList.length !== remoteList.length) return true;
    const r = new Set(remoteList);
    return localList.some(s => !r.has(s));
  }, [localList, remoteList]);

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveTickerSymbols(localList);
      queryClient.setQueryData(['ticker-symbols'], result);
      // The Header bar reads from its own polling — invalidate to force refresh.
      queryClient.invalidateQueries({ queryKey: ['market-quotes'] });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setSelected(new Set(remoteList));

  if (isLoading) {
    return (
      <div style={card}>
        <div style={cardTitle}>◈ LIVE TICKER</div>
        <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)' }}>
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={cardTitle}>◈ LIVE TICKER</div>
      <p style={{
        fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
        color: 'var(--text-muted)', marginBottom: '18px', lineHeight: 1.5,
      }}>
        Pick which symbols scroll on the header ticker bar.
        Changes sync across all your devices.
      </p>

      {CATALOG.map(group => (
        <div key={group.group} style={{ marginBottom: '16px' }}>
          <span style={groupLabel}>{group.group}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {group.items.map(item => {
              const active = selected.has(item.sym);
              return (
                <button
                  key={item.sym}
                  onClick={() => toggle(item.sym)}
                  style={chip(active)}
                  aria-pressed={active}
                >
                  <span style={{ fontSize: '11px' }}>{active ? '●' : '○'}</span>
                  {item.label}
                  <span style={{ opacity: 0.5, fontSize: 'var(--fs-section)' }}>{item.sym}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Footer actions */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        marginTop: '18px', paddingTop: '14px',
        borderTop: '1px solid var(--border2)',
      }}>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)' }}>
          {selected.size} symbol{selected.size === 1 ? '' : 's'} selected
        </span>
        <span style={{ flex: 1 }} />
        {dirty && (
          <button
            onClick={reset}
            style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
              padding: '8px 14px', background: 'none', color: 'var(--text-muted)',
              border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}
          >
            CANCEL
          </button>
        )}
        <button
          onClick={save}
          disabled={!dirty || saving || selected.size === 0}
          style={{
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
            padding: '8px 16px',
            background: !dirty || selected.size === 0 ? 'var(--border2)' : 'var(--accent-blue)',
            color: '#25272c',
            border: 'none',
            cursor: !dirty || saving || selected.size === 0 ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {savedFlash ? '✓ SAVED' : saving ? 'SAVING…' : 'SAVE'}
        </button>
      </div>
    </div>
  );
};
