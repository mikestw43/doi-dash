import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { runtimeStore } from '../services/runtimeStore';
import { toUsd } from '../services/fxService';
import prisma from '../lib/prisma';

const router = Router();
router.use(authMiddleware);

router.get('/overview', (req: AuthRequest, res: Response) => {
  const allAccounts = runtimeStore.getAccountsByUser(req.user!.id);
  // Exclude demo/sandbox accounts from KPI summary
  const accounts = allAccounts.filter(a => !a.isDemo);
  const online = accounts.filter(a => a.status === 'online');
  const offline = accounts.filter(a => a.status === 'offline');

  const totalBalance = accounts.reduce((s, a) => s + toUsd(a.balance, a.currency), 0);
  const totalEquity = accounts.reduce((s, a) => s + toUsd(a.equity, a.currency), 0);
  const totalProfit = accounts.reduce((s, a) => s + toUsd(a.profit, a.currency), 0);
  const totalTodayPnl = accounts.reduce((s, a) => s + toUsd(a.todayPnl ?? 0, a.currency), 0);
  const totalOpenLots = accounts.reduce((s, a) => s + a.openLots, 0);
  const totalBuyLots = accounts.reduce((s, a) => s + a.buyLots, 0);
  const totalSellLots = accounts.reduce((s, a) => s + a.sellLots, 0);
  const totalPending = accounts.reduce((s, a) => s + a.pendingOrders, 0);

  res.json({
    totalAccounts: accounts.length,
    onlineAccounts: online.length,
    offlineAccounts: offline.length,
    totalBalance: parseFloat(totalBalance.toFixed(2)),
    totalEquity: parseFloat(totalEquity.toFixed(2)),
    totalProfit: parseFloat(totalProfit.toFixed(2)),
    totalTodayPnl: parseFloat(totalTodayPnl.toFixed(2)),
    totalOpenLots: parseFloat(totalOpenLots.toFixed(2)),
    totalBuyLots: parseFloat(totalBuyLots.toFixed(2)),
    totalSellLots: parseFloat(totalSellLots.toFixed(2)),
    totalPendingOrders: totalPending,
  });
});

router.get('/heatmap/accounts', (req: AuthRequest, res: Response) => {
  const accounts = runtimeStore.getAccountsByUser(req.user!.id).filter(a => !a.isDemo);
  const data = accounts.map(a => ({
    id: a.id,
    name: a.name,
    broker: a.broker,
    status: a.status,
    balance: a.balance,
    equity: a.equity,
    drawdown: a.drawdown,
    marginLevel: a.marginLevel,
    profit: a.profit,
    currency: a.currency,
  }));
  res.json(data);
});

router.get('/heatmap/orders', (req: AuthRequest, res: Response) => {
  const accounts = runtimeStore.getAccountsByUser(req.user!.id).filter(a => !a.isDemo);
  const orders: object[] = [];
  accounts.forEach(account => {
    account.orders.forEach(order => {
      const openTime = new Date(order.openTime);
      const durationMs = Date.now() - openTime.getTime();
      const durationMin = Math.floor(durationMs / 60000);
      orders.push({
        ...order,
        accountName: account.name,
        accountId: account.id,
        broker: account.broker,
        durationMin,
      });
    });
  });
  res.json(orders);
});

router.get('/heatmap/pending', (req: AuthRequest, res: Response) => {
  const accounts = runtimeStore.getAccountsByUser(req.user!.id).filter(a => !a.isDemo);
  const pending: object[] = [];
  accounts.forEach(account => {
    account.pending.forEach(order => {
      pending.push({
        ...order,
        accountName: account.name,
        accountId: account.id,
        broker: account.broker,
      });
    });
  });
  res.json(pending);
});

