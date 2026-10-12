// Build step (after patchgate.js): jars (see api/_jars.js).
// - Ten jars open a locked Deal of the day safe early for one customer: checkout lets that customer order the piece.
// - The back office has a Jars tab to see every customer's jars and give or take one.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/order.js', R`  if ((await offline.deals(products)).state[p.id] === 'locked') return`, R`  if ((await offline.deals(products)).state[p.id] === 'locked' && !(await require('./_jars').hasPass(require('./_gate').emailOf(b.acct), p.id))) return`],
  // GET ?k=<key>&jars=1                    owner only: every customer's jars.
  // GET ?k=<key>&jar=<email>&by=1 or -1    owner only: gives or takes one jar.
  ['api/admin.js', R`  if (req.query && req.query.msgs) {`, R`  if (req.query && req.query.jar) {
    const who = String(req.query.jar).trim().toLowerCase(), by = Number(req.query.by) === -1 ? -1 : 1;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(who)) return res.status(400).json({ error: 'That email address is not valid.' });
    await require('./_jars').adjust(who, by);
    return res.json({ ok: true });
  }
  if (req.query && req.query.jars) return res.json({ need: require('./_jars').NEED, jars: await require('./_jars').all() });
  if (req.query && req.query.msgs) {`],
  ['inject.js', R`  if (f === 'admin.html' && s.indexOf('/admin-carts.js') < 0) s = before(s, f, '<script src="/admin-carts.js" defer></script>');`, R`  if (f === 'admin.html' && s.indexOf('/admin-carts.js') < 0) s = before(s, f, '<script src="/admin-carts.js" defer></script>');
  if (f === 'admin.html' && s.indexOf('/admin-jars.js') < 0) s = before(s, f, '<script src="/admin-jars.js" defer></script>');`],
  ['public/account.html', R`<button type="button" class="ghost" id="out">Sign out</button>`, R`<a class="solid" href="/jars.html" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center">My jars</a>
    <button type="button" class="ghost" id="out">Sign out</button>`],
  // The party piece is off the product list and cannot be ordered before the party opens.
  ['api/order.js', R`      const pty = require('./_party'), over = (await pty.state(0)).ended;`, R`      const pty = require('./_party'), over = (await pty.state(0)).ended || Date.now() < pty.PARTY.starts;`],
  ['api/order.js', R`  if (p.id === require('./_party').PARTY.pid && (await require('./_party').state(0)).ended) return`, R`  if (p.id === require('./_party').PARTY.pid && Date.now() < require('./_party').PARTY.starts) return res.status(400).json({ error: 'Party pricing opens ' + require('./_party').PARTY.startsText + '. Come back then.' });
  if (p.id === require('./_party').PARTY.pid && (await require('./_party').state(0)).ended) return`],
  // Orders can be sorted: newest, oldest, most expensive, cheapest.
  ['public/admin.html', R`      <button type="button" class="ghost" id="csv">Download as a spreadsheet</button>`, R`      <label id="sortBox" style="flex:0 1 220px">Sort orders<select id="sortBy"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="high">Most expensive first</option><option value="low">Cheapest first</option></select></label>
      <button type="button" class="ghost" id="csv">Download as a spreadsheet</button>`],
  ['public/admin.html', R`    var bo = $('bOrders'), bp = $('bPeople'); bo.textContent = ''; bp.textContent = '';
    orders.forEach(function (o) {`, R`    var bo = $('bOrders'), bp = $('bPeople'); bo.textContent = ''; bp.textContent = '';
    $('sortBox').hidden = tab !== 'orders';
    var sb = $('sortBy').value, amt = function (o) { return Number(String(o.total == null ? '' : o.total).replace(/[^0-9.]/g, '')) || 0; };
    orders.slice().sort(function (a, b) { return sb === 'old' ? a.at - b.at : sb === 'high' ? amt(b) - amt(a) || b.at - a.at : sb === 'low' ? amt(a) - amt(b) || b.at - a.at : b.at - a.at; }).forEach(function (o) {`],
  ['public/admin.html', R`  $('tPeople').addEventListener('click', function () { tab = 'people'; draw(); });`, R`  $('tPeople').addEventListener('click', function () { tab = 'people'; draw(); });
  $('sortBy').addEventListener('change', function () { draw(); });`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchjars: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
// The checkout page's product list (?co=1) also carries any locked safe this customer has opened with jars.
const f = 'api/order.js';
fs.writeFileSync(f, fs.readFileSync(f, 'utf8') + `
;(() => {
  const inner = module.exports;
  const w = async (req, res) => {
    if (req.method === 'GET' && req.query && req.query.co && req.query.t) {
      let extra = [];
      try {
        const email = require('./_gate').emailOf(req.query.t), mine = await require('./_jars').passes(email), ids = Object.keys(mine);
        if (ids.length) {
          const lib = require('./_lib'), off = require('./_offline');
          const inv = await lib.getInventory(), ship = await off.shipping(), nft = await off.nfts(), dl = await off.deals(inv);
          extra = inv.filter((p) => mine[p.id] && dl.state[p.id] === 'locked').map((p) => ({ id: p.id, name: p.name, price: (p.cents / 100).toFixed(2), min: p.min, stock: p.stock, ship: ((ship[p.id] || 0) / 100).toFixed(2), sections: [], deal: true, nft: !!nft[p.id], desc: '', shelf: false, photo: '' }));
        }
      } catch (e) { extra = []; }
      if (extra.length) {
        const send = res.json.bind(res);
        res.json = (body) => { try { if (body && Array.isArray(body.products)) extra.forEach((p) => { if (!body.products.some((x) => x.id === p.id)) body.products.push(p); }); } catch (e) { /* as it was */ } return send(body); };
      }
    }
    return inner(req, res);
  };
  Object.assign(w, inner);
  module.exports = w;
})();
`);
