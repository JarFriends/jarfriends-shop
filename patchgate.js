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
    if ((await gate.gated())[p.id] && !gate.isAdmin(b.ak) && !(await gate.isBuyer(gate.emailOf(b.acct)))) return res.status(403).json({ error: 'This is a Customer Loyalty product, only for returning customers. Sign in with the email you ordered with, then open the safe again.' });
  }`],
  // The checkout page sends the sign-in along, and never lists a safe that is still locked.
  ['public/order.html', R`  Promise.all([fetch('/api/order', { cache: 'no-store' })`, R`  var acct = '', ak = ''; try { acct = localStorage.getItem('acct_token') || ''; ak = localStorage.getItem('adminKey') || ''; } catch (e) { acct = ''; }
  Promise.all([fetch('/api/order?co=1' + (acct ? '&t=' + encodeURIComponent(acct) : '') + (ak ? '&ak=' + encodeURIComponent(ak) : ''), { cache: 'no-store' })`],
  ['public/order.html', R`    data.product = $('product').value; data.qty = Number($('qty').value);`, R`    data.product = $('product').value; data.qty = Number($('qty').value); data.acct = acct; data.ak = ak;`]
];
// Saving a lower price in the back office emails the mailing list right away.
changes.push(['api/admin.js', "    if (!p.deal) f.section = String(q.section || '').replace(/[^A-Za-z, ]/g, '').trim().slice(0, 80);\n    await edits.save(p.id, f);\n    return res.json({ ok: true });",
  "    if (!p.deal) f.section = String(q.section || '').replace(/[^A-Za-z, ]/g, '').trim().slice(0, 80);\n    await edits.save(p.id, f);\n    if (Number(f.price) < Number(p.price) - 0.004) { try { await require('./_sweep').dropNow(); } catch (e) { console.error('DROP_NOW_FAIL', String(e && e.message || e)); } }\n    return res.json({ ok: true });"]);
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
        email = gate.emailOf(req.query && req.query.t); ok = gate.isAdmin(req.query && req.query.ak) || await gate.isBuyer(email);
        const send = res.json.bind(res), co = !!(req.query && req.query.co);
        res.json = (body) => {
          try {
            if (body && Array.isArray(body.products)) {
              body.products = body.products.map((p) => {
                if (!ids[p.id]) return p;
                // Claimed: nobody sees what it was; everyone sees that the next one is coming soon.
                if (!(Number(p.stock) > 0)) return co ? null : { id: p.id, name: 'Customer Loyalty safe', price: '0.00', min: 1, stock: 0, ship: '0.00', sections: p.sections || [], deal: false, nft: false, shelf: true, locked: true, soon: true, gate: 'soon',
                  desc: 'Someone already claimed this Customer Loyalty reward. A new one is coming soon.', photo: 'https://' + req.headers.host + '/photos/vault.jpg' };
                if (ok) return Object.assign({}, p, { buyersOnly: true });
                if (co) return null;
                return { id: p.id, name: 'Customer Loyalty safe', price: '0.00', min: 1, stock: Number(p.stock) > 0 ? 1 : 0, ship: '0.00', sections: p.sections || [], deal: false, nft: false, shelf: true, locked: true, gate: email ? 'buyer' : 'signin',
                  desc: 'A Customer Loyalty product: only returning customers can open this safe. Sign in with the email you ordered with to see what is inside.', photo: 'https://' + req.headers.host + '/photos/vault.jpg' };
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
