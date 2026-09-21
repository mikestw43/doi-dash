import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchOverview } from '../../services/api';
import type { OverviewStats } from '../../types';
import { SummaryCards } from './SummaryCards';
import { AccountHeatmap } from '../heatmaps/AccountHeatmap';
import { OrdersHeatmap } from '../heatmaps/OrdersHeatmap';
import { PendingHeatmap } from '../heatmaps/PendingHeatmap';
import { useTranslation } from '../../i18n/useTranslation';

const TABS = [
  { id: 'overview', labelKey: 'overview.tab_overview' },
  { id: 'accounts', labelKey: 'overview.tab_health' },
  { id: 'orders',   labelKey: 'overview.tab_orders' },
  { id: 'pending',  labelKey: 'overview.tab_pending' },
];

export const OverviewTabs = () => {
  const t = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: stats, isLoading } = useQuery<OverviewStats>({
    queryKey: ['overview'],
    queryFn: fetchOverview,
    refetchInterval: 5000,
  });

  return (
    <div>
      {/* Section header — OUTSIDE the box (matches mockup) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '7px', height: '7px', background: 'var(--accent-blue)',flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-primary)', letterSpacing: '2px' }}>{t('dashboard.portfolio')}</span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border2), transparent)' }} />
      </div>

      {/* Tab nav — sits directly on page bg, just a border-bottom (matches mockup .ptab-bar) */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border2)', marginBottom: '14px' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '10px 4px',
              fontFamily: 'var(--ff-section)',
              fontSize: 'var(--fs-section)',
              color: activeTab === tab.id ? 'var(--accent-blue)' : 'var(--text-muted)',
              cursor: 'pointer',
              textAlign: 'center',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent-blue)' : 'transparent'}`,
              marginBottom: '-2px',
              letterSpacing: '.5px',
              transition: 'all .15s',
            }}
          >
            {t(tab.labelKey).toUpperCase()}
          </button>
        ))}
      </div>

      {/* Tab content — no wrapper box; cards/heatmaps fill full width */}
      {activeTab === 'overview' && (
        isLoading || !stats ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px' }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ height: '110px', background: 'var(--bg-tertiary)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)' }} />
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
  );
};
