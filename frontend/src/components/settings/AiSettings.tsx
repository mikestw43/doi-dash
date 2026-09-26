import { useEffect, useState } from 'react';
import { fetchAiSettings, saveAiSettings, testAiSettings, fetchAiModels,
  type AiSettings as Settings, type AiModelList } from '../../services/api';
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
  const [list, setList] = useState<AiModelList | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  // The dropdown covers what the provider offers; a brand new model can be
  // usable days before it appears in anyone's list, so there is still a way
  // to type one in.
  const [typeModel, setTypeModel] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    try {
      const s = await fetchAiSettings();
      setSettings(s);
      setProvider(s.provider);
      setModel(s.models[s.provider] ?? '');
    } catch { /* not an admin, or not reachable */ }
  };

  useEffect(() => { void load(); }, []);

  /**
   * Ask the provider which models this key may use.
   *
   * Asked again whenever the provider changes, and after a key is saved —
   * the list is the first honest sign that a key works, before anyone
   * presses TEST.
   */
  const loadModels = async (forProvider: string, withKey?: string) => {
    setLoadingModels(true);
    try {
      setList(await fetchAiModels({ provider: forProvider, ...(withKey?.trim() ? { apiKey: withKey.trim() } : {}) }));
    } catch {
      setList(null);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (settings) void loadModels(provider);
    // A typed-but-unsaved key is deliberately not a trigger: the list would
    // be re-fetched on every keystroke. It is picked up by SAVE and TEST.
  }, [provider, settings?.keys[provider]]);

  /** Everything the dropdown should offer: what the provider returned, plus
   *  whatever is saved, so a model chosen before it disappeared from the
   *  list is still visible rather than silently swapped. */
  const options = [...new Set([...(list?.models ?? []), ...(model ? [model] : [])])];

  /** The key questions are all about the provider selected in the dropdown
   *  right now, which is not always the one the server is using. */
  const keyHere = settings?.keys[provider] ?? null;
  const envHere = provider === settings?.provider && settings.source === 'environment';

  const save = async () => {
    setSaving(true);
    setResult(null);
    try {
      await saveAiSettings({ provider, model, ...(key.trim() ? { apiKey: key.trim() } : {}) });
      const justTyped = key.trim();
      setKey('');
      await load();
      await loadModels(provider, justTyped);
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
      if (r.ok && key.trim()) void loadModels(provider, key.trim());
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
          onChange={e => {
            const next = e.target.value;
            setProvider(next);
            setModel(settings.models[next] ?? '');
            setKey('');
            setTypeModel(false);
            setResult(null);
          }}
          style={{ ...inp, cursor: 'pointer' }}
        >
          {settings.providers.map(p => (
            <option key={p} value={p}>
              {p}{settings.keys[p] ? ` — ${t('aiset.key_on_file')}` : ''}
            </option>
          ))}
        </select>
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
          color: 'var(--text-muted)', marginTop: '5px',
        }}>{t('aiset.where')}: {WHERE[provider] ?? ''}</div>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label style={lbl}>{t('aiset.model')}</label>

        {typeModel ? (
          <input
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder={settings.defaults[provider] ?? ''}
            style={inp}
            autoFocus
          />
        ) : (
          <select
            value={model}
            onChange={e => {
              if (e.target.value === '__type__') { setTypeModel(true); setModel(''); return; }
              setModel(e.target.value);
              setResult(null);
            }}
            disabled={loadingModels}
            style={{ ...inp, cursor: loadingModels ? 'wait' : 'pointer' }}
          >
            <option value="">
              {t('aiset.model_default')} — {settings.defaults[provider] ?? ''}
            </option>
            {options.map(m => <option key={m} value={m}>{m}</option>)}
            <option value="__type__">{t('aiset.model_type')}</option>
          </select>
        )}

        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
          // Without a key there is nothing to ask with, which is the normal
          // state of a page nobody has filled in yet — not a warning.
          color: list?.source === 'fallback' && (keyHere || key.trim()) ? 'var(--warning)' : 'var(--text-muted)',
          marginTop: '5px', lineHeight: 1.5,
        }}>
          {loadingModels
            ? t('aiset.models_loading')
            : typeModel
              ? <>{t('aiset.model_hint')} — {settings.defaults[provider] ?? ''}{' '}
                  <button
                    onClick={() => { setTypeModel(false); setModel(''); }}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      color: 'var(--accent-blue)', fontFamily: 'var(--ff-body)',
                      fontSize: 'var(--fs-micro)', textDecoration: 'underline',
                    }}
                  >{t('aiset.model_back')}</button>
                </>
              : list?.source === 'provider'
                ? `${t('aiset.models_live')} (${list.models.length})`
                : keyHere || key.trim()
                  ? t('aiset.models_offline')
                  : t('aiset.models_need_key')}
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={lbl}>{t('aiset.key')}</label>
        <input
          type="password"
          value={key}
          onChange={e => { setKey(e.target.value); setResult(null); }}
          placeholder={keyHere ? `${keyHere} — ${t('aiset.key_replace')}` : t('aiset.key_none')}
          autoComplete="off"
          style={inp}
        />
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-micro)',
          color: keyHere ? 'var(--success)' : 'var(--text-muted)', marginTop: '5px',
        }}>
          {keyHere
            ? `${t('aiset.key_saved')}${envHere ? ` (${t('aiset.from_env')})` : ''}`
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
          disabled={testing || (!keyHere && !key.trim())}
          style={{
            flex: '1 1 120px', padding: '10px',
            cursor: testing || (!keyHere && !key.trim()) ? 'default' : 'pointer',
            background: 'none', color: 'var(--text-dim)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
            opacity: testing || (!keyHere && !key.trim()) ? .5 : 1,
          }}
        >{testing ? t('aiset.testing') : t('aiset.test')}</button>
      </div>

      {keyHere && !envHere && (
        <button
          onClick={() => {
            // Clears the key for the provider on screen, not whichever one
            // the server happens to be using.
            setKey('');
            void saveAiSettings({ provider, apiKey: '', activate: false }).then(load);
          }}
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
