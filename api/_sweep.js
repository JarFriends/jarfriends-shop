// Emails the site sends on its own. There is no timer: the check runs when someone visits the shop, at most once
// every ten minutes, and only on the live site.
// 1. Someone typed their email on a checkout page three hours ago and has not ordered that piece: one reminder.
// 2. An accepted or countered offer runs out within three hours and is still unused: one "runs out soon" email.
const store = require('./_store');
const GAP = 10 * 60000, WAIT = 3 * 3600000, OLD = 48 * 3600000, SOON = 3 * 3600000, HOST = 'https://jarfriends.com';
let last = 0;
const first = (n) => (n ? 'Hi ' + String(n).split(' ')[0] + ',' : 'Hi,');
async function files(prefix) {
  const { list } = await import('@vercel/blob');
  const r = await list({ prefix: prefix, limit: 1000 });
  return (r.blobs || []).map((b) => b.pathname);
}

async function carts(now, mail) {
  const due = (await Promise.all((await files('carts/')).map(async (p) => { const c = await store.read(p); return c ? Object.assign(c, { path: p }) : null; })))
    .filter((c) => c && c.email && !c.sent && now - c.at >= WAIT && now - c.at < OLD).slice(0, 10);
  if (!due.length) return;
  const products = await require('./_edits').apply(require('./_products'), { all: true });
  const sold = await store.soldBy(), sales = await store.sales(), buyers = {};
  // Pieces held for an accepted offer are not available either.
  let held = {};
  try { held = await require('./_holds').byProduct(); } catch (e) { held = {}; }
  for (const c of due) {
    const p = products.filter((x) => x.id === c.pid)[0];
    const left = p && !p.hidden ? Number(p.stock) - (sold[c.pid] || 0) - (held[c.pid] || 0) : 0;
    if (left <= 0) continue;
    if (!buyers[c.pid]) buyers[c.pid] = (await Promise.all(sales.filter((s) => s.pid === c.pid).map((s) => store.read(s.path)))).map((d) => String((d && d.email) || '').trim().toLowerCase());
    if (buyers[c.pid].indexOf(c.email) >= 0) continue;
    const out = await mail(c.email, 'Still thinking about ' + c.product + '?', [first(c.name), '', 'You started checking out ' + c.product + ' at JarFriends but did not finish.', left === 1 ? 'There is only 1 left, so do not miss out.' : left <= 5 ? 'There are only ' + left + ' left, so do not miss out.' : 'Do not miss out.', '', 'If this is your first order, take 10% off with promo code JAR10 at checkout.', '', 'Finish your order here:', HOST + '/order.html?product=' + encodeURIComponent(c.pid), '', 'If you are no longer interested, ignore this email. We will not send another reminder.'], 'cart-' + c.path.slice(6, -5)).catch(() => 'failed');
    if (out === 'sent' || out === 'duplicate') { const path = c.path; delete c.path; await store.write(path, Object.assign(c, { sent: Date.now(), auto: true })); }
  }
}

async function offers(now, mail) {
  const holds = require('./_holds');
  const due = (await Promise.all((await files('offers/')).map(async (p) => { const o = await store.read(p); return o ? Object.assign(o, { path: p }) : null; })))
    .filter((o) => o && o.email && !o.warned && (o.status === 'accepted' || o.status === 'countered') && o.until > now && o.until - now <= SOON).slice(0, 10);
  for (const o of due) {
    if (!((await holds.mine(o.n)) > 0)) continue;
    const mins = Math.round((o.until - now) / 60000), hrs = Math.round(mins / 60);
    const out = await mail(o.email, 'Your offer on ' + o.item + ' runs out soon', [first(o.buyer), '', 'Your accepted offer on ' + o.item + ' runs out in ' + (mins < 50 ? 'less than an hour' : 'about ' + hrs + (hrs === 1 ? ' hour' : ' hours')) + '.', 'After that the piece goes back on sale at the listed price.', ''].concat(o.deal ? ['Check out at your offer price here:', HOST + '/order.html?offer=' + o.deal] : ['To check out at your offer price, use the link in the email we sent you when your offer was accepted.']), 'offer-soon-' + o.n).catch(() => 'failed');
    if (out === 'sent' || out === 'duplicate') { const path = o.path; delete o.path; await store.write(path, Object.assign(o, { warned: Date.now() })); }
  }
}

