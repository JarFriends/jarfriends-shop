// Auctions. A product with an "auction" setting ({ start: dollars, ends: ISO time }) is sold to the highest bidder.
// Bids are files under auction/<id>/bids/, one per bid, so two bids at once never overwrite each other.
// auction/<id>/state.json holds a later end time (a bid in the last 2 minutes adds 2 minutes) and what happened
// after it ended (who was offered the piece, and when).
const store = require('./_store');
const EXTEND = 2 * 60000;
// How much the next bid must add: 25 cents under $5, 50 cents under $25, $1 under $100, then $2.50.
const inc = (c) => (c < 500 ? 25 : c < 2500 ? 50 : c < 10000 ? 100 : 250);
async function list() {
  return (await require('./_edits').apply(require('./_products'), { all: true })).filter((p) => p.auction && !p.hidden);
}
async function files(prefix) {
  const { list: ls } = await import('@vercel/blob');
  const r = await ls({ prefix: prefix, limit: 1000 });
  return (r.blobs || []).map((b) => b.pathname);
}
async function bids(id) {
  const all = (await Promise.all((await files('auction/' + id + '/bids/')).map((p) => store.read(p)))).filter((b) => b && b.e && b.amt > 0);
  return all.sort((a, b) => b.amt - a.amt || a.at - b.at);
}
async function state(p) {
  const st = (await store.read('auction/' + p.id + '/state.json')) || {};
  const all = await bids(p.id);
  const start = Math.round(Number(p.auction.start) * 100);
  const ends = Math.max(Date.parse(p.auction.ends) || 0, st.ends || 0);
  const top = all[0] || null;
  return { id: p.id, start: start, current: top ? top.amt : start, count: all.length, next: top ? top.amt + inc(top.amt) : start, ends: ends, ended: Date.now() >= ends, top: top, list: all, st: st };
}
const mask = (e) => String(e || '').split('@')[0].slice(0, 2) + '•••';
const usd = (c) => (c / 100).toFixed(2);
// What anyone may see: amounts and masked bidders, never emails.
function pub(s) {
  return { start: usd(s.start), current: usd(s.current), bids: s.count, next: usd(s.next), ends: s.ends, ended: s.ended,
    bidders: new Set(s.list.map((b) => b.e)).size, leader: s.top ? mask(s.top.e) : '',
    history: s.list.slice(0, 25).map((b) => ({ who: mask(b.e), amount: usd(b.amt), at: b.at })) };
}
module.exports = { list, state, pub, mask, inc, bids, EXTEND, usd };
