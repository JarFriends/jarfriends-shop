// Buzz: how many other shoppers want a piece right now, shown softly on cards and piece pages ("In 2 carts",
// "1 offer out") so buyers see they are not alone and buy at full price.
//   Carts: cartbuzz/<pid>/<device>.json, one small file per shopper device while the piece sits in their cart.
//          Counted for 3 days after it was put in; removed when they take it out or check out.
//   Offers: offers/*.json still open (not declined, withdrawn, expired or paid), made in the last 7 days.
// Nothing about who is shown: only counts.
const store = require('./_store');

const CART_DAYS = 3, OFFER_DAYS = 7;
const OK_DEV = /^[a-z0-9]{12,32}$/;
const OK_PID = /^[A-Za-z0-9_-]{2,40}$/;
const CLOSED = /declin|withdraw|expir|paid|bought|buy|done|cancel|reject/i;

async function list(prefix) {
  const { list: ls } = await import('@vercel/blob');
  const out = []; let cursor;
  do { const r = await ls({ prefix: prefix, cursor: cursor, limit: 1000 }); (r.blobs || []).forEach((b) => out.push(b)); cursor = r.hasMore ? r.cursor : null; } while (cursor);
  return out;
}
let memo = null;
async function counts() {
  if (memo && Date.now() - memo.at < 90000) return memo.v;
  const v = {}, now = Date.now();
  const bump = (pid, k) => { const x = v[pid] = v[pid] || { carts: 0, offers: 0 }; x[k]++; };
  if (store.on()) {
    try {
      (await list('cartbuzz/')).forEach((b) => {
        const m = /^cartbuzz\/([A-Za-z0-9_-]+)\/[a-z0-9]+\.json$/.exec(b.pathname);
        if (m && now - new Date(b.uploadedAt).getTime() < CART_DAYS * 864e5) bump(m[1], 'carts');
      });
    } catch (e) { console.error('BUZZ_CARTS_FAIL', String(e && e.message || e)); }
    try {
      const fresh = (await list('offers/')).filter((b) => now - new Date(b.uploadedAt).getTime() < OFFER_DAYS * 864e5);
      const rows = await Promise.all(fresh.map((b) => store.read(b.pathname).catch(() => null)));
      rows.forEach((o) => { if (o && o.pid && !CLOSED.test(String(o.status || '')) && !(o.until && o.until < now && o.status !== 'sent')) bump(o.pid, 'offers'); });
    } catch (e) { console.error('BUZZ_OFFERS_FAIL', String(e && e.message || e)); }
  }
  memo = { at: Date.now(), v: v };
  return v;
}
// A shopper's device put a piece in its cart (on) or took it out (off).
async function ping(pid, dev, on) {
  pid = String(pid || ''); dev = String(dev || '');
  if (!OK_PID.test(pid) || !OK_DEV.test(dev) || !store.on()) return { ok: false };
  const path = 'cartbuzz/' + pid + '/' + dev + '.json';
  if (on) await store.write(path, { at: Date.now() });
  else { try { const { del } = await import('@vercel/blob'); const b = (await list('cartbuzz/' + pid + '/' + dev)).map((x) => x.url); if (b.length) await del(b); } catch (e) { /* already gone */ } }
  if (memo && memo.v) { const x = memo.v[pid] = memo.v[pid] || { carts: 0, offers: 0 }; x.carts = Math.max(0, x.carts + (on ? 1 : -1)); }
  return { ok: true };
}
module.exports = { counts, ping };
