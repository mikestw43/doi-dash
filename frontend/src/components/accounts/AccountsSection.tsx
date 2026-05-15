import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Copy, Trash2, Key, ChevronDown, ChevronUp, RefreshCw, CheckCircle, AlertTriangle, Bell, X, Eye, EyeOff } from 'lucide-react';
import { fetchAccounts, deleteAccount, createAccount, getAccountAlerts, saveAccountAlerts, revealApiKey } from '../../services/api';
import type { Account, AccountAlerts } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { Dialog } from '../ui/Dialog';
import { CardSkeleton } from '../ui/Skeleton';

const generateApiKey = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const segments = [8, 4, 4, 12];
  return 'snl_' + segments.map(len =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  ).join('_');
};

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
    const keyToCopy = fullKey || maskedKey;
    if (!fullKey) {
      addToast({ type: 'warning', title: 'Reveal key first', message: 'Click the eye icon to reveal the full key before copying' });
      return;
    }
    navigator.clipboard.writeText(keyToCopy);
    addToast({ type: 'success', title: 'Copied!', message: 'API key copied to clipboard' });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-gray-400 max-w-[220px] truncate">
        {fullKey || maskedKey}
      </span>
      <button
        onClick={handleReveal}
        className="text-gray-500 hover:text-gray-300 transition-colors"
        title={fullKey ? 'Hide key' : 'Reveal full key'}
        disabled={loading}
      >
        {loading ? <RefreshCw size={12} className="animate-spin" /> : fullKey ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
      <button
        onClick={copy}
        className={`transition-colors ${fullKey ? 'text-gray-500 hover:text-gray-300' : 'text-gray-700 cursor-not-allowed'}`}
        title={fullKey ? 'Copy full key' : 'Reveal key first'}
      >
        <Copy size={12} />
      </button>
    </div>
  );
};

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
    <Dialog open onClose={onClose} title="Delete Account">
      <p className="text-gray-400 text-sm mb-4">
        Are you sure you want to delete <strong className="text-white">{account.name}</strong>?
        This action cannot be undone.
      </p>
      <div className="flex gap-3 justify-end">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-danger" onClick={handleDelete} disabled={loading}>
          {loading ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </Dialog>
  );
};

