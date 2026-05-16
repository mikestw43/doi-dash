import { Router, Request, Response } from 'express';

const router = Router();

// ── Types ────────────────────────────────────────────────────────────────────
export interface MarketQuote {
  sym: string;
  price: number;
  chgPct: number | null; // null when unavailable
  up: boolean | null;    // null when unavailable
}

// ── Simple in-memory cache (30 s TTL) ────────────────────────────────────────
let _cache: { data: MarketQuote[]; ts: number } | null = null;
const CACHE_TTL = 30_000;

// ── Helpers ──────────────────────────────────────────────────────────────────
const safeFetch = async (url: string): Promise<unknown> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// ── GET /api/market/quotes ────────────────────────────────────────────────────
router.get('/quotes', async (_req: Request, res: Response): Promise<void> => {
  const now = Date.now();
  if (_cache && now - _cache.ts < CACHE_TTL) {
    res.json(_cache.data);
    return;
  }

  const quotes: MarketQuote[] = [];

  // ── 1. Binance: BTC + ETH (includes 24h % change) ──────────────────────────
  try {
    const data = await safeFetch(
      'https://api.binance.com/api/v3/ticker/24hr?symbols=%5B%22BTCUSDT%22%2C%22ETHUSDT%22%5D'
    ) as { symbol: string; lastPrice: string; priceChangePercent: string }[];

    for (const item of data) {
      const sym = item.symbol === 'BTCUSDT' ? 'BTCUSD' : 'ETHUSD';
      const pct = parseFloat(item.priceChangePercent);
      quotes.push({ sym, price: parseFloat(item.lastPrice), chgPct: pct, up: pct >= 0 });
    }
  } catch (err) {
    console.warn('[market] Binance fetch failed:', (err as Error).message);
  }

  // ── 2. Frankfurter: EUR/USD, GBP/USD, USD/JPY ──────────────────────────────
  try {
    const data = await safeFetch(
      'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY'
    ) as { rates: { EUR?: number; GBP?: number; JPY?: number } };

    const { EUR, GBP, JPY } = data.rates;
    if (EUR) quotes.push({ sym: 'EURUSD', price: parseFloat((1 / EUR).toFixed(5)), chgPct: null, up: null });
    if (GBP) quotes.push({ sym: 'GBPUSD', price: parseFloat((1 / GBP).toFixed(5)), chgPct: null, up: null });
    if (JPY) quotes.push({ sym: 'USDJPY', price: parseFloat(JPY.toFixed(3)), chgPct: null, up: null });
  } catch (err) {
    console.warn('[market] Frankfurter fetch failed:', (err as Error).message);
  }

  // ── 3. metals.live: Gold (XAU/USD) ─────────────────────────────────────────
  try {
    const data = await safeFetch('https://api.metals.live/v1/spot') as
      Array<{ gold?: number }> | { gold?: number };

    const gold = Array.isArray(data) ? data[0]?.gold : (data as { gold?: number }).gold;
    if (gold) quotes.push({ sym: 'XAUUSD', price: gold, chgPct: null, up: null });
  } catch (err) {
    console.warn('[market] metals.live fetch failed:', (err as Error).message);
  }

  _cache = { data: quotes, ts: now };
  res.json(quotes);
});

export default router;
