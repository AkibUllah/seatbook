import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthUser {
  id: number;
  email: string;
  role: 'ORGANIZER' | 'ATTENDEE';
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });
}

function readUser(req: Request): AuthUser | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const payload = jwt.verify(header.slice('Bearer '.length), config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.id !== 'number') {
      return null;
    }
    return { id: payload.id, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const user = readUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in' });
  }
  req.user = user;
  next();
}

// For public routes that show extra detail to a logged-in user.
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  req.user = readUser(req) ?? undefined;
  next();
}

export function requireRole(role: AuthUser['role']) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      const who = role === 'ORGANIZER' ? 'organizers' : 'attendees';
      return res.status(403).json({ error: `Only ${who} can do this` });
    }
    next();
  };
}