// 3. An order placed to be paid by hand (Zelle, Venmo, Cash App, cash) that is still unpaid: a payment reminder every
// four hours, at most two, until it is marked paid or cancelled.
const EVERY = 4 * 3600000, MOST = 2;
async function unpaid(now, mail) {
  const WAYS = require('./_offline').WAYS || {};
  const recent = (await store.sales()).filter((s) => !s.gone && now - s.at < 3 * 86400000 && now - s.at >= EVERY);
  for (const s of recent) {
    const d = (await store.read(s.path)) || {}, m = (await store.read('meta/' + s.n + '.json')) || {};
    const sent = m.reminders || 0;
    if (!d.email || !/payment due/i.test(d.status || '') || m.paidAt || m.cancelledAt || sent >= MOST) continue;
    if (now - (d.at || s.at) < EVERY || now - (m.remindedAt || 0) < EVERY) continue;
    const w = Object.keys(WAYS).filter((k) => WAYS[k].label === d.pay)[0];
    const to = w && WAYS[w].env ? (process.env[WAYS[w].env] || '').trim() : '';
    const out = await mail(d.email, 'Reminder: payment due for order ' + s.n, [first(d.buyer), '', 'Your order ' + s.n + ' (' + (d.product || 'your order') + ' x ' + s.q + ') is waiting for payment. We are holding it for you.', 'Total due: $' + String(d.total || '').replace(/^\$/, ''), 'Orders are cancelled if payment is not received within 24 hours of ordering.', to ? 'Send your ' + d.pay + ' payment to ' + to + '.' : 'Reply to this email and we will send payment details.', '', 'Already paid? Reply to this email and we will mark it paid.', 'Changed your mind? Reply and we will cancel the order.'], 'unpaid-' + s.n + '-' + (sent + 1)).catch(() => 'failed');
    if (out === 'sent' || out === 'duplicate') {
      const fresh = (await store.read('meta/' + s.n + '.json')) || {};
      await store.write('meta/' + s.n + '.json', Object.assign(fresh, { reminders: sent + 1, remindedAt: Date.now() }));
    }
  }
}

// 4. A new Deal of the day safe has unlocked (the one before it was claimed): everyone who has ordered or joined the mailing list gets
// one email about it, with a picture of the vault. Twelve go out per check, so a long list takes a few checks.
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hashOf = (e) => require('crypto').createHash('sha1').update(String(e).toLowerCase()).digest('hex').slice(0, 20);
async function safes(now, mail) {
  const lib = require('./_lib'), dl = await require('./_offline').deals(await lib.getInventory());
  const open = ((dl.slots || []).filter((x) => x.state === 'open')[0] || {}).n || 0;
  // One time, asked for by the owner on October 11, 2026: safe 3 was already open when these emails were added,
  // so its email goes out now, once.
  if (open === 3 && !(await store.read('sweep/blast3-go.json'))) {
    await store.write('sweep/blast3-go.json', { at: now });
    await store.write('sweep/safe.json', { open: 3, pending: 3, at: now });
  }
  const was = await store.read('sweep/safe.json');
  // The first time this runs it only notes which safe is open. Nothing is sent for a safe that was already open.
  if (!was) { await store.write('sweep/safe.json', { open: open, pending: 0 }); return; }
  let st = was;
  if (open && open > (was.open || 0)) { st = { open: open, pending: open, at: now }; await store.write('sweep/safe.json', st); }
  if (!st.pending) return;
  const n = st.pending, total = (dl.slots || []).length || 5, left = total - n;
  const sales = await store.sales(), who = {}, owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  // The owner gets it first, to see what went out.
  if (owner) who[owner] = '';
  (await Promise.all(sales.map((x) => store.read(x.path)))).forEach((d) => { const e = String((d && d.email) || '').trim().toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && !(e in who)) who[e] = d.buyer || ''; });
  // And everyone who joined the mailing list (help.html?join=1).
  (await Promise.all((await files('list/')).map((p) => store.read(p)))).forEach((d) => { const e = String((d && d.email) || '').trim().toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && !(e in who)) who[e] = d.name || ''; });
  const log = (await store.read('sweep/blast-' + n + '.json')) || { done: {} };
  const todo = Object.keys(who).filter((e) => !log.done[hashOf(e)]);
  if (!todo.length) { await store.write('sweep/safe.json', { open: st.open, pending: 0 }); return; }
  const addr = (process.env.RETURN_ADDRESS || '').replace(/\s*\n\s*/g, ', ').trim();
  const subject = n >= total ? 'The Vault is open at JarFriends' : 'Safe ' + n + ' just unlocked at JarFriends';
  for (const e of todo.slice(0, 12)) {
    if (await store.read('unsub/' + hashOf(e) + '.json')) { log.done[hashOf(e)] = 1; continue; }
    const stop = HOST + '/api/unsub?t=' + lib.sign({ un: 1, e: e });
    const l1 = n >= total ? 'Every safe before it has been claimed, so The Vault is open right now.' : 'Safe ' + (n - 1) + ' was just claimed, so safe ' + n + ' is unlocked.';
    const l2 = n >= total ? 'This is the last and biggest one. Have you seen what is inside?' : 'Have you checked what is inside the new safe?';
    const l3 = n >= total ? '' : 'We are getting closer to The Vault: ' + (left === 1 ? 'it is the very next safe to open.' : left + ' more safes to go before it opens.');
    const lines = [first(who[e]), '', l1, l2].concat(l3 ? ['', l3] : [], ['', 'See it here:', HOST + '/#deal', '', 'You are getting this because you ordered from JarFriends or subscribed.' + (addr ? ' JarFriends, ' + addr + '.' : ''), 'Unsubscribe: ' + stop]);
    const html = '<div style="background:#0B1712;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#E6EFE9"><div style="max-width:520px;margin:0 auto">' +
      '<div style="font-size:13px;letter-spacing:2px;color:#C9A45C">DEAL OF THE DAY</div>' +
      '<h1 style="font-size:26px;margin:8px 0 14px;color:#8FD3AE">' + esc(subject.replace(' at JarFriends', '')) + '</h1>' +
      '<p style="font-size:16px;line-height:1.5;margin:0 0 10px">' + esc(first(who[e])) + '</p>' +
      '<p style="font-size:16px;line-height:1.5;margin:0 0 10px">' + esc(l1) + ' <b>' + esc(l2) + '</b></p>' +
      '<p style="margin:18px 0"><a href="' + HOST + '/#deal" style="background:#C9A45C;color:#0B1712;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:24px;display:inline-block">' + (n >= total ? 'Open The Vault' : 'See what is in safe ' + n) + '</a></p>' +
      (l3 ? '<p style="font-size:16px;line-height:1.5;margin:0 0 12px">' + esc(l3) + '</p>' : '') +
      '<a href="' + HOST + '/#deal"><img src="' + HOST + '/photos/vault.jpg" alt="The Vault" width="360" style="max-width:100%;height:auto;border:0;border-radius:10px;display:block"></a>' +
      '<p style="font-size:12px;line-height:1.5;color:#8FA89A;margin:22px 0 0">You are getting this because you ordered from JarFriends or subscribed.' + (addr ? ' JarFriends, ' + esc(addr) + '.' : '') + ' <a href="' + stop + '" style="color:#8FA89A">Unsubscribe</a></p></div></div>';
    const out = await mail(e, subject, lines, 'safe-' + n + '-' + hashOf(e), html).catch(() => 'failed');
    if (out === 'sent' || out === 'duplicate') log.done[hashOf(e)] = 1;
    await new Promise((r) => setTimeout(r, 550));
  }
  await store.write('sweep/blast-' + n + '.json', log);
}

