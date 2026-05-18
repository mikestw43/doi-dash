import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccountStore } from '../../stores/accountStore';
import { useUIStore } from '../../stores/uiStore';
import { fetchGroups, fetchTodayPnl } from '../../services/api';
import type { Account, AccountGroup } from '../../types';
import { BotCard } from './BotCard';
import { GroupManager } from '../groups/GroupManager';

const SORT_OPTIONS = [
  { value: 'name',     label: 'Name A-Z' },
  { value: 'profit',   label: 'P/L ↓' },
  { value: 'balance',  label: 'Balance ↓' },
  { value: 'drawdown', label: 'DD% ↓' },
  { value: 'status',   label: 'Online first' },
];

// ── Section header matching mockup ──────────────────────────────────────────
const SecHdr = ({ title, count, dot = 'var(--accent-blue)' }: { title: string; count?: string; dot?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
    <div style={{ width: '7px', height: '7px', background: dot, boxShadow: `0 0 6px ${dot}`, flexShrink: 0 }} />
    <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-primary)', letterSpacing: '2px' }}>
      {title}
    </span>
    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
    {count && (
      <span style={{
        fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
        color: 'var(--text-muted)',
        padding: '4px 10px',
        border: '1px solid var(--border2)',
      }}>{count}</span>
    )}
  </div>
);

