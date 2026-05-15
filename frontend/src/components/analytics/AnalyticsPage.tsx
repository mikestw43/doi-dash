import { useState } from 'react';
import { useAccountStore } from '../../stores/accountStore';
import { EquityChart } from './EquityChart';
import { PnLChart } from './PnLChart';
import { PerformanceCards } from './PerformanceCards';
import { BarChart3 } from 'lucide-react';

type Tab = 'equity' | 'pnl' | 'performance';

export const AnalyticsPage = () => {
  const accounts = useAccountStore(s => s.accounts);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [tab, setTab] = useState<Tab>('equity');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'equity', label: 'Equity Chart' },
    { key: 'pnl', label: 'Daily P&L' },
    { key: 'performance', label: 'Performance' },
  ];

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 size={16} className="text-accent-blue" />
          <h2 className="font-pixel text-[11px] text-accent-blue tracking-wider">Analytics</h2>
        </div>

        {/* Account selector */}
        <select
          value={selectedAccount}
          onChange={e => setSelectedAccount(e.target.value)}
          className="bg-bg-secondary border border-border2 px-3 py-1.5 font-tech text-sm text-gray-300 focus:outline-none focus:border-accent-blue max-w-xs"
        >
          <option value="">All Accounts</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border2 pb-0">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 font-pixel text-[8px] tracking-wider transition-colors border-b-2 -mb-[1px] ${
              tab === t.key
                ? 'text-accent-blue border-accent-blue'
                : 'text-gray-600 border-transparent hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'equity' && (
        selectedAccount ? (
          <EquityChart accountId={selectedAccount} />
        ) : (
          <div className="card text-center py-12">
            <p className="font-tech text-sm text-gray-600">Select an account to view equity history.</p>
          </div>
        )
      )}
      {tab === 'pnl' && <PnLChart accountId={selectedAccount || undefined} />}
      {tab === 'performance' && <PerformanceCards accountId={selectedAccount || undefined} />}
    </div>
  );
};
