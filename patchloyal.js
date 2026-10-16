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
  // A returning customer: any order under the email that is paid, marked paid, has a label bought, tracking or was
  // shipped (Zelle, Venmo and Cash App orders whose label was bought never got marked paid). All orders read at once.
  ['api/_gate.js', R`  let v = false;
  try {
    for (const s of await store.sales()) {
      const d = (await store.read(s.path)) || {};
      if (String(d.email || '').trim().toLowerCase() !== email) continue;
      if (!/payment due/i.test(d.status || '')) { v = true; break; }
      const meta = (await store.read('meta/' + s.n + '.json')) || {};
      if (meta.paidAt) { v = true; break; }
    }
  } catch (e) { console.error('GATE_FAIL', String(e && e.message || e)); }`, R`  let v = false, found = 0;
  try {
    const all = await store.sales(), mine = [];
    for (let i = 0; i < all.length; i += 40) {
      const part = all.slice(i, i + 40), got = await Promise.all(part.map((s) => store.read(s.path)));
      got.forEach((d, k) => { if (d && String(d.email || '').trim().toLowerCase() === email) mine.push({ s: part[k], d: d }); });
    }
    found = mine.length;
    if (mine.some((x) => !/payment due/i.test(x.d.status || ''))) v = true;
    else {
      const metas = await Promise.all(mine.map((x) => store.read('meta/' + x.s.n + '.json')));
      v = metas.some((m) => m && (m.paidAt || m.shippedAt || m.labelPdf || (m.tracking && !m.testLabel)));
    }
  } catch (e) { console.error('GATE_FAIL', String(e && e.message || e)); }
  console.log('LOYAL_CHECK', JSON.stringify({ who: email.replace(/^(.).*?(@.*)$/, '$1***$2'), orders: found, ok: v }));`],
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
