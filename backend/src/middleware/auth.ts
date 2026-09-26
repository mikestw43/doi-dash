import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * The key every session token is signed with.
 *
 * In production it must come from the environment. It used to fall back to
 * a constant written here, which is the worst possible failure: a server
 * whose .env lost this line would keep working, signing tokens anyone who
 * has read this file could forge, and nothing would say so. If it is
 * missing now, a random key is made instead — everyone has to sign in
 * again, which is noticeable, and nobody can forge anything, which is the
 * point. The log says what happened and how to fix it.
 */
const resolveJwtSecret = (): string => {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  if (process.env.NODE_ENV === 'production') {
    const temporary = crypto.randomBytes(32).toString('hex');
    console.error(
      '[Auth] JWT_SECRET is missing or too short. Using a random key for this ' +
      'run: everyone must sign in again, and they will have to again at the ' +
      'next restart. Set JWT_SECRET in backend/.env to stop that — ' +
      'bash deploy/rotate-jwt.sh does it for you.',
    );
    return temporary;
  }

  return 'onlyfunds_dev_secret';
};

export const JWT_SECRET = resolveJwtSecret();

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
};

export const generateToken = (payload: { id: string; email: string; role: string }): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};
