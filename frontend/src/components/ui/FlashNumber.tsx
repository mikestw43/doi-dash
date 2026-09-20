import { useRef, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

interface FlashNumberProps {
  value: number;
  format?: (v: number) => string;
  positiveGreen?: boolean;
  style?: CSSProperties;
  className?: string;
}

export const FlashNumber = ({
  value,
  format = (v) => v.toFixed(2),
  positiveGreen = false,
  style,
  className = '',
}: FlashNumberProps) => {
  const prevRef = useRef<number>(value);
  const [flash, setFlash] = useState<'green' | 'red' | null>(null);

  useEffect(() => {
    if (prevRef.current !== value) {
      const isUp = value > prevRef.current;
      setFlash(isUp ? 'green' : 'red');
      prevRef.current = value;
      const timer = setTimeout(() => setFlash(null), 600);
      return () => clearTimeout(timer);
    }
  }, [value]);

  const resolvedColor = positiveGreen
    ? value > 0 ? 'var(--green)' : value < 0 ? 'var(--red)' : 'var(--text-dim)'
    : 'var(--text)';

  const flashBg: CSSProperties = flash === 'green'
    ? { backgroundColor: 'rgba(52,211,153,.3)', transition: 'background-color .6s' }
    : flash === 'red'
    ? { backgroundColor: 'rgba(248,113,113,.3)', transition: 'background-color .6s' }
    : {};

  const computedStyle: CSSProperties = {
    display: 'inline-block',
    color: resolvedColor,
    ...flashBg,
    ...style,
    ...(style?.color ? { color: style.color } : {}),
  };

  return (
    <span className={className} style={computedStyle}>
      {format(value)}
    </span>
  );
};
