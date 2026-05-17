import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchAccounts, deleteAccount, createAccount, getAccountAlerts, saveAccountAlerts, revealApiKey } from '../../services/api';
import type { Account, AccountAlerts } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { Dialog } from '../ui/Dialog';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const generateApiKey = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const segments = [8, 4, 4, 12];
  return 'snl_' + segments.map(len =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  ).join('_');
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
  padding: '7px 10px', outline: 'none', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
  color: 'var(--text-dim)', letterSpacing: '.5px', marginBottom: '6px',
};
const thSt: React.CSSProperties = {
  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)',
  letterSpacing: '.5px', padding: '8px 10px', textAlign: 'left',
  borderBottom: '2px solid var(--border2)', fontWeight: 400, whiteSpace: 'nowrap',
};
const tdSt: React.CSSProperties = {
  padding: '7px 10px', borderBottom: '1px solid rgba(45,64,96,.3)',
  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text)',
};

// ─── MaskedKey ────────────────────────────────────────────────────────────────

const MaskedKey = ({ accountId, maskedKey }: { accountId: string; maskedKey: string }) => {
  const addToast = useUIStore(s => s.addToast);
  const [fullKey, setFullKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleReveal = async () => {
    if (fullKey) { setFullKey(null); return; }
    setLoading(true);
    try {
      const key = await revealApiKey(accountId);
      setFullKey(key);
    } catch {
      addToast({ type: 'error', title: 'Failed to reveal key' });
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!fullKey) {
      addToast({ type: 'warning', title: 'Reveal key first', message: 'Click the eye icon to reveal the full key before copying' });
      return;
    }
    navigator.clipboard.writeText(fullKey);
    addToast({ type: 'success', title: 'Copied!', message: 'API key copied to clipboard' });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {fullKey || maskedKey}
      </span>
      <button
        onClick={handleReveal}
        disabled={loading}
        title={fullKey ? 'Hide key' : 'Reveal full key'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: '12px', padding: '0 2px', lineHeight: 1 }}
      >
        {loading ? '…' : fullKey ? '◉' : '○'}
      </button>
      <button
        onClick={copy}
        title={fullKey ? 'Copy full key' : 'Reveal key first'}
        style={{ background: 'none', border: 'none', cursor: fullKey ? 'pointer' : 'default', color: fullKey ? 'var(--text-dim)' : 'rgba(100,116,139,.3)', fontSize: '11px', padding: '0 2px', lineHeight: 1 }}
      >
        ⎘
      </button>
    </div>
  );
};

// ─── DeleteDialog ─────────────────────────────────────────────────────────────

const DeleteDialog = ({ account, onClose }: { account: Account; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteAccount(account.id);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      addToast({ type: 'success', title: 'Account deleted', message: account.name });
      onClose();
    } catch {
      addToast({ type: 'error', title: 'Delete failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="DELETE ACCOUNT">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Are you sure you want to delete{' '}
          <strong style={{ color: 'var(--text)' }}>{account.name}</strong>?
          This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '8px 14px', background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer', letterSpacing: '.5px' }}
          >CANCEL</button>
          <button
            onClick={handleDelete}
            disabled={loading}
            style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '8px 14px', background: 'var(--red)', color: '#fff', border: '1px solid var(--red)', cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '.5px', opacity: loading ? .6 : 1 }}
          >{loading ? 'DELETING...' : 'DELETE'}</button>
        </div>
      </div>
    </Dialog>
  );
};

// ─── NumField (module-level to avoid focus loss on re-render) ─────────────────

