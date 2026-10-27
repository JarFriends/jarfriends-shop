// The owner's orders page (admin.html).
// GET ?send=1   emails the owner a private link to the page. Anyone can ask; only the owner's inbox gets it.
// POST { pass } signs in with the owner's passcode (ADMIN_PASSCODE in the site's settings) and returns a key.
// GET ?k=<key>  owner only: every order in the site's ledger, newest first, plus every product and the party.
// GET ?k=<key>&paid=<invoice>  owner only: marks an order paid by hand (Zelle, Venmo, Cash App, cash) and tells the buyer.
const { sign, verify, mail } = require('./_lib');
const store = require('./_store');
const crypto = require('crypto');
const catalog = require('./_products');
const party = require('./_party');

const hash = (v) => crypto.createHash('sha256').update(String(v)).digest();
// Wrong passcodes allowed before sign-in by passcode pauses, and for how long (minutes).
const TRIES = 8, PAUSE = 15;
async function passIn(req, res, now, host) {
  const want = (process.env.ADMIN_PASSCODE || '').trim();
  if (want.length < 8) return res.status(503).json({ error: 'No passcode is set up yet. Use the emailed link instead.' });
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const f = store.on() ? ((await store.read('meta/admin-tries.json')) || {}) : {};
  if (f.n >= TRIES && Date.now() - f.at < PAUSE * 60000) return res.status(429).json({ error: 'Too many wrong passcodes. Wait ' + PAUSE + ' minutes, or use the emailed link.' });
  if (!crypto.timingSafeEqual(hash(String(b.pass || '').trim()), hash(want))) {
    if (store.on()) await store.write('meta/admin-tries.json', { n: (Date.now() - (f.at || 0) < PAUSE * 60000 ? f.n || 0 : 0) + 1, at: Date.now() }).catch(() => null);
    return res.status(401).json({ error: 'That passcode is not right.' });
  }
  if (f.n && store.on()) await store.write('meta/admin-tries.json', { n: 0, at: 0 }).catch(() => null);
  return res.json({ k: sign({ adm: 1, x: now + 30 * 86400 }) });
}
// Every product with what has sold and what is left, and where it shows on the site.
async function shelf(sales) {
  const sold = {};
  sales.forEach((s) => { sold[s.pid] = (sold[s.pid] || 0) + s.q; });
  let opened = false;
  const state = {};
  catalog.filter((p) => p.deal > 0).sort((a, b) => a.deal - b.deal).forEach((p) => {
    const left = Math.max(0, p.stock - (sold[p.id] || 0));
    state[p.id] = left < (p.min || 1) ? 'Claimed' : opened ? 'Locked' : 'Open now';
    if (state[p.id] === 'Open now') opened = true;
  });
  return catalog.map((p) => {
    const n = sold[p.id] || 0, free = p.shipping === 'free' || !Number(p.shipping);
    return { id: p.id, name: p.name, price: p.price, start: p.stock, sold: n, left: Math.max(0, p.stock - n), shipping: free ? 0 : Number(p.shipping), nft: !!p.nft,
      where: p.id === party.PARTY.pid ? 'Party pricing' : p.deal ? 'Deal of the day' : 'Shop', deal: p.deal || 0, state: state[p.id] || '', section: p.section || '', test: /^(Test|Deal) Piece/.test(p.name) };
  });
}

