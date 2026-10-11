// Holds: units set aside for a buyer whose offer the owner accepted, until their checkout link runs out.
// One small file per hold in the site's storage: hold/<product>/<offer no>~<units>~<runs out, in seconds>.json.
// The file name carries everything, so holds are counted from a listing. A hold past its time counts for nothing.
const store = require('./_store');
const blob = () => import('@vercel/blob');
let memo = null;
async function all() {
  if (!store.on()) return [];
  if (memo && Date.now() - memo.at < 8000) return memo.v;
  const { list } = await blob();
  const v = [];
  let cursor;
  do {
    const r = await list({ prefix: 'hold/', cursor: cursor, limit: 1000 });
    (r.blobs || []).forEach((b) => {
      const m = /^hold\/([A-Za-z0-9_-]+)\/([A-Z0-9]+)~(\d+)~(\d+)\.json$/.exec(b.pathname);
      if (m) v.push({ pid: m[1], n: m[2], q: Number(m[3]), x: Number(m[4]), path: b.pathname });
    });
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  memo = { at: Date.now(), v: v };
  return v;
}
const live = async () => (await all()).filter((h) => h.x > Date.now() / 1000);
// Units held right now, by product id.
async function byProduct() {
  const out = {};
  (await live()).forEach((h) => { out[h.pid] = (out[h.pid] || 0) + h.q; });
  return out;
}
// Units held right now for one accepted offer.
async function mine(n) {
  return (await live()).filter((h) => h.n === n).reduce((s, h) => s + h.q, 0);
}
// Let go of an offer's hold: the buyer ordered, or the offer is being accepted afresh.
async function release(n) {
  memo = null;
  const hs = (await all()).filter((h) => h.n === n);
  if (hs.length) { const { del } = await blob(); await del(hs.map((h) => h.path)); }
  memo = null;
}
async function add(pid, n, q, until) {
  await release(n);
  await store.write('hold/' + pid + '/' + n + '~' + q + '~' + until + '.json', { pid: pid, n: n, q: q, x: until });
  memo = null;
}
module.exports = { byProduct, mine, release, add };
