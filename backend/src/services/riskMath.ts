import prisma from '../lib/prisma';
import type { SymbolSpec } from '../controllers/mt5Controller';

/**
 * What an order would risk, in the account's own money.
 *
 * This is deliberately not left to the model. A language model asked to
 * multiply a tick value by a distance by a lot size, on a cent account,
 * will usually be right — and "usually" is the wrong standard for the
 * number that decides how much of someone's account is on the table.
 * The model decides what to do; this works out what it costs.
 *
 * Everything comes from the terminal's own figures, sent by EA v1.4:
 * a stop N price-units away costs (N / tickSize) × tickValue per lot.
 */

export interface RiskRow {
  symbol: string;
  side: 'buy' | 'sell';
  /** Where it would be filled. For a market order, the current price. */
  entry?: number;
  sl?: number;
  tp?: number;
  /**
   * A stop given as a distance instead of a price: "20 points away".
   * A point is the terminal's own point — 0.01 on a two-decimal gold —
   * and the conversion happens here rather than in the model, because
   * "20 points" and "20 dollars" are a hundred times apart on that
   * symbol and only one of them is what was meant.
   */
  slPoints?: number;
  tpPoints?: number;
  lots: number;
}

export interface RiskResult extends RiskRow {
  /** Money lost if the stop is hit, in the account's currency. */
  risk: number | null;
  /** Money made if the target is hit. */
  reward: number | null;
  /** How far the stop is, in the symbol's own price units. */
  slDistance: number | null;
  /** Reward divided by risk, when both are known. */
  rr: number | null;
  /** Anything that stops this row being sent as written. */
  problems: string[];
}

export interface RiskSummary {
  currency: string;
  /** 'USC' is cents: a hundred of them is one dollar. */
  cents: boolean;
  rows: RiskResult[];
  totalRisk: number;
  /** As a share of this account's equity, which is the number that
   *  actually says whether a plan is sane. */
  riskPercent: number | null;
  equity: number | null;
  /** Rows the account's own figures say cannot be sent as written. */
  problems: string[];
}

const round = (n: number, dp = 2): number => Math.round(n * 10 ** dp) / 10 ** dp;

export const specsFor = async (accountId: string): Promise<SymbolSpec[]> => {
  const row = await prisma.account.findUnique({
    where: { id: accountId },
    select: { specs: true },
  });
  return Array.isArray(row?.specs) ? (row!.specs as unknown as SymbolSpec[]) : [];
};

/** Brokers add suffixes — XAUUSD.v, XAUUSDm — so a name is matched
 *  exactly first and then by what it starts with. */
const findSpec = (specs: SymbolSpec[], symbol: string): SymbolSpec | undefined => {
  const want = symbol.trim().toUpperCase();
  return specs.find(s => s.symbol.toUpperCase() === want)
    ?? specs.find(s => s.symbol.toUpperCase().startsWith(want))
    ?? specs.find(s => want.startsWith(s.symbol.toUpperCase()));
};

