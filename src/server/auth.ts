import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from './config';

export interface AuthenticatedRequest extends Request {
  user?: {
    authenticated: boolean;
  };
}

/**
 * Timing-safe comparison to prevent timing side-channel attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Keep processor busy to mimic comparison duration
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Rate limiters to prevent brute force and DOS attacks.
 */
export const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // 5 requests per window per IP
  message: { error: 'Too many login attempts. Please try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per window per IP
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Authentication Middleware
 * - Verifies JWT from HttpOnly cookie
 * - Enforces anti-CSRF header for mutating HTTP requests
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.auth_token;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as { authenticated: boolean };
    
    if (!decoded.authenticated) {
      return res.status(401).json({ error: 'Unauthorized: Invalid session state' });
    }

    req.user = decoded;

    // Defense-in-depth CSRF prevention for mutating endpoints
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const csrfHeader = req.headers['x-auth-csrf'];
      if (csrfHeader !== '1') {
        return res.status(403).json({ error: 'Forbidden: Missing anti-CSRF validation header' });
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Session expired or invalid' });
  }
}