// Today's closed P/L per account.
// Prefer EA-reported `todayPnl` (v1.3+ computes it from MT5 history directly).
// Fall back to DB-summed closedTrade rows for accounts that haven't reported one yet
// (older EA builds, or accounts offline since last server restart).
router.get('/today-pnl', async (req: AuthRequest, res: Response) => {
  const accounts = runtimeStore.getAccountsByUser(req.user!.id).filter(a => !a.isDemo);

  const pnlMap: Record<string, number> = {};

  // 1) Trust EA-reported todayPnl when present
  const accountsNeedingFallback: typeof accounts = [];
  for (const a of accounts) {
    if (typeof a.todayPnl === 'number') {
      pnlMap[a.id] = parseFloat(a.todayPnl.toFixed(2));
    } else {
      accountsNeedingFallback.push(a);
    }
  }

  // 2) DB fallback for accounts without an EA-reported value
  if (accountsNeedingFallback.length > 0) {
    const offsetMap = new Map<string, number>();
    for (const a of accountsNeedingFallback) {
      offsetMap.set(a.id, a.brokerTimeOffset ?? 7200);
    }

    const offsets = [...new Set(offsetMap.values())];
    const now = new Date();
    let earliestStart = now;
    for (const offset of offsets) {
      const offsetMs = offset * 1000;
      const brokerNow = new Date(now.getTime() + offsetMs);
      const brokerMidnight = new Date(Date.UTC(
        brokerNow.getUTCFullYear(), brokerNow.getUTCMonth(), brokerNow.getUTCDate()
      ));
      const startUtc = new Date(brokerMidnight.getTime() - offsetMs);
      if (startUtc < earliestStart) earliestStart = startUtc;
    }

    const trades = await prisma.closedTrade.findMany({
      where: {
        closeTime: { gte: earliestStart },
        accountId: { in: accountsNeedingFallback.map(a => a.id) },
      },
      select: { accountId: true, profit: true, swap: true, commission: true, closeTime: true },
    });

    for (const t of trades) {
      const offset = offsetMap.get(t.accountId) ?? 7200;
      const offsetMs = offset * 1000;
      const brokerNow = new Date(now.getTime() + offsetMs);
      const brokerMidnight = new Date(Date.UTC(
        brokerNow.getUTCFullYear(), brokerNow.getUTCMonth(), brokerNow.getUTCDate()
      ));
      const accountStartOfDay = new Date(brokerMidnight.getTime() - offsetMs);

      if (t.closeTime >= accountStartOfDay) {
        pnlMap[t.accountId] = (pnlMap[t.accountId] || 0) + t.profit + t.swap + t.commission;
      }
    }

    for (const a of accountsNeedingFallback) {
      pnlMap[a.id] = parseFloat((pnlMap[a.id] || 0).toFixed(2));
    }
  }

  res.json(pnlMap);
});

// ─── Economic Calendar (Investing.com proxy) ────────────────────────────────
// Switched from ForexFactory's ff_calendar_thisweek.json (no `actual` field
// in the free feed) to Investing.com's filtered-data endpoint which returns
// HTML with full actual/forecast/previous after release. We parse the HTML
// here so the frontend keeps consuming the same JSON shape.

interface EconomicEvent {
  title: string;
  country: string;
  date: string;
  impact: 'High' | 'Medium' | 'Low' | 'Non-Economic';
  forecast: string;
  previous: string;
  actual: string;
  /** Sentiment vs forecast — 'better' = good for the country (green),
   *  'worse' = bad (red), 'neutral' = unset / matches forecast. */
  actualSentiment: 'better' | 'worse' | 'neutral';
}

interface CalendarCache {
  data: EconomicEvent[];
  expiry: number;
}

let calendarCache: CalendarCache | null = null;
const CALENDAR_TTL = 30 * 60 * 1000; // 30 minutes

