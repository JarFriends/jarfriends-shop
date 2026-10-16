// Signed-in customers: the orders placed with their email, read from the shop's own order records (the same ones
// the back office shows). Newest first. Cancelled orders are not listed.
//   GET  ?t=<sign-in>                                   the orders
//   POST { t, n, addr: { name, street, line2, city, state, zip } }   change the shipping address of order n,
//        only while it has not shipped (no label bought, no tracking). The country stays as ordered.
const { verify } = require('./_lib');
const store = require('./_store');

const num = (v) => Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')) || 0;
const s = (v, n) => String(v == null ? '' : v).slice(0, n || 300);
// The order's own invoice, from its label link (it carries the signed invoice).
function invOf(d) { try { const t = new URL(String(d.label || '')).searchParams.get('inv'); return t ? verify(t) : null; } catch (e) { return null; } }
const sent = (m) => !!((m.tracking && !m.testLabel) || m.shippedAt || m.labelPdf || m.nftSentAt);

async function mine(email) {
  const all = await store.sales(), out = [];
  for (let i = 0; i < all.length; i += 40) {
    const part = all.slice(i, i + 40), got = await Promise.all(part.map((x) => store.read(x.path)));
    got.forEach((d, k) => { if (d && String(d.email || '').trim().toLowerCase() === email) out.push({ s: part[k], d: d }); });
  }
  const metas = await Promise.all(out.map((x) => store.read('meta/' + x.s.n + '.json')));
  out.forEach((x, i) => { x.m = metas[i] || {}; });
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const b = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
  const t = verify(req.method === 'POST' ? b.t : req.query.t);
  const now = Math.floor(Date.now() / 1000);
  if (!t || t.a !== 1 || !t.e || !(t.x > now)) return res.status(401).json({ error: 'Your sign-in link has expired. Ask for a new one.' });
  if (!store.on()) return res.status(503).json({ error: 'Orders are not available right now.' });
  const email = String(t.e).trim().toLowerCase();
  try {
    const list = await mine(email);
    if (req.method === 'POST') {
      const x = list.filter((o) => o.s.n === String(b.n || ''))[0];
      if (!x) return res.status(404).json({ error: 'That order was not found under your email.' });
      if (sent(x.m)) return res.status(400).json({ error: 'This order has already shipped (or its label is bought), so the address can no longer change. Reply to your order email and we will help.' });
      const inv = invOf(x.d), was = inv && Array.isArray(inv.a) ? inv.a : null;
      if (!was || !was[2] || (inv && inv.wa)) return res.status(400).json({ error: 'This order does not ship to a mailing address.' });
      const a = b.addr || {}, cc = String((x.m.addr && x.m.addr[7]) || was[7] || 'US'), us = cc === 'US';
      const f = { name: s(a.name, 80).trim(), street: s(a.street, 120).trim(), line2: s(a.line2, 60).trim(), city: s(a.city, 60).trim(), state: s(a.state, 30).trim(), zip: s(a.zip, 12).trim() };
      if (!f.name) return res.status(400).json({ error: 'Enter the name for the label.' });
      if (us ? (!/[0-9]/.test(f.street) || !/[A-Za-z]/.test(f.street)) : f.street.length < 4) return res.status(400).json({ error: us ? 'Enter the street address with its number, for example 120 Main St.' : 'Enter the street address.' });
      if (f.city.length < 2) return res.status(400).json({ error: 'Enter the city.' });
      if (us && f.state.length < 2) return res.status(400).json({ error: 'Enter the state.' });
      if (us && !/^[0-9]{5}(-[0-9]{4})?$/.test(f.zip)) return res.status(400).json({ error: 'Enter a 5-digit ZIP code.' });
      const addr = [f.name, (x.m.addr ? x.m.addr[1] : was[1]) || '', f.street, f.line2, f.city, f.state, f.zip].concat(cc !== 'US' ? [cc] : []);
      const line = require('./_offline').shipLine({ a: addr });
      await store.write('meta/' + x.s.n + '.json', Object.assign({}, x.m, { addr: addr, addrAt: Date.now(), addrWas: x.d.ship || '' }));
      await store.write(x.s.path, Object.assign({}, x.d, { ship: line }));
      console.log('ADDRESS_CHANGED', x.s.n);
      try { await require('./_discord')('**ADDRESS CHANGED** order ' + x.s.n + ' · ' + (x.d.product || '') + '\nNew: ' + line + '\nWas: ' + (x.d.ship || '-')); } catch (e) { /* the ping is extra */ }
      return res.json({ ok: true, ship: line });
    }
    const orders = list.map((x) => {
      const d = x.d, m = x.m, due = /payment due/i.test(d.status || '');
      const paidNow = !due || m.paidAt || m.shippedAt || m.labelPdf || (m.tracking && !m.testLabel);
      const shipped = (m.tracking && !m.testLabel) || m.shippedAt || m.nftSentAt;
      const status = shipped ? (m.nftSentAt && !m.tracking ? 'NFT sent' : 'Shipped' + (m.tracking ? ' (tracking ' + m.tracking + ')' : '')) : paidNow ? 'Paid, getting ready to ship' : 'Payment due';
      const total = num(d.total), inv = sent(m) ? null : invOf(d), cur = m.addr || (inv && inv.a) || null;
      return {
        at: d.at || x.s.at || 0,
        invoice: s(x.s.n), placed: s(d.placed || new Date(d.at || x.s.at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })),
        product: s(d.product || x.s.pid), productNo: s(x.s.pid), units: s(x.s.q), plan: s(d.pay),
        total: total.toFixed(2), paid: (paidNow ? total : num(d.paid)).toFixed(2), balance: (paidNow ? 0 : Math.max(0, total - num(d.paid))).toFixed(2),
        status: status, proof: /^https:\/\//.test(s(d.proof)) ? s(d.proof) : '', ship: s(d.ship),
        // Not shipped yet and going to a mailing address: the address can still change.
        edit: !sent(m) && Array.isArray(cur) && !!cur[2] && !(inv && inv.wa) ? { name: cur[0], street: cur[2], line2: cur[3] || '', city: cur[4], state: cur[5], zip: cur[6], intl: !!(cur[7] && cur[7] !== 'US') } : null
      };
    }).sort((a, z) => z.at - a.at);
    res.json({ email: t.e, orders: orders });
  } catch (e) {
    console.error('ORDERS_FAIL', String(e && e.message || e));
    res.status(503).json({ error: 'Could not load your orders right now. Try again shortly.' });
  }
};
