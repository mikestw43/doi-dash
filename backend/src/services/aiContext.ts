import prisma from '../lib/prisma';
import { runtimeStore } from './runtimeStore';
import { toUsd } from './fxService';

/**
 * What the assistant is told about the portfolio before it answers.
 *
 * Written as text rather than JSON because that is what a model reads best,
 * and because the same text is what the person sees if they ask what it can
 * see. Two rules shape it:
 *
 *   Everything here is this user's own. Every query filters on their id —
 *   the assistant cannot be talked into looking at another account.
 *
 *   It is a summary, not a dump. This portfolio closes about 6,750 trades a
 *   month; sending them all would cost a fortune per question and bury the
 *   answer. Open positions go in one by one, because those are what get
 *   asked about; history goes in as figures per symbol.
 *
 * Money is stated in the account's own currency, and a cent account (USC)
 * is marked as such, because 1,410,798 on one of those is $14,107 and an
 * assistant that misses the difference gives frightening advice.
 */

const money = (n: number, currency: string): string =>
  `${n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;

const hoursSince = (t: string | Date): number =>
  Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 36e5));

export interface PortfolioContext {
  text: string;
  /** For the page: what it was built from, in numbers. */
  accounts: number;
  openOrders: number;
}

export const buildPortfolioContext = async (userId: string): Promise<PortfolioContext> => {
  // Demo accounts are in, marked as such. They were left out when the
  // assistant could only talk: now that it can draft an order for the
  // person to confirm, the practice account is exactly where that should
  // be tried first.
  const accounts = runtimeStore.getAccountsByUser(userId);
  const lines: string[] = [];

  lines.push(`Now: ${new Date().toISOString()} (UTC).`);
  lines.push('');

  // ── The accounts themselves ────────────────────────────────────────────
  let totalUsd = 0;
  lines.push('ACCOUNTS');
  for (const a of accounts) {
    const cur = a.currency || 'USD';
    const cents = cur.toUpperCase() === 'USC';
    totalUsd += toUsd(a.equity ?? 0, cur);
    lines.push(
      `- ${a.name} (#${a.accountNumber}, ${a.broker}, ${cur}${cents ? ' — cent account, 100 units = 1 USD' : ''}` +
      `${a.isDemo ? ', DEMO — practice money' : ''}, ${a.status}): ` +
      `balance ${money(a.balance ?? 0, cur)}, equity ${money(a.equity ?? 0, cur)}, ` +
      `floating ${money(a.profit ?? 0, cur)}, today ${a.todayPnl != null ? money(a.todayPnl, cur) : 'unknown'}, ` +
      `drawdown ${(a.drawdown ?? 0).toFixed(1)}%, free margin ${money(a.freeMargin ?? 0, cur)}, ` +
      `margin level ${(a.marginLevel ?? 0).toFixed(0)}%, open lots ${(a.openLots ?? 0).toFixed(2)}`,
    );
  }
  lines.push(`Total equity across accounts, converted: ${totalUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD`);
  lines.push('');

  // ── Open positions, one by one ─────────────────────────────────────────
  const open = accounts.flatMap(a => (a.orders ?? []).map(o => ({ ...o, account: a.name, currency: a.currency || 'USD' })));
  lines.push(`OPEN POSITIONS (${open.length})`);
  if (open.length === 0) lines.push('- none');
  for (const o of open.slice(0, 60)) {
    lines.push(
      `- #${o.ticket} ${o.symbol} ${o.type} ${o.lots} lots on ${o.account}: ` +
      `open ${o.openPrice}, now ${o.currentPrice}, P/L ${money(o.profit ?? 0, o.currency)}` +
      `${o.swap ? `, swap ${money(o.swap, o.currency)}` : ''}, ` +
      `SL ${o.sl || 'none'}, TP ${o.tp || 'none'}, open for ${hoursSince(o.openTime)}h`,
    );
  }
  if (open.length > 60) lines.push(`- (${open.length - 60} more not listed)`);
  lines.push('');

  const pending = accounts.flatMap(a => (a.pending ?? []).map(o => ({ ...o, account: a.name })));
  if (pending.length > 0) {
    lines.push(`PENDING ORDERS (${pending.length})`);
    for (const o of pending.slice(0, 30)) {
      lines.push(`- #${o.ticket} ${o.symbol} ${o.type} ${o.lots} lots at ${o.openPrice} on ${o.account}`);
    }
    lines.push('');
  }

  // ── History, as figures ────────────────────────────────────────────────
  const since = new Date(Date.now() - 30 * 864e5);
  const closed = await prisma.closedTrade.findMany({
    where: { userId, closeTime: { gte: since } },
    select: { symbol: true, type: true, lots: true, profit: true, swap: true, commission: true, closeTime: true, accountCurrency: true },
  });

  lines.push(`CLOSED TRADES, LAST 30 DAYS (${closed.length})`);
  if (closed.length === 0) {
    lines.push('- none recorded');
  } else {
    const bySymbol = new Map<string, { n: number; wins: number; net: number; lots: number; currency: string }>();
    for (const c of closed) {
      const net = (c.profit ?? 0) + (c.swap ?? 0) + (c.commission ?? 0);
      const row = bySymbol.get(c.symbol) ?? { n: 0, wins: 0, net: 0, lots: 0, currency: c.accountCurrency || 'USD' };
      row.n += 1;
      row.wins += net > 0 ? 1 : 0;
      row.net += net;
      row.lots += c.lots ?? 0;
      bySymbol.set(c.symbol, row);
    }
    const rows = [...bySymbol.entries()].sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net));
    for (const [symbol, r] of rows.slice(0, 20)) {
      lines.push(
        `- ${symbol}: ${r.n} trades, ${Math.round((r.wins / r.n) * 100)}% won, ` +
        `net ${money(Number(r.net.toFixed(2)), r.currency)}, ${r.lots.toFixed(2)} lots traded`,
      );
    }
  }
  lines.push('');

  // MT5's own daily figures, which are the authority on a finished day.
  const daily = await prisma.dailyPnl.findMany({
    where: { userId, brokerDate: { gte: new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10) } },
    orderBy: { brokerDate: 'desc' },
    take: 40,
  });
  if (daily.length > 0) {
    lines.push('DAILY P/L FROM MT5, LAST 14 DAYS (the broker\'s own figures)');
    for (const d of daily) {
      lines.push(`- ${d.brokerDate} ${d.accountName ?? ''}: ${money(d.netProfit, d.accountCurrency || 'USD')} over ${d.deals} deals`);
    }
    lines.push('');
  }

  return { text: lines.join('\n'), accounts: accounts.length, openOrders: open.length };
};
