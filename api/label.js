// Owner only: price and buy a postage-paid USPS label for an order through Shippo.
// GET  ?inv=<invoice>&k=<owner key>  prices the label (nothing is bought) and says what it will cost.
// POST { inv, k, rate }              buys that label and returns the printable PDF and the tracking number.
// The owner key comes only in the owner's new-order email and the Orders sheet, so a buyer cannot buy labels.
//
// Settings (Vercel environment variables):
//   SHIPPO_API_KEY  Shippo token. A token starting with shippo_test_ makes free sample labels that cannot be mailed.
//   SHIP_FROM       JSON: {"name","street1","street2","city","state","zip","phone"} - where packages ship from.
//   A product can override the package in the sheet with its own weight_oz and box (a USPS flat rate box).
//   SHIP_PARCEL     JSON: {"length","width","height","weight_oz"} in inches and ounces. Defaults to a 9 x 6 x 1 in, 4 oz mailer.
const { verify, mail, sheetPost } = require('./_lib');
const offline = require('./_offline');

const API = 'https://api.goshippo.com';
const key = () => (process.env.SHIPPO_API_KEY || '').trim();
const isTest = () => key().indexOf('shippo_test_') === 0;
function json(name) { try { const v = JSON.parse(process.env[name] || ''); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
function shipFrom() {
  const f = json('SHIP_FROM');
  if (!f || !f.street1 || !f.city || !f.state || !f.zip) return null;
  return { name: String(f.name || process.env.BRAND_NAME || 'JarFriends'), street1: String(f.street1), street2: String(f.street2 || ''), city: String(f.city), state: String(f.state), zip: String(f.zip), country: 'US', phone: String(f.phone || ''), email: (process.env.OWNER_EMAIL || '').trim() };
}
// The default package, changed by whatever the product sets for itself. pkg is how the owner page words it.
async function parcel(inv) {
  const p = json('SHIP_PARCEL') || {};
  const n = (v, d) => (Number(v) > 0 ? String(Number(v)) : d);
  const out = { length: n(p.length, '9'), width: n(p.width, '6'), height: n(p.height, '1'), distance_unit: 'in', weight: n(p.weight_oz, '4'), mass_unit: 'oz' };
  const own = await offline.parcelFor(inv.pid, inv.q);
  if (own.oz) out.weight = String(own.oz);
  if (own.template) { delete out.length; delete out.width; delete out.height; delete out.distance_unit; out.template = own.template; }
  return { parcel: out, pkg: (own.template ? own.name : out.length + ' x ' + out.width + ' x ' + out.height + ' in') + ', ' + out.weight + ' oz' };
}
async function shippo(path, body) {
  const r = await fetch(API + path, { method: 'POST', signal: AbortSignal.timeout(25000), headers: { authorization: 'ShippoToken ' + key(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Shippo answered ' + r.status + ': ' + JSON.stringify(j).slice(0, 300));
  return j;
}
const notes = (j) => (Array.isArray(j && j.messages) ? j.messages.map((m) => m && m.text).filter(Boolean).join(' ') : '');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const b = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
  const inv = verify(req.method === 'POST' ? b.inv : req.query.inv);
  const own = verify(req.method === 'POST' ? b.k : req.query.k);
  if (!inv || !inv.n) return res.status(400).json({ error: 'This label link is not valid.' });
  if (!own || own.lb !== 1 || own.n !== inv.n) return res.status(403).json({ error: 'This link cannot buy labels. Use the link from your new-order email.' });
  const to = offline.shipTo(inv);
  if (!to) return res.status(400).json({ error: 'This order has no shipping address on it.' });
  if (!key()) return res.status(503).json({ error: 'Shippo is not connected yet. Add SHIPPO_API_KEY in Vercel, then redeploy.' });
  const from = shipFrom();
  if (!from) return res.status(503).json({ error: 'The ship-from address is not set yet. Add SHIP_FROM in Vercel, then redeploy.' });
  const pk = await parcel(inv);
  const order = { no: inv.n, item: inv.i, qty: inv.q, to: to, from: from, parcel: pk.parcel, pkg: pk.pkg, test: isTest() };

  if (req.method === 'GET') {
    try {
      const s = await shippo('/shipments/', {
        address_from: from,
        address_to: { name: to.name, company: to.company, street1: to.street, street2: to.line2, city: to.city, state: to.state, zip: to.zip, country: 'US', email: inv.e || '' },
        parcels: [order.parcel], async: false
      });
      const rates = (Array.isArray(s.rates) ? s.rates : []).filter((r) => r && r.object_id && Number(r.amount) > 0);
      const usps = rates.filter((r) => String(r.provider || '').toUpperCase() === 'USPS');
      const pick = (usps.length ? usps : rates).sort((a, c) => Number(a.amount) - Number(c.amount))[0];
      if (!pick) return res.status(502).json({ error: 'Shippo gave no USPS price for this address. ' + notes(s), order: order });
      return res.json({ order: order, rate: { id: pick.object_id, carrier: pick.provider, service: (pick.servicelevel && pick.servicelevel.name) || '', amount: Number(pick.amount).toFixed(2), days: pick.estimated_days || null } });
    } catch (e) {
      console.error('LABEL_QUOTE_FAIL', String(e && e.message || e));
      return res.status(502).json({ error: 'Could not price the label. ' + String(e && e.message || e), order: order });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!b.rate) return res.status(400).json({ error: 'Price the label first.' });
  // One label per order: the sheet refuses a second row with the same key. b.again lets the owner buy a replacement on purpose.
  const guard = await sheetPost({ tab: 'Labels', key: 'label-' + inv.n + (b.again ? '-' + Date.now() : ''), headers: ['When', 'Invoice', 'Status', 'Tracking', 'Label'], row: [new Date().toISOString(), inv.n, 'Buying', '', ''] });
  if (guard === 'duplicate') return res.status(409).json({ error: 'A label was already bought for this order. Reprint it from your Shippo account, or buy a replacement.', again: true });
  try {
    const t = await shippo('/transactions/', { rate: String(b.rate), label_file_type: 'PDF_4x6', async: false, metadata: 'Invoice ' + inv.n });
    if (t.status !== 'SUCCESS' || !t.label_url) return res.status(502).json({ error: 'Shippo did not make the label. ' + notes(t) });
    const out = { label: t.label_url, tracking: t.tracking_number || '', track: t.tracking_url_provider || '', test: isTest() };
    console.log('LABEL', JSON.stringify({ invoice: inv.n, tracking: out.tracking, test: out.test }));
    const jobs = [sheetPost({ tab: 'Labels', key: 'label-' + inv.n + '-' + (out.tracking || Date.now()), headers: ['When', 'Invoice', 'Status', 'Tracking', 'Label'], row: [new Date().toISOString(), inv.n, out.test ? 'Test label' : 'Bought', out.tracking, out.label] })];
    // Real labels only: tell the buyer it is on the way.
    if (!out.test && inv.e && out.tracking) jobs.push(mail(inv.e, 'Your order ' + inv.n + ' is on its way', [
      'Good news: ' + (inv.i || 'your order') + (inv.q ? ' x ' + inv.q : '') + ' has a shipping label and is heading out by ' + 'USPS.', '',
      'Tracking number: ' + out.tracking].concat(out.track ? ['Track it here:', out.track] : []), 'shipped|' + inv.n + '|' + out.tracking));
    const done = await Promise.all(jobs);
    out.emailed = done[1] || 'off';
    return res.json(out);
  } catch (e) {
    console.error('LABEL_BUY_FAIL', String(e && e.message || e));
    return res.status(502).json({ error: 'Could not buy the label. ' + String(e && e.message || e) });
  }
};