// One-time changes the owner asked for. Each is done once, then never again, so later edits in the back office stand.
const ONCE = [
  ['lava5', 'LAVAJACK', { stock: 5 }],
  ['koala125', 'DEAL2', { price: 125, shipping: 'free' }],
  // The first-order promo code named in the checkout reminder email: 10% off shop and Deal of the day pieces.
  ['jar10', 'promo:JAR10', { on: true, pct: 10, for: ['shop', 'deal'] }]
];
let once = false;
async function oneOff() {
  if (once) return;
  once = true;
  for (const o of ONCE) {
    if (await store.read('sweep/' + o[0] + '.json')) continue;
    if (o[1].indexOf('promo:') === 0) await require('./_offline').savePromo(o[1].slice(6), o[2]);
    else await require('./_edits').save(o[1], o[2]);
    await store.write('sweep/' + o[0] + '.json', { at: Date.now() });
  }
}

async function run() {
  const now = Date.now();
  if (process.env.VERCEL_ENV === 'production' && store.on()) await oneOff().catch((e) => { once = false; console.error('ONEOFF_FAIL', String(e && e.message || e)); });
  if (process.env.VERCEL_ENV !== 'production' || !store.on() || now - last < GAP) return;
  last = now;
  const was = (await store.read('sweep/last.json')) || {};
  if (now - (was.at || 0) < GAP) return;
  await store.write('sweep/last.json', { at: now });
  const mail = require('./_lib').mail;
  await carts(now, mail).catch((e) => console.error('SWEEP_CARTS_FAIL', String(e && e.message || e)));
  await offers(now, mail).catch((e) => console.error('SWEEP_OFFERS_FAIL', String(e && e.message || e)));
  await unpaid(now, mail).catch((e) => console.error('SWEEP_UNPAID_FAIL', String(e && e.message || e)));
  await safes(now, mail).catch((e) => console.error('SWEEP_SAFES_FAIL', String(e && e.message || e)));
}
module.exports = { run };
