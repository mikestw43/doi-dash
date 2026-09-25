const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', THB: '฿',
  AUD: 'A$', NZD: 'NZ$', CAD: 'C$', CHF: 'CHF ',
};

export const formatCurrency = (value: number, currency = 'USD'): string => {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = value < 0 ? '-' : '';
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency + ' ';
  return `${sign}${symbol}${formatted}`;
};

export const formatNumber = (value: number, decimals = 2): string => {
  return value.toFixed(decimals);
};

export const formatLots = (lots: number): string => {
  return lots.toFixed(2);
};

export const formatPercent = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

export const formatMaskedKey = (key: string): string => {
  if (key.startsWith('●●●●')) return key;
  return '●●●●' + key.slice(-6);
};

export const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

/** Display only the first word of the broker name — "XM Trading" → "XM",
 *  "InterStellar Capital" → "InterStellar". Falls back to the full string. */
export const formatBrokerShort = (broker: string | undefined | null): string => {
  if (!broker) return '';
  const first = broker.trim().split(/\s+/)[0];
  return first || broker;
};

export const getProfitColor = (profit: number): string => {
  if (profit > 0) return 'text-success';
  if (profit < 0) return 'text-danger';
  return 'text-gray-400';
};

export const getDrawdownColor = (dd: number): string => {
  if (dd < 10) return 'text-success';
  if (dd < 30) return 'text-warning';
  return 'text-danger';
};

export const getMarginLevelColor = (level: number): string => {
  if (level > 500) return 'text-success';
  if (level > 200) return 'text-warning';
  return 'text-danger';
};

/**
 * One date format for the whole app: 27 Aug 2026.
 *
 * `toLocaleDateString()` and an ISO slice were both in use, which gave
 * `2026-09-20` on one screen and something else on the next — and on a phone
 * set to Thai, `toLocaleDateString()` answers in the Buddhist era, so a date
 * read "27 Aug BE 2569" for a trade that closed in 2026. Built by hand rather
 * than through Intl: the device locale cannot reach it, the year is always the
 * one the broker reports, and every month is three letters (en-GB returns a
 * four-letter "Sept", which does not line up with the rest of a column).
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

const toDate = (value?: string | number | Date | null): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

/** 27 Aug 2026 */
export const formatDate = (value?: string | number | Date | null): string => {
  const d = toDate(value);
  return d ? `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '\u2014';
};

/** 27 Aug 2026 14:05 */
export const formatDateTime = (value?: string | number | Date | null): string => {
  const d = toDate(value);
  return d ? `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '\u2014';
};

/** 27 Aug 14:05 — for a column where the year is the same on every row. */
export const formatDayTime = (value?: string | number | Date | null): string => {
  const d = toDate(value);
  return d ? `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '\u2014';
};
