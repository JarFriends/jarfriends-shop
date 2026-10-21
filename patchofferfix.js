// Build step: a buyer with an accepted offer (or an auction win) always sees their piece at checkout.
// Accepting an offer holds the unit, and a held unit counts against stock. For a Deal of the day piece that made the
// safe look claimed, so the piece dropped out of the checkout list and the buyer's own link showed nothing.
// The checkout page now sends its offer key; that piece is listed for that buyer with the units held for them.
// Runs after patchcoin.js.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/order.js', R`.filter((p) => !dl.state[p.id] || dl.state[p.id] === 'open')`, R`.filter((p) => !dl.state[p.id] || dl.state[p.id] === 'open' || p.id === offPid)`],
  ['api/order.js', R`      const ship = await offline.shipping(), secs = await offline.sections();`, R`      // An accepted offer's key: its piece is listed for this buyer, with the units held for them.
      let offPid = '', offQ = 0;
      try { const ok = verify(String((req.query && req.query.offer) || '')); if (ok && ok.oa === 1 && ok.pid && ok.x > Math.floor(Date.now() / 1000)) { offPid = String(ok.pid); offQ = Number(ok.q) || 1; } } catch (e) { offPid = ''; }
      const ship = await offline.shipping(), secs = await offline.sections();`],
  ['api/order.js', R`return res.json({ products: products, deals: dl.slots,`, R`if (offPid) products.forEach((x) => { if (x.id === offPid && !(Number(x.stock) >= offQ)) x.stock = offQ; });
      return res.json({ products: products, deals: dl.slots,`],
  ['public/order.html', R`Promise.all([fetch('/api/order?co=1' + (acct ? '&t=' + encodeURIComponent(acct) : '')`, R`Promise.all([fetch('/api/order?co=1' + (offerTok ? '&offer=' + encodeURIComponent(offerTok) : '') + (acct ? '&t=' + encodeURIComponent(acct) : '')`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchofferfix: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
