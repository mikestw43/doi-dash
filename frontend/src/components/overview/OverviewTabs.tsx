import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchOverview } from '../../services/api';
import type { OverviewStats } from '../../types';
import { SummaryCards } from './SummaryCards';
import { AccountHeatmap } from '../heatmaps/AccountHeatmap';
import { OrdersHeatmap } from '../heatmaps/OrdersHeatmap';
import { PendingHeatmap } from '../heatmaps/PendingHeatmap';

const TABS = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'accounts', label: 'HEALTH' },
  { id: 'orders',   label: 'ORDERS' },
  { id: 'pending',  label: 'PENDING' },
];

export const OverviewTabs = () => {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: stats, isLoading } = useQuery<OverviewStats>({
    queryKey: ['overview'],
    queryFn: fetchOverview,
    refetchInterval: 5000,
  });

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border2)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px 0', }}>
        <div style={{ width: '7px', height: '7px', background: 'var(--accent-blue)', boxShadow: '0 0 6px var(--accent-blue)', flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-primary)', letterSpacing: '2px' }}>PORTFOLIO</span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '8px 4px',
              fontFamily: 'var(--ff-section)',
              fontSize: 'var(--fs-section)',
              color: activeTab === tab.id ? 'var(--accent-blue)' : 'var(--text-muted)',
              cursor: 'pointer',
              textAlign: 'center',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent-blue)' : 'transparent'}`,
              letterSpacing: '.5px',
              transition: 'all .15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: '10px' }}>
        {activeTab === 'overview' && (
          isLoading || !stats ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ height: '110px', background: 'var(--bg-tertiary)', border: '1px solid var(--border2)' }} />
              ))}
            </div>
          ) : (
            <SummaryCards stats={stats} />
          )
        )}
        {activeTab === 'accounts' && <AccountHeatmap />}
        {activeTab === 'orders'   && <OrdersHeatmap />}
        {activeTab === 'pending'  && <PendingHeatmap />}
      </div>
    </div>
  );
};
