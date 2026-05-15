import { useState } from 'react';
import { useAccountStore } from '../../stores/accountStore';
import { EquityChart } from './EquityChart';
import { PnLChart } from './PnLChart';
import { PerformanceCards } from './PerformanceCards';

type Tab = 'performance' | 'equity' | 'pnl';

const TABS: { key: Tab; label: string }[] = [
  { key: 'performance', label: 'PERFORMANCE' },
  { key: 'equity',      label: 'EQUITY CURVE' },
  { key: 'pnl',        label: 'DAILY P&L' },
];

export const AnalyticsPage = () => {
  const accounts = useAccountStore(s => s.accounts);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [tab, setTab] = useState<Tab>('performance');

  const anTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 11px',
    fontFamily: "'Press Start 2P'",
    fontSize: '7px',
    letterSpacing: '.5px',
    border: active ? '1px solid var(--cyan)' : '1px solid var(--border2)',
    color: active ? 'var(--cyan)' : 'var(--text-dim)',
    background: active ? 'rgba(56,189,248,.08)' : 'none',
    cursor: 'pointer',
    transition: 'all .15s',
  });

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '7px', height: '7px', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)', flexShrink: 0 }} />
        <span style={{ fontFamily: "'Press Start 2P'", fontSize: '7px', color: 'var(--text)', letterSpacing: '2px' }}>
          ANALYTICS
        </span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
      </div>

      {/* Toolbar: tabs + account selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={anTabStyle(tab === t.key)}>
            {t.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto' }}>
          <select
            value={selectedAccount}
            onChange={e => setSelectedAccount(e.target.value)}
            style={{
              background: 'var(--bg-input)', border: '1px solid var(--border2)',
              color: 'var(--text)', fontFamily: "'Share Tech Mono'", fontSize: '11px',
              padding: '6px 10px', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">All Accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', padding: '14px' }}>
        {tab === 'performance' && (
          <PerformanceCards accountId={selectedAccount || undefined} />
        )}
        {tab === 'equity' && (
          selectedAccount ? (
            <EquityChart accountId={selectedAccount} />
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)', fontFamily: "'Share Tech Mono'", fontSize: '11px' }}>
              Select an account to view equity history
            </div>
          )
        )}
        {tab === 'pnl' && (
          <PnLChart accountId={selectedAccount || undefined} />
        )}
      </div>
    </div>
  );
};
