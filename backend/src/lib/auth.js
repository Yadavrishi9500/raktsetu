import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from './http.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtTtl });
}

export function requireAuth(...roles) {
  return (req, _res, next) => {
    const match = (req.get('authorization') || '').match(/^Bearer (.+)$/);
    if (!match) throw new HttpError(401, 'Sign in to continue');
    let payload;
    try {
      payload = jwt.verify(match[1], config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Your session has expired. Sign in again.');
    }
    req.user = { id: Number(payload.sub), role: payload.role };
    if (roles.length && !roles.includes(req.user.role)) {
      throw new HttpError(403, 'Your account does not have access to this');
    }
    next();
  };
}
