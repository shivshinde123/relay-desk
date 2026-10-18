// Creates demo users and sample tickets. Usage: npm run db:seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');
const { createTicket } = require('../src/services/ticket.service');

async function upsertUser(name, email, password, role) {
  const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length) return rows[0].id;
  const [r] = await pool.query('INSERT INTO users (full_name,email,password_hash,role) VALUES (?,?,?,?)',
    [name, email, await bcrypt.hash(password, 12), role]);
  return r.insertId;
}

(async () => {
  const [cats] = await pool.query('SELECT id, name FROM categories');
  const cat = Object.fromEntries(cats.map((c) => [c.name, c.id]));

  await upsertUser('Admin Asha', 'admin@demo.test', 'Admin@12345', 'admin');
  const agents = [
    ['Billing Bhavna', 'bhavna@demo.test', 'Billing'],
    ['Tech Tanmay', 'tanmay@demo.test', 'Technical'],
    ['Account Aarav', 'aarav@demo.test', 'Account'],
  ];
  for (const [name, email, c] of agents) {
    const id = await upsertUser(name, email, 'Agent@12345', 'agent');
    await pool.query('INSERT IGNORE INTO agent_profiles (user_id, category_id, max_open_tickets) VALUES (?,?,10)', [id, cat[c]]);
  }
  const customerId = await upsertUser('Demo Customer', 'customer@demo.test', 'Customer@12345', 'customer');

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM tickets');
  if (n === 0) {
    const samples = [
      ['Charged twice for my subscription', 'I was charged twice this month for the Pro plan. Please refund the extra payment as soon as possible, this is urgent for my accounts team.'],
      ['Whole site is down for our team', 'Our production dashboard has been down for 20 minutes and nobody can log in. This is an outage affecting every user, please help immediately!!'],
      ['Cannot reset my password', 'I tried to reset my password three times but the verification email never arrives. My account is locked now.'],
      ['Please add dark mode to the mobile app', 'It would be nice if the app had a dark mode. Just a suggestion, thanks for the great product!'],
      ['This is unacceptable service', 'The app keeps crashing every time I upload a file. This is ridiculous, I am furious and paying for a broken product.'],
      ['How do I download my invoices?', 'Quick question: where can I download last quarter invoices for my records?'],
    ];
    for (const [subject, description] of samples) {
      await createTicket({ customerId, subject, description }, { forceRules: true });
    }
    console.log(`Created ${samples.length} sample tickets.`);
  }

  console.log('\nDemo logins');
  console.log('  Customer: customer@demo.test / Customer@12345');
  console.log('  Agent:    tanmay@demo.test   / Agent@12345');
  console.log('  Admin:    admin@demo.test    / Admin@12345');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