// Days a link keeps working.
const DAYS = 60;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const now = Math.floor(Date.now() / 1000), host = 'https://' + req.headers.host;
  if (req.method === 'POST') return passIn(req, res, now, host);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  const owner = (process.env.OWNER_EMAIL || '').trim();
  if (req.query && req.query.send) {
    if (!owner) return res.status(503).json({ error: 'No owner email is set up for this site.' });
    // At most one email every ten minutes.
    const out = await mail(owner, 'Your private link to the orders page', ['Open this link to see every order and customer:', host + '/admin.html?k=' + sign({ adm: 1, x: now + DAYS * 86400 }), '', 'The link works for ' + DAYS + ' days. Anyone who has it can see your orders, so do not forward it.'], 'admin-link-' + Math.floor(now / 600)).catch(() => 'failed');
    return res.json({ ok: out === 'sent' || out === 'duplicate', sent: out });
  }
  const k = verify(String((req.query && req.query.k) || ''));
  if (!k || k.adm !== 1 || now > k.x) return res.status(401).json({ error: 'Your sign-in is not valid or has run out. Sign in again.' });
  if (!store.on()) return res.json({ orders: [], products: await shelf([]), note: 'Order storage is not connected.' });
  let sales = [];
  try { sales = await store.sales(); } catch (e) { return res.status(503).json({ error: 'Could not read the orders just now. Try again.' }); }
  // A fresh pay link for an accepted offer (good 48 more hours), to send the buyer: pays at the offer price, card included.
  if (req.query && req.query.offerlink) {
    const n = String(req.query.offerlink).replace(/[^A-Za-z0-9-]/g, '').slice(0, 30), o = n && await store.read('offers/' + n + '.json');
    if (!o || !(o.status === 'accepted' || o.status === 'countered')) return res.status(404).json({ error: 'That accepted offer was not found.' });
    const until = Math.max(o.until || 0, Date.now() + 48 * 3600000);
    if (until !== o.until) await store.write('offers/' + n + '.json', Object.assign(o, { until: until }));
    const c = o.status === 'countered' && o.counter ? o.counter : o.offer;
    const link = 'https://' + req.headers.host + '/order.html?offer=' + sign({ oa: 1, n: o.n, pid: o.pid, q: o.q || 1, c: c, x: Math.floor(until / 1000) }) + '&email=' + encodeURIComponent(o.email || '');
    return res.json({ ok: true, link: link, until: until });
  }
  // Mark one order as paid. The note sits beside the sale file; the buyer is told once.
  const mark = String((req.query && req.query.paid) || '');
  if (mark) {
    const s = sales.filter((x) => x.n === mark)[0];
    if (!s) return res.status(404).json({ error: 'That order was not found.' });
    const d = (await store.read(s.path)) || {}, was = (await store.read('meta/' + s.n + '.json')) || {};
    if (!was.paidAt) {
      await store.write('meta/' + s.n + '.json', Object.assign(was, { paidAt: Date.now(), paidHow: 'hand' }));
      if (d.email) await mail(d.email, 'Payment received for order ' + s.n, ['Thanks, we have your ' + (d.pay || '') + ' payment for order ' + s.n + ' (' + (d.product || 'your order') + ' x ' + s.q + ').', '', 'Your order is confirmed. We will email your tracking number when it ships.'], 'paid-by-hand-' + s.n).catch(() => null);
    }
    return res.json({ ok: true });
  }
  // Each order with its notes: paid by hand, shipped, tracking.
  const orders = await Promise.all(sales.map((s) => Promise.all([store.read(s.path), store.read('meta/' + s.n + '.json')]).then((x) => {
    const d = x[0] || {}, m = x[1] || {}, due = /payment due/i.test(d.status || '') && !m.paidAt;
    return Object.assign({}, d, { n: s.n, pid: s.pid, q: s.q, at: d.at || s.at, due: due, paidAt: m.paidAt || 0, tracking: m.tracking || '', testLabel: !!m.testLabel, shippedAt: m.shippedAt || 0,
      status: m.paidAt && /payment due/i.test(d.status || '') ? (m.paidHow === 'label' ? 'Paid (' + (d.pay || 'by hand') + '), marked when the label was bought' : 'Paid (' + (d.pay || 'by hand') + '), marked by you') : d.status || '' });
  })));
  orders.sort((a, b) => b.at - a.at);
  // Which shop each order came from: every seller's orders are listed here, not just one shop's.
  try {
    const M = require('./_sellers');
    const names = {}, from = {}, mails = {};
    (await M.all()).forEach((x) => { names[x.slug] = x.name || x.slug; mails[x.slug] = x.email || ''; const f = x.shipFrom || {};
      from[x.slug] = f.street1 ? [f.name || x.name, f.street1, f.street2, [f.city, [f.state, f.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), x.based === 'intl' ? (f.country || x.country || '') : '', f.phone].filter(Boolean).join(', ') : ''; });
    const shopOf = {}; (await M.listings()).forEach((p) => { if (p.seller) shopOf[p.id] = p.seller; });
    orders.forEach((o) => { const sl = shopOf[o.pid] || o.seller || ''; o.sellerSlug = sl; o.sellerName = sl ? (names[sl] || sl) : 'Site shop'; o.sellerEmail = sl ? mails[sl] || '' : ''; o.shipFrom = sl ? from[sl] || '' : (() => { try { const d = JSON.parse(process.env.SHIP_FROM || '{}'); return d.street1 ? [d.name, d.street1, d.street2, [d.city, [d.state, d.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), d.phone].filter(Boolean).join(', ') : ''; } catch (e) { return ''; } })(); });
  } catch (e) { console.error('ADMIN_SELLERS', String(e && e.message || e)); }
  const mp = catalog.filter((p) => p.id === party.PARTY.pid)[0];
  const ps = await party.state(mp ? Math.round(mp.price * 100) : 0);
  res.json({ orders: orders, products: await shelf(sales), party: { sold: ps.sold, total: ps.total, off: ps.off, ended: ps.ended, endsText: ps.endsText, next: ps.next, tiers: ps.tiers } });
};
