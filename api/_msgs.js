// Messages between a buyer and a seller ("Ask the seller a question"). One thread per buyer, seller and piece.
// Files: msgs/t/<id>.json   the thread: { id, buyer, buyerName, seller, sellerName, pid, product, msgs: [{ from, text, at }], readB, readS, at }
//        msgs/s/<slug>/<id>.json   a pointer so a seller can list their threads (buyers list theirs by the id prefix).
// The other side gets an email for a new message, at most once every 15 minutes per thread, with a link to reply.
const crypto = require('crypto');
const store = require('./_store');
const M = require('./_sellers');
const lib = require('./_lib');

const h = (e) => crypto.createHash('sha1').update(String(e).toLowerCase()).digest('hex').slice(0, 12);
const tidy = (v, n) => String(v == null ? '' : v).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
const firstName = (e) => String(e || '').split('@')[0].replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 20) || 'Buyer';
const HOST = () => 'https://' + String(process.env.SITE_HOST || 'veefam.io').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const tKey = (id) => 'msgs/t/' + id + '.json';
const OK_ID = /^[a-f0-9]{12}-[a-z0-9-]{2,30}-[A-Za-z0-9_-]{0,40}$/;

async function list(prefix) {
  const { list: ls } = await import('@vercel/blob');
  const out = []; let cursor;
  do { const r = await ls({ prefix: prefix, cursor: cursor, limit: 1000 }); (r.blobs || []).forEach((b) => out.push(b.pathname)); cursor = r.hasMore ? r.cursor : null; } while (cursor);
  return out;
}
const view = (t, side) => ({ id: t.id, side: side, seller: t.seller, sellerName: t.sellerName, buyerName: t.buyerName, pid: t.pid || '', product: t.product || '',
  last: t.msgs.length ? t.msgs[t.msgs.length - 1] : null, unread: t.msgs.filter((m) => m.from !== side && m.at > (side === 'b' ? t.readB || 0 : t.readS || 0)).length, at: t.at });

// Can this person see the thread, and as which side? 'b' buyer, 's' seller.
async function sideOf(t, me) {
  if (!t) return '';
  if (String(t.buyer).toLowerCase() === me) return 'b';
  const shop = await M.bySlug(t.seller);
  return shop && String(shop.email).toLowerCase() === me ? 's' : '';
}
async function notify(t, side, host) {
  const now = Date.now(), k = side === 'b' ? 'mailS' : 'mailB';
  if (now - (t[k] || 0) < 15 * 60000) return;
  t[k] = now;
  const last = t.msgs[t.msgs.length - 1], link = (host || HOST()) + '/messages.html?t=' + encodeURIComponent(t.id);
  const shop = side === 'b' ? await M.bySlug(t.seller) : null;
  const to = side === 'b' ? shop && shop.email : t.buyer;
  if (!to) return;
  const who = side === 'b' ? t.buyerName : t.sellerName;
  await lib.mail(to, 'New message from ' + who + (t.product ? ' about ' + t.product : ''), [who + ' wrote' + (t.product ? ' about ' + t.product : '') + ':', '', last.text, '', 'Reply here:', link], 'msg-' + t.id + '-' + last.at).catch(() => null);
}

// Send a message. A buyer starts or continues their thread with a seller (about a piece, if pid is given);
// either side can reply to a thread they are in by its id.
async function send(me, b, host) {
  const text = tidy(b.text, 1500);
  if (text.length < 1) return { error: 'Write your message first.' };
  let t = null, side = '';
  if (b.id) {
    if (!OK_ID.test(String(b.id))) return { error: 'That conversation was not found.' };
    t = await store.read(tKey(b.id)); side = await sideOf(t, me);
    if (!side) return { error: 'That conversation was not found.' };
  } else {
    const shop = await M.bySlug(String(b.seller || ''));
    if (!shop || shop.status !== 'approved') return { error: 'That shop was not found.' };
    if (String(shop.email).toLowerCase() === me) return { error: 'This is your own shop.' };
    let pid = String(b.pid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40), product = '';
    if (pid) { const p = (await M.listings()).filter((x) => x.id === pid && x.seller === shop.slug)[0]; if (p) product = p.name; else pid = ''; }
    const id = h(me) + '-' + shop.slug + '-' + pid;
    t = (await store.read(tKey(id))) || { id: id, buyer: me, buyerName: firstName(me), seller: shop.slug, sellerName: shop.name, pid: pid, product: product, msgs: [], readB: 0, readS: 0, created: Date.now() };
    side = 'b';
    await store.write('msgs/s/' + shop.slug + '/' + id + '.json', { id: id, at: Date.now() });
  }
  const recent = t.msgs.filter((m) => m.from === side && Date.now() - m.at < 60000).length;
  if (recent >= 6) return { error: 'Slow down a little: wait a minute before sending more.' };
  const now = Date.now();
  t.msgs.push({ from: side, text: text, at: now }); t.msgs = t.msgs.slice(-300); t.at = now;
  if (side === 'b') t.readB = now; else t.readS = now;
  await notify(t, side, host);
  await store.write(tKey(t.id), t);
  return { ok: true, thread: Object.assign(view(t, side), { msgs: t.msgs }) };
}
// One thread, marked read for the person opening it.
async function open(me, id) {
  if (!OK_ID.test(String(id || ''))) return { error: 'That conversation was not found.' };
  const t = await store.read(tKey(id)), side = await sideOf(t, me);
  if (!side) return { error: 'That conversation was not found.' };
  const now = Date.now(), was = side === 'b' ? t.readB : t.readS;
  if (t.msgs.some((m) => m.from !== side && m.at > (was || 0))) { if (side === 'b') t.readB = now; else t.readS = now; await store.write(tKey(id), t); }
  return { ok: true, thread: Object.assign(view(t, side), { msgs: t.msgs }) };
}
// Every thread for this person: as a buyer, and as a seller if they have a shop. Newest first.
async function inbox(me) {
  const shop = await M.byEmail(me);
  const ids = (await list('msgs/t/' + h(me) + '-')).map((p) => p.replace(/^msgs\/t\//, '').replace(/\.json$/, ''));
  const sIds = shop ? (await list('msgs/s/' + shop.slug + '/')).map((p) => p.replace(/^.*\//, '').replace(/\.json$/, '')) : [];
  const all = await Promise.all(ids.map((id) => store.read(tKey(id)).then((t) => (t && t.msgs.length ? view(t, 'b') : null)))
    .concat(sIds.map((id) => store.read(tKey(id)).then((t) => (t && t.msgs.length && t.seller === shop.slug ? view(t, 's') : null)))));
  const v = all.filter(Boolean).sort((a, b) => b.at - a.at);
  return { threads: v, unread: v.reduce((n, t) => n + t.unread, 0), shop: shop ? shop.slug : '' };
}
module.exports = { send, open, inbox };
