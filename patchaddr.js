// Build step: a customer can change the shipping address of an order that has not shipped (My orders).
// The new address is kept in meta/<invoice>.json as addr: [name, company, street, line2, city, state, zip, country];
// the shipping label and the label page use it in place of the address on the order. See api/orders.js (POST).
// Runs after patchjars2.js.
const fs = require('fs');
const R = String.raw;
const over = R`  try { const mo = await require('./_store').read('meta/' + inv.n + '.json'); if (mo && Array.isArray(mo.addr) && mo.addr[2]) inv.a = mo.addr; } catch (e) { /* the address on the order stays */ }
`;
const changes = [
  ['api/label.js', R`  const to = offline.shipTo(inv);
  if (!to) return res.status(400).json({ error: 'This order has no shipping address on it.' });`, over + R`  const to = offline.shipTo(inv);
  if (!to) return res.status(400).json({ error: 'This order has no shipping address on it.' });`],
  ['api/status.js', R`  const invoice = { no: inv.n, item: inv.i,`, over + R`  const invoice = { no: inv.n, item: inv.i,`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchaddr: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
