// Signed-in customers: list the orders placed with their email, read from the shop's own order records
// (the same ones the back office shows). Newest first. Cancelled orders are not listed.
const { verify } = require('./_lib');
const store = require('./_store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const t = verify(req.query.t);
  const now = Math.floor(Date.now() / 1000);
  if (!t || t.a !== 1 || !t.e || !(t.x > now)) return res.status(401).json({ error: 'Your sign-in link has expired. Ask for a new one.' });
  if (!store.on()) return res.status(503).json({ error: 'Orders are not available right now.' });
  const email = String(t.e).trim().toLowerCase();
  try {
    const all = await store.sales(), mine = [];
    for (let i = 0; i < all.length; i += 40) {
      const part = all.slice(i, i + 40), got = await Promise.all(part.map((s) => store.read(s.path)));
      got.forEach((d, k) => { if (d && String(d.email || '').trim().toLowerCase() === email) mine.push({ s: part[k], d: d }); });
    }
    const metas = await Promise.all(mine.map((x) => store.read('meta/' + x.s.n + '.json')));
    const s = (v) => String(v == null ? '' : v).slice(0, 300);
    const num = (v) => Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')) || 0;
    const orders = mine.map((x, i) => {
      const d = x.d, m = metas[i] || {}, due = /payment due/i.test(d.status || '');
      const paidNow = !due || m.paidAt || m.shippedAt || m.labelPdf || (m.tracking && !m.testLabel);
      const shipped = (m.tracking && !m.testLabel) || m.shippedAt || m.nftSentAt;
      const status = shipped ? (m.nftSentAt && !m.tracking ? 'NFT sent' : 'Shipped' + (m.tracking ? ' (tracking ' + m.tracking + ')' : '')) : paidNow ? 'Paid, getting ready to ship' : 'Payment due';
      const total = num(d.total);
      return {
        at: d.at || x.s.at || 0,
        invoice: s(x.s.n), placed: s(d.placed || new Date(d.at || x.s.at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })),
        product: s(d.product || x.s.pid), productNo: s(x.s.pid), units: s(x.s.q), plan: s(d.pay),
        total: total.toFixed(2), paid: (paidNow ? total : num(d.paid)).toFixed(2), balance: (paidNow ? 0 : Math.max(0, total - num(d.paid))).toFixed(2),
        status: status, proof: /^https:\/\//.test(s(d.proof)) ? s(d.proof) : ''
      };
    }).sort((a, b) => b.at - a.at);
    res.json({ email: t.e, orders: orders });
  } catch (e) {
    console.error('ORDERS_FAIL', String(e && e.message || e));
    res.status(503).json({ error: 'Could not load your orders right now. Try again shortly.' });
  }
};
