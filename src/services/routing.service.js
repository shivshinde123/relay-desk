/**
 * Smart routing: among available agents under their capacity, prefer the
 * category specialist, then the one with the fewest open tickets.
 * If no specialist has room, a generalist/other agent picks it up.
 */
async function pickAgent(db, categoryId) {
  const [rows] = await db.query(
    `SELECT u.id, u.full_name, ap.category_id, ap.max_open_tickets,
            COUNT(t.id) AS open_count
       FROM users u
       JOIN agent_profiles ap ON ap.user_id = u.id
       LEFT JOIN tickets t ON t.assigned_agent_id = u.id
            AND t.status IN ('open','in_progress','waiting_customer')
      WHERE u.role = 'agent' AND u.is_active = 1 AND ap.is_available = 1
      GROUP BY u.id, u.full_name, ap.category_id, ap.max_open_tickets
     HAVING open_count < ap.max_open_tickets
      ORDER BY (ap.category_id <=> ?) DESC, open_count ASC, u.id ASC
      LIMIT 1`,
    [categoryId]
  );
  return rows[0] || null;
}

module.exports = { pickAgent };
