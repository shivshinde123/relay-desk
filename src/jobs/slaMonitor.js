const cron = require('node-cron');
const pool = require('../config/db');
const sla = require('../services/sla.service');
const svc = require('../services/ticket.service');

/** Every minute: log 75%/90% warnings and mark breaches on active tickets. */
async function runOnce(io) {
  const [rows] = await pool.query(
    `SELECT id, created_at, resolution_due, status FROM tickets
      WHERE status IN ('open','in_progress') AND sla_breached = 0 AND resolution_due IS NOT NULL`);
  const now = Date.now();

  for (const t of rows) {
    const start = new Date(t.created_at).getTime();
    const due = new Date(t.resolution_due).getTime();
    const ratio = (now - start) / Math.max(due - start, 1);

    if (ratio >= 1) {
      await pool.query('UPDATE tickets SET sla_breached = 1 WHERE id = ?', [t.id]);
      await sla.logEvent(pool, t.id, 'breached', 'resolution');
      const ticket = await svc.getTicketById(pool, t.id);
      io?.to('staff').emit('ticket:updated', ticket);
      io?.to('staff').emit('sla:breach', { id: t.id, ticket_no: ticket.ticket_no });
      continue;
    }
    for (const [limit, event] of [[0.9, 'warning_90'], [0.75, 'warning_75']]) {
      if (ratio >= limit) {
        const [seen] = await pool.query(
          `SELECT id FROM sla_logs WHERE ticket_id = ? AND event_type = ? AND sla_type = 'resolution' LIMIT 1`, [t.id, event]);
        if (!seen.length) await sla.logEvent(pool, t.id, event, 'resolution');
        break; // only the highest threshold reached
      }
    }
  }
}

function start(io) {
  cron.schedule('* * * * *', () => runOnce(io).catch((e) => console.error('SLA monitor failed:', e.message)));
  console.log('SLA monitor scheduled (every minute).');
}

module.exports = { start, runOnce };
