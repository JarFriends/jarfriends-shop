// Build step: a promo code the owner adds works only on the groups the owner ticks for it: shop products, Deal of the day, party pricing. Runs after patchextra.js.
// Codes from the PROMO_CODES setting that the owner has not touched keep working on every product.
// Each change is [file, text to find, text to put in its place]; the text to find must be there exactly once.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/_offline.js', R`    else if (v.pct > 0 && v.pct <= 100) out[c] = { pct: v.pct };
    else if (v.off > 0) out[c] = { off: v.off };`, R`    else if (v.pct > 0 && v.pct <= 100) out[c] = { pct: v.pct, for: Array.isArray(v.for) ? v.for : [] };
    else if (v.off > 0) out[c] = { off: v.off, for: Array.isArray(v.for) ? v.for : [] };`],
  // promo(code, productId): with a product, a code that is not ticked for it is no code at all.
  ['api/_offline.js', R`function promo(code) {
  const c = String(code == null ? '' : code).trim().toUpperCase();
  const p = c ? promos()[c] : null;`, R`// Which of the owner's three groups a product is in: 'party' (party pricing), 'deal' (Deal of the day) or 'shop'.
async function promoGroup(pid) {
  const id = String(pid == null ? '' : pid);
  if (id === require('./_party').PARTY.pid) return 'party';
  try {
    const x = (await require('./_edits').apply(require('./_products'), { all: true })).filter((y) => y.id === id)[0];
    return x && x.deal ? 'deal' : 'shop';
  } catch (e) { return 'shop'; }
}
function promo(code, pid, group) {
  const c = String(code == null ? '' : code).trim().toUpperCase();
  let p = c ? promos()[c] : null;
  if (p && pid != null && p.for && p.for.indexOf(String(pid)) < 0 && p.for.indexOf(group) < 0) p = null;`],
  ['api/_offline.js', 'module.exports = { promos,', 'module.exports = { promoGroup, promos,'],
  ['api/order.js', R`const found = offline.promo(req.query.promo);
      return found ? res.json({ promo: found }) : res.status(404).json({ error: 'That promo code is not valid.' });`, R`const found = offline.promo(req.query.promo, req.query.product, await offline.promoGroup(req.query.product));
      return found ? res.json({ promo: found }) : res.status(404).json({ error: offline.promo(req.query.promo) ? 'That promo code does not work on this piece.' : 'That promo code is not valid.' });`],
  ['api/order.js', R`const promo = code ? offline.promo(code) : null;
  if (code && !promo) return res.status(400).json({ error: 'That promo code is not valid. Remove it or try another.' });`, R`const promo = code ? offline.promo(code, p.id, await offline.promoGroup(p.id)) : null;
  if (code && !promo) return res.status(400).json({ error: offline.promo(code) ? 'That promo code does not work on this piece. Remove it to continue.' : 'That promo code is not valid. Remove it or try another.' });`],
  ['api/admin.js', R`q.kind === 'pct' ? { pct: n } : { off: Math.round(n * 100) }));`, R`q.kind === 'pct' ? { pct: n } : { off: Math.round(n * 100) }, { for: String(q.for || '').split(',').map((x) => x.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20)).filter(Boolean).slice(0, 200) }));`],
  ['api/admin.js', R`box[c].pct ? { pct: box[c].pct } : { off: box[c].off }); });`, R`box[c].pct ? { pct: box[c].pct } : { off: box[c].off }, { for: Array.isArray(box[c].for) ? box[c].for : [] }); });`],
  // Checkout: the code is checked against the piece picked, and again when the piece changes.
  ['public/order.html', R`fetch('/api/order?promo=' + encodeURIComponent(code), { cache: 'no-store' })`, R`fetch('/api/order?promo=' + encodeURIComponent(code) + '&product=' + encodeURIComponent($('product').value), { cache: 'no-store' })`],
  ['public/order.html', R`  $('product').addEventListener('change', total);`, R`  $('product').addEventListener('change', function () { if (promo || $('promo').value.trim()) applyPromo(); else total(); });`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchpromo: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
