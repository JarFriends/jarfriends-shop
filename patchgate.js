// Build step (last of the patches): buyers-only pieces (see api/_gate.js).
// - The back office can tick "Buyers only" on a product.
// - The shop's product list shows such a piece as a locked safe unless the request carries the sign-in of a past buyer.
// - Placing an order for one needs that sign-in too.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/admin.js', R`    if (q.hidden !== undefined) f.hidden = q.hidden === '1';`, R`    if (q.hidden !== undefined) f.hidden = q.hidden === '1';
    if (q.buyers !== undefined) f.buyers = q.buyers === '1';`],
  ['api/admin.js', R`hidden: !!p.hidden, onShelf: !!p.shelf,`, R`hidden: !!p.hidden, buyers: !!p.buyers, onShelf: !!p.shelf,`],
  ['api/order.js', R`  if (!p) return res.status(400).json({ error: 'Choose a product.' });`, R`  if (!p) return res.status(400).json({ error: 'Choose a product.' });
  {
    const gate = require('./_gate');
    if ((await gate.gated())[p.id] && !(await gate.isBuyer(gate.emailOf(b.acct)))) return res.status(403).json({ error: 'This piece is for past buyers only. Sign in with the email you ordered with, then open the safe again.' });
  }`],
  // The checkout page sends the sign-in along, and never lists a safe that is still locked.
  ['public/order.html', R`  Promise.all([fetch('/api/order', { cache: 'no-store' })`, R`  var acct = ''; try { acct = localStorage.getItem('acct_token') || ''; } catch (e) { acct = ''; }
  Promise.all([fetch('/api/order?co=1' + (acct ? '&t=' + encodeURIComponent(acct) : ''), { cache: 'no-store' })`],
  ['public/order.html', R`    data.product = $('product').value; data.qty = Number($('qty').value);`, R`    data.product = $('product').value; data.qty = Number($('qty').value); data.acct = acct;`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchgate: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
// The product list: a buyers-only piece goes out as a locked safe (no name, price or photo of what is inside)
// unless the request is signed in as a past buyer. ?co=1 (the checkout page) leaves locked ones out altogether.
const f = 'api/order.js';
fs.writeFileSync(f, fs.readFileSync(f, 'utf8') + `
;(() => {
  const inner = module.exports;
  const w = async (req, res) => {
    if (req.method === 'GET') {
      const gate = require('./_gate');
      let ids = {}, email = '', ok = false;
      try { ids = await gate.gated(); } catch (e) { ids = {}; }
      if (Object.keys(ids).length) {
        email = gate.emailOf(req.query && req.query.t); ok = await gate.isBuyer(email);
        const send = res.json.bind(res), co = !!(req.query && req.query.co);
        res.json = (body) => {
          try {
            if (body && Array.isArray(body.products)) {
              body.products = body.products.map((p) => {
                if (!ids[p.id]) return p;
                if (ok) return Object.assign({}, p, { buyersOnly: true });
                if (co) return null;
                return { id: p.id, name: 'Buyers-only safe', price: '0.00', min: 1, stock: Number(p.stock) > 0 ? 1 : 0, ship: '0.00', sections: p.sections || [], deal: false, nft: false, shelf: true, locked: true, gate: email ? 'buyer' : 'signin',
                  desc: 'Only past buyers can open this safe. Sign in with the email you ordered with to see what is inside.', photo: 'https://' + req.headers.host + '/photos/vault.jpg' };
              }).filter(Boolean);
            }
          } catch (e) { /* the list goes out as it was */ }
          return send(body);
        };
      }
    }
    return inner(req, res);
  };
  Object.assign(w, inner);
  module.exports = w;
})();
`);
