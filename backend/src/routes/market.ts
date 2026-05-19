import { Router, Request, Response } from 'express';

const router = Router();

// ── Types ────────────────────────────────────────────────────────────────────
export interface MarketQuote {
  sym: string;
  price: number;
  chgPct: number | null; // null when unavailable
  up: boolean | null;    // null when unavailable
}

// ── Simple in-memory cache (10 s TTL) ────────────────────────────────────────
let _cache: { data: MarketQuote[]; ts: number } | null = null;
const CACHE_TTL = 10_000;

// ── FX: separate cache so TwelveData credits aren't burnt every 10s.
// 30 s TTL stays under the 8 credits/min throttle (2 calls × 3 symbols = 6/min)
// while still feeling responsive.
const FX_CACHE_TTL = 30_000;
let _fxCache: { quotes: MarketQuote[]; ts: number } | null = null;

// When TwelveData returns 429 (daily 800-credit quota exhausted), avoid hammering
// the endpoint until UTC midnight when the quota resets.
let _tdQuotaResetAt = 0;

const TWELVEDATA_KEY = process.env.TWELVEDATA_API_KEY;

const nextUtcMidnight = (): number => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
};

interface TwelveDataQuote {
  symbol: string;
  close: string;
  percent_change: string;
}

async function fetchTwelveDataFx(): Promise<MarketQuote[]> {
  if (!TWELVEDATA_KEY) throw new Error('TWELVEDATA_API_KEY not set');
  const url =
    `https://api.twelvedata.com/quote?symbol=EUR/USD,GBP/USD,USD/JPY` +
    `&apikey=${encodeURIComponent(TWELVEDATA_KEY)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (res.status === 429) throw new Error('429');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, TwelveDataQuote | { status?: string; message?: string }>;
  // TwelveData returns { status: 'error', message: '...' } when over quota or invalid key.
  if ((data as { status?: string }).status === 'error') {
    const msg = (data as { message?: string }).message ?? 'unknown';
    if (/api credits|daily/i.test(msg)) throw new Error('429');
    throw new Error(`TwelveData error: ${msg}`);
  }
  const dpForSym = (sym: string) => (sym === 'USDJPY' ? 3 : 5);
  const quotes: MarketQuote[] = [];
  for (const [key, item] of Object.entries(data)) {
    if (!item || typeof item !== 'object' || !('close' in item)) continue;
    const sym = key.replace('/', '');
    const price = parseFloat((item as TwelveDataQuote).close);
    const pct = parseFloat((item as TwelveDataQuote).percent_change);
    if (Number.isNaN(price)) continue;
    quotes.push({
      sym,
      price: parseFloat(price.toFixed(dpForSym(sym))),
      chgPct: Number.isNaN(pct) ? null : parseFloat(pct.toFixed(2)),
      up: Number.isNaN(pct) ? null : pct >= 0,
    });
  }
  return quotes;
}

async function fetchFrankfurterFx(): Promise<MarketQuote[]> {
  const y = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const ymd = `${y.getUTCFullYear()}-${String(y.getUTCMonth() + 1).padStart(2, '0')}-${String(y.getUTCDate()).padStart(2, '0')}`;
  const [todayData, yestData] = await Promise.all([
    safeFetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY') as Promise<{ rates: { EUR?: number; GBP?: number; JPY?: number } }>,
    safeFetch(`https://api.frankfurter.app/${ymd}?from=USD&to=EUR,GBP,JPY`).catch(() => null) as Promise<{ rates: { EUR?: number; GBP?: number; JPY?: number } } | null>,
  ]);
  const out: MarketQuote[] = [];
  const pushPair = (sym: string, todayRaw: number | undefined, yestRaw: number | undefined, invert: boolean, dp: number) => {
    if (!todayRaw) return;
    const price = invert ? 1 / todayRaw : todayRaw;
    if (yestRaw) {
      const yestPrice = invert ? 1 / yestRaw : yestRaw;
      const pct = ((price - yestPrice) / yestPrice) * 100;
      out.push({ sym, price: parseFloat(price.toFixed(dp)), chgPct: parseFloat(pct.toFixed(2)), up: pct >= 0 });
    } else {
      out.push({ sym, price: parseFloat(price.toFixed(dp)), chgPct: null, up: null });
    }
  };
  pushPair('EURUSD', todayData.rates.EUR, yestData?.rates.EUR, true, 5);
  pushPair('GBPUSD', todayData.rates.GBP, yestData?.rates.GBP, true, 5);
  pushPair('USDJPY', todayData.rates.JPY, yestData?.rates.JPY, false, 3);
  return out;
}

async function fetchFxQuotes(): Promise<MarketQuote[]> {
  const now = Date.now();
  if (_fxCache && now - _fxCache.ts < FX_CACHE_TTL) return _fxCache.quotes;

  // Try TwelveData when we have a key and the daily quota isn't known-exhausted.
  if (TWELVEDATA_KEY && now > _tdQuotaResetAt) {
    try {
      const td = await fetchTwelveDataFx();
      if (td.length > 0) {
        _fxCache = { quotes: td, ts: now };
        return td;
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === '429') {
        _tdQuotaResetAt = nextUtcMidnight();
        console.warn('[market] TwelveData quota exhausted, falling back to Frankfurter until UTC midnight');
      } else {
        console.warn('[market] TwelveData failed, falling back to Frankfurter:', msg);
      }
    }
  }

  try {
    const ff = await fetchFrankfurterFx();
    _fxCache = { quotes: ff, ts: now };
    return ff;
  } catch (err) {
    console.warn('[market] Frankfurter fetch failed:', (err as Error).message);
    return _fxCache?.quotes ?? [];
  }
}

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

  // ── 2. FX: TwelveData (real-time) → Frankfurter (daily) fallback ──────────
  //
  // TwelveData free tier is 800 credits/day and a batch of 3 symbols costs
  // 3 credits, so we cap that fetch via a separate 30s FX cache and remember
  // any 429 until UTC midnight to spare downstream user quota.
  const fxQuotes = await fetchFxQuotes();
  quotes.push(...fxQuotes);

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