const NumField = ({
  label, value, onChange, onClear, placeholder, unit,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  onClear: () => void;
  placeholder: string;
  unit: string;
}) => (
  <div>
    <label style={lbl}>{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input
        type="number" min="0" step="0.1"
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
        placeholder={placeholder}
        style={{ ...inp, width: 'auto', flex: 1 }}
      />
      <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', width: '20px', letterSpacing: '.5px' }}>{unit}</span>
      {value !== null && (
        <button type="button" onClick={onClear}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>✕</button>
      )}
    </div>
    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', marginTop: '3px' }}>
      {value === null ? 'Disabled' : 'Enabled'}
    </div>
  </div>
);

// ─── AlertThresholdsDialog ────────────────────────────────────────────────────

const AlertThresholdsDialog = ({ account, onClose }: { account: Account; onClose: () => void }) => {
  const addToast = useUIStore(s => s.addToast);
  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['account-alerts', account.id],
    queryFn: () => getAccountAlerts(account.id),
  });

  const [form, setForm] = useState<Omit<AccountAlerts, 'id'>>({
    alertDrawdown: null, alertEquityBelow: null, alertMarginLevel: null, alertOffline: false,
  });

  useEffect(() => {
    if (alerts) setForm({ alertDrawdown: alerts.alertDrawdown, alertEquityBelow: alerts.alertEquityBelow, alertMarginLevel: alerts.alertMarginLevel, alertOffline: alerts.alertOffline });
  }, [alerts]);

  const mutation = useMutation({
    mutationFn: () => saveAccountAlerts(account.id, form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['account-alerts', account.id] }); addToast({ type: 'success', title: 'Alert thresholds saved' }); onClose(); },
    onError: () => { addToast({ type: 'error', title: 'Failed to save alert thresholds' }); },
  });

  return (
    <Dialog open onClose={onClose} title={`ALERT THRESHOLDS — ${account.name}`}>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Leave a field blank to disable that alert. Requires Telegram in Profile Settings.
          </p>

          <NumField label="DRAWDOWN ALERT (fire when DD ≥)" value={form.alertDrawdown} onChange={v => setForm(p => ({ ...p, alertDrawdown: v }))} onClear={() => setForm(p => ({ ...p, alertDrawdown: null }))} placeholder="e.g. 10" unit="%" />
          <NumField label="EQUITY ALERT (fire when equity drops below)" value={form.alertEquityBelow} onChange={v => setForm(p => ({ ...p, alertEquityBelow: v }))} onClear={() => setForm(p => ({ ...p, alertEquityBelow: null }))} placeholder="e.g. 4500" unit="$" />
          <NumField label="MARGIN LEVEL ALERT (fire when margin level ≤)" value={form.alertMarginLevel} onChange={v => setForm(p => ({ ...p, alertMarginLevel: v }))} onClear={() => setForm(p => ({ ...p, alertMarginLevel: null }))} placeholder="e.g. 200" unit="%" />

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox" id="alertOffline"
              checked={form.alertOffline}
              onChange={e => setForm(p => ({ ...p, alertOffline: e.target.checked }))}
              style={{ width: '14px', height: '14px', accentColor: 'var(--cyan)', cursor: 'pointer' }}
            />
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-dim)' }}>Alert when account goes offline</span>
          </label>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button onClick={onClose}
              style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '8px 14px', background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer', letterSpacing: '.5px' }}>
              CANCEL
            </button>
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
              style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '8px 14px', background: 'var(--cyan)', color: '#0c1422', border: '1px solid var(--cyan)', cursor: mutation.isPending ? 'not-allowed' : 'pointer', letterSpacing: '.5px', opacity: mutation.isPending ? .6 : 1 }}>
              {mutation.isPending ? 'SAVING...' : 'SAVE'}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

// ─── ApiKeyRevealDialog ───────────────────────────────────────────────────────

