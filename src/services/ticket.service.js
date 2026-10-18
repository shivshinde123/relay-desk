const pool = require('../config/db');
const ai = require('./ai.service');
const sla = require('./sla.service');
const routing = require('./routing.service');
const HttpError = require('../utils/httpError');

const OPEN_STATUSES = ['open', 'in_progress', 'waiting_customer'];

const TICKET_SELECT = `
  SELECT t.*, c.name AS category_name, cu.full_name AS customer_name, a.full_name AS agent_name
    FROM tickets t
    LEFT JOIN categories c ON c.id = t.category_id
    JOIN users cu ON cu.id = t.customer_id
    LEFT JOIN users a ON a.id = t.assigned_agent_id`;

async function getTicketById(db, id) {
  const [rows] = await db.query(`${TICKET_SELECT} WHERE t.id = ?`, [id]);
  return rows[0] || null;
}

/** Lifecycle steps 1-4: create -> AI classify -> SLA -> route. */
async function createTicket({ customerId, subject, description, categoryId }, opts = {}) {
  // AI call happens before the DB transaction so a slow API never holds a connection.
  const analysis = await ai.analyze(`${subject}\n${description}`, { forceRules: opts.forceRules });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let catId = null;
    if (categoryId) {
      const [r] = await conn.query('SELECT id FROM categories WHERE id = ?', [categoryId]);
      if (r.length) catId = r[0].id;
    }
    if (!catId) {
      const [r] = await conn.query('SELECT id FROM categories WHERE name = ?', [analysis.category]);
      if (r.length) catId = r[0].id;
    }

    const policy = await sla.getPolicy(conn, analysis.priority);
    const now = new Date();
    const { firstResponseDue, resolutionDue } = sla.computeDue(policy, now);

    const [ins] = await conn.query(
      `INSERT INTO tickets
        (ticket_no, customer_id, category_id, subject, description, priority, sentiment, sentiment_score,
         ai_confidence, sla_policy_id, first_response_due, resolution_due, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [`TMP-${Math.random().toString(36).slice(2, 10)}`, customerId, catId, subject, description,
       analysis.priority, analysis.sentiment, analysis.sentimentScore, analysis.confidence,
       policy?.id ?? null, firstResponseDue, resolutionDue, now]
    );
    const ticketId = ins.insertId;
    await conn.query('UPDATE tickets SET ticket_no = ? WHERE id = ?', [`TKT-${String(ticketId).padStart(6, '0')}`, ticketId]);

    await conn.query(
      'INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, body) VALUES (?,?,?,?)',
      [ticketId, customerId, 'customer', description]
    );
    await conn.query(
      `INSERT INTO ai_analysis_logs (ticket_id, engine, predicted_category, predicted_priority, sentiment_score, confidence, raw_response)
       VALUES (?,?,?,?,?,?,?)`,
      [ticketId, analysis.engine, analysis.category, analysis.priority, analysis.sentimentScore, analysis.confidence, JSON.stringify(analysis)]
    );
    await sla.logEvent(conn, ticketId, 'started', 'first_response', { due: firstResponseDue });
    await sla.logEvent(conn, ticketId, 'started', 'resolution', { due: resolutionDue });

    const agent = await routing.pickAgent(conn, catId);
    if (agent) {
      await conn.query('UPDATE tickets SET assigned_agent_id = ? WHERE id = ?', [agent.id, ticketId]);
      await conn.query(
        'INSERT INTO agent_assignments (ticket_id, agent_id, assigned_by, reason) VALUES (?,?,?,?)',
        [ticketId, agent.id, 'ai_router', `Category match / lowest load (${agent.open_count} open)`]
      );
    }

    await conn.commit();
    const ticket = await getTicketById(pool, ticketId);
    return { ticket, analysis };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Lifecycle steps 6-9: status changes, SLA bookkeeping, resolution time. */
async function updateTicket(id, actor, changes) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM tickets WHERE id = ? FOR UPDATE', [id]);
    const t = rows[0];
    if (!t) throw new HttpError(404, 'Ticket not found.');
    if (actor.role === 'agent' && t.assigned_agent_id && t.assigned_agent_id !== actor.id) {
      throw new HttpError(403, 'This ticket is assigned to another agent.');
    }

    const now = new Date();
    const sets = {};
    const { status, priority, category_id: categoryId, assigned_agent_id: agentId } = changes;

    if (priority && priority !== t.priority) {
      const policy = await sla.getPolicy(conn, priority);
      const due = sla.computeDue(policy, new Date(t.created_at));
      Object.assign(sets, { priority, sla_policy_id: policy?.id ?? null, first_response_due: due.firstResponseDue, resolution_due: due.resolutionDue });
    }
    if (categoryId) sets.category_id = categoryId;

    if (agentId !== undefined && agentId !== t.assigned_agent_id) {
      if (actor.role !== 'admin' && agentId !== actor.id) throw new HttpError(403, 'Only admins can assign tickets to others.');
      sets.assigned_agent_id = agentId;
      await conn.query('UPDATE agent_assignments SET unassigned_at = ? WHERE ticket_id = ? AND unassigned_at IS NULL', [now, id]);
      if (agentId) {
        await conn.query('INSERT INTO agent_assignments (ticket_id, agent_id, assigned_by, reason) VALUES (?,?,?,?)',
          [id, agentId, actor.role === 'admin' ? 'admin' : 'agent', 'Manual assignment']);
      }
    }

    if (status && status !== t.status) {
      sets.status = status;

      // First response: first time an agent moves the ticket forward.
      if (!t.first_responded_at && ['in_progress', 'waiting_customer', 'resolved'].includes(status)) {
        sets.first_responded_at = now;
        const late = t.first_response_due && now > new Date(t.first_response_due);
        await sla.logEvent(conn, id, late ? 'breached' : 'met', 'first_response', { at: now });
      }
      // Pause the clock while we wait on the customer; shift the deadline when it resumes.
      if (status === 'waiting_customer') {
        sets.paused_at = now;
        await sla.logEvent(conn, id, 'paused', 'resolution');
      } else if (t.status === 'waiting_customer' && t.paused_at) {
        const pausedMs = now - new Date(t.paused_at);
        sets.paused_at = null;
        if (t.resolution_due) sets.resolution_due = new Date(new Date(t.resolution_due).getTime() + pausedMs);
        await sla.logEvent(conn, id, 'resumed', 'resolution', { pausedMs });
      }
      if (status === 'resolved') {
        sets.resolved_at = now;
        sets.resolution_minutes = Math.max(0, Math.round((now - new Date(t.created_at)) / 60000));
        const due = sets.resolution_due || t.resolution_due;
        const breached = t.sla_breached || (due && now > new Date(due));
        sets.sla_breached = breached ? 1 : 0;
        await sla.logEvent(conn, id, breached ? 'breached' : 'met', 'resolution', { minutes: sets.resolution_minutes });
      }
      if (status === 'open' || status === 'in_progress') {
        // Re-opened: clear resolution fields.
        if (t.resolved_at) Object.assign(sets, { resolved_at: null, resolution_minutes: null });
      }
    }

    const cols = Object.keys(sets);
    if (cols.length) {
      await conn.query(`UPDATE tickets SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => sets[c]), id]);
    }
    await conn.commit();
    return getTicketById(pool, id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function listTickets({ status, priority, limit = 100, agentId } = {}) {
  const where = [];
  const params = [];
  if (status) { where.push('t.status = ?'); params.push(status); }
  else where.push(`t.status IN ('open','in_progress','waiting_customer')`);
  if (priority) { where.push('t.priority = ?'); params.push(priority); }
  if (agentId) { where.push('t.assigned_agent_id = ?'); params.push(agentId); }
  params.push(Math.min(Number(limit) || 100, 200));
  const [rows] = await pool.query(
    `${TICKET_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY FIELD(t.priority,'critical','high','medium','low'), t.resolution_due ASC LIMIT ?`,
    params
  );
  return rows;
}

async function listForCustomer(customerId) {
  const [rows] = await pool.query(`${TICKET_SELECT} WHERE t.customer_id = ? ORDER BY t.created_at DESC LIMIT 50`, [customerId]);
  return rows;
}

async function getAgentAssist(id, actor) {
  const ticket = await getTicketById(pool, id);
  if (!ticket) throw new HttpError(404, 'Ticket not found.');
  if (actor.role === 'agent' && ticket.assigned_agent_id && ticket.assigned_agent_id !== actor.id) {
    throw new HttpError(403, 'This ticket is assigned to another agent.');
  }
  return ai.assistTicket(ticket);
}

async function getDashboard() {
  const [statusRows] = await pool.query('SELECT status, COUNT(*) AS n FROM tickets GROUP BY status');
  const [prioRows] = await pool.query(
    `SELECT priority, COUNT(*) AS n FROM tickets WHERE status IN ('open','in_progress','waiting_customer') GROUP BY priority`);
  const [[slaRow]] = await pool.query(
    `SELECT COALESCE(SUM(resolved_at IS NOT NULL AND sla_breached = 0),0) AS met,
            COALESCE(SUM(sla_breached = 1),0) AS breached,
            ROUND(AVG(resolution_minutes)) AS avg_resolution_minutes
       FROM tickets`);
  const [[risk]] = await pool.query(
    `SELECT COUNT(*) AS n FROM tickets
      WHERE status IN ('open','in_progress') AND sla_breached = 0 AND resolution_due IS NOT NULL
        AND TIMESTAMPDIFF(SECOND, created_at, NOW()) / GREATEST(TIMESTAMPDIFF(SECOND, created_at, resolution_due),1) >= 0.75`);
  const [workload] = await pool.query(
    `SELECT u.id, u.full_name, COUNT(t.id) AS open_count
       FROM users u LEFT JOIN tickets t ON t.assigned_agent_id = u.id AND t.status IN ('open','in_progress','waiting_customer')
      WHERE u.role = 'agent' GROUP BY u.id, u.full_name ORDER BY open_count DESC`);
  const [bySentiment] = await pool.query(
    `SELECT sentiment, COUNT(*) AS n FROM tickets WHERE status IN ('open','in_progress','waiting_customer') GROUP BY sentiment`);

  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, Number(r.n)]));
  const byPriority = Object.fromEntries(prioRows.map((r) => [r.priority, Number(r.n)]));
  const finished = Number(slaRow.met) + Number(slaRow.breached);
  return {
    byStatus,
    byPriority,
    bySentiment: Object.fromEntries(bySentiment.map((r) => [r.sentiment, Number(r.n)])),
    sla: {
      met: Number(slaRow.met),
      breached: Number(slaRow.breached),
      atRisk: Number(risk.n),
      compliancePct: finished ? Math.round((Number(slaRow.met) / finished) * 100) : 100,
      avgResolutionMinutes: slaRow.avg_resolution_minutes === null ? null : Number(slaRow.avg_resolution_minutes),
    },
    workload: workload.map((w) => ({ id: w.id, name: w.full_name, open: Number(w.open_count) })),
    tickets: await listTickets({ limit: 50 }),
  };
}

module.exports = { createTicket, updateTicket, listTickets, listForCustomer, getDashboard, getTicketById, getAgentAssist, OPEN_STATUSES };
