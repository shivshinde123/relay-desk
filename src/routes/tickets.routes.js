const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const HttpError = require('../utils/httpError');
const svc = require('../services/ticket.service');

const STATUSES = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const emit = (req, event, ticket) => {
  const io = req.app.get('io');
  if (!io) return;
  io.to('staff').emit(event, ticket);
  io.to(`user:${ticket.customer_id}`).emit(event, ticket);
};

router.use(requireAuth);

// POST /api/tickets: AI analysis + SLA + routing + save
router.post('/', requireRole('customer'), asyncHandler(async (req, res) => {
  const subject = String(req.body?.subject || '').trim();
  const description = String(req.body?.description || '').trim();
  if (subject.length < 5 || subject.length > 200) throw new HttpError(400, 'Subject must be 5-200 characters.');
  if (description.length < 20 || description.length > 5000) throw new HttpError(400, 'Describe the issue in 20-5000 characters.');
  const { ticket, analysis } = await svc.createTicket({
    customerId: req.user.id, subject, description, categoryId: Number(req.body?.category_id) || null,
  });
  emit(req, 'ticket:new', ticket);
  res.status(201).json({ ticket, analysis });
}));

router.get('/mine', requireRole('customer'), asyncHandler(async (req, res) => {
  res.json({ tickets: await svc.listForCustomer(req.user.id) });
}));

// GET /api/tickets/dashboard (must be declared before /:id)
router.get('/dashboard', requireRole('agent', 'admin'), asyncHandler(async (_req, res) => {
  res.json(await svc.getDashboard());
}));

router.get('/', requireRole('agent', 'admin'), asyncHandler(async (req, res) => {
  const { status, priority, limit, mine } = req.query;
  if (status && !STATUSES.includes(status)) throw new HttpError(400, 'Unknown status.');
  if (priority && !PRIORITIES.includes(priority)) throw new HttpError(400, 'Unknown priority.');
  res.json({ tickets: await svc.listTickets({ status, priority, limit, agentId: mine === '1' ? req.user.id : undefined }) });
}));

router.post('/:id(\\d+)/assist', requireRole('agent', 'admin'), asyncHandler(async (req, res) => {
  res.json({ assist: await svc.getAgentAssist(Number(req.params.id), req.user) });
}));

// PUT /api/tickets/:id: status/priority/assignment + resolution time
router.put('/:id(\\d+)', requireRole('agent', 'admin'), asyncHandler(async (req, res) => {
  const { status, priority, category_id, assigned_agent_id } = req.body || {};
  if (status !== undefined && !STATUSES.includes(status)) throw new HttpError(400, 'Unknown status.');
  if (priority !== undefined && !PRIORITIES.includes(priority)) throw new HttpError(400, 'Unknown priority.');
  const ticket = await svc.updateTicket(Number(req.params.id), req.user, { status, priority, category_id, assigned_agent_id });
  emit(req, 'ticket:updated', ticket);
  res.json({ ticket });
}));

module.exports = router;