const ApiKeyRevealDialog = ({ apiKey, accountName, onClose }: { apiKey: string; accountName: string; onClose: () => void }) => {
  const [copied, setCopied] = useState(false);

  const copyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Dialog open onClose={() => {}} title="ACCOUNT CREATED — SAVE YOUR API KEY">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Warning banner */}
        <div style={{
          padding: '12px 14px',
          background: 'rgba(250,204,21,.08)', border: '2px solid rgba(250,204,21,.5)',
          fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--warning)', lineHeight: 1.8, letterSpacing: '.5px',
          textAlign: 'center',
        }}>
          ⚠ THIS IS THE ONLY TIME YOUR API KEY WILL BE SHOWN.<br />
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', letterSpacing: 0 }}>
            Copy it now and paste it into your MT5 EA settings.
          </span>
        </div>

        {/* Account name */}
        <div>
          <label style={lbl}>ACCOUNT</label>
          <div style={{ fontFamily: 'var(--ff-input)', fontSize: 'var(--fs-input)', color: 'var(--text)' }}>{accountName}</div>
        </div>

        {/* API Key with large copy button */}
        <div>
          <label style={lbl}>API KEY — COPY AND PASTE INTO EA</label>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'var(--bg-input)', border: '2px solid var(--accent-blue)', padding: '10px 12px',
          }}>
            <code style={{
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
              color: 'var(--accent-blue)', flex: 1,
              wordBreak: 'break-all', userSelect: 'all', letterSpacing: '.5px',
            }}>
              {apiKey}
            </code>
            <button
              onClick={copyKey}
              style={{
                flexShrink: 0,
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '8px 12px',
                background: copied ? 'rgba(34,197,94,.15)' : 'rgba(56,189,248,.12)',
                border: `1px solid ${copied ? 'var(--success)' : 'var(--accent-blue)'}`,
                color: copied ? 'var(--success)' : 'var(--accent-blue)',
                cursor: 'pointer', letterSpacing: '.5px',
                transition: 'all .2s',
              }}
            >
              {copied ? '✓ COPIED' : '⎘ COPY'}
            </button>
          </div>
        </div>

        {/* EA Setup instructions */}
        <div>
          <label style={lbl}>MT5 EA SETUP</label>
          <div style={{
            background: 'var(--bg-input)', border: '1px solid var(--border2)',
            padding: '10px 12px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
            color: 'var(--text-dim)', lineHeight: 2,
          }}>
            <div>① Attach EA to any chart in MT5</div>
            <div>② Set <span style={{ color: 'var(--accent-blue)' }}>ApiKey</span> = <span style={{ color: 'var(--warning)' }}>{apiKey}</span></div>
            <div>③ Set <span style={{ color: 'var(--accent-blue)' }}>ServerURL</span> = <span style={{ color: 'var(--text-dim)' }}>https://doi-dash-production.up.railway.app</span></div>
            <div>④ Broker, account number &amp; currency will fill in automatically on first push</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '10px 18px',
              background: copied ? 'var(--success)' : 'var(--accent-blue)',
              color: '#0c1422',
              border: `1px solid ${copied ? 'var(--success)' : 'var(--accent-blue)'}`,
              cursor: 'pointer', letterSpacing: '.5px',
            }}
          >
            {copied ? 'DONE ✓' : 'I HAVE COPIED THE KEY'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

// ─── AddAccountDialog ─────────────────────────────────────────────────────────
// Simplified: user only enters account name + demo toggle.
// API key is auto-generated. MT5 EA fills in broker/accountNumber/server/currency/leverage on first connect.

const AddAccountDialog = ({ onClose, onCreated }: { onClose: () => void; onCreated: (apiKey: string, name: string) => void }) => {
  const queryClient = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const [name, setName] = useState('');
  const [isDemo, setIsDemo] = useState(false);
  const [apiKey] = useState(generateApiKey);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { addToast({ type: 'warning', title: 'Enter an account name' }); return; }
    setLoading(true);
    try {
      await createAccount({ name: name.trim(), apiKey, isDemo });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      onCreated(apiKey, name.trim());
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to add account';
      addToast({ type: 'error', title: msg });
      setLoading(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="ADD NEW ACCOUNT">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Info banner */}
        <div style={{ padding: '8px 10px', background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          ℹ Broker, account number, server &amp; currency will be filled automatically when your MT5 EA connects.
        </div>

        {/* Account Name */}
        <div>
          <label style={lbl}>ACCOUNT NAME *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Gold Scalper Bot"
            style={inp}
            autoFocus
          />
        </div>

        {/* Demo / Live toggle */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
          padding: '10px 12px',
          border: isDemo ? '1px solid rgba(250,204,21,.4)' : '1px solid var(--border2)',
          background: isDemo ? 'rgba(250,204,21,.06)' : 'rgba(34,197,94,.04)',
          transition: 'all .15s',
        }}>
          <input
            type="checkbox"
            checked={isDemo}
            onChange={e => setIsDemo(e.target.checked)}
            style={{ width: '14px', height: '14px', accentColor: 'var(--warning)', cursor: 'pointer', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: isDemo ? 'var(--warning)' : 'var(--success)', letterSpacing: '.5px' }}>
              {isDemo ? '⬛ DEMO / SANDBOX' : '▶ LIVE ACCOUNT'}
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', marginTop: '4px' }}>
              {isDemo
                ? 'Excluded from KPI stats & performance reports'
                : 'Included in all statistics and reports'}
            </div>
          </div>
        </label>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
          <button type="button" onClick={onClose}
            style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '8px 14px', background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer', letterSpacing: '.5px' }}>
            CANCEL
          </button>
          <button type="submit" disabled={loading || !name.trim()}
            style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', padding: '8px 14px', background: 'var(--accent-blue)', color: '#0c1422', border: '1px solid var(--accent-blue)', cursor: (loading || !name.trim()) ? 'not-allowed' : 'pointer', letterSpacing: '.5px', opacity: (loading || !name.trim()) ? .5 : 1 }}>
            {loading ? 'ADDING...' : 'ADD ACCOUNT'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};

// ─── AccountsSection (main export) ───────────────────────────────────────────

export const AccountsSection = () => {
  const [expanded, setExpanded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [revealKey, setRevealKey] = useState<{ apiKey: string; name: string } | null>(null);
  const [alertTarget, setAlertTarget] = useState<Account | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
    staleTime: 30000,
  });

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', padding: '16px 18px' }}>
      {/* Header row */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--cyan)', letterSpacing: '.5px' }}>
            ⌗ API KEY MANAGEMENT
          </span>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', border: '1px solid var(--border2)', padding: '2px 7px' }}>
            {accounts.length}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={e => { e.stopPropagation(); setShowAdd(true); }}
            style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px', padding: '7px 12px', background: 'var(--cyan)', color: '#0c1422', border: '1px solid var(--cyan)', cursor: 'pointer' }}
          >
            + ADD ACCOUNT
          </button>
          <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>{expanded ? '▴' : '▾'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '14px' }}>
          {isLoading ? (
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-dim)', textAlign: 'center', padding: '16px' }}>Loading...</div>
          ) : accounts.length === 0 ? (
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', color: 'var(--text-dim)', textAlign: 'center', padding: '16px' }}>
              No accounts yet. Add your first MT5 account.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card2)' }}>
                    <th style={thSt}>NAME</th>
                    <th style={thSt}>BROKER</th>
                    <th style={thSt}>ACCOUNT #</th>
                    <th style={thSt}>API KEY</th>
                    <th style={thSt}>STATUS</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc: Account) => (
                    <tr
                      key={acc.id}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(45,64,96,.2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ ...tdSt, color: 'var(--text)' }}>{acc.name}</td>
                      <td style={{ ...tdSt, color: 'var(--text-dim)' }}>{acc.broker}</td>
                      <td style={{ ...tdSt, color: 'var(--text-dim)' }}>{acc.accountNumber}</td>
                      <td style={tdSt}><MaskedKey accountId={acc.id} maskedKey={acc.apiKey} /></td>
                      <td style={tdSt}>
                        <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: acc.status === 'online' ? 'var(--green)' : 'var(--text-dim)' }}>
                          <span style={{ width: '5px', height: '5px', background: acc.status === 'online' ? 'var(--green)' : '#475569', display: 'inline-block' }} />
                          {acc.status}
                        </span>
                      </td>
                      <td style={{ ...tdSt, textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <button
                            onClick={() => setAlertTarget(acc)}
                            title="Alert thresholds"
                            style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-dim)', cursor: 'pointer', padding: '3px 7px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}
                          >🔔</button>
                          <button
                            onClick={() => setDeleteTarget(acc)}
                            title="Delete account"
                            style={{ background: 'none', border: '1px solid rgba(239,68,68,.3)', color: 'var(--red)', cursor: 'pointer', padding: '3px 7px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}
                          >✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAdd && <AddAccountDialog onClose={() => setShowAdd(false)} onCreated={(apiKey, name) => { setShowAdd(false); setRevealKey({ apiKey, name }); }} />}
      {revealKey && <ApiKeyRevealDialog apiKey={revealKey.apiKey} accountName={revealKey.name} onClose={() => setRevealKey(null)} />}
      {deleteTarget && <DeleteDialog account={deleteTarget} onClose={() => setDeleteTarget(null)} />}
      {alertTarget && <AlertThresholdsDialog account={alertTarget} onClose={() => setAlertTarget(null)} />}
    </div>
  );
};
