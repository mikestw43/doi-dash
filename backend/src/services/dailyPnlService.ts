import prisma from '../lib/prisma';
import { accountSnapshot } from './tradeHistoryService';

/**
 * Keep MT5's own realized P/L for each broker day.
 *
 * The EA computes the day's total straight from MT5's deal history on every
 * push — the same number the terminal shows and the number the TODAY tile has
 * always displayed. Until now the backend used it once and dropped it, so the
 * calendar had to rebuild the day by adding up the individual trades we had
 * managed to store. That reconstruction is only as good as its worst push: a
 * partial close that overwrote its own row, a position the server only guessed
 * had closed, a gap while the EA was restarting — each one left a day that did
 * not match the terminal, permanently, because nothing ever re-checked it.
 *
 * Storing the EA's figure removes that whole class of error. The trades are
 * still the detail; MT5 is the total.
 */

/** YYYY-MM-DD as the broker's own clock reads it, for an instant. */
export const brokerDateOf = (at: Date, offsetSec: number): string =>
  new Date(at.getTime() + offsetSec * 1000).toISOString().slice(0, 10);

/** Last value written per account, so an unchanged figure costs no write. */
const lastWritten = new Map<string, string>();

/**
 * Record the day's realized P/L the EA just reported.
 *
 * Called on every push. The EA's figure is cumulative for the broker day, so
 * the newest one simply replaces the stored one; at broker midnight MT5 resets
 * it to zero and the date key moves on, which starts the next day at zero
 * without touching the one that just ended.
 */
export const recordDailyPnl = async (
  accountId: string,
  netProfit: number,
  deals: number,
  brokerOffsetSec: number,
): Promise<void> => {
  const brokerDate = brokerDateOf(new Date(), brokerOffsetSec);
  const net = parseFloat(netProfit.toFixed(2));

  // Seven accounts pushing every ten seconds would otherwise write the same
  // row several times a second for no reason.
  const fingerprint = `${brokerDate}|${net}|${deals}`;
  if (lastWritten.get(accountId) === fingerprint) return;

  const snapshot = await accountSnapshot(accountId);

  const existing = await prisma.dailyPnl.findFirst({
    where: { accountId, brokerDate },
    select: { id: true },
  });

  if (existing) {
    await prisma.dailyPnl.update({
      where: { id: existing.id },
      data: { netProfit: net, deals, ...snapshot },
    });
  } else {
    await prisma.dailyPnl.create({
      data: { accountId, brokerDate, netProfit: net, deals, ...snapshot },
    });
  }

  lastWritten.set(accountId, fingerprint);
};
