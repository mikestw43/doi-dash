import prisma from '../lib/prisma';

/**
 * What happened to each command.
 *
 * Kept because "queued" is not an answer. Between the button and the broker
 * there are three places a command can die — the EA may have trading
 * switched off, its own limits may refuse it, the broker may reject it —
 * and each one has a reason worth reading. The EA reports back and this is
 * where that lands.
 */

const KEEP_DAYS = 30;

export const logCommandQueued = (
  commandId: string,
  accountId: string,
  userId: string,
  type: string,
  detail: string,
): void => {
  void prisma.commandLog
    .create({ data: { commandId, accountId, userId, type, detail, status: 'queued' } })
    .then(() =>
      prisma.commandLog.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 864e5) } },
      }),
    )
    .catch(err => console.error('[CmdLog] could not record:', (err as Error).message));
};

export const markCommandsSent = (commandIds: string[]): void => {
  if (commandIds.length === 0) return;
  void prisma.commandLog
    .updateMany({
      // Only while it is still queued. These writes are not awaited — the
      // push must not wait on a log — and the EA can answer before this
      // lands, which once turned a finished command back into "sent".
      where: { commandId: { in: commandIds }, status: 'queued' },
      data: { status: 'sent', sentAt: new Date() },
    })
    .catch(err => console.error('[CmdLog] could not mark sent:', (err as Error).message));
};

/** The EA's own answer: it ran, or it refused, and why. */
export const settleCommand = async (
  commandId: string,
  ok: boolean,
  result: string,
): Promise<void> => {
  try {
    await prisma.commandLog.updateMany({
      where: { commandId },
      data: { status: ok ? 'done' : 'failed', result: result.slice(0, 300), settledAt: new Date() },
    });
  } catch (err) {
    console.error('[CmdLog] could not settle:', (err as Error).message);
  }
};

/**
 * Commands that were queued for an EA which then said it cannot execute.
 *
 * They are not held: an order that waits for someone to switch trading on is
 * an order placed at a price that no longer exists. They are dropped, with
 * the reason, so the dashboard can say so.
 */
export const dropCommands = (commandIds: string[], why: string): void => {
  if (commandIds.length === 0) return;
  void prisma.commandLog
    .updateMany({
      // Same reason as above: never overwrite an answer that has arrived.
      where: { commandId: { in: commandIds }, status: { in: ['queued', 'sent'] } },
      data: { status: 'dropped', result: why, settledAt: new Date() },
    })
    .catch(err => console.error('[CmdLog] could not drop:', (err as Error).message));
};
