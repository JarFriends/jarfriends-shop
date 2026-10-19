// Build step: every offer is kept, with where it stands, so the back office can list them and answer them.
// Runs after patchcounter.js, patch24.js and patchmsgs.js (it builds on their text).
// Each change is [file, text to find, text to put in its place]; the text to find must be there exactly once.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/offer.js', R`const holds = require('./_holds');`, R`const holds = require('./_holds');
// One file per offer: offers/<offer no>.json. status is pending, accepted, countered, declined or auto (declined
// on the spot for being under the owner's minimum). t is the owner's own review key for that offer.
async function saveOffer(o, tok, status, extra) {
  try {
    const store = require('./_store');
    if (!store.on()) return;
    const was = (await store.read('offers/' + o.n + '.json')) || {};
    await store.write('offers/' + o.n + '.json', Object.assign({ at: o.t * 1000 }, was, { n: o.n, pid: o.pid, item: o.i, q: o.q, offer: o.c, list: o.l, buyer: o.b, email: o.e, pay: o.w || '', t: tok, status: status, statusAt: Date.now(), hist: (was.hist || []).concat([{ s: status, at: Date.now(), c: (extra && extra.counter) || 0 }]) }, extra || {}));
  } catch (e) { console.error('OFFER_SAVE_FAIL', o.n, String(e && e.message || e)); }
}`],
  ['api/offer.js', R`      const deal = sign({ oa: 1, n: o.n, pid: o.pid, q: o.q, c: o.c, x: until });`, R`      const deal = sign({ oa: 1, n: o.n, pid: o.pid, q: o.q, c: o.c, x: until });
      await saveOffer(o, b.t, 'accepted', { until: until * 1000, counter: 0 });`],
  ['api/offer.js', R`      const deal = sign({ oa: 1, n: o.n, pid: o.pid, q: o.q, c: cents, x: until });`, R`      const deal = sign({ oa: 1, n: o.n, pid: o.pid, q: o.q, c: cents, x: until });
      await saveOffer(o, b.t, 'countered', { until: until * 1000, counter: cents });`],
  ['api/offer.js', R`    if (b.do === 'decline') {`, R`    if (b.do === 'decline') {
      await saveOffer(o, b.t, 'declined', { until: 0 });`],
  ['api/offer.js', R`    await log(o, 'Declined automatically (below your minimum)');`, R`    await log(o, 'Declined automatically (below your minimum)');
    await saveOffer(o, sign(o), 'auto');`],
  ['api/offer.js', R`  const review = host + '/offer.html?t=' + sign(o);`, R`  const tok = sign(o);
  await saveOffer(o, tok, 'pending');
  const review = host + '/offer.html?t=' + tok;`],
  // GET ?k=<key>&offers=1  owner only: the newest 300 offers.
  ['api/admin.js', R`  if (req.query && req.query.msgs) {`, R`  if (req.query && req.query.offers) {
    const { list } = await import('@vercel/blob');
    const r = await list({ prefix: 'offers/', limit: 1000 });
    const paths = (r.blobs || []).map((b) => b.pathname).sort().reverse().slice(0, 300);
    return res.json({ offers: (await Promise.all(paths.map((p) => store.read(p)))).filter(Boolean) });
  }
  if (req.query && req.query.msgs) {`],
  ['inject.js', R`s = before(s, f, '<script src="/admin-messages.js" defer></script>');`, R`s = before(s, f, '<script src="/admin-messages.js" defer></script>');
  if (f === 'admin.html' && s.indexOf('/admin-offers.js') < 0) s = before(s, f, '<script src="/admin-offers.js" defer></script>');`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchoffers: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
