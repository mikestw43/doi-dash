/**
 * OnlyFunds shield mark — same geometry as public/icon.svg, so the tab icon,
 * the home-screen icon and the in-app logo are one drawing at three sizes.
 */
export const Logo = ({ size = 32 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    role="img"
    aria-label="OnlyFunds"
    style={{ display: 'block', flexShrink: 0 }}
  >
    <g stroke="var(--brand)" strokeLinejoin="round">
      <path
        d="M32 8 L54 16.5 L54 33 C54 45.5 44.5 53 32 58.5 C19.5 53 10 45.5 10 33 L10 16.5 Z"
        strokeWidth={1.9}
      />
      <path
        d="M32 12.4 L50 19.3 L50 33 C50 43.2 42.2 49.4 32 54 C21.8 49.4 14 43.2 14 33 L14 19.3 Z"
        strokeWidth={1.5}
      />
    </g>
  </svg>
);
