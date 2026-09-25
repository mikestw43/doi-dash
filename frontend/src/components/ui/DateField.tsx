import { useState, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * A date field that opens a calendar we draw ourselves.
 *
 * `input[type=date]` was the obvious choice and the wrong one: iOS renders it
 * with the phone's own calendar, so a device set to Thai reads back
 * "24 Sep BE 2569" for a day in 2026 — MT5's own history filter has the same
 * problem, in the same place. A page cannot reach inside a native control to
 * correct it, so this one is ours: the grid, the month header and the button
 * label are all built from the Gregorian date, and no device setting can
 * change what they say.
 *
 * The value is the YYYY-MM-DD string the filters already speak.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const toKey = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const parse = (v: string): { y: number; m: number; d: number } | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Shown on the button while nothing is picked. */
  placeholder: string;
  /** The field's own styling, so it matches the selects beside it. */
  style: React.CSSProperties;
}

export const DateField = ({ value, onChange, placeholder, style }: Props) => {
  const picked = parse(value);
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => ({
    y: picked?.y ?? today.getFullYear(),
    m: picked?.m ?? today.getMonth(),
  }));
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Placed against the viewport rather than the button, because the button
  // sits inside a panel that clips what overflows it: anchored to the field,
  // the calendar opened off the right edge of the phone from the TO field and
  // under the bottom bar from either, with no way to scroll to what was cut.
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  // Reopening on a field that already holds a date should land on that month,
  // not on wherever the last visit left off.
  useEffect(() => {
    if (open && picked) setView({ y: picked.y, m: picked.m });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }

    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const GAP = 4;
      const EDGE = 8;
      // The bottom bar is part of the shell, not an overlay, so the space to
      // open into ends above it.
      const navH = document.querySelector('.bottom-nav')?.getBoundingClientRect().height ?? 0;

      const width = Math.min(260, vw - EDGE * 2);
      const height = panelRef.current?.offsetHeight ?? 300;

      const left = Math.min(Math.max(r.left, EDGE), vw - width - EDGE);
      const below = r.bottom + GAP;
      const roomBelow = vh - navH - EDGE - below;
      const top = roomBelow >= height
        ? below
        : Math.max(EDGE, r.top - GAP - height);

      setPos({ left, top, width });
    };

    place();
    // Once the panel has a height of its own, place it again — the first pass
    // could only guess.
    const again = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(again);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Captured, so one Escape does not also dismiss the panel behind us.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const step = (by: number) => setView(v => {
    const d = new Date(v.y, v.m + by, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // Monday-first, to match the performance calendar.
  const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (d: number) =>
    view.y === today.getFullYear() && view.m === today.getMonth() && d === today.getDate();
  const isPicked = (d: number) =>
    !!picked && picked.y === view.y && picked.m === view.m && picked.d === d;

  const navBtn: React.CSSProperties = {
    width: '26px', height: '26px', lineHeight: 1,
    border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
    background: 'none', color: 'var(--text)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: 0, flex: '1 1 0' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          ...style,
          width: '100%', textAlign: 'left', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
          color: picked ? 'var(--text)' : 'var(--text-dim)',
          borderColor: open ? 'var(--accent-blue)' : (style.border ? undefined : undefined),
        }}
      >
        {picked ? `${pad2(picked.d)} ${MONTHS[picked.m]} ${picked.y}` : placeholder}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          style={{
            position: 'fixed', zIndex: 60,
            left: pos?.left ?? -9999, top: pos?.top ?? -9999,
            width: pos?.width ?? 260,
            visibility: pos ? 'visible' : 'hidden',
            padding: '10px',
            background: 'var(--bg-card2, var(--bg-card))',
            border: '1px solid var(--border2)',
            borderRadius: 'var(--radius-card)',
            boxShadow: '0 12px 28px rgba(0,0,0,.45)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <button type="button" onClick={() => step(-1)} style={navBtn} aria-label="previous month">‹</button>
            <div style={{
              fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)',
              color: 'var(--text-primary)', letterSpacing: '1px',
            }}>
              {MONTHS[view.m]} {view.y}
            </div>
            <button type="button" onClick={() => step(1)} style={navBtn} aria-label="next month">›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {WEEKDAYS.map(w => (
              <div key={w} style={{
                fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-micro)',
                color: 'var(--text-dim)', textAlign: 'center', padding: '2px 0',
              }}>{w}</div>
            ))}
            {cells.map((d, i) => d === null ? <div key={`b${i}`} /> : (
              <button
                key={d}
                type="button"
                onClick={() => { onChange(toKey(view.y, view.m, d)); setOpen(false); }}
                style={{
                  fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-body-sm)',
                  height: '30px', cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${isPicked(d) ? 'var(--accent-blue)' : 'transparent'}`,
                  background: isPicked(d) ? 'rgba(96,165,250,.18)' : 'none',
                  color: isPicked(d) ? 'var(--accent-blue)' : 'var(--text)',
                  fontWeight: isToday(d) ? 700 : 400,
                  textDecoration: isToday(d) && !isPicked(d) ? 'underline' : 'none',
                }}
              >
                {d}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => { onChange(toKey(today.getFullYear(), today.getMonth(), today.getDate())); setOpen(false); }}
              style={{ ...navBtn, flex: 1, width: 'auto', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)' }}
            >
              TODAY
            </button>
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              style={{ ...navBtn, flex: 1, width: 'auto', fontFamily: 'var(--ff-section)', fontSize: 'var(--fs-section)', color: 'var(--text-dim)' }}
            >
              CLEAR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
