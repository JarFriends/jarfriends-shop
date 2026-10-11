// Jars: a customer earns one jar for every paid order. The owner can add or take away jars in the back office.
// Ten jars open one locked Deal of the day safe early, for that customer only (they still pay for the piece).
// Every change is its own small file, jars/<email hash>/<time>.json, so nothing is ever overwritten:
//   { email, adj: +1 or -1 }            the owner gave or took a jar
//   { email, spent: 10, pass: <pid> }   ten jars used to open that piece's safe
const crypto = require('crypto');
const store = require('./_store');
const gate = require('./_gate');
const NEED = 10;
const hashOf = (e) => crypto.createHash('sha1').update(String(e).toLowerCase()).digest('hex').slice(0, 20);

async function events(prefix) {
  const { list } = await import('@vercel/blob');
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix: prefix, cursor: cursor, limit: 1000 });
    (r.blobs || []).forEach((b) => out.push(b.pathname));
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  return (await Promise.all(out.sort().map((p) => store.read(p)))).filter(Boolean);
}
const fold = (evs) => evs.reduce((m, e) => { m.adj += Number(e.adj) || 0; m.spent += Number(e.spent) || 0; if (e.pass) m.passes[e.pass] = 1; return m; }, { adj: 0, spent: 0, passes: {} });
const total = (earned, f) => Math.max(0, earned + f.adj - f.spent);

async function summary(email) {
  const f = fold(await events('jars/' + hashOf(email) + '/')), earned = ((await gate.paidByEmail())[email] || { n: 0 }).n;
  return { email: email, earned: earned, adj: f.adj, spent: f.spent, jars: total(earned, f), passes: f.passes, need: NEED };
}
async function write(email, ev) { await store.write('jars/' + hashOf(email) + '/' + Date.now() + '.json', Object.assign({ email: email, at: Date.now() }, ev)); }
const adjust = (email, by) => write(email, { adj: by });
async function redeem(email, pid) {
  const s = await summary(email);
  if (s.passes[pid]) return { ok: true, already: true };
  if (s.jars < NEED) return { error: 'You need ' + NEED + ' jars to open a locked safe. You have ' + s.jars + '.' };
  await write(email, { spent: NEED, pass: pid });
  return { ok: true };
}
async function passes(email) { return email && store.on() ? fold(await events('jars/' + hashOf(email) + '/')).passes : {}; }
async function hasPass(email, pid) { try { return !!(await passes(email))[pid]; } catch (e) { return false; } }
// Every customer with their jars, for the back office.
async function all() {
  const paid = await gate.paidByEmail(), by = {};
  (await events('jars/')).forEach((e) => { if (e.email) (by[e.email] = by[e.email] || []).push(e); });
  const emails = Object.keys(paid).concat(Object.keys(by).filter((e) => !paid[e]));
  return emails.map((e) => { const f = fold(by[e] || []), earned = (paid[e] || { n: 0 }).n; return { email: e, name: (paid[e] || {}).name || '', earned: earned, adj: f.adj, spent: f.spent, jars: total(earned, f), opened: Object.keys(f.passes).length }; }).sort((a, b) => b.jars - a.jars || a.email.localeCompare(b.email));
}
// The locked Deal of the day safes, in order: [{ n, pid }].
async function lockedSafes() {
  const lib = require('./_lib'), dl = await require('./_offline').deals(await lib.getInventory());
  const order = (await require('./_edits').apply(require('./_products'))).filter((p) => Number(p.deal) > 0).sort((a, b) => Number(a.deal) - Number(b.deal));
  return (dl.slots || []).map((s, i) => ({ n: s.n, state: s.state, pid: order[i] ? order[i].id : '', name: order[i] ? order[i].name : '' })).filter((s) => s.pid && dl.state[s.pid] === s.state);
}
module.exports = { NEED, summary, adjust, redeem, passes, hasPass, all, lockedSafes };
