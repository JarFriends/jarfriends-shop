// Build step: the Customer Loyalty safe opens by email, with no sign-in link sent by email.
// The visitor types the email they ordered with; if it has a paid order, the safe opens at once and this device
// keeps a loyalty pass (30 days) that works only for Customer Loyalty pieces, not for My orders. Signed in: automatic.
//   GET /api/order?loyal=<email>   -> { ok, lt } or an error
// Runs after patchpartyedit.js.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/_gate.js', R`module.exports = { emailOf, isBuyer, gated, paidByEmail, isAdmin, bidderOf };`, R`// A signed-in email, or the email on a loyalty pass (made when someone types the email they ordered with).
function loyalOf(token) {
  const e = emailOf(token);
  if (e) return e;
  const t = verify(String(token || ''));
  return t && t.lb === 1 && t.e && t.x > Math.floor(Date.now() / 1000) ? String(t.e).trim().toLowerCase() : '';
}
module.exports = { emailOf, isBuyer, gated, paidByEmail, isAdmin, bidderOf, loyalOf };`],
  ['api/order.js', R`!(await gate.isBuyer(gate.emailOf(b.acct)))`, R`!(await gate.isBuyer(gate.loyalOf(b.acct)))`],
  ['api/order.js', R`email = gate.emailOf(req.query && req.query.t); ok = gate.isAdmin(req.query && req.query.ak) || await gate.isBuyer(email);`, R`email = gate.loyalOf(req.query && req.query.t); ok = gate.isAdmin(req.query && req.query.ak) || await gate.isBuyer(email);`],
  ['api/order.js', R`  if (req.method === 'GET') {
    // ?quote=1`, R`  if (req.method === 'GET' && req.query && req.query.loyal != null) {
    const e = String(req.query.loyal || '').trim().toLowerCase().slice(0, 160);
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e)) return res.status(400).json({ error: 'Enter the email you ordered with.' });
    const g = require('./_gate');
    if (!(await g.isBuyer(e))) return res.status(404).json({ error: 'We do not see a paid order under that email. Check the spelling, or use the email you ordered with. Buy any piece in the shop and this safe opens for you.' });
    return res.json({ ok: true, lt: require('./_lib').sign({ lb: 1, e: e, x: Math.floor(Date.now() / 1000) + 30 * 86400 }) });
  }
  if (req.method === 'GET') {
    // ?quote=1`],
  // The checkout uses the pass too when nobody is signed in.
  ['public/order.html', R`acct = localStorage.getItem('acct_token') || '';`, R`acct = localStorage.getItem('acct_token') || localStorage.getItem('loyal_token') || '';`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchloyal: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