export const priceRisk = async (
  accountId: string,
  rows: RiskRow[],
  equity?: number | null,
  currency = 'USD',
): Promise<RiskSummary> => {
  const specs = await specsFor(accountId);
  const cents = currency.toUpperCase() === 'USC';

  const out: RiskResult[] = rows.map(row => {
    const problems: string[] = [];
    const spec = findSpec(specs, row.symbol);
    const lots = Number(row.lots) || 0;

    if (!spec) {
      problems.push(`No figures for ${row.symbol} yet — the EA sends them a few minutes after it starts.`);
      return { ...row, lots, risk: null, reward: null, slDistance: null, rr: null, problems };
    }

    // Size: what the broker will actually accept.
    if (spec.volMin > 0 && lots < spec.volMin - 1e-9) {
      problems.push(`${row.symbol} needs at least ${spec.volMin} lots`);
    }
    if (spec.volMax > 0 && lots > spec.volMax + 1e-9) {
      problems.push(`${row.symbol} allows at most ${spec.volMax} lots`);
    }
    if (spec.volStep > 0) {
      const steps = lots / spec.volStep;
      if (Math.abs(steps - Math.round(steps)) > 1e-6) {
        problems.push(`${row.symbol} trades in steps of ${spec.volStep} lots`);
      }
    }

    const entry = row.entry && row.entry > 0
      ? row.entry
      : (row.side === 'buy' ? spec.ask : spec.bid);

    // A distance becomes a price here, once, from the terminal's point.
    if (row.slPoints && row.slPoints > 0 && entry > 0 && spec.point > 0) {
      const away = row.slPoints * spec.point;
      row = { ...row, sl: row.side === 'buy' ? entry - away : entry + away };
    }
    if (row.tpPoints && row.tpPoints > 0 && entry > 0 && spec.point > 0) {
      const away = row.tpPoints * spec.point;
      row = { ...row, tp: row.side === 'buy' ? entry + away : entry - away };
    }

    // A stop the broker is too close to accept is a refused order, and
    // the refusal arrives seconds after the button, not before it.
    if (row.sl && spec.stopsLevel > 0 && spec.point > 0 && entry > 0) {
      const points = Math.abs(entry - row.sl) / spec.point;
      if (points < spec.stopsLevel) {
        problems.push(`the stop is ${Math.round(points)} points away; this broker wants at least ${spec.stopsLevel}`);
      }
    }
    if (row.sl && entry > 0) {
      const wrongSide = row.side === 'buy' ? row.sl >= entry : row.sl <= entry;
      if (wrongSide) problems.push('the stop is on the wrong side of the entry');
    }

    const perLot = spec.tickSize > 0 ? spec.tickValue / spec.tickSize : 0;
    const slDistance = row.sl && entry > 0 ? Math.abs(entry - row.sl) : null;
    const tpDistance = row.tp && entry > 0 ? Math.abs(entry - row.tp) : null;

    const risk = slDistance != null && perLot > 0 ? round(slDistance * perLot * lots) : null;
    const reward = tpDistance != null && perLot > 0 ? round(tpDistance * perLot * lots) : null;

    return {
      ...row,
      lots,
      entry: round(entry, spec.digits || 5),
      ...(row.sl ? { sl: round(row.sl, spec.digits || 5) } : {}),
      ...(row.tp ? { tp: round(row.tp, spec.digits || 5) } : {}),
      risk,
      reward,
      slDistance: slDistance != null ? round(slDistance, spec.digits || 5) : null,
      rr: risk && reward ? round(reward / risk, 2) : null,
      problems,
    };
  });

  const totalRisk = round(out.reduce((sum, r) => sum + (r.risk ?? 0), 0));

  return {
    currency,
    cents,
    rows: out,
    totalRisk,
    equity: equity ?? null,
    riskPercent: equity && equity > 0 ? round((totalRisk / equity) * 100, 2) : null,
    problems: out.flatMap(r => r.problems),
  };
};

/**
 * The other direction: how many lots puts exactly this much money at
 * risk. What "I can lose 1,000 baht" actually means in lots.
 */
export const lotsForRisk = async (
  accountId: string,
  symbol: string,
  entry: number,
  sl: number,
  money: number,
): Promise<{ lots: number | null; perLot: number | null; note?: string }> => {
  const spec = findSpec(await specsFor(accountId), symbol);
  if (!spec) return { lots: null, perLot: null, note: `No figures for ${symbol} yet.` };
  if (spec.tickSize <= 0 || spec.tickValue <= 0) {
    return { lots: null, perLot: null, note: `The terminal reports no tick value for ${symbol}.` };
  }

  const distance = Math.abs(entry - sl);
  if (distance <= 0) return { lots: null, perLot: null, note: 'The stop and the entry are the same price.' };

  const perLot = (distance / spec.tickSize) * spec.tickValue;
  let lots = money / perLot;

  if (spec.volStep > 0) lots = Math.floor(lots / spec.volStep) * spec.volStep;
  lots = round(lots, 2);

  if (spec.volMin > 0 && lots < spec.volMin) {
    return {
      lots: null,
      perLot: round(perLot),
      note: `Even the smallest size (${spec.volMin}) risks ${round(perLot * spec.volMin)} — more than that budget.`,
    };
  }
  if (spec.volMax > 0 && lots > spec.volMax) lots = spec.volMax;

  return { lots, perLot: round(perLot) };
};
