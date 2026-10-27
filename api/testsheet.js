// The shop's built-in product list. It stands in for the owner's Google Sheet and answers like the sheet's web app:
// GET lists the products, POST accepts an order or offer row and says ok. Used while SHEET_WEBHOOK_URL points here.
// Each order is kept in the site's own ledger (see _store.js), so stock goes down as pieces sell and the
// Deal of the day safes move on. "stock" below is the starting count. Offers are only written to the function log.
const store = require('./_store');
const party = require('./_party');
const { mail, verify } = require('./_lib');
const PRODUCTS = require('./_products');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    // Only rows this server wrote (signed in _lib.js sheetPost) are taken. Anything else is refused: a buyer must not
    // be able to mark their own order paid or shipped, or rewrite its total, by posting here with their invoice link.
    const crypto = require('crypto'), want = require('./_lib').sheetSig(JSON.stringify(b));
    const got = String(req.headers['x-v2v-sig'] || '');
    if (!want || got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) { console.error('SHEET_REFUSED', req.headers['x-forwarded-for'] || ''); return res.status(403).send('refused'); }
    console.log('TEST_SHEET', b.tab || '', b.key || '');
    res.setHeader('content-type', 'text/plain');
    // An order row: keep it in the ledger so the units come out of stock.
    const pid = b.stock && String(b.stock.product || ''), qty = b.stock && Math.floor(Number(b.stock.qty)), key = String(b.key || ''), row = Array.isArray(b.row) ? b.row : [];
    // Only a real order counts: its row carries the label link, which holds the invoice signed by this site.
    let inv = null;
    try { inv = verify(new URL(String(row[17] || '')).searchParams.get('inv')); } catch (e) { inv = null; }
    const real = !!inv && inv.n === key && inv.pid === pid && Number(inv.q) === qty;
    // A shipping label was bought (see label.js): keep the tracking number with the order. An order that was
    // waiting on a by-hand payment counts as paid from here on. Notes sit beside the sale file, which never changes.
    if (b.tab === 'Labels' && store.on()) {
      const li = verify(String(row[5] || ''));
      if (li && li.n && li.n === row[1] && /^[A-Z0-9]{4,20}$/.test(li.n)) {
        try {
          const was = (await store.read('meta/' + li.n + '.json')) || {};
          await store.write('meta/' + li.n + '.json', Object.assign(was, { tracking: String(row[3] || ''), labelPdf: String(row[4] || ''), testLabel: row[2] === 'Test label', shippedAt: Date.now() }, was.paidAt ? {} : { paidAt: Date.now(), paidHow: 'label' }));
        } catch (e) { console.error('LABEL_NOTE_FAIL', li.n, String(e && e.message || e)); }
      }
      return res.send('ok');
    }
    if (b.tab === 'Orders' && real && /^[A-Za-z0-9_-]{1,20}$/.test(pid || '') && /^[A-Z0-9]{4,20}$/.test(key) && qty > 0 && store.on()) {
      try {
        await store.addSale(pid, key, qty, { n: key, pid: pid, q: qty, at: Date.now(), placed: row[0] || '', product: row[3] || '', pay: row[5] || '', items: row[6] || '', shipping: row[7] || '', total: row[8] || '', paid: row[9] || '', buyer: row[11] || '', email: row[12] || '', status: row[13] || '', proof: row[14] || '', promo: row[15] || '', ship: row[16] || '', label: row[17] || '' });
      } catch (e) {
        console.error('LEDGER_FAIL', key, String(e && e.message || e));
        return res.send('error');
      }
      // A party piece: tell the buyer what they are in for.
      if (pid === party.PARTY.pid && Date.now() >= party.PARTY.starts && Date.now() <= party.PARTY.ends && row[12]) {
        const p = PRODUCTS.filter((x) => x.id === pid)[0];
        try {
          const st = await party.state(p ? Math.round(p.price * 100) : 0);
          await mail(row[12], 'You are in the party: ' + (p ? p.name : 'your order'), ['Thanks for your order ' + key + '.', '', st.note, '', 'We will email you when the party ends with the amount coming back to you.'], 'party-in-' + key);
        } catch (e) { console.error('PARTY_MAIL_FAIL', key, String(e && e.message || e)); }
      }
    }
    return res.send('ok');
  }
  if (req.query && req.query.signed) return res.json({});
  // The My orders page asks for a buyer's past orders. None are listed here.
  if (req.query && req.query.orders != null) return res.json({ orders: [] });
  // Stock is the starting count less what the ledger says has sold. If the ledger cannot be read, the starting count is used.
  let sold = {};
  try { sold = await store.soldBy(); } catch (e) { console.error('LEDGER_READ_FAIL', String(e && e.message || e)); }
  res.json({ products: PRODUCTS.map((p) => Object.assign({}, p, { stock: Math.max(0, p.stock - (sold[p.id] || 0)) })) });
};
module.exports.PRODUCTS = PRODUCTS;
