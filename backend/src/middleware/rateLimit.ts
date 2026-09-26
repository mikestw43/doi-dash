import { Request, Response, NextFunction } from 'express';

/**
 * A small fixed-window limiter, in memory.
 *
 * No dependency and no store: the API runs as a single pm2 process against
 * one SQLite file, so a Map is the whole truth, and a restart forgiving
 * everyone is an acceptable price for a form that is asked for a password
 * reset a handful of times a week.
 *
 * It exists because the forgot-password form now says, in as many words,
 * whether an address has an account. That is what makes the form usable —
 * "no account uses this address" is the answer a person needs — and it is
 * also what would let someone work through a list of addresses to find out
 * who is registered. The registration form already answers the same question
 * ("Email already in use"), so the secret was never kept; a limit on how fast
 * the question can be asked is worth more here than a vague answer.
 */

interface Window { count: number; resetAt: number }

export const rateLimit = ({ windowMs, max, message }: {
  windowMs: number;
  max: number;
  message: string;
}) => {
  const hits = new Map<string, Window>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();

    // Sweep on the way through. The map only ever holds addresses seen in the
    // last window, so it cannot grow without bound.
    for (const [key, w] of hits) if (w.resetAt <= now) hits.delete(key);

    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const w = hits.get(key);

    if (!w || w.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    w.count += 1;
    if (w.count > max) {
      res.status(429)
        .set('Retry-After', String(Math.ceil((w.resetAt - now) / 1000)))
        .json({ error: message });
      return;
    }
    next();
  };
};
