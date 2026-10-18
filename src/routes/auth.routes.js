const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { asyncHandler } = require('../middleware/error');
const { signToken } = require('../middleware/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', asyncHandler(async (req, res) => {
  const { full_name, email, password } = req.body || {};
  if (!full_name || String(full_name).trim().length < 2) throw new HttpError(400, 'Enter your full name.');
  if (!EMAIL_RE.test(email || '')) throw new HttpError(400, 'Enter a valid email address.');
  if (!password || String(password).length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');

  const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (exists.length) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');

  const hash = await bcrypt.hash(password, 12);
  // Public sign-ups are always customers. Agents/admins are created by seed or an admin.
  const [r] = await pool.query('INSERT INTO users (full_name, email, password_hash, role) VALUES (?,?,?,?)',
    [full_name.trim(), email.toLowerCase(), hash, 'customer']);
  const user = { id: r.insertId, full_name: full_name.trim(), role: 'customer' };
  res.status(201).json({ token: signToken(user), user: { id: user.id, name: user.full_name, role: user.role } });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND is_active = 1', [String(email || '').toLowerCase()]);
  const user = rows[0];
  // Same message for unknown email and wrong password.
  if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  res.json({ token: signToken(user), user: { id: user.id, name: user.full_name, role: user.role } });
}));

module.exports = router;
