const jwt = require('jsonwebtoken');
const HttpError = require('../utils/httpError');

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}
const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, name: user.full_name }, SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Please sign in to continue.'));
  try {
    const p = verifyToken(token);
    req.user = { id: p.sub, role: p.role, name: p.name };
    next();
  } catch {
    next(new HttpError(401, 'Your session has expired. Sign in again.'));
  }
}

const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'You do not have access to this.'));

module.exports = { signToken, verifyToken, requireAuth, requireRole };
