// Build step: Discord says which crypto the buyer picked.
//  - CRYPTO CHOSEN: the first time the buyer picks a coin on the pay page (amount and network).
//  - PAYMENT SEEN: once, when their payment shows up on the blockchain (still confirming).
//  - PAID: names the coin.
// Runs after patchpaid.js.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/status.js', R`  if (!coins[coin]) return res.json({ invoice: invoice, now: now });`, R`  if (!coins[coin]) return res.json({ invoice: invoice, now: now });
  const coinName = coins[coin].amount + ' ' + coins[coin].symbol + ' (' + (coins[coin].network || coins[coin].label) + ')';
  // Once per order: tell the owner which coin was picked. Remembered here and in storage so polling does not repeat it.
  const once = async (kind, text) => {
    const k = kind + '|' + inv.n; global.__coinTold = global.__coinTold || new Set();
    if (global.__coinTold.has(k)) return; global.__coinTold.add(k);
    try {
      const store = require('./_store'), path = 'cointold/' + inv.n + '-' + kind + '.json';
      if (await store.read(path)) return;
      await store.write(path, { at: Date.now(), coin: coin });
      await require('./_discord')(text);
    } catch (e) { /* the ping is extra */ }
  };
  if (inv.pid) await once('chose', '**CRYPTO CHOSEN** ' + coinName + ' · ' + (inv.i || '-') + (inv.q ? ' x ' + inv.q : '') + '\n' + (inv.b || '') + ' · order ' + inv.n + ' · not paid yet');`],
  ['api/status.js', R`  if (status === 'confirmed' && inv.pid) await offline.record(inv, 'Paid in full', { paid: true, proof: found.explorer,`, R`  if (status === 'detected' && inv.pid) await once('seen', '**PAYMENT SEEN** ' + coinName + ' · order ' + inv.n + ' · ' + (inv.b || '') + '\nOn the blockchain, waiting for confirmations' + (found && found.explorer ? ': ' + found.explorer : '.'));
  if (status === 'confirmed' && inv.pid) await offline.record(inv, 'Paid in full', { coin: coinName, paid: true, proof: found.explorer,`],
  ['api/_offline.js', R`' · ' + payWith(inv) + ' · order ' + inv.n + ' · it is in Needs to be shipped'`, R`' · ' + (o.coin ? 'Crypto: ' + o.coin : payWith(inv)) + ' · order ' + inv.n + ' · it is in Needs to be shipped' + (o.proof && /^https:/.test(o.proof) ? '\n' + o.proof : '')`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchcoin: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
