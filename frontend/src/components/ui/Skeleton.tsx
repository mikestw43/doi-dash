const skeletonStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--bg-card2) 25%, rgba(42,45,52,.4) 50%, var(--bg-card2) 75%)',
  backgroundSize: '200% 100%',
  animation: 'skeleton-shimmer 1.4s ease infinite',
};

interface SkeletonProps {
  width?: string;
  height?: string;
  style?: React.CSSProperties;
}

export const Skeleton = ({ width = '100%', height = '12px', style }: SkeletonProps) => (
  <div style={{ ...skeletonStyle, width, height, ...style }} />
);

export const CardSkeleton = () => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <Skeleton width="35%" height="10px" />
    <Skeleton width="65%" height="20px" />
    <Skeleton width="50%" height="10px" />
  </div>
);