/** Dialog for per-account alert thresholds */
const AlertThresholdsDialog = ({ account, onClose }: { account: Account; onClose: () => void }) => {
  const addToast = useUIStore(s => s.addToast);
  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['account-alerts', account.id],
    queryFn: () => getAccountAlerts(account.id),
  });

  const [form, setForm] = useState<Omit<AccountAlerts, 'id'>>({
    alertDrawdown: null,
    alertEquityBelow: null,
    alertMarginLevel: null,
    alertOffline: false,
  });

  useEffect(() => {
    if (alerts) {
      setForm({
        alertDrawdown: alerts.alertDrawdown,
        alertEquityBelow: alerts.alertEquityBelow,
        alertMarginLevel: alerts.alertMarginLevel,
        alertOffline: alerts.alertOffline,
      });
    }
  }, [alerts]);

  const mutation = useMutation({
    mutationFn: () => saveAccountAlerts(account.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-alerts', account.id] });
      addToast({ type: 'success', title: 'Alert thresholds saved' });
      onClose();
    },
    onError: () => {
      addToast({ type: 'error', title: 'Failed to save alert thresholds' });
    },
  });

  const numField = (
    label: string,
    key: 'alertDrawdown' | 'alertEquityBelow' | 'alertMarginLevel',
    placeholder: string,
    unit: string,
  ) => (
    <div>
      <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          step="0.1"
          value={form[key] ?? ''}
          onChange={e =>
            setForm(p => ({
              ...p,
              [key]: e.target.value === '' ? null : parseFloat(e.target.value),
            }))
          }
          placeholder={placeholder}
          className="flex-1 bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white placeholder-gray-700 focus:outline-none focus:border-accent-blue"
        />
        <span className="font-pixel text-[8px] text-gray-600 w-8">{unit}</span>
        {form[key] !== null && (
          <button
            type="button"
            onClick={() => setForm(p => ({ ...p, [key]: null }))}
            className="text-gray-500 hover:text-danger transition-colors"
            title="Disable this alert"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <p className="text-[10px] text-gray-600 mt-0.5">
        {form[key] === null ? 'Disabled' : 'Enabled'}
      </p>
    </div>
  );

  return (
    <Dialog open onClose={onClose} title={`Alert Thresholds — ${account.name}`}>
      {isLoading ? (
        <div className="text-center text-gray-400 py-4 text-sm">Loading...</div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Leave a field blank to disable that alert type. Requires Telegram to be configured in Profile Settings.
          </p>

          {numField('Drawdown Alert (fire when drawdown >=)', 'alertDrawdown', 'e.g. 10', '%')}
          {numField('Equity Alert (fire when equity drops below)', 'alertEquityBelow', 'e.g. 4500', '$')}
          {numField('Margin Level Alert (fire when margin level <=)', 'alertMarginLevel', 'e.g. 200', '%')}

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="alertOffline"
              checked={form.alertOffline}
              onChange={e => setForm(p => ({ ...p, alertOffline: e.target.checked }))}
              className="w-4 h-4 accent-accent-blue"
            />
            <label htmlFor="alertOffline" className="text-sm text-gray-300 cursor-pointer">
              Alert when account goes offline
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving...' : 'Save Thresholds'}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

/** Dialog shown AFTER account creation — displays the full API key once */
const ApiKeyRevealDialog = ({ apiKey, accountName, onClose }: { apiKey: string; accountName: string; onClose: () => void }) => {
  const [copied, setCopied] = useState(false);

  const copyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onClose={onClose} title="Account Created Successfully">
      <div className="space-y-4">
        <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 p-3">
          <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
          <p className="font-tech text-xs text-warning/90">
            Copy your API Key now! This is the only time it will be shown in full.
          </p>
        </div>

        <div>
          <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">Account</label>
          <p className="font-tech text-sm text-white">{accountName}</p>
        </div>

        <div>
          <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">API Key</label>
          <div className="flex items-center gap-2 bg-bg-primary border border-border2 px-3 py-2.5">
            <code className="font-tech text-sm text-accent-blue flex-1 break-all select-all">{apiKey}</code>
            <button
              onClick={copyKey}
              className={`shrink-0 p-1.5 transition-colors ${copied ? 'text-success' : 'text-gray-500 hover:text-white'}`}
            >
              {copied ? <CheckCircle size={15} /> : <Copy size={15} />}
            </button>
          </div>
        </div>

        <div>
          <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">EA Settings</label>
          <div className="bg-bg-primary border border-border2 px-3 py-2 font-tech text-xs text-gray-400 space-y-1">
            <p>ApiKey = <span className="text-accent-blue">{apiKey}</span></p>
            <p>ServerURL = <span className="text-gray-500">https://doi-dash-production.up.railway.app</span></p>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button className="btn-primary" onClick={onClose}>
            {copied ? 'DONE ✓' : 'COPIED THE KEY'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

const AddAccountDialog = ({ onClose, onCreated }: { onClose: () => void; onCreated: (apiKey: string, name: string) => void }) => {
  const queryClient = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const [form, setForm] = useState({
    name: '', broker: '', accountNumber: '', apiKey: generateApiKey(),
    server: '', currency: 'USD', leverage: '100',
  });
  // Note: broker, server, leverage are auto-filled by EA push — not shown in form
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.accountNumber || !form.apiKey) {
      addToast({ type: 'warning', title: 'Fill in all required fields' });
      return;
    }
    setLoading(true);
    try {
      await createAccount({ ...form, leverage: parseInt(form.leverage) });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      onCreated(form.apiKey, form.name);
    } catch {
      addToast({ type: 'error', title: 'Failed to add account' });
      setLoading(false);
    }
  };

  const field = (key: keyof typeof form, label: string, placeholder = '', type = 'text') => (
    <div>
      <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white placeholder-gray-700 focus:outline-none focus:border-accent-blue"
      />
    </div>
  );

  return (
    <Dialog open onClose={onClose} title="Add New Account">
      <form onSubmit={handleSubmit} className="space-y-3">
        {field('name', 'Bot Name *', 'Gold Scalper Bot')}
        {field('accountNumber', 'Account Number *', '123456')}
        <div>
          <label className="text-xs text-gray-400 block mb-1">API Key *</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.apiKey}
              onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))}
              placeholder="snl_xxxxxxxx_xxxx_xxxx_xxxxxxxxxxxx"
              className="flex-1 bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white placeholder-gray-700 focus:outline-none focus:border-accent-blue"
            />
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, apiKey: generateApiKey() }))}
              className="btn-ghost px-2.5 shrink-0"
              title="Generate new key"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div>
          <label className="font-pixel text-[8px] text-gray-600 tracking-widest uppercase block mb-2">Currency</label>
          <select
            value={form.currency}
            onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
            className="w-full bg-bg-primary border border-border2 px-3 py-2 font-tech text-sm text-white focus:outline-none focus:border-accent-blue"
          >
            <option value="USD">USD</option>
            <option value="USDC">USDC (Cent)</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="JPY">JPY</option>
          </select>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Adding...' : 'Add Account'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};

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
    <div className="card">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <Key size={14} className="text-accent-blue" />
          <h2 className="font-pixel text-[9px] text-accent-blue tracking-widest">API Key Management</h2>
          <span className="font-tech text-xs border border-border2 text-gray-600 px-2 py-0.5">
            {accounts.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
            onClick={e => { e.stopPropagation(); setShowAdd(true); }}
          >
            <Plus size={11} />
            ADD ACCOUNT
          </button>
          {expanded ? <ChevronUp size={14} className="text-gray-600" /> : <ChevronDown size={14} className="text-gray-600" />}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-2">
          {isLoading ? (
            <CardSkeleton />
          ) : accounts.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No accounts yet. Add your first MT5 account.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border2">
                    <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left pb-2.5 pr-4">Name</th>
                    <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left pb-2.5 pr-4">Broker</th>
                    <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left pb-2.5 pr-4">Account #</th>
                    <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left pb-2.5 pr-4">API Key</th>
                    <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-left pb-2.5 pr-4">Status</th>
                    <th className="font-pixel text-[8px] text-gray-600 tracking-widest text-right pb-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc: Account) => (
                    <tr key={acc.id} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                      <td className="py-2.5 pr-4 font-tech text-white">{acc.name}</td>
                      <td className="py-2.5 pr-4 font-tech text-gray-400">{acc.broker}</td>
                      <td className="py-2.5 pr-4 font-tech text-gray-500">{acc.accountNumber}</td>
                      <td className="py-2.5 pr-4"><MaskedKey accountId={acc.id} maskedKey={acc.apiKey} /></td>
                      <td className="py-2.5 pr-4">
                        <span className={`font-pixel text-[8px] tracking-wider inline-flex items-center gap-1 ${acc.status === 'online' ? 'text-success' : 'text-gray-600'}`}>
                          <span className={`w-1.5 h-1.5 ${acc.status === 'online' ? 'bg-success' : 'bg-gray-600'}`} />
                          {acc.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setAlertTarget(acc)}
                            className="text-gray-500 hover:text-accent-blue transition-colors"
                            title="Alert thresholds"
                          >
                            <Bell size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(acc)}
                            className="text-gray-500 hover:text-danger transition-colors"
                            title="Delete account"
                          >
                            <Trash2 size={13} />
                          </button>
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

      {showAdd && (
        <AddAccountDialog
          onClose={() => setShowAdd(false)}
          onCreated={(apiKey, name) => {
            setShowAdd(false);
            setRevealKey({ apiKey, name });
          }}
        />
      )}
      {revealKey && (
        <ApiKeyRevealDialog
          apiKey={revealKey.apiKey}
          accountName={revealKey.name}
          onClose={() => setRevealKey(null)}
        />
      )}
      {deleteTarget && <DeleteDialog account={deleteTarget} onClose={() => setDeleteTarget(null)} />}
      {alertTarget && <AlertThresholdsDialog account={alertTarget} onClose={() => setAlertTarget(null)} />}
    </div>
  );
};
