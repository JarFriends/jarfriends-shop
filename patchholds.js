// Build step: the back office shows the pieces set aside for offers, so sold + held adds up to what is gone.
// Runs after patchoffers.js. Each change is [file, text to find, text to put in its place], found exactly once.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/_holds.js', 'module.exports = { byProduct, mine, release, add };', 'module.exports = { byProduct, mine, release, add, live };'],
  ['api/admin.js', R`res.json({ orders: orders, products: await shelf(sales),`, R`res.json({ holds: (await require('./_holds').live().catch(() => [])).map((h) => ({ pid: h.pid, n: h.n, q: h.q, until: h.x * 1000 })), orders: orders, products: await shelf(sales),`],
  ['public/admin-offers.js', R`waiting(a[0].offers || [], a[1].orders || []); }, function () { box.textContent`, R`waiting(a[0].offers || [], a[1].orders || [], a[1]); }, function () { box.textContent`],
  ['public/admin-offers.js', R`if (!a[0].error) waiting(a[0].offers || [], a[1].orders || []); }`, R`if (!a[0].error) waiting(a[0].offers || [], a[1].orders || [], a[1]); }`],
  ['public/admin-offers.js', R`  function waiting(offers, orders) {`, R`  function waiting(offers, orders, all) {`],
  ['public/admin-offers.js', R`    if (!list.length) { wait.hidden = true; return; }
    wait.appendChild(el('b', `, R`    // Pieces set aside for offers, by product: sold + held = spoken for.
    var holds = (all && all.holds) || [], names = {}, held = {}, known = {};
    ((all && all.products) || []).forEach(function (p) { names[p.id] = p; });
    holds.forEach(function (h) { held[h.pid] = (held[h.pid] || 0) + h.q; });
    offers.forEach(function (o) { known[o.n] = o; });
    if (!list.length && !holds.length) { wait.hidden = true; return; }
    Object.keys(held).forEach(function (pid) {
      var p = names[pid] || { name: pid, sold: 0, start: 0 }, c = el('div', null, 'card small');
      c.appendChild(el('b', p.name + ': ' + p.sold + ' sold + ' + held[pid] + ' held for offers = ' + (p.sold + held[pid]) + (p.start ? ' of ' + p.start : '') + ' spoken for'));
      wait.appendChild(c);
    });
    if (list.length) wait.appendChild(el('b', `],
  ['public/admin-offers.js', R`    wait.hidden = !!$('wOrders').hidden;
  }`, R`    // Held pieces with no accepted offer listed above: an offer still waiting on your answer, or one accepted before offers were kept here.
    holds.filter(function (h) { var o = known[h.n]; return !o || o.status === 'pending'; }).forEach(function (h) {
      var o = known[h.n], c = el('div', null, 'card small'); c.style.cssText = 'border-left:4px solid #4E7A63';
      c.appendChild(el('b', h.q + ' x ' + ((names[h.pid] || {}).name || h.pid) + (o ? ', held while you decide on an offer' : ', held for an offer you accepted earlier')));
      c.appendChild(el('div', (o ? o.buyer + ' offered ' + usd(o.offer) + ' each. Answer it in the Offers tab. ' : 'Offer ' + h.n + '. It was accepted before offers were listed here, so the buyer is not shown. ') + 'The hold runs out ' + when(h.until) + '.'));
      wait.appendChild(c);
    });
    wait.hidden = !!$('wOrders').hidden;
  }`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchholds: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