/** Convert "YYYY/MM/DD HH:mm:ss" (US Eastern Time) → ISO with offset. */
function etToIso(etDateStr: string): string {
  const [datePart, timePart] = etDateStr.split(' ');
  if (!datePart || !timePart) return etDateStr;
  const [y, m, d] = datePart.split('/').map(Number);
  const [h, mi, s] = timePart.split(':').map(Number);
  // US DST: 2nd Sunday of March → 1st Sunday of November
  const march = new Date(Date.UTC(y, 2, 1));
  const dstStart = new Date(Date.UTC(y, 2, 8 + ((7 - march.getUTCDay()) % 7)));
  const nov = new Date(Date.UTC(y, 10, 1));
  const dstEnd = new Date(Date.UTC(y, 10, 1 + ((7 - nov.getUTCDay()) % 7)));
  const ref = new Date(Date.UTC(y, m - 1, d));
  const isDST = ref >= dstStart && ref < dstEnd;
  const offset = isDST ? '-04:00' : '-05:00';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}${offset}`;
}

/** Decode the handful of HTML entities Investing.com sends in data cells. */
function cleanCell(s: string): string {
  return s
    .replace(/&nbsp;/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

/** Parse Investing.com's HTML rows into our EconomicEvent shape. */
function parseInvestingHtml(html: string): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const rowRe =
    /<tr id="eventRowId_(\d+)"[^>]*data-event-datetime="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const datetime = m[2];
    const inner = m[3];

    const currencyMatch = inner.match(
      /flagCur[^>]*>[\s\S]*?<\/span>\s*([A-Z]{3})\s*<\/td>/,
    );
    const country = currencyMatch ? currencyMatch[1] : '';

    const bullMatch = inner.match(/data-img_key="bull(\d)"/);
    const bull = bullMatch ? parseInt(bullMatch[1], 10) : 0;
    const impact: EconomicEvent['impact'] =
      bull === 3 ? 'High' : bull === 2 ? 'Medium' : bull === 1 ? 'Low' : 'Non-Economic';

    const titleMatch = inner.match(/<a[^>]*>\s*([^<]+?)\s*<\/a>/);
    const title = titleMatch ? cleanCell(titleMatch[1].replace(/\s+/g, ' ')) : '';

    // Investing.com applies greenFont / redFont to the ACTUAL <td> to mark
    // "Better Than Expected" vs "Worse Than Expected" relative to forecast.
    // We capture the entire <td> so we can read the class and the value.
    const actualBlockMatch = inner.match(/<td[^>]*id="eventActual_\d+"[^>]*>[^<]*<\/td>/);
    const actualBlock = actualBlockMatch ? actualBlockMatch[0] : '';
    const actualSentiment: EconomicEvent['actualSentiment'] = /greenFont/.test(actualBlock)
      ? 'better'
      : /redFont/.test(actualBlock)
        ? 'worse'
        : 'neutral';
    const actualValueMatch = actualBlock.match(/>([^<]*)<\/td>/);
    const actual = actualValueMatch ? cleanCell(actualValueMatch[1]) : '';

    const forecastMatch = inner.match(/eventForecast_\d+"[^>]*>([^<]*)</);
    const forecast = forecastMatch ? cleanCell(forecastMatch[1]) : '';

    const previousMatch = inner.match(
      /eventPrevious_\d+"[^>]*>(?:<span[^>]*>([^<]*)<\/span>|([^<]*))</,
    );
    const previous = previousMatch ? cleanCell(previousMatch[1] || previousMatch[2] || '') : '';

    if (!country || !title) continue;

    events.push({
      title,
      country,
      date: etToIso(datetime),
      impact,
      forecast,
      previous,
      actual,
      actualSentiment,
    });
  }
  return events;
}

/** Minimal shape from ForexFactory's free JSON — used to override the
 *  impact on Investing-sourced events (user prefers FF's editorial). */
interface FfEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
}

async function fetchForexFactory(): Promise<FfEvent[]> {
  const res = await fetch(
    'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    {
      headers: {
        'User-Agent': 'SENTINEL/2.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) throw new Error(`ForexFactory HTTP ${res.status}`);
  return (await res.json()) as FfEvent[];
}

async function fetchInvestingCom(): Promise<EconomicEvent[]> {
  const body = new URLSearchParams();
  // Investing.com country IDs for the majors we care about.
  const countries = ['4', '5', '6', '12', '17', '22', '25', '32', '35', '37', '43', '72'];
  countries.forEach(c => body.append('country[]', c));
  ['1', '2', '3'].forEach(i => body.append('importance[]', i));
  body.append('timeZone', '8'); // US Eastern — etToIso handles UTC conversion
  body.append('currentTab', 'thisWeek');
  body.append('limit_from', '0');

  const res = await fetch(
    'https://www.investing.com/economic-calendar/Service/getCalendarFilteredData',
    {
      method: 'POST',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: '*/*',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!res.ok) throw new Error(`Investing.com HTTP ${res.status}`);
  const json = (await res.json()) as { data?: string };
  if (!json.data) throw new Error('Investing.com payload missing `data`');
  return parseInvestingHtml(json.data);
}

/**
 * Hybrid fetcher: Investing.com provides actual / forecast / previous /
 * datetime, ForexFactory provides the impact rating (user prefers FF's
 * editorial — same event sometimes gets a different impact level on each
 * source). We match by (country, datetime-to-the-minute in UTC); if FF
 * has a matching event we override the impact, otherwise we keep
 * Investing's impact as a fallback.
 *
 * If ForexFactory is unreachable we still return Investing's payload as-is.
 */
async function fetchHybridCalendar(): Promise<EconomicEvent[]> {
  const [invEvents, ffResult] = await Promise.allSettled([
    fetchInvestingCom(),
    fetchForexFactory(),
  ]);

  if (invEvents.status === 'rejected') throw invEvents.reason;
  const inv = invEvents.value;

  if (ffResult.status === 'rejected') {
    console.warn('[Calendar] ForexFactory unavailable, falling back to Investing impact:', ffResult.reason?.message);
    return inv;
  }
  const ff = ffResult.value;

  // Build FF lookup: country|YYYY-MM-DDTHH:MM (UTC).
  const ffByKey = new Map<string, FfEvent>();
  for (const e of ff) {
    const utcMinute = new Date(e.date).toISOString().slice(0, 16);
    ffByKey.set(`${e.country}|${utcMinute}`, e);
  }

  let matched = 0;
  const merged = inv.map((e): EconomicEvent => {
    const utcMinute = new Date(e.date).toISOString().slice(0, 16);
    const ffMatch = ffByKey.get(`${e.country}|${utcMinute}`);
    if (!ffMatch) return e;
    matched++;
    const ffImpact = ffMatch.impact as EconomicEvent['impact'];
    const validImpacts: EconomicEvent['impact'][] = ['High', 'Medium', 'Low', 'Non-Economic'];
    return {
      ...e,
      impact: validImpacts.includes(ffImpact) ? ffImpact : e.impact,
    };
  });

  console.log(`[Calendar] Hybrid: inv=${inv.length} ff=${ff.length} matched=${matched}`);
  return merged;
}

router.get('/economic-calendar', async (req: AuthRequest, res: Response) => {
  // ?force=1 (or fresh=1) bypasses the 30-minute cache so a manual
  // refresh button click actually hits upstream instead of the cached payload.
  const force = req.query.force === '1' || req.query.fresh === '1';
  try {
    if (!force && calendarCache && calendarCache.expiry > Date.now()) {
      return res.json(calendarCache.data);
    }
    const data = await fetchHybridCalendar();
    calendarCache = { data, expiry: Date.now() + CALENDAR_TTL };
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Calendar] Fetch failed:', msg);
    if (calendarCache) {
      return res.json(calendarCache.data);
    }
    res.status(502).json({ error: `Failed to fetch economic calendar: ${msg}` });
  }
});

export default router;
