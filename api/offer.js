// Offers. A buyer names a price for a product (POST). An offer under the floor is declined on the spot.
// Any other offer is emailed to the owner with a private review link, where the owner accepts or declines.
// An accepted offer gives the buyer a checkout link that locks in the offered price for a limited time.
//
// The floor ("decline anything below this") is, per product, the "minOffer" value from the sheet if it has one,
// otherwise OFFER_MIN_PERCENT percent of the list price. With neither set, nothing is declined automatically.
const crypto = require('crypto');
const { getInventory, sign, verify, sheetPost, mail } = require('./_lib');
const offline = require('./_offline');

// Hours an accepted offer stays good for checkout.
const HOLD_HOURS = 48;
const money = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (cents) => (cents / 100).toFixed(2);
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const owner = () => (process.env.OWNER_EMAIL || '').trim();
// What a buyer can say they will pay with, and the checkout option each one opens.
const PAYS = { 'Zelle': 'zelle', 'Venmo': 'venmo', 'Cash App': 'cashapp', 'Cash or ACH': 'cash', 'Ethereum': 'crypto', 'USDC': 'crypto', 'USDT': 'crypto', 'Card': 'card' };

async function floorCents(p) {
  const url = (process.env.SHEET_WEBHOOK_URL || '').trim();
  if (url) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
      const j = await r.json();
      const row = (Array.isArray(j.products) ? j.products : []).filter((x) => String(x.id || '').trim() === p.id)[0];
      const v = row ? Number(row.minOffer != null ? row.minOffer : row.min_offer) : 0;
      if (v > 0) return Math.round(v * 100);
    } catch (e) { console.error('FLOOR_FAIL', String(e && e.message || e)); }
  }
  const pct = Number(process.env.OFFER_MIN_PERCENT);
  return pct > 0 && pct <= 100 ? Math.ceil(p.cents * pct / 100) : 0;
}

