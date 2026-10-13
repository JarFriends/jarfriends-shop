// Emails the site sends on its own. There is no timer: the check runs when someone visits the shop, at most once
// every ten minutes, and only on the live site.
// 1. Someone typed their email on a checkout page three hours ago and has not ordered that piece: one reminder.
// 2. An accepted or countered offer runs out within an hour and is still unused: one "runs out soon" email.
const store = require('./_store');
const GAP = 10 * 60000, WAIT = 3 * 3600000, OLD = 48 * 3600000, SOON = 3600000, HOST = 'https://jarfriends.com';
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
// Has this address unsubscribed? Subscribing again (help.html?join=1) undoes it. The shop owner always gets these.
async function gone(e) {
  if (String(e).toLowerCase() === (process.env.OWNER_EMAIL || '').trim().toLowerCase()) return false;
  const r = await store.read('unsub/' + hashOf(e) + '.json');
  return !!(r && r.at && !(r.back > r.at));
}
async function safes(now, mail) {
  const lib = require('./_lib'), dl = await require('./_offline').deals(await lib.getInventory());
  const openSlot = (dl.slots || []).filter((x) => x.state === 'open')[0] || {}, open = openSlot.n || 0, openId = openSlot.id || '';
  // One time, asked for by the owner on October 11, 2026: safe 3 was already open when these emails were added,
  // so its email goes out now, once.
  if (open === 3 && !(await store.read('sweep/blast3-go.json'))) {
    await store.write('sweep/blast3-go.json', { at: now });
    await store.write('sweep/safe.json', { open: 3, pending: 3, at: now });
  }
  const was = await store.read('sweep/safe.json');
  // The first time this runs it only notes which safe is open. Nothing is sent for a safe that was already open.
  if (!was) { await store.write('sweep/safe.json', { open: open, id: openId, pending: 0 }); return; }
  let st = was;
  // Notes which piece is in the open safe, the first time, without sending anything for it.
  if (open && open === was.open && was.id === undefined) { st = Object.assign({}, was, { id: openId }); await store.write('sweep/safe.json', st); }
  // A new safe opened: the next one in this round, or safe 1 of a brand new round of deals.
  else if (open && (open !== was.open || (was.id !== undefined && openId !== was.id))) { st = { open: open, id: openId, pending: open, key: 'blast-' + open + '-' + openId, at: now }; await store.write('sweep/safe.json', st); }
  if (!st.pending) return;
  const n = st.pending, total = (dl.slots || []).length || 5, left = total - n;
  const sales = await store.sales(), who = {}, owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  // The owner gets it first, to see what went out.
  if (owner) who[owner] = '';
  (await Promise.all(sales.map((x) => store.read(x.path)))).forEach((d) => { const e = String((d && d.email) || '').trim().toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && !(e in who)) who[e] = d.buyer || ''; });
  // And everyone who joined the mailing list (help.html?join=1).
  (await Promise.all((await files('list/')).map((p) => store.read(p)))).forEach((d) => { const e = String((d && d.email) || '').trim().toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && !(e in who)) who[e] = d.name || ''; });
  const logKey = st.key || ('blast-' + n), log = (await store.read('sweep/' + logKey + '.json')) || { done: {} };
  const todo = Object.keys(who).filter((e) => !log.done[hashOf(e)]);
  if (!todo.length) { await store.write('sweep/safe.json', { open: st.open, id: st.id, pending: 0 }); return; }
  const addr = (process.env.RETURN_ADDRESS || '').replace(/\s*\n\s*/g, ', ').trim();
  // What is inside the open safe (only that one; locked safes stay a secret).
  let piece = null;
  try { const sj = await (await fetch(HOST + '/api/order', { signal: AbortSignal.timeout(8000), headers: { 'cache-control': 'no-store' } })).json(); piece = (sj.products || []).filter((p) => p.id === st.id && p.deal)[0] || null; } catch (e) { piece = null; }
  const subject = n >= total ? 'The Vault is open at JarFriends' : n === 1 ? 'New Deal of the day: safe 1 is open at JarFriends' : 'Safe ' + n + ' just unlocked at JarFriends';
  for (const e of todo.slice(0, 12)) {
    if (await gone(e)) { log.done[hashOf(e)] = 1; continue; }
    const stop = HOST + '/api/unsub?t=' + lib.sign({ un: 1, e: e });
    const l1 = n >= total ? 'Every safe before it has been claimed, so The Vault is open right now.' : n === 1 ? 'A new round of Deal of the day safes just started, and safe 1 is open.' : 'Safe ' + (n - 1) + ' was just claimed, so safe ' + n + ' is unlocked.';
    const l2 = n >= total ? 'This is the last and biggest one. Have you seen what is inside?' : 'Have you checked what is inside the new safe?';
    const l3 = n >= total ? '' : 'We are getting closer to The Vault: ' + (left === 1 ? 'it is the very next safe to open.' : left + ' more safes to go before it opens.');
    const pl = piece ? ['', 'Inside safe ' + n + ': ' + piece.name, '$' + piece.price + (piece.nft ? '' : Number(piece.ship) > 0 ? ' + $' + piece.ship + ' shipping' : ', free shipping')] : [];
    const lines = [first(who[e]), '', l1, l2].concat(pl, l3 ? ['', l3] : [], ['', 'See it here:', HOST + '/#deal', '', 'You are getting this because you ordered from JarFriends or subscribed.' + (addr ? ' JarFriends, ' + addr + '.' : ''), 'Unsubscribe: ' + stop]);
    const html = '<div style="background:#0B1712;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#E6EFE9"><div style="max-width:520px;margin:0 auto">' +
      '<div style="font-size:13px;letter-spacing:2px;color:#C9A45C">DEAL OF THE DAY</div>' +
      '<h1 style="font-size:26px;margin:8px 0 14px;color:#8FD3AE">' + esc(subject.replace(' at JarFriends', '')) + '</h1>' +
      '<p style="font-size:16px;line-height:1.5;margin:0 0 10px">' + esc(first(who[e])) + '</p>' +
      '<p style="font-size:16px;line-height:1.5;margin:0 0 10px">' + esc(l1) + ' <b>' + esc(l2) + '</b></p>' +
      '<p style="margin:18px 0"><a href="' + HOST + '/#deal" style="background:#C9A45C;color:#0B1712;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:24px;display:inline-block">' + (n >= total ? 'Open The Vault' : 'See what is in safe ' + n) + '</a></p>' +
      (piece ? '<div style="border:1px solid #C9A45C;border-radius:10px;padding:14px;margin:0 0 14px"><div style="font-size:13px;letter-spacing:2px;color:#C9A45C">INSIDE SAFE ' + n + '</div>' + (piece.photo ? '<img src="' + esc(piece.photo) + '" alt="' + esc(piece.name) + '" width="480" style="max-width:100%;height:auto;border:0;border-radius:8px;display:block;margin:10px 0">' : '') + '<div style="font-size:18px;font-weight:bold;line-height:1.35;margin-top:6px">' + esc(piece.name) + '</div><div style="font-size:22px;font-weight:bold;color:#C9A45C;margin-top:6px">$' + esc(piece.price) + '</div></div>' : '') +
      (l3 ? '<p style="font-size:16px;line-height:1.5;margin:0 0 12px">' + esc(l3) + '</p>' : '') +
      (piece && piece.photo ? '' : '<a href="' + HOST + '/#deal"><img src="' + HOST + '/photos/vault.jpg" alt="The Vault" width="360" style="max-width:100%;height:auto;border:0;border-radius:10px;display:block"></a>') +
      '<p style="font-size:12px;line-height:1.5;color:#8FA89A;margin:22px 0 0">You are getting this because you ordered from JarFriends or subscribed.' + (addr ? ' JarFriends, ' + esc(addr) + '.' : '') + ' <a href="' + stop + '" style="color:#8FA89A">Unsubscribe</a></p></div></div>';
    const out = await mail(e, subject, lines, logKey + '-' + hashOf(e), html).catch(() => 'failed');
    if (out === 'sent' || out === 'duplicate') log.done[hashOf(e)] = 1;
    await new Promise((r) => setTimeout(r, 550));
  }
  await store.write('sweep/' + logKey + '.json', log);
}

