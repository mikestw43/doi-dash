import { useQuery } from '@tanstack/react-query';
import { fetchHeatmapAccounts } from '../../services/api';
import type { HeatmapAccount } from '../../types';

const getTileStyle = (acc: HeatmapAccount) => {
  if (acc.status !== 'online') {
    return { borderColor: 'rgba(100,116,139,.3)', background: 'rgba(100,116,139,.06)', color: 'var(--text-dim)' };
  }
  if (acc.drawdown < 10) {
    return { borderColor: 'rgba(34,197,94,.3)', background: 'rgba(34,197,94,.06)', color: 'var(--green)' };
  }
  if (acc.drawdown < 30) {
    return { borderColor: 'rgba(250,204,21,.3)', background: 'rgba(250,204,21,.06)', color: 'var(--yellow)' };
  }
  return { borderColor: 'rgba(239,68,68,.3)', background: 'rgba(239,68,68,.06)', color: 'var(--red)' };
};

export const AccountHeatmap = () => {
  const { data: accounts = [], isLoading } = useQuery<HeatmapAccount[]>({
    queryKey: ['heatmap-accounts'],
    queryFn: fetchHeatmapAccounts,
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="heatmap-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '4px' }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ height: '54px', background: 'var(--bg-card2)', border: '1px solid var(--border2)' }} />
        ))}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-dim)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body)' }}>
        No accounts data
      </p>
    );
  }

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)', letterSpacing: '.5px' }}>DD:</span>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--green)' }}>● &lt;10%</span>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--yellow)' }}>● 10–30%</span>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--red)' }}>● &gt;30%</span>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)' }}>● OFFLINE</span>
      </div>

      {/* Tiles */}
      <div className="heatmap-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '4px' }}>
        {accounts.map(acc => {
          const s = getTileStyle(acc);
          return (
            <div
              key={acc.id}
              style={{
                border: `1px solid ${s.borderColor}`,
                background: s.background,
                padding: '6px 8px',
              }}
            >
              <div style={{
                fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)', color: 'var(--text)',
                marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {acc.name}
              </div>
              <div style={{ fontFamily: 'var(--ff-display)', fontSize: 'var(--fs-disp-sm)', color: s.color, lineHeight: 1 }}>
                {acc.status !== 'online' ? 'OFFLINE' : `${acc.drawdown.toFixed(2)}%`}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .heatmap-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
};
