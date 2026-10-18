// Quick check of the rule-based classifier (no database or API key needed). Usage: npm run test:ai
const assert = require('assert');
const { analyzeWithRules, assistTicket } = require('../src/services/ai.service');

const cases = [
  ['I was charged twice, please refund this urgent payment problem', { category: 'Billing', priority: 'high' }],
  ['Our production is down, total outage, nobody can use the app!!', { category: 'Technical', priority: 'critical' }],
  ['I forgot my password and my account is locked', { category: 'Account' }],
  ['It would be nice to have a dark mode feature, thanks!', { category: 'Feature Request', priority: 'low', sentiment: 'positive' }],
  ['This is unacceptable, the app crashes and I am furious', { category: 'Technical', sentiment: 'angry' }],
  ['hello there', { category: 'General' }],
];
for (const [text, expected] of cases) {
  const r = analyzeWithRules(text);
  for (const [k, v] of Object.entries(expected)) assert.strictEqual(r[k], v, `"${text}" -> ${k}: got ${r[k]}, expected ${v}`);
  console.log('ok  ', text.slice(0, 55).padEnd(55), r.category, r.priority, r.sentiment);
}
const assist = assistTicket({
  subject: 'Cannot reset my password',
  description: 'The reset email never arrives. My account is locked.',
});
assert.strictEqual(assist.category, 'Account');
assert.match(assist.nextAction, /approved identity-verification process/i);
assert.match(assist.nextAction, /Never ask.*password, OTP/i);
assert.strictEqual(assist.engine, 'built-in rules');
console.log('ok   ticket assist includes account-safe next action');
console.log('All AI classifier checks passed.');
