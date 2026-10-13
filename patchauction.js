// Build step (after patchship.js): auctions (see api/_auction.js and api/auction.js).
// - Checkout sells an auction piece only to the winner, through the pay link in their "You won" email.
// - The shop's product list carries each auction's current bid, end time and bid count, and shows the current bid as the price.
// - The back office knows which products are auctions.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/order.js', R`  const tail = deal ? ' (accepted offer ' + deal.n + ')' : '';`, R`  {
    let auc = null;
    try { auc = (await require('./_auction').list()).filter((x) => x.id === p.id)[0]; } catch (e) { auc = null; }
    if (auc && !(deal && deal.n === 'AUC-' + p.id)) return res.status(403).json({ error: 'This piece is up for auction. Place a bid on its auction page: https://' + req.headers.host + '/auction.html?id=' + p.id });
  }
  const tail = deal ? (/^AUC-/.test(deal.n) ? ' (auction win)' : ' (accepted offer ' + deal.n + ')') : '';`],
  ['api/admin.js', R`buyers: !!p.buyers,`, R`buyers: !!p.buyers, auction: p.auction || null,`],
  ['public/order.html', R`      $('lead').textContent = 'Your offer was accepted. The price below is your offer price.';`, R`      $('lead').textContent = /^AUC-/.test(deal.no || '') ? 'You won the auction. The price below is your winning bid. Pay within 24 hours to claim it.' : 'Your offer was accepted. The price below is your offer price.';`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchauction: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
const f = 'api/order.js';
fs.writeFileSync(f, fs.readFileSync(f, 'utf8') + `
;(() => {
  const inner = module.exports;
  const w = async (req, res) => {
    if (req.method === 'GET') {
      // Pieces whose last units are held for an accepted offer show as on hold, not sold out.
      let held = {};
      try { held = await require('./_holds').byProduct(); } catch (e) { held = {}; }
      if (Object.keys(held).length) {
        const send0 = res.json.bind(res);
        res.json = (body) => { try { if (body && Array.isArray(body.products)) body.products.forEach((p) => { if (held[p.id] && !(Number(p.stock) > 0)) p.onHold = true; }); } catch (e) { /* as it was */ } return send0(body); };
      }
      let list = [];
      try { list = await require('./_auction').list(); } catch (e) { list = []; }
      if (list.length) {
        const A = require('./_auction'), seen = {};
        await Promise.all(list.map(async (p) => { try { seen[p.id] = A.pub(await A.state(p)); } catch (e) { /* left as it is */ } }));
        const send = res.json.bind(res);
        res.json = (body) => {
          try { if (body && Array.isArray(body.products)) body.products.forEach((p) => { const a = seen[p.id]; if (a) { p.auction = Object.assign({}, a, { history: undefined }); p.price = a.current; } }); } catch (e) { /* the list goes out as it was */ }
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