// 5. A new piece is on the shop shelf: everyone who has ordered or subscribed gets one email with its picture and
// price. A piece is announced once it has been up for half an hour, so there is time to fix its name, price or photo
// first; pieces that appear together go out in one email. Deal of the day pieces are left to the safe emails.
const HOLD = 30 * 60000;
async function everyone() {
  const who = {}, owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase(), ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (owner) who[owner] = '';
  (await Promise.all((await store.sales()).map((x) => store.read(x.path)))).forEach((d) => { const e = String((d && d.email) || '').trim().toLowerCase(); if (ok.test(e) && !(e in who)) who[e] = d.buyer || ''; });
  (await Promise.all((await files('list/')).map((p) => store.read(p)))).forEach((d) => { const e = String((d && d.email) || '').trim().toLowerCase(); if (ok.test(e) && !(e in who)) who[e] = d.name || ''; });
  return who;
}
async function arrivals(now, mail) {
  const lib = require('./_lib');
  const r = await fetch(HOST + '/api/order', { signal: AbortSignal.timeout(8000), headers: { 'cache-control': 'no-store' } });
  const shop = ((await r.json()).products || []).filter((p) => p && p.id && !p.deal && p.shelf && !p.locked);
  if (!shop.length) return;
  const st = await store.read('sweep/known.json');
  // The first time this runs every piece already on the shelf is noted as known. Nothing is sent for those.
  if (!st) { const seen = {}; shop.forEach((p) => { seen[p.id] = 1; }); await store.write('sweep/known.json', { seen: seen, wait: {}, batch: null }); return; }
  st.seen = st.seen || {}; st.wait = st.wait || {};
  let changed = false;
  shop.forEach((p) => { if (!st.seen[p.id] && !st.wait[p.id]) { st.wait[p.id] = now; changed = true; } });
  // Start a batch when nothing is going out and a piece has waited long enough. Everything waiting goes with it.
  if (!st.batch && Object.keys(st.wait).some((id) => now - st.wait[id] >= HOLD)) {
    const ids = Object.keys(st.wait); st.batch = { key: 'new-' + now.toString(36), ids: ids };
    ids.forEach((id) => { st.seen[id] = 1; }); st.wait = {}; changed = true;
  }
  if (changed) await store.write('sweep/known.json', st);
  if (!st.batch) return;
  // Only pieces that can still be bought are shown.
  const items = st.batch.ids.map((id) => shop.filter((p) => p.id === id)[0]).filter((p) => p && Number(p.stock) > 0);
  const who = items.length ? await everyone() : {}, log = (await store.read('sweep/' + st.batch.key + '.json')) || { done: {} };
  const todo = Object.keys(who).filter((e) => !log.done[hashOf(e)]);
  if (!todo.length) { st.batch = null; await store.write('sweep/known.json', st); return; }
  const addr = (process.env.RETURN_ADDRESS || '').replace(/\s*\n\s*/g, ', ').trim();
  const subject = items.length === 1 ? 'New at JarFriends: ' + items[0].name : items.length + ' new pieces at JarFriends';
  const cost = (p) => (p.auction ? 'Auction: bidding starts at $' + p.auction.start + ', ends ' + new Date(p.auction.ends).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Central' : '$' + p.price + (p.eth ? ' (about ' + p.eth + ' ETH)' : '')) + (p.nft ? '' : Number(p.ship) > 0 ? ' + $' + p.ship + ' shipping' : ', free shipping');
  const linkOf = (p) => p.auction ? HOST + '/auction.html?id=' + encodeURIComponent(p.id) : HOST + '/order.html?product=' + encodeURIComponent(p.id);
  const tip = 'Pay with crypto and take 1% off. There is no wallet to connect and nothing to sign: you just send the payment to the address shown.';
  for (const e of todo.slice(0, 12)) {
    if (await gone(e)) { log.done[hashOf(e)] = 1; continue; }
    const stop = HOST + '/api/unsub?t=' + lib.sign({ un: 1, e: e });
    const lines = [first(who[e]), '', items.length === 1 ? 'A new piece just landed in the shop:' : 'New pieces just landed in the shop:', ''];
    items.forEach((p) => { lines.push(p.name, cost(p), linkOf(p), ''); });
    lines.push(tip, '', 'You are getting this because you ordered from JarFriends or subscribed.' + (addr ? ' JarFriends, ' + addr + '.' : ''), 'Unsubscribe: ' + stop);
    const html = '<div style="background:#0B1712;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#E6EFE9"><div style="max-width:520px;margin:0 auto">' +
      '<div style="font-size:13px;letter-spacing:2px;color:#C9A45C">NEW IN THE SHOP</div>' +
      '<h1 style="font-size:26px;margin:8px 0 14px;color:#8FD3AE">' + (items.length === 1 ? 'A new piece just landed' : 'New pieces just landed') + '</h1>' +
      '<p style="font-size:16px;line-height:1.5;margin:0 0 16px">' + esc(first(who[e])) + '</p>' +
      items.map((p) => { const link = linkOf(p); return '<div style="border:1px solid #2C4A3B;border-radius:10px;padding:16px;margin:0 0 16px">' +
        (p.photo ? '<a href="' + link + '"><img src="' + esc(p.photo) + '" alt="' + esc(p.name) + '" width="480" style="max-width:100%;height:auto;border:0;border-radius:8px;display:block;margin:0 0 12px"></a>' : '') +
        '<div style="font-size:18px;font-weight:bold;line-height:1.35">' + esc(p.name) + '</div>' +
        '<div style="font-size:22px;font-weight:bold;color:#C9A45C;margin:8px 0 4px">' + esc(cost(p)) + '</div>' +
        (p.desc ? '<div style="font-size:14px;line-height:1.5;color:#B9CCC0;margin:6px 0 0">' + esc(p.desc) + '</div>' : '') +
        '<p style="margin:14px 0 0"><a href="' + link + '" style="background:#C9A45C;color:#0B1712;text-decoration:none;font-weight:bold;padding:11px 20px;border-radius:24px;display:inline-block">' + (p.auction ? 'Bid now' : 'Get it') + '</a></p></div>'; }).join('') +
      '<p style="font-size:15px;line-height:1.5;margin:0 0 10px;background:#12261D;border-radius:8px;padding:12px 14px">' + esc(tip) + '</p>' +
      '<p style="font-size:12px;line-height:1.5;color:#8FA89A;margin:22px 0 0">You are getting this because you ordered from JarFriends or subscribed.' + (addr ? ' JarFriends, ' + esc(addr) + '.' : '') + ' <a href="' + stop + '" style="color:#8FA89A">Unsubscribe</a></p></div></div>';
    const out = await mail(e, subject, lines, st.batch.key + '-' + hashOf(e), html).catch(() => 'failed');
    if (out === 'sent' || out === 'duplicate') log.done[hashOf(e)] = 1;
    await new Promise((res) => setTimeout(res, 550));
  }
  await store.write('sweep/' + st.batch.key + '.json', log);
}

// One-time changes the owner asked for. Each is done once, then never again, so later edits in the back office stand.
const ONCE = [
  ['lava5', 'LAVAJACK', { stock: 5 }],
  // October 12: the party is 5 comics, not 11.
  ['party5', 'MPARTY2', { stock: 5 }],
  // Later on October 12: 8 comics.
  ['party8', 'MPARTY2', { stock: 8 }],
  // Starts at $26.00 and ends at $18.80 if all 8 sell.
  ['party26', 'MPARTY2', { price: 26 }],
  ['koala125', 'DEAL2', { price: 125, shipping: 'free' }],
  // The first-order promo code named in the checkout reminder email: 10% off shop and Deal of the day pieces.
  ['jar10', 'promo:JAR10', { on: true, pct: 10, for: ['shop', 'deal'] }]
];
let once = false;
async function oneOff() {
  if (once) return;
  once = true;
  // Asked for by the owner on October 12, 2026: take the freed Jolly Jack-O copy off, so safe 1 counts as claimed
  // and the next safe opens again. Done once.
  if (!(await store.read('sweep/jacko-pull.json'))) {
    const ed = require('./_edits'), p = (await ed.apply(require('./_products'), { all: true })).filter((x) => x.id === 'JACKO')[0];
    if (p) {
      let held = 0;
      try { held = (await require('./_holds').byProduct())['JACKO'] || 0; } catch (e) { held = 0; }
      const left = Number(p.stock) - ((await store.soldBy())['JACKO'] || 0) - held;
      if (left > 0) await ed.save('JACKO', { stock: Number(p.stock) - left });
    }
    await store.write('sweep/jacko-pull.json', { at: Date.now() });
  }
  for (const o of ONCE) {
    if (await store.read('sweep/' + o[0] + '.json')) continue;
    if (o[1].indexOf('promo:') === 0) await require('./_offline').savePromo(o[1].slice(6), o[2]);
    else await require('./_edits').save(o[1], o[2]);
    await store.write('sweep/' + o[0] + '.json', { at: Date.now() });
  }
}

// 7. Price drops. When a piece in the shop (or the open Deal of the day) gets cheaper, everyone on the list hears
// about it, with the old and new price, right away: saving a lower price in the back office sends it (dropNow), and
// the regular check catches anything else. Price rises send nothing.
async function repriced(now, mail, opt) {
  const hold = opt && opt.hold !== undefined ? opt.hold : 0, max = (opt && opt.max) || 12;
  const lib = require('./_lib');
  const r = await fetch(HOST + '/api/order', { signal: AbortSignal.timeout(8000), headers: { 'cache-control': 'no-store' } });
  const shop = ((await r.json()).products || []).filter((p) => p && p.id && !p.locked && !p.auction && !/^MPARTY/.test(p.id));
  if (!shop.length) return;
  let st = await store.read('sweep/prices.json');
  // The first time, today's prices are noted. Nothing is sent for them.
  if (!st) { const lastP = {}; shop.forEach((p) => { lastP[p.id] = Number(p.price); }); await store.write('sweep/prices.json', { last: lastP, wait: {}, batch: null }); return; }
  st.last = st.last || {}; st.wait = st.wait || {};
  let changed = false;
  shop.forEach((p) => {
    const cur = Number(p.price), prev = st.last[p.id];
    if (!(cur > 0)) return;
    if (prev === undefined) { st.last[p.id] = cur; changed = true; return; }
    if (cur < prev - 0.004) {
      const w = st.wait[p.id];
      st.wait[p.id] = { from: w ? w.from : prev, to: cur, at: w ? w.at : now };
      st.last[p.id] = cur; changed = true;
    } else if (cur > prev + 0.004) {
      st.last[p.id] = cur; changed = true;
      if (st.wait[p.id] && cur >= st.wait[p.id].from - 0.004) delete st.wait[p.id];
    }
  });
  if (!st.batch && Object.keys(st.wait).some((id) => now - st.wait[id].at >= hold)) {
    st.batch = { key: 'drop-' + now.toString(36), items: st.wait }; st.wait = {}; changed = true;
  }
  if (changed) await store.write('sweep/prices.json', st);
  console.log('DROPS', JSON.stringify({ waiting: Object.keys(st.wait), batch: st.batch ? Object.keys(st.batch.items) : null, checked: shop.length }));
  if (!st.batch) return;
  // Only pieces still for sale, still at the lower price, are shown.
  const items = Object.keys(st.batch.items).map((id) => { const p = shop.filter((x) => x.id === id)[0], w = st.batch.items[id]; return p && Number(p.stock) > 0 && Number(p.price) < w.from - 0.004 ? Object.assign({}, p, { was: w.from }) : null; }).filter(Boolean);
  const who = items.length ? await everyone() : {}, log = (await store.read('sweep/' + st.batch.key + '.json')) || { done: {} };
  const todo = Object.keys(who).filter((e) => !log.done[hashOf(e)]);
  // The last batch is done: clear it, then look again at once so a newer drop is not left waiting.
  console.log('DROPS_SEND', JSON.stringify({ key: st.batch.key, items: items.length, people: Object.keys(who).length, left: todo.length }));
  if (!todo.length) { st.batch = null; await store.write('sweep/prices.json', st); return opt && opt.again === false ? undefined : repriced(now, mail, Object.assign({}, opt, { again: false })); }
  const addr = (process.env.RETURN_ADDRESS || '').replace(/\s*\n\s*/g, ', ').trim();
  const usd = (n) => '$' + Number(n).toFixed(2);
  const subject = items.length === 1 ? 'Price drop: ' + items[0].name + ' is now ' + usd(items[0].price) : items.length + ' price drops at JarFriends';
  const ship = (p) => (p.nft ? '' : Number(p.ship) > 0 ? ' + $' + p.ship + ' shipping' : ', free shipping');
  const tip = 'Pay with crypto and take 1% off. There is no wallet to connect and nothing to sign: you just send the payment to the address shown.';
  for (const e of todo.slice(0, max)) {
    if (await gone(e)) { log.done[hashOf(e)] = 1; continue; }
    const stop = HOST + '/api/unsub?t=' + lib.sign({ un: 1, e: e });
    const lines = [first(who[e]), '', items.length === 1 ? 'A price just dropped at JarFriends:' : 'Prices just dropped at JarFriends:', ''];
    items.forEach((p) => { lines.push(p.name, 'Was ' + usd(p.was) + ', now ' + usd(p.price) + (p.eth ? ' (about ' + p.eth + ' ETH)' : '') + ship(p), HOST + '/order.html?product=' + encodeURIComponent(p.id), ''); });
    lines.push(tip, '', 'You are getting this because you ordered from JarFriends or subscribed.' + (addr ? ' JarFriends, ' + addr + '.' : ''), 'Unsubscribe: ' + stop);
    const html = '<div style="background:#0B1712;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#E6EFE9"><div style="max-width:520px;margin:0 auto">' +
      '<div style="font-size:13px;letter-spacing:2px;color:#C9A45C">PRICE DROP</div>' +
      '<h1 style="font-size:26px;margin:8px 0 14px;color:#8FD3AE">' + (items.length === 1 ? 'A price just dropped' : 'Prices just dropped') + '</h1>' +
      '<p style="font-size:16px;line-height:1.5;margin:0 0 16px">' + esc(first(who[e])) + '</p>' +
      items.map((p) => { const link = HOST + '/order.html?product=' + encodeURIComponent(p.id); return '<div style="border:1px solid #2C4A3B;border-radius:10px;padding:16px;margin:0 0 16px">' +
        (p.photo ? '<a href="' + link + '"><img src="' + esc(p.photo) + '" alt="' + esc(p.name) + '" width="480" style="max-width:100%;height:auto;border:0;border-radius:8px;display:block;margin:0 0 12px"></a>' : '') +
        '<div style="font-size:18px;font-weight:bold;line-height:1.35">' + esc(p.name) + '</div>' +
        '<div style="margin:8px 0 4px"><span style="font-size:16px;color:#8FA89A;text-decoration:line-through">' + usd(p.was) + '</span> <span style="font-size:24px;font-weight:bold;color:#C9A45C">' + usd(p.price) + '</span> <span style="font-size:14px;color:#8FD3AE">' + Math.round((1 - Number(p.price) / p.was) * 100) + '% off</span></div>' +
        '<div style="font-size:13px;color:#B9CCC0">' + esc([p.eth ? 'About ' + p.eth + ' ETH' : '', p.nft ? '' : Number(p.ship) > 0 ? 'Plus $' + p.ship + ' shipping' : 'Free shipping'].filter(Boolean).join(' · ')) + '</div>' +
        '<p style="margin:14px 0 0"><a href="' + link + '" style="background:#C9A45C;color:#0B1712;text-decoration:none;font-weight:bold;padding:11px 20px;border-radius:24px;display:inline-block">Get it</a></p></div>'; }).join('') +
      '<p style="font-size:15px;line-height:1.5;margin:0 0 10px;background:#12261D;border-radius:8px;padding:12px 14px">' + esc(tip) + '</p>' +
      '<p style="font-size:12px;line-height:1.5;color:#8FA89A;margin:22px 0 0">You are getting this because you ordered from JarFriends or subscribed.' + (addr ? ' JarFriends, ' + esc(addr) + '.' : '') + ' <a href="' + stop + '" style="color:#8FA89A">Unsubscribe</a></p></div></div>';
    const out = await mail(e, subject, lines, st.batch.key + '-' + hashOf(e), html).catch(() => 'failed');
    if (out === 'sent' || out === 'duplicate') log.done[hashOf(e)] = 1;
    await new Promise((res) => setTimeout(res, 550));
  }
  await store.write('sweep/' + st.batch.key + '.json', log);
}

// 8. Auctions (see _auction.js). Under an hour left: every bidder hears it is ending. Once it ends: the winner gets a
// link to pay their bid within 24 hours (the owner gets a copy). Not paid in 24 hours: the next-highest bidder is
// offered it at their own bid, up to two times.
async function auctions(now, mail) {
  const A = require('./_auction'), lib = require('./_lib');
  const box = (title, body, link, btn) => '<div style="background:#0B1712;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#E6EFE9"><div style="max-width:520px;margin:0 auto"><div style="font-size:13px;letter-spacing:2px;color:#C9A45C">AUCTION</div><h1 style="font-size:24px;margin:8px 0 14px;color:#8FD3AE">' + esc(title) + '</h1>' + body.map((t) => '<p style="font-size:16px;line-height:1.5;margin:0 0 10px">' + esc(t) + '</p>').join('') + '<p style="margin:18px 0"><a href="' + link + '" style="background:#C9A45C;color:#0B1712;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:24px;display:inline-block">' + esc(btn) + '</a></p></div></div>';
  const owner = (process.env.OWNER_EMAIL || '').trim();
  for (const p of await A.list()) {
    const s = await A.state(p), st = Object.assign({}, s.st), page = HOST + '/auction.html?id=' + encodeURIComponent(p.id);
    let changed = false;
    if (!s.ended && s.count && s.ends - now < 3600000 && !st.soonSent) {
      st.soonSent = now; changed = true;
      for (const e of Array.from(new Set(s.list.map((b) => b.e)))) {
        const lead = s.top && s.top.e === e;
        const body = [p.name + ' ends in under an hour. The top bid is $' + A.usd(s.current) + (lead ? ', and it is yours.' : '.'), lead ? 'Keep an eye on it: a late bid could still beat you.' : 'There is still time to win it.'];
        await mail(e, 'Ending soon: ' + p.name, body.concat(['', page]), 'auc-soon-' + p.id + '-' + hashOf(e), box('Ending in under an hour', body, page, lead ? 'Watch the auction' : 'Bid now')).catch(() => null);
      }
    }
    if (s.ended && !st.closed) {
      st.closed = now; st.offered = []; changed = true;
      if (!s.top) {
        if (owner) await mail(owner, 'Auction ended with no bids: ' + p.name, ['The auction for ' + p.name + ' ended with no bids.'], 'auc-none-' + p.id).catch(() => null);
      } else {
        st.offered.push({ e: s.top.e, amt: s.top.amt, at: now });
        await offerTo(p, s.top, now, true);
      }
    } else if (st.closed && st.offered && st.offered.length && st.offered.length < 3) {
      const last = st.offered[st.offered.length - 1];
      if (now - last.at > 24 * 3600000 && !(await store.sales()).some((x) => x.pid === p.id)) {
        const taken = st.offered.map((o) => o.e), next = s.list.filter((b) => taken.indexOf(b.e) < 0)[0];
        if (next) { st.offered.push({ e: next.e, amt: next.amt, at: now }); changed = true; await offerTo(p, next, now, false); }
        else if (!st.noneLeft) { st.noneLeft = now; changed = true; if (owner) await mail(owner, 'Auction winner did not pay: ' + p.name, ['Nobody paid for ' + p.name + ' after the auction, and there are no more bidders to offer it to.'], 'auc-left-' + p.id).catch(() => null); }
      }
    }
    if (changed) await store.write('auction/' + p.id + '/state.json', st);
  }
  async function offerTo(p, bid, at, first) {
    const pref = (await store.read('bidder/' + require('crypto').createHash('sha1').update(String(bid.e).toLowerCase()).digest('hex').slice(0, 20) + '.json')) || {};
    const pay = HOST + '/order.html?offer=' + lib.sign({ oa: 1, n: 'AUC-' + p.id, pid: p.id, q: 1, c: bid.amt, x: Math.floor(at / 1000) + 24 * 3600 }) + (pref.method ? '&method=' + encodeURIComponent(pref.method) : '') + '&email=' + encodeURIComponent(bid.e);
    const body = first ? ['You won the auction for ' + p.name + ' with your bid of $' + A.usd(bid.amt) + '.', 'Pay within 24 hours to claim it. If it is not paid in time, it goes to the next bidder.']
      : ['Good news: the winner of the auction for ' + p.name + ' did not pay, so it is yours for your bid of $' + A.usd(bid.amt) + '.', 'Pay within 24 hours to claim it.'];
    await mail(bid.e, (first ? 'You won: ' : 'It is yours: ') + p.name, body.concat(['', 'Pay here:', pay]), 'auc-win-' + p.id + '-' + hashOf(bid.e), box(first ? 'You won the auction' : 'It is yours', body, pay, 'Pay $' + A.usd(bid.amt))).catch(() => null);
    if (owner) await mail(owner, (first ? 'Auction won: ' : 'Auction passed to next bidder: ') + p.name, [p.name + ' went to ' + bid.e + ' for $' + A.usd(bid.amt) + '. They have 24 hours to pay. It shows in the back office once they order.'], 'auc-own-' + p.id + '-' + hashOf(bid.e)).catch(() => null);
  }
}

// 9. Party pricing opens: everyone on the list hears it once, for each new party.
async function partyOpen(now, mail) {
  const lib = require('./_lib'), P = require('./_party').PARTY;
  if (!P || !P.pid || now < P.starts || now >= P.ends) return;
  const key = 'sweep/party-' + P.pid + '-' + P.starts + '.json';
  const log = (await store.read(key)) || { done: {} };
  if (log.finished) return;
  const who = await everyone(), todo = Object.keys(who).filter((e) => !log.done[hashOf(e)]);
  if (!todo.length) { log.finished = now; await store.write(key, log); return; }
  let p = null;
  try { const sj = await (await fetch(HOST + '/api/order', { signal: AbortSignal.timeout(8000), headers: { 'cache-control': 'no-store' } })).json(); p = (sj.products || []).filter((x) => x.id === P.pid)[0] || null; } catch (e) { p = null; }
  const name = p ? p.name.replace(/:\s*Party Pricing$/, '') : 'the party piece';
  const addr = (process.env.RETURN_ADDRESS || '').replace(/\s*\n\s*/g, ', ').trim();
  const body = ['JarFriends Party Pricing is open now: ' + name + '.', 'The more that sell, the lower the price goes for everyone, and if it drops after you buy, you get the difference back.', 'Ends ' + P.endsText + '. Only ' + P.total + ' available.'];
  for (const e of todo.slice(0, 12)) {
    if (await gone(e)) { log.done[hashOf(e)] = 1; continue; }
    const stop = HOST + '/api/unsub?t=' + lib.sign({ un: 1, e: e });
    const html = '<div style="background:#0B1712;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#E6EFE9"><div style="max-width:520px;margin:0 auto"><div style="font-size:13px;letter-spacing:2px;color:#C9A45C">PARTY PRICING</div><h1 style="font-size:26px;margin:8px 0 14px;color:#8FD3AE">The party is open</h1><p style="font-size:16px;line-height:1.5;margin:0 0 10px">' + esc(first(who[e])) + '</p>' +
      body.map((t) => '<p style="font-size:16px;line-height:1.5;margin:0 0 10px">' + esc(t) + '</p>').join('') +
      (p && p.photo ? '<img src="' + esc(p.photo) + '" alt="' + esc(name) + '" width="480" style="max-width:100%;height:auto;border:0;border-radius:8px;display:block;margin:12px 0">' : '') +
      '<p style="margin:18px 0"><a href="' + HOST + '/#party" style="background:#C9A45C;color:#0B1712;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:24px;display:inline-block">Join the party</a></p>' +
      '<p style="font-size:12px;line-height:1.5;color:#8FA89A;margin:22px 0 0">You are getting this because you ordered from JarFriends or subscribed.' + (addr ? ' JarFriends, ' + esc(addr) + '.' : '') + ' <a href="' + stop + '" style="color:#8FA89A">Unsubscribe</a></p></div></div>';
    const out = await mail(e, 'Party Pricing is open at JarFriends', [first(who[e]), ''].concat(body, ['', HOST + '/#party', '', 'Unsubscribe: ' + stop]), 'party-' + P.pid + '-' + P.starts + '-' + hashOf(e), html).catch(() => 'failed');
    log.done[hashOf(e)] = out === 'sent' || out === 'duplicate' ? 1 : 'failed';
    await new Promise((r) => setTimeout(r, 550));
  }
  await store.write(key, log);
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
  // Sent on their own: a safe opening (including a new round) and party pricing opening. New pieces, price drops and
  // auctions go out together when the owner presses the daily update button in the back office (see _digest.js).
  await safes(now, mail).catch((e) => console.error('SWEEP_SAFES_FAIL', String(e && e.message || e)));
  await partyOpen(now, mail).catch((e) => console.error('SWEEP_PARTY_FAIL', String(e && e.message || e)));
  await auctions(now, mail).catch((e) => console.error('SWEEP_AUCTIONS_FAIL', String(e && e.message || e)));
}
// Called by the back office the moment a lower price is saved.
async function dropNow() { /* price drops now go out with the daily update (see _digest.js) */ }
module.exports = { run, dropNow, everyone, gone, hashOf, esc, first };
