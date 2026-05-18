/**
 * Lightweight in-memory FX cache.
 *
 * Used by the dashboard endpoints to convert non-USD account balances /
 * equity / profit into USD before aggregating into the KPI totals.
 *
 * Source: api.frankfurter.app (no API key, free, ~hourly cadence is fine).
 * We refresh the cache every 30 minutes; if a fetch fails we keep serving
 * the last known rates (or 1.0 fallback if cache is still empty).
 */

const TTL_MS = 30 * 60 * 1000; // 30 minutes

// Common MT5 base currencies. USC = USD cents, USDC/USDT = stablecoin = USD.
// "USD" itself is implicitly rate = 1.
const SUPPORTED = ['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD', 'NZD', 'CNY', 'INR', 'KRW', 'THB', 'MXN', 'ZAR'] as const;

// Stablecoins & USD-pegged unit fakes — never call the FX API for these
const PEGGED: Record<string, number> = {
  USD: 1,
  USDC: 1,
  USDT: 1,
  USC: 0.01, // USD cents → USD
};

// In-memory cache: currency code → rate (1 unit of currency = N USD)
let cache: Record<string, number> = {};
let cacheExpiresAt = 0;
let refreshInFlight: Promise<void> | null = null;

const fetchRates = async (): Promise<void> => {
  try {
    const url = `https://api.frankfurter.app/latest?from=USD&to=${SUPPORTED.join(',')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates: Record<string, number> };

    // Frankfurter returns "1 USD = X foreign". Invert so cache stores
    // "1 foreign = Y USD" — the multiplier we want at conversion time.
    const next: Record<string, number> = {};
    for (const code of SUPPORTED) {
      const usdToForeign = data.rates[code];
      if (usdToForeign && usdToForeign > 0) {
        next[code] = 1 / usdToForeign;
      }
    }
    if (Object.keys(next).length > 0) {
      cache = next;
      cacheExpiresAt = Date.now() + TTL_MS;
      console.log(`[fx] Refreshed ${Object.keys(next).length} rates`);
    }
  } catch (err) {
    console.warn('[fx] Refresh failed:', (err as Error).message);
    // Keep old cache; never throw — callers can fall back to 1.0.
  }
};

/**
 * Returns "1 unit of `currency` in USD". Never throws.
 * - Stablecoins/USD-pegged → instant return.
 * - Supported fiat → cached rate; triggers async refresh if stale.
 * - Unknown currency → 1 (assume already USD-ish, safer than 0).
 */
export const usdRate = (currency: string): number => {
  const code = currency.toUpperCase();
  if (code in PEGGED) return PEGGED[code]!;

  // Lazy refresh — return current cache value while a refresh happens in background.
  if (Date.now() > cacheExpiresAt && !refreshInFlight) {
    refreshInFlight = fetchRates().finally(() => {
      refreshInFlight = null;
    });
  }

  return cache[code] ?? 1;
};

/** Convert `value` from `currency` to USD. */
export const toUsd = (value: number, currency: string): number => value * usdRate(currency);

/** Force a refresh now (used on server start to warm the cache). */
export const warmFxCache = (): Promise<void> => fetchRates();
