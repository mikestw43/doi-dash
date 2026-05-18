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

  // ── 2. Frankfurter: EUR/USD, GBP/USD, USD/JPY (with % change vs yesterday) ─
  try {
    // Compute yesterday's date (UTC, in YYYY-MM-DD)
    const y = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ymd = `${y.getUTCFullYear()}-${String(y.getUTCMonth() + 1).padStart(2, '0')}-${String(y.getUTCDate()).padStart(2, '0')}`;

    const [todayData, yestData] = await Promise.all([
      safeFetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY') as Promise<{ rates: { EUR?: number; GBP?: number; JPY?: number } }>,
      safeFetch(`https://api.frankfurter.app/${ymd}?from=USD&to=EUR,GBP,JPY`).catch(() => null) as Promise<{ rates: { EUR?: number; GBP?: number; JPY?: number } } | null>,
    ]);

    const pushPair = (sym: string, todayRaw: number | undefined, yestRaw: number | undefined, invert: boolean, dp: number) => {
      if (!todayRaw) return;
      const price = invert ? 1 / todayRaw : todayRaw;
      if (yestRaw) {
        const yestPrice = invert ? 1 / yestRaw : yestRaw;
        const pct = ((price - yestPrice) / yestPrice) * 100;
        quotes.push({ sym, price: parseFloat(price.toFixed(dp)), chgPct: parseFloat(pct.toFixed(2)), up: pct >= 0 });
      } else {
        quotes.push({ sym, price: parseFloat(price.toFixed(dp)), chgPct: null, up: null });
      }
    };

    pushPair('EURUSD', todayData.rates.EUR, yestData?.rates.EUR, true,  5);
    pushPair('GBPUSD', todayData.rates.GBP, yestData?.rates.GBP, true,  5);
    pushPair('USDJPY', todayData.rates.JPY, yestData?.rates.JPY, false, 3);
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
