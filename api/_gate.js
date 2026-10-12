// Buyers-only pieces. A product the owner has ticked "Buyers only" shows on the shop as a locked safe. Only someone
// signed in (the My orders sign-in) whose email already has a paid order can open it and order it.
const { verify } = require('./_lib');
const store = require('./_store');

// The signed-in email behind an account token, or ''.
function emailOf(token) {
  const t = verify(String(token || ''));
  return t && t.a === 1 && t.e && t.x > Math.floor(Date.now() / 1000) ? String(t.e).trim().toLowerCase() : '';
}
// Has this email got an order that is paid (or marked paid)? Remembered for a minute.
const memo = new Map();
async function isBuyer(email) {
  if (!email || !store.on()) return false;
  const m = memo.get(email);
  if (m && Date.now() - m.at < 60000) return m.v;
  let v = false;
  try {
    for (const s of await store.sales()) {
      const d = (await store.read(s.path)) || {};
      if (String(d.email || '').trim().toLowerCase() !== email) continue;
      if (!/payment due/i.test(d.status || '')) { v = true; break; }
      const meta = (await store.read('meta/' + s.n + '.json')) || {};
      if (meta.paidAt) { v = true; break; }
    }
  } catch (e) { console.error('GATE_FAIL', String(e && e.message || e)); }
  if (memo.size > 500) memo.clear();
  memo.set(email, { at: Date.now(), v: v });
  return v;
}
// Paid orders by email, for every customer at once: { email: count }. Cancelled orders are not in the ledger.
async function paidByEmail() {
  const out = {};
  if (!store.on()) return out;
  await Promise.all((await store.sales()).map(async (s) => {
    const d = (await store.read(s.path)) || {}, e = String(d.email || '').trim().toLowerCase();
    if (!e) return;
    let paid = !/payment due/i.test(d.status || '');
    if (!paid) paid = !!((await store.read('meta/' + s.n + '.json')) || {}).paidAt;
    out[e] = out[e] || { n: 0, name: d.buyer || '' };
    if (paid) out[e].n++;
  }));
  return out;
}
// Product ids the owner has marked buyers only.
async function gated() {
  const out = {};
  try { (await require('./_edits').apply(require('./_products'), { all: true })).forEach((p) => { if (p.buyers) out[p.id] = true; }); } catch (e) { /* none */ }
  return out;
}
// The owner's back-office key (the one admin.html keeps after signing in). It opens every buyers-only safe.
function isAdmin(k) {
  const t = verify(String(k || ''));
  return !!(t && t.adm === 1 && t.x > Math.floor(Date.now() / 1000));
}
// Who may bid: anyone signed in the usual ways, or with a bidder sign-in (email and password, made on the auction page).
function bidderOf(token) {
  const e = emailOf(token);
  if (e) return e;
  const t = verify(String(token || ''));
  return t && t.bd === 1 && t.e && t.x > Math.floor(Date.now() / 1000) ? String(t.e).trim().toLowerCase() : '';
}
module.exports = { emailOf, isBuyer, gated, paidByEmail, isAdmin, bidderOf };
