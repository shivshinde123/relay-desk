async function getPolicy(db, priority) {
  const [rows] = await db.query('SELECT * FROM sla_policies WHERE priority = ?', [priority]);
  return rows[0] || null;
}

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);

function computeDue(policy, from = new Date()) {
  if (!policy) return { firstResponseDue: null, resolutionDue: null };
  return {
    firstResponseDue: addMinutes(from, policy.first_response_minutes),
    resolutionDue: addMinutes(from, policy.resolution_minutes),
  };
}

async function logEvent(db, ticketId, eventType, slaType, details = null) {
  await db.query('INSERT INTO sla_logs (ticket_id, event_type, sla_type, details) VALUES (?,?,?,?)', [
    ticketId, eventType, slaType, details ? JSON.stringify(details) : null,
  ]);
}

module.exports = { getPolicy, computeDue, logEvent, addMinutes };