export const BotList = () => {
  const accounts = useAccountStore(s => s.accounts);
  const { botFilter, setBotFilter } = useUIStore();
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const { data: todayPnlData } = useQuery({
    queryKey: ['today-pnl'],
    queryFn: fetchTodayPnl,
    refetchInterval: 10_000,
  });

  const loadGroups = useCallback(() => {
    fetchGroups().then(setGroups).catch(() => {});
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (!showFilter) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilter(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilter]);

  // Split live / demo — MUST be declared before `filtered` useMemo
  const liveAccounts = accounts.filter(a => !a.isDemo);
  const demoAccounts = accounts.filter(a => a.isDemo);
  const onlineCount = liveAccounts.filter(a => a.status === 'online').length;
  const demoOnlineCount = demoAccounts.filter(a => a.status === 'online').length;

  const brokers = useMemo(() => {
    const b = new Set(liveAccounts.map(a => a.broker));
    return ['all', ...Array.from(b)];
  }, [liveAccounts]);

  const filtered = useMemo(() => {
    let result = [...liveAccounts];
    if (botFilter.status !== 'all') result = result.filter(a => a.status === botFilter.status);
    if (botFilter.broker !== 'all') result = result.filter(a => a.broker === botFilter.broker);
    if (botFilter.group !== 'all') {
      if (botFilter.group === 'ungrouped') result = result.filter(a => !a.groupId);
      else result = result.filter(a => a.groupId === botFilter.group);
    }
    if (botFilter.search.trim()) {
      const q = botFilter.search.toLowerCase();
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.broker.toLowerCase().includes(q) ||
        a.accountNumber.includes(q)
      );
    }
    result.sort((a, b) => {
      switch (botFilter.sort) {
        case 'profit': return b.profit - a.profit;
        case 'balance': return b.balance - a.balance;
        case 'drawdown': return b.drawdown - a.drawdown;
        case 'status': return a.status === 'online' ? -1 : 1;
        default: return a.name.localeCompare(b.name);
      }
    });
    return result;
  }, [liveAccounts, botFilter]);

  const clearFilters = () => {
    setBotFilter({ status: 'all', broker: 'all', search: '', sort: 'name', group: 'all' });
  };

  // button style factory
  const ftabStyle = (active: boolean) => ({
    padding: '5px 10px',
    fontFamily: 'var(--ff-section)',
    fontSize: 'var(--fs-section)',
    border: active ? '1px solid var(--accent-blue)' : '1px solid var(--border2)',
    color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
    background: active ? 'rgba(56,189,248,.08)' : 'none',
    cursor: 'pointer',
    transition: 'all .15s',
  } as React.CSSProperties);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── MY ACCOUNTS — no wrapper box, cards fill width (matches mockup) ── */}
      <div>
        <SecHdr title="MY ACCOUNTS" count={`${onlineCount} / ${liveAccounts.length}`} />

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', position: 'relative' }} ref={filterRef}>
          {/* ⚙ FILTER */}
          <button
            onClick={() => setShowFilter(f => !f)}
            style={ftabStyle(showFilter)}
          >
            ⚙ FILTER
          </button>

          {/* Filter popup */}
          {showFilter && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0,
              zIndex: 500,
              background: 'var(--bg-card)',
              border: '2px solid var(--border2)',
              padding: '12px 14px',
              minWidth: '220px',
              boxShadow: '4px 4px 0 rgba(56,189,248,.2)',
            }}>
              {/* Search */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '.5px', marginBottom: '6px' }}>SEARCH</div>
                <input
                  type="text"
                  placeholder="name, broker, account #"
                  value={botFilter.search}
                  onChange={e => setBotFilter({ search: e.target.value })}
                  style={{
                    width: '100%', background: 'var(--bg-input)',
                    border: '1px solid var(--border2)', color: 'var(--text-primary)',
                    padding: '7px 9px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Broker */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '.5px', marginBottom: '6px' }}>BROKER</div>
                <select
                  value={botFilter.broker}
                  onChange={e => setBotFilter({ broker: e.target.value })}
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text-primary)', padding: '7px 8px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', outline: 'none', cursor: 'pointer' }}
                >
                  {brokers.map(b => <option key={b} value={b}>{b === 'all' ? 'All brokers' : b}</option>)}
                </select>
              </div>

              {/* Group */}
              {groups.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '.5px', marginBottom: '6px' }}>GROUP</div>
                  <select
                    value={botFilter.group}
                    onChange={e => setBotFilter({ group: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text-primary)', padding: '7px 8px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="all">All</option>
                    <option value="ungrouped">Ungrouped</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}

              {/* Sort */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-muted)', letterSpacing: '.5px', marginBottom: '6px' }}>SORT BY</div>
                <select
                  value={botFilter.sort}
                  onChange={e => setBotFilter({ sort: e.target.value })}
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text-primary)', padding: '7px 8px', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)', outline: 'none', cursor: 'pointer' }}
                >
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <button
                onClick={() => { clearFilters(); setShowFilter(false); }}
                style={{
                  width: '100%', padding: '7px',
                  fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
                  border: '1px solid var(--border2)', color: 'var(--text-muted)',
                  background: 'none', cursor: 'pointer',
                }}
              >
                CLEAR ALL
              </button>
            </div>
          )}
        </div>

        {/* Bot grid — 3 columns matching mockup */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}>
            No bots match your filters
            {botFilter.status !== 'all' || botFilter.broker !== 'all' || botFilter.search ? (
              <div style={{ marginTop: '8px' }}>
                <button onClick={clearFilters} style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  CLEAR FILTERS
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '10px' }}
            className="bot-grid-responsive"
          >
            {filtered.map((account: Account) => (
              <BotCard key={account.id} account={account} todayPnl={todayPnlData?.[account.id] ?? 0} />
            ))}
          </div>
        )}
      </div>

      {/* ── DEMO ACCOUNTS — no wrapper box ────────────────────────────── */}
      {demoAccounts.length > 0 && (
        <div>
          {/* Demo section header — yellow dot + SANDBOX badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '7px', height: '7px', background: 'var(--warning)', boxShadow: '0 0 6px var(--warning)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--warning)', letterSpacing: '2px' }}>
              DEMO ACCOUNTS
            </span>
            <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, rgba(250,204,21,.3), transparent)' }} />
            <span style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              color: 'var(--warning)',
              padding: '3px 8px',
              border: '1px solid rgba(250,204,21,.4)',
              background: 'rgba(250,204,21,.06)',
              letterSpacing: '.5px',
            }}>SANDBOX</span>
            <span style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              color: 'var(--text-muted)',
              padding: '4px 10px',
              border: '1px solid var(--border2)',
            }}>{demoOnlineCount} / {demoAccounts.length}</span>
          </div>

          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '.3px' }}>
            ⚠ Demo accounts are excluded from KPI stats and performance reports
          </div>

          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}
            className="bot-grid-responsive"
          >
            {demoAccounts.map((account: Account) => (
              <BotCard key={account.id} account={account} todayPnl={todayPnlData?.[account.id] ?? 0} />
            ))}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 1280px) { .bot-grid-responsive { grid-template-columns: repeat(2,1fr) !important; } }
        @media (max-width: 900px)  { .bot-grid-responsive { grid-template-columns: 1fr !important; } }
      `}</style>

      <GroupManager open={showGroupManager} onClose={() => setShowGroupManager(false)} onGroupsChanged={loadGroups} />
    </div>
  );
};
