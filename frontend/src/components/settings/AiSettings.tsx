import { useEffect, useState } from 'react';
import { fetchAiSettings, saveAiSettings, testAiSettings, type AiSettings as Settings } from '../../services/api';
import { useUIStore } from '../../stores/uiStore';
import { useTranslation } from '../../i18n/useTranslation';

/**
 * Connecting the assistant, from the dashboard.
 *
 * The alternative was SSH, nano and a restart to paste a key — for the
 * person who owns this, on a phone, that is the difference between a
 * feature that gets switched on and one that does not.
 *
 * The key goes one way. It is encrypted on the server and this page is
 * only ever told that there is one and its last four characters, so
 * nothing here can show it back or leak it to a screenshot.
 */

const WHERE: Record<string, string> = {
  anthropic: 'console.anthropic.com → API keys',
  openai: 'platform.openai.com → API keys',
  google: 'aistudio.google.com → Get API key',
  openrouter: 'openrouter.ai → Keys',
};

export const AiSettings = () => {
  const t = useTranslation();
  const { addToast } = useUIStore();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    try {
      const s = await fetchAiSettings();
      setSettings(s);
      setProvider(s.provider);
      setModel(s.model === s.defaultModel ? '' : s.model);
    } catch { /* not an admin, or not reachable */ }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    setSaving(true);
    setResult(null);
    try {
      await saveAiSettings({ provider, model, ...(key.trim() ? { apiKey: key.trim() } : {}) });
      setKey('');
      await load();
      addToast({ type: 'success', title: t('aiset.saved') });
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      addToast({ type: 'error', title: t('aiset.title'), message: msg ?? 'Could not save' });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      // The typed key is tested before it is saved: a wrong one should
      // never make it into the database in the first place.
      const r = await testAiSettings({ provider, model, ...(key.trim() ? { apiKey: key.trim() } : {}) });
      setResult(r.ok
        ? { ok: true, text: `${t('aiset.test_ok')} · ${r.model} · ${r.ms}ms` }
        : { ok: false, text: r.message ?? 'Failed' });
    } catch {
      setResult({ ok: false, text: 'Could not reach the server.' });
    } finally {
      setTesting(false);
    }
  };

  if (!settings) return null;

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-sm)', padding: '16px', minWidth: 0,
  };
  const lbl: React.CSSProperties = {
    fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
    color: 'var(--text-dim)', letterSpacing: '.5px', display: 'block', marginBottom: '6px',
  };
  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontFamily: 'var(--ff-body)',
    fontSize: 'var(--fs-body)', padding: '9px 11px', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={card}>
      <div style={{
        fontFamily: 'var(--ff-title)', fontSize: 'var(--fs-section)',
        color: 'var(--text-primary)', letterSpacing: '1px', marginBottom: '8px',
      }}>{t('aiset.title')}</div>

      <p style={{
        fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
        color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '16px',
      }}>{t('aiset.intro')}</p>

      <div style={{ marginBottom: '14px' }}>
        <label style={lbl}>{t('aiset.provider')}</label>
        <select
          value={provider}
          onChange={e => { setProvider(e.target.value); setResult(null); }}
          style={{ ...inp, cursor: 'pointer' }}
        >
          {settings.providers.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
          color: 'var(--text-muted)', marginTop: '5px',
        }}>{t('aiset.where')}: {WHERE[provider] ?? ''}</div>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label style={lbl}>{t('aiset.model')}</label>
        <input
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder={settings.defaults[provider] ?? ''}
          style={inp}
        />
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
          color: 'var(--text-muted)', marginTop: '5px',
        }}>{t('aiset.model_hint')} — {settings.defaults[provider] ?? ''}</div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={lbl}>{t('aiset.key')}</label>
        <input
          type="password"
          value={key}
          onChange={e => { setKey(e.target.value); setResult(null); }}
          placeholder={settings.hasKey ? `${settings.keyHint} — ${t('aiset.key_replace')}` : t('aiset.key_none')}
          autoComplete="off"
          style={inp}
        />
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
          color: settings.hasKey ? 'var(--success)' : 'var(--text-muted)', marginTop: '5px',
        }}>
          {settings.hasKey
            ? `${t('aiset.key_saved')}${settings.source === 'environment' ? ` (${t('aiset.from_env')})` : ''}`
            : t('aiset.key_none')}
        </div>
      </div>

      {result && (
        <div style={{
          padding: '9px 11px', marginBottom: '14px', borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', lineHeight: 1.6,
          background: result.ok ? 'rgba(52,211,153,.08)' : 'rgba(248,113,113,.08)',
          border: `1px solid ${result.ok ? 'rgba(52,211,153,.35)' : 'rgba(248,113,113,.35)'}`,
          color: result.ok ? 'var(--green)' : 'var(--danger)',
        }}>{result.ok ? '✓ ' : '✕ '}{result.text}</div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            flex: '1 1 120px', padding: '10px', cursor: saving ? 'wait' : 'pointer',
            background: 'var(--accent-blue)', color: '#12151a', border: 'none',
            borderRadius: 'var(--radius-sm)', fontFamily: 'var(--ff-section)',
            fontSize: 'var(--fs-section)', letterSpacing: '.5px',
          }}
        >{saving ? t('common.saving') : t('common.save')}</button>

        <button
          onClick={test}
          disabled={testing || (!settings.hasKey && !key.trim())}
          style={{
            flex: '1 1 120px', padding: '10px',
            cursor: testing || (!settings.hasKey && !key.trim()) ? 'default' : 'pointer',
            background: 'none', color: 'var(--text-dim)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
            opacity: testing || (!settings.hasKey && !key.trim()) ? .5 : 1,
          }}
        >{testing ? t('aiset.testing') : t('aiset.test')}</button>
      </div>

      {settings.hasKey && settings.source === 'dashboard' && (
        <button
          onClick={() => { setKey(''); void saveAiSettings({ apiKey: '' }).then(load); }}
          style={{
            marginTop: '10px', background: 'none', border: 'none', padding: 0,
            color: 'var(--text-muted)', fontFamily: 'var(--ff-body)',
            fontSize: 'var(--fs-micro)', cursor: 'pointer', textDecoration: 'underline',
          }}
        >{t('aiset.clear')}</button>
      )}
    </div>
  );
};