// One line per offer event in the Offers tab of the sheet.
function log(o, status, key) {
  const when = new Date().toLocaleString('en-US', { timeZone: process.env.LEADS_TZ || 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });
  return sheetPost({
    tab: 'Offers', key: key || o.n,
    headers: ['When', 'Offer', 'Product No', 'Product', 'Units', 'List price (USD)', 'Offer per unit (USD)', 'Offer total (USD)', 'Buyer', 'Email', 'Status', 'Pay with'],
    row: [when, o.n, o.pid, o.i, o.q, usd(o.l), usd(o.c), usd(o.c * o.q), o.b, o.e, status, o.w || '']
  });
}
const view = (o) => ({ no: o.n, product: o.pid, item: o.i, qty: o.q, list: usd(o.l), offer: usd(o.c), total: usd(o.c * o.q), buyer: o.b, email: o.e, pay: o.w || '' });

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const now = Math.floor(Date.now() / 1000);
  const host = 'https://' + req.headers.host;

  if (req.method === 'GET') {
    // t: the owner's review link. a: the buyer's accepted-offer checkout link.
    const o = verify(req.query.t);
    if (o && o.o === 1) return res.json({ offer: view(o) });
    const a = verify(req.query.a);
    if (a && a.oa === 1) return res.json({ deal: { no: a.n, product: a.pid, qty: a.q, price: usd(a.c), expired: now > a.x } });
    return res.status(400).json({ error: 'This offer link is not valid.' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const b = req.body && typeof req.body === 'object' ? req.body : {};

  // The owner accepts or declines from the review page.
  if (b.t) {
    const o = verify(b.t);
    if (!o || o.o !== 1) return res.status(400).json({ error: 'This offer link is not valid.' });
    if (b.do === 'accept') {
      const deal = sign({ oa: 1, n: o.n, pid: o.pid, q: o.q, c: o.c, x: now + HOLD_HOURS * 3600 });
      const link = host + '/order.html?offer=' + deal + (PAYS[o.w] ? '&method=' + PAYS[o.w] : '');
      const out = await Promise.all([mail(o.e, 'Your offer on ' + o.i + ' was accepted', [
        'Good news: your offer of ' + money(o.c) + ' each for ' + o.q + ' x ' + o.i + ' was accepted.', '',
        'Finish your order at that price here. The link is good for ' + HOLD_HOURS + ' hours:', link, '',
        'The piece is not held until you check out.'
      ], hash('offer-yes|' + o.n)), log(o, 'Accepted', o.n + '-accepted')]);
      return res.json({ ok: true, done: 'accepted', emailed: out[0] });
    }
    if (b.do === 'decline') {
      const out = await Promise.all([mail(o.e, 'About your offer on ' + o.i, [
        'Thanks for your offer of ' + money(o.c) + ' each for ' + o.q + ' x ' + o.i + '.', '',
        'We are not able to accept it this time. You are welcome to send another offer, or buy it at the listed price:', host + '/order.html?product=' + encodeURIComponent(o.pid)
      ], hash('offer-no|' + o.n)), log(o, 'Declined', o.n + '-declined')]);
      return res.json({ ok: true, done: 'declined', emailed: out[0] });
    }
    return res.status(400).json({ error: 'Choose accept or decline.' });
  }

  // A buyer sends a new offer.
  if (b.website) return res.status(400).json({ error: 'Could not send this offer.' });
  if (!offline.offersOpen()) return res.status(503).json({ error: 'Offers are not open yet. You can still buy at the listed price.' });
  const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const name = clip(b.name, 80), email = clip(b.email, 160);
  if (!name) return res.status(400).json({ error: 'Enter your name above first.' });
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return res.status(400).json({ error: 'Enter your email above first.' });
  let products;
  try { products = await getInventory(true); } catch (e) { return res.status(503).json({ error: 'Offers are not available right now. Please try again shortly.' }); }
  const p = products.filter((x) => x.id === clip(b.product, 20))[0];
  if (!p) return res.status(400).json({ error: 'Choose a product.' });
  if ((await offline.deals(products)).state[p.id] === 'locked') return res.status(400).json({ error: 'This deal is still locked. It opens when the one before it is claimed.' });
  const qty = Number(b.qty);
  if (!Number.isInteger(qty) || qty < p.min) return res.status(400).json({ error: 'Quantity must be a whole number of at least ' + p.min + '.' });
  if (qty > p.stock) return res.status(409).json({ error: p.stock > 0 ? 'Only ' + p.stock + (p.stock === 1 ? ' unit is' : ' units are') + ' in stock right now.' : 'This product is sold out right now.' });
  const cents = Math.round(Number(b.offer) * 100);
  if (!(cents > 0)) return res.status(400).json({ error: 'Enter your offer as a dollar amount.' });
  if (cents >= p.cents) return res.json({ status: 'buy', message: 'That is our listed price or more, so there is no need for an offer. Just place the order.' });

  // How they plan to pay, so the owner can weigh it with the price.
  const pay = clip(b.pay, 20);
  if (!PAYS[pay]) return res.status(400).json({ error: 'Choose how you would pay.' });
  const o = { o: 1, w: pay, n: 'F' + Date.now().toString(36).toUpperCase(), pid: p.id, i: p.name, q: qty, c: cents, l: p.cents, b: name, e: email, t: now };
  const floor = await floorCents(p);
  if (floor && cents < floor) {
    await log(o, 'Declined automatically (below your minimum)');
    return res.json({ status: 'declined', message: 'Thanks, but that is lower than we can go on this piece. You are welcome to try a higher offer.' });
  }
  const review = host + '/offer.html?t=' + sign(o);
  const out = await Promise.all([mail(owner(), 'Offer: ' + money(cents) + ' each for ' + qty + ' x ' + p.name, [
    name + ' <' + email + '> offered ' + money(cents) + ' each for ' + qty + ' x ' + p.name + '.', '',
    'Listed price: ' + money(p.cents) + ' each', 'Offer total: ' + money(cents * qty), 'Wants to pay with: ' + pay, '',
    'Accept or decline here:', review
  ], hash('offer-new|' + o.n)), log(o, 'Waiting for your answer')]);
  if (out[0] !== 'sent') return res.status(503).json({ error: 'We could not send your offer just now. Please try again shortly.' });
  res.json({ status: 'sent', message: 'Offer sent. We will email ' + email + ' with our answer.' });
};
