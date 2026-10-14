// Build step: card and crypto checkouts that are started but not paid yet.
// They used to ping Discord as an ORDER but only reached the back office once paid. Now:
//  - each one is kept (pending/<invoice>.json) and listed in Needs to be shipped under "Checkout started, not paid yet",
//    with a Check for payment button for crypto (it records the order if the coins arrived);
//  - the Discord ping says it is not paid yet, and a second PAID ping goes out when the payment is confirmed.
// Runs after patchpay.js.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/order.js', R`  const out = await Promise.all([(card ? sendLinkEmail(r.inv, link) : offline.sendPayLinkEmail(r.inv, link)), offline.notifyOwner(r.inv, label, card ? 'card, waiting for payment' : 'crypto, waiting for payment')]);`,
    R`  try { await require('./_store').write('pending/' + r.inv.n + '.json', { n: r.inv.n, t: r.token, at: Date.now(), how: card ? 'card' : 'crypto', coins: Object.keys(r.inv.k || {}), product: r.inv.i || '', pid: r.inv.pid || '', q: r.inv.q, buyer: r.inv.b || '', email: r.inv.e || '', total: (r.inv.T / 100).toFixed(2), ship: offline.shipLine(r.inv) || '' }); } catch (e) { console.error('PENDING_SAVE_FAIL', String(e && e.message || e)); }
  const out = await Promise.all([(card ? sendLinkEmail(r.inv, link) : offline.sendPayLinkEmail(r.inv, link)), offline.notifyOwner(r.inv, label, card ? 'card checkout started, NOT PAID YET' : 'crypto checkout started, NOT PAID YET')]);`],
  ['api/_offline.js', R`  console.log('ORDER', JSON.stringify({ invoice: inv.n, sheet: out }));`,
    R`  console.log('ORDER', JSON.stringify({ invoice: inv.n, sheet: out }));
  if (out === 'ok' && o.paid) { try { await require('./_discord')('**PAID** ' + money(inv.T) + ' · ' + (inv.i || '-') + (inv.q ? ' x ' + inv.q : '') + '\n' + inv.b + ' · ' + payWith(inv) + ' · order ' + inv.n + ' · it is in Needs to be shipped'); } catch (e) { /* the ping is extra */ } }`],
  ['api/admin.js', R`  orders.sort((a, b) => b.at - a.at);`, R`  orders.sort((a, b) => b.at - a.at);
  // Card and crypto checkouts from the last 14 days that have no order yet: started, not paid.
  let pending = [];
  try {
    const { list } = await import('@vercel/blob'), have = {};
    sales.concat(gone).forEach((s) => { have[s.n] = 1; });
    const pr = await list({ prefix: 'pending/', limit: 1000 });
    pending = (await Promise.all((pr.blobs || []).filter((b) => !have[b.pathname.slice(8, -5)] && Date.now() - new Date(b.uploadedAt).getTime() < 14 * 86400000).map((b) => store.read(b.pathname)))).filter(Boolean).sort((a, b) => b.at - a.at);
  } catch (e) { console.error('PENDING_LIST_FAIL', String(e && e.message || e)); }`],
  ['api/admin.js', R`res.json({ holds:`, R`res.json({ pending: pending, holds:`],
  // Orders tab: a crypto payment's proof link reads View payment on blockchain.
  ['public/admin.html', R`      [['Payment proof', /^https:\/\//.test(o.proof || '') ? o.proof : '']].forEach(function (x) {
        if (!/^https:\/\//.test(x[1] || '')) return;
        var a = el('a', x[0]);`, R`      [[/scan\.|mempool\.space|blockscout|explorer/i.test(o.proof || '') ? 'View payment on blockchain' : 'Payment proof', /^https:\/\//.test(o.proof || '') ? o.proof : '']].forEach(function (x) {
        if (!/^https:\/\//.test(x[1] || '')) return;
        var a = el('a', x[0]); if (/blockchain/.test(x[0])) a.style.fontWeight = '700';`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchpending: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
