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
  // Crypto checks: if the first blockchain data source fails or is busy, try the next one (and log why).
  ['api/_lib.js', R`  const j = await getJSON((c.api || 'https://eth.blockscout.com/api') + '?module=account&' + q + '&address=' + addr + '&sort=desc&page=1&offset=50');
  const list = Array.isArray(j.result) ? j.result : [];
  if (!Array.isArray(j.result) && j.status !== '0') throw new Error('Unexpected reply from Ethereum data source');`, R`  const srcs = [c.api || 'https://eth.blockscout.com/api', 'https://api.routescan.io/v2/network/mainnet/evm/' + (c.chain === 'base' ? '8453' : '1') + '/etherscan/api'];
  let list = null;
  for (const base of srcs) {
    let why = '';
    try {
      const j = await getJSON(base + '?module=account&' + q + '&address=' + addr + '&sort=desc&page=1&offset=50');
      if (Array.isArray(j.result)) { list = j.result; break; }
      if (/no transactions/i.test(String(j.message || ''))) { list = []; break; }
      why = 'reply "' + String(j.message || j.result || '').slice(0, 80) + '"';
    } catch (e) { why = String(e && e.message || e); }
    console.error('CHAIN_SOURCE_FAIL', new URL(base).host, why);
  }
  if (!list) throw new Error('Unexpected reply from Ethereum data source');`],
  // Back office: mark a started crypto or card checkout as paid by hand (when you can see the money arrived).
  ['api/admin.js', R`  if (req.query && req.query.carts) {`, R`  if (req.query && req.query.paidpending) {
    const n = String(req.query.paidpending).replace(/[^A-Za-z0-9-]/g, ''), pe = await store.read('pending/' + n + '.json');
    if (!pe) return res.status(404).json({ error: 'That checkout was not found.' });
    const inv = require('./_lib').verify(pe.t);
    if (!inv) return res.status(400).json({ error: 'That checkout could not be read.' });
    const proof = /^https:\/\/[^\s"<>]+$/.test(String(req.query.proof || '')) ? String(req.query.proof) : '';
    const off = require('./_offline'), out = await off.record(inv, 'Paid in full (marked paid by you)', { paid: true, proof: proof, label: off.labelLink('https://' + req.headers.host, pe.t, inv) });
    console.log('PENDING_MARKED_PAID', n, out);
    return out === 'ok' || out === 'duplicate' ? res.json({ ok: true }) : res.status(503).json({ error: 'Could not save that just now. Try again.' });
  }
  if (req.query && req.query.carts) {`],
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
