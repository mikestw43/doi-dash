import { useRef, useState, useEffect } from 'react';

/**
 * A row that reveals an action when you drag it sideways, the way a mail app
 * reveals archive and delete.
 *
 * A phone has no room for a CLOSE button and an SL/TP button on every open
 * position — the table that held them had to be 580px wide, which is what made
 * the account card stretch. The actions live off the edges instead.
 *
 * Unlike a mail app, a full swipe does not fire: it *reveals* the button and
 * you tap it. Closing a live position is not an archive you can undo, and a
 * thumb brushing past a row on a moving list should not be able to do it.
 *
 * A drag only counts as horizontal once it has moved further across than down,
 * so the list still scrolls normally under the same thumb.
 *
 * Everything is revealed by dragging left, never right. A rightward drag that
 * begins near the left edge is the browser's own back gesture — during testing
 * it took the whole app off the screen — and no in-page control should have to
 * compete with it. iOS Mail puts its actions on one side for the same reason.
 */

export interface SwipeAction {
  label: string;
  color: string;
  background: string;
  onAction: () => void;
}

interface Props {
  /** Revealed, in order, by dragging the row to the left. */
  actions: SwipeAction[];
  /** Width of each revealed button, in px. */
  actionWidth?: number;
  /** Closed from outside — e.g. while the row is being edited. */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  children: React.ReactNode;
}

export const SwipeRow = ({
  actions, actionWidth = 84, open: openProp, onOpenChange, children,
}: Props) => {
  const [openSelf, setOpenSelf] = useState(false);
  const open = openProp !== undefined ? openProp : openSelf;
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setOpenSelf(v);
    onOpenChange?.(v);
  };

  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; axis: null | 'x' | 'y' } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const revealed = actionWidth * actions.length;

  // A row left open should close when attention moves elsewhere.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: TouchEvent | MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('touchstart', onDown);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const resting = open ? -revealed : 0;

  const onTouchStart = (e: React.TouchEvent) => {
    // A touch event without a touch should not be possible, and blanked the
    // whole app when it happened: reading clientX off undefined throws during
    // render and React unmounts the tree. Cheap to rule out.
    const t = e.touches[0];
    if (!t) { start.current = null; return; }
    start.current = { x: t.clientX, y: t.clientY, axis: null };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    const t = e.touches[0];
    if (!s || !t) return;
    const mx = t.clientX - s.x;
    const my = t.clientY - s.y;

    if (s.axis === null) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
      // Down the list wins ties, so an ordinary scroll is never stolen.
      s.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
    }
    if (s.axis !== 'x') return;

    // Only leftward, and not past what is behind the row.
    const next = Math.max(-revealed, Math.min(0, resting + mx));
    setDx(next);
  };

  const onTouchEnd = () => {
    const s = start.current;
    start.current = null;
    if (!s || s.axis !== 'x') { setDx(0); return; }
    setOpen(dx < -revealed * 0.4);
    setDx(0);
  };

  const offset = dx !== 0 ? dx : resting;

  return (
    <div ref={wrapRef} style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-sm)' }}>
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0,
        display: 'flex', width: `${revealed}px`,
      }}>
        {actions.map(a => (
          <button
            key={a.label}
            type="button"
            onClick={() => { setOpen(false); a.onAction(); }}
            style={{
              width: `${actionWidth}px`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', letterSpacing: '.5px',
              color: a.color, background: a.background,
              border: 'none', cursor: 'pointer',
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div
        className="swipe-row-content"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          position: 'relative',
          transform: `translateX(${offset}px)`,
          transition: dx === 0 ? 'transform .18s ease' : 'none',
          background: 'var(--bg-card)',
        }}
      >
        {children}
      </div>
    </div>
  );
};
