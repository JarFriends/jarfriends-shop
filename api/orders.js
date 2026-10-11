// Signed-in customers: list the orders placed with their email, read from the Orders tab.
const { verify } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const t = verify(req.query.t);
  const now = Math.floor(Date.now() / 1000);
  if (!t || t.a !== 1 || !t.e || !(t.x > now)) return res.status(401).json({ error: 'Your sign-in link has expired. Ask for a new one.' });
  const url = (process.env.SHEET_WEBHOOK_URL || '').trim();
  if (!url) return res.status(503).json({ error: 'Orders are not available right now.' });
  try {
    const r = await fetch(url + '?orders=' + encodeURIComponent(t.e), { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
    const j = await r.json();
    if (!Array.isArray(j.orders)) throw new Error('No orders list in reply');
    const s = (v) => String(v == null ? '' : v).slice(0, 300);
    const orders = j.orders.map((o) => ({
      invoice: s(o['Invoice']), placed: s(o['Placed']), product: s(o['Product']), productNo: s(o['Product No']), units: s(o['Units']), plan: s(o['Plan']),
      total: s(o['Order total (USD)']), paid: s(o['Deposit paid (USD)']), balance: s(o['Balance due (USD)']), status: s(o['Status']),
      proof: /^https:\/\//.test(s(o['Proof'])) ? s(o['Proof']) : ''
    })).reverse();
    res.json({ email: t.e, orders: orders });
  } catch (e) {
    console.error('ORDERS_FAIL', String(e && e.message || e));
    res.status(503).json({ error: 'Could not load your orders right now. Try again shortly.' });
  }
};
