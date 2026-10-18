const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ai = require('../services/ai.service');
const pool = require('../config/db');
const { asyncHandler } = require('../middleware/error');

const limiter = rateLimit({ windowMs: 60_000, max: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Wait a moment and try again.' } });

// Category list for the portal dropdown
router.get('/categories', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query('SELECT id, name FROM categories ORDER BY id');
  res.json({ categories: rows });
}));

// Live suggestion while the customer types. Uses the fast rule engine so it never costs API calls.
router.post('/suggest', limiter, asyncHandler(async (req, res) => {
  const text = String(req.body?.text || '').slice(0, 2000);
  if (text.trim().length < 12) return res.json({ ready: false });
  const a = await ai.analyze(text, { forceRules: true });
  res.json({ ready: true, category: a.category, priority: a.priority, sentiment: a.sentiment, confidence: a.confidence, reasons: a.reasons });
}));

// Chat widget: answers common questions and suggests opening a ticket.
const FAQ = [
  { test: /(reset|forgot).*(password)|password.*(reset|forgot)/i, reply: 'To reset your password, choose "Forgot password" on the sign-in page and follow the email link. It stays valid for 30 minutes.' },
  { test: /refund|money back/i, reply: 'Refunds for eligible payments are sent back to the original payment method within 5-7 business days after approval.' },
  { test: /invoice|receipt/i, reply: 'You can download invoices from your account under Billing. If one is missing, open a ticket and we will send it.' },
];
router.post('/chat', limiter, asyncHandler(async (req, res) => {
  const message = String(req.body?.message || '').slice(0, 1000).trim();
  if (!message) return res.status(400).json({ error: 'Type a message first.' });
  const faq = FAQ.find((f) => f.test.test(message));
  const a = await ai.analyze(message, { forceRules: true });
  const escalate = !faq || a.priority === 'critical' || a.priority === 'high' || a.sentiment === 'angry';
  res.json({
    reply: faq ? faq.reply : `That looks like a ${a.category.toLowerCase()} issue. I can open a ticket so the right agent picks it up.`,
    escalate,
    suggestion: { category: a.category, priority: a.priority, sentiment: a.sentiment },
  });
}));

module.exports = router;
