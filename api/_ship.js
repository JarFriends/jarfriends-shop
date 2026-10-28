// Seller shipping, the eBay way.
//
// Each seller listing picks how buyers pay for shipping:
//   free  - the buyer pays nothing for shipping; the seller still pays for the label
//   flat  - the buyer pays a set price ("shipping" on the listing), whatever the label costs
//   calc  - the buyer pays the live USPS price from the seller's ZIP to their address (worked out at checkout)
// Each listing also has a package (a preset or its own weight and size), used for calculated prices and labels.
//
// The seller buys the label from their portal ("Buy shipping label"). V2V's own Shippo account (SHIPPO_API_KEY) buys
// it, and the seller pays for it: first out of the money V2V is holding for them (sales paid by Zelle, Venmo, Cash
// App, cash or crypto, not yet sent to them), and whatever that does not cover is charged to the card saved on their
// account (My account, How I pay). The label is the seller's cost whatever the buyer paid for shipping.
//
// meta/<invoice>.json gets { tracking, labelPdf, labelTx, shippedAt, shippedBy, labelCost, labelFromEarnings,
// labelFromCard, labelCardPi } when a seller buys a label.
const store = require('./_store');
const M = require('./_sellers');

const API = 'https://api.goshippo.com';
const key = () => (process.env.SHIPPO_API_KEY || '').trim();
const ready = () => !!key();
const isTest = () => key().indexOf('shippo_test_') === 0;

// Package presets, in inches and ounces. "oz" is the weight of one piece packed; more pieces add weight.
const PRESETS = {
  envelope: { name: 'Card in a toploader (rigid envelope)', length: 7, width: 5, height: 0.5, oz: 3 },
  mailer: { name: 'Small padded mailer', length: 10, width: 7, height: 1, oz: 6 },
  slab: { name: 'Graded slab in a small box', length: 9, width: 6, height: 3, oz: 12 },
  smallbox: { name: 'Small box', length: 8, width: 6, height: 4, oz: 16 },
  box: { name: 'Medium box', length: 12, width: 10, height: 6, oz: 32 }
};
// A listing's package: its preset with its own weight, or its own size.
function packageOf(listing, q) {
  const pk = (listing && listing.pkg) || {};
  const base = PRESETS[pk.preset] || PRESETS.mailer;
  const n = (v, d, max) => { const x = Number(v); return x > 0 && x <= max ? Math.round(x * 10) / 10 : d; };
  q = Math.max(1, Number(q) || 1);
  const oz = n(pk.oz, base.oz, 1120);
  return { length: String(n(pk.length, base.length, 108)), width: String(n(pk.width, base.width, 108)), height: String(n(pk.height, base.height, 108)), distance_unit: 'in',
    weight: String(Math.round(oz * (1 + (q - 1) * 0.8) * 10) / 10), mass_unit: 'oz' };
}
// The seller's ship-from address, from their shop settings.
// A seller based outside the USA ships from their own country: its 2-letter code, from what they typed ("Canada" → CA).
let CC = null;
function countryCode(v) {
  const s = String(v || '').trim(); if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase() === 'UK' ? 'GB' : s.toUpperCase();
  if (!CC) { CC = {}; try { const dn = new Intl.DisplayNames(['en'], { type: 'region' }); for (let a = 65; a < 91; a++) for (let b = 65; b < 91; b++) { const c = String.fromCharCode(a, b); try { const nm = dn.of(c); if (nm && nm !== c && !CC[nm.toLowerCase()]) CC[nm.toLowerCase()] = c; } catch (e) { /* not a code */ } } } catch (e) { /* no Intl */ } CC['uk'] = 'GB'; CC['england'] = 'GB'; CC['usa'] = 'US'; }
  return CC[s.toLowerCase()] || '';
}
function fromOf(seller) {
  const f = seller && seller.shipFrom, abroad = seller && seller.based === 'intl';
  if (!f || !f.street1 || !f.city || !f.zip || (!abroad && !f.state)) return null;
  const country = abroad ? countryCode(f.country || seller.country) || 'US' : 'US';
  return { name: f.name || seller.name, street1: f.street1, street2: f.street2 || '', city: f.city, state: f.state || '', zip: f.zip, country: country, phone: f.phone || '', email: seller.email };
}

// For a checkout price only: the seller's ship-from, or VeeFam's own address (SHIP_FROM) when the seller has not
// added theirs yet. They add it when they buy the label, which always uses their own address.
function fromForQuote(seller) {
  const f = fromOf(seller); if (f) return f;
  try { const d = JSON.parse(process.env.SHIP_FROM || '{}'); if (d.street1 && d.city && d.state && d.zip) return { name: d.name || 'VeeFam', street1: d.street1, street2: d.street2 || '', city: d.city, state: d.state, zip: d.zip, country: 'US', phone: d.phone || '', email: '' }; } catch (e) { /* not set */ }
  return null;
}
async function shippo(path, body) {
  const r = await fetch(API + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(25000), headers: { authorization: 'ShippoToken ' + key(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Shippo answered ' + r.status + ': ' + JSON.stringify(j).slice(0, 300));
  return j;
}
// The cheapest USPS rate for a package, from one address to another.
async function cheapest(from, to, parcel) {
  const s = await shippo('/shipments/', { address_from: from, address_to: to, parcels: [parcel], async: false });
  const rates = (Array.isArray(s.rates) ? s.rates : []).filter((r) => r && r.object_id && Number(r.amount) > 0);
  const usps = rates.filter((r) => String(r.provider || '').toUpperCase() === 'USPS');
  const pick = (usps.length ? usps : rates).sort((a, c) => Number(a.amount) - Number(c.amount))[0];
  if (!pick) throw new Error('no USPS price for this address');
  return { id: pick.object_id, cents: Math.round(Number(pick.amount) * 100), service: ((pick.provider || '') + ' ' + ((pick.servicelevel && pick.servicelevel.name) || '')).trim(), days: pick.estimated_days || null, options: choices(rates) };
}


// Every carrier choice for a label, cheapest first, one per carrier and service (up to 6), so the seller can pick.
const choices = (rates) => { const seen = {}; return rates.slice().sort((a, c) => Number(a.amount) - Number(c.amount)).filter((r) => { const k = (r.provider || '') + '|' + ((r.servicelevel && r.servicelevel.name) || ''); if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 6)
  .map((r) => ({ id: r.object_id, cents: Math.round(Number(r.amount) * 100), service: ((r.provider || '') + ' ' + ((r.servicelevel && r.servicelevel.name) || '')).trim(), days: r.estimated_days || null })); };
// ---- Outside the USA (sellers who tick "Ship internationally" in Shop settings) ----
// A Shippo customs declaration is made for the package (what is inside, its value, weight; certified by the seller),
// so the label comes with its customs form. USPS first, any carrier if USPS has no price.
// Ships abroad: the seller's choice in Shop settings; sellers based outside the USA ship internationally unless they turn it off.
const shipsIntl = (s) => (s && s.shipIntl != null ? !!s.shipIntl : !!(s && s.based === 'intl'));
async function intlRate(seller, listing, to, qty, value, item, quoteOnly) {
  const from = quoteOnly ? fromForQuote(seller) : fromOf(seller);
  if (!from) throw new Error('no ship-from address');
  const parcel = packageOf(listing, qty);
  const cd = await shippo('/customs/declarations/', {
    contents_type: 'MERCHANDISE', non_delivery_option: 'RETURN', certify: true, certify_signer: from.name, incoterm: 'DDU', eel_pfc: 'NOEEI_30_37_a',
    items: [{ description: ('Collectible ' + String(item || 'collectible')).slice(0, 45), quantity: Math.max(1, Number(qty) || 1), net_weight: String(parcel.weight), mass_unit: 'oz',
      value_amount: (Math.max(100, Number(value) || 0) / 100).toFixed(2), value_currency: 'USD', origin_country: from.country || 'US' }]
  });
  const s = await shippo('/shipments/', { address_from: from, address_to: to, parcels: [parcel], customs_declaration: cd.object_id, async: false });
  const rates = (Array.isArray(s.rates) ? s.rates : []).filter((r) => r && r.object_id && Number(r.amount) > 0);
  const usps = rates.filter((r) => String(r.provider || '').toUpperCase() === 'USPS');
  const pick = (usps.length ? usps : rates).sort((a, c) => Number(a.amount) - Number(c.amount))[0];
  if (!pick) throw new Error('no price to that address');
  return { options: choices(rates), id: pick.object_id, cents: Math.round(Number(pick.amount) * 100), service: ((pick.provider || '') + ' ' + ((pick.servicelevel && pick.servicelevel.name) || '')).trim(), days: pick.estimated_days || null, parcel: parcel };
}
// Checkout: what an international buyer pays to ship a seller's piece: the real postage plus 10% (prices can move
// a little before the seller buys the label). Customs duties are the buyer's (DDU).
async function quoteIntl(o) {
  if (!ready()) return { error: 'Shipping outside the USA is not available right now.' };
  const listing = (await M.listings()).filter((x) => x.id === o.pid)[0];
  const seller = listing && (await M.bySlug(listing.seller));
  if (!seller || !shipsIntl(seller)) return { error: 'This seller ships inside the USA only.' };
  // A seller based outside the USA ships their own way: the buyer pays the shipping price on the listing.
  if (seller.based === 'intl') return { cents: listing.shipping === 'free' ? 0 : Math.round(Number(listing.shipping) * 100) || 0, service: 'Seller ships from ' + (seller.country || 'outside the USA') };
  if (!fromForQuote(seller)) return { error: 'This seller has not finished setting up shipping yet.' };
  try {
    const r = await intlRate(seller, listing, o.to, o.qty, o.value, o.item, true);
    return { cents: Math.ceil(r.cents * 1.10), base: r.cents / 100, service: r.service };
  } catch (e) { console.error('SELLER_INTL_QUOTE_FAIL', o.pid, String(e && e.message || e)); return { error: 'We could not get a shipping price to that address. Check the address and try again.' }; }
}

// Checkout: the calculated shipping for a seller's piece, or null when the piece has a set price (free or flat).
// to: { name, street1, street2, city, state, zip }. Prices are remembered for 10 minutes per address and package.
const memo = new Map();
async function calcFor(pid, to, qty) {
  if (!M.isSellerPid(pid)) return null;
  const listing = (await M.listings()).filter((x) => x.id === pid)[0];
  if (!listing || listing.shipMode !== 'calc') return null;
  if (!ready()) return { error: 'Shipping cannot be priced right now. Try again later.' };
  const seller = await M.bySlug(listing.seller);
  // No ship-from address yet: the checkout price comes from VeeFam's own address (close enough for USPS inside the
  // USA). The seller adds theirs when they buy the label.
  const from = fromForQuote(seller);
  if (!from) return { error: 'This seller has not finished setting up shipping yet.' };
  if (!/^[0-9]{5}(-[0-9]{4})?$/.test(String(to.zip || '')) || String(to.street1 || '').length < 4) return { error: 'Enter your full address to see the shipping price.' };
  const parcel = packageOf(listing, qty);
  const k = [pid, qty, to.street1, to.city, to.state, to.zip].join('|').toLowerCase();
  const was = memo.get(k);
  if (was && Date.now() - was.at < 600000) return was.v;
  try {
    const r = await cheapest(from, { name: to.name || 'Buyer', street1: to.street1, street2: to.street2 || '', city: to.city, state: to.state, zip: to.zip, country: 'US' }, parcel);
    const v = { cents: r.cents, service: r.service };
    if (memo.size > 500) memo.clear();
    memo.set(k, { at: Date.now(), v: v });
    return v;
  } catch (e) {
    console.error('CALC_SHIP_FAIL', pid, String(e && e.message || e));
    return { error: 'Could not price shipping to that address. Check the address and try again.' };
  }
}

// ---- Labels bought by the seller ----
// The order a seller wants a label for, if it is theirs, paid, and not shipped yet.
async function orderFor(seller, n) {
  const row = (await M.ledger(seller.slug)).filter((r) => r.n === n)[0];
  if (!row) return { error: 'That order was not found.' };
  if (!row.paid) return { error: 'Wait until this order is paid before you ship it.' };
  if (row.tracking) return { error: 'This order already has a tracking number.' };
  const sale = (await store.sales()).filter((x) => x.n === n)[0];
  const d = sale ? (await store.read(sale.path)) || {} : {};
  const meta = (await store.read('meta/' + n + '.json')) || {};
  // The ship-to address: as changed by the buyer (meta.addr), else from the order's label link.
  let a = Array.isArray(meta.addr) && meta.addr[2] ? meta.addr : null;
  if (!a) { try { const inv = require('./_lib').verify(new URL(String(d.label || '')).searchParams.get('inv')); if (inv && Array.isArray(inv.a)) a = inv.a; } catch (e) { a = null; } }
  if (!a || !a[2]) return { error: 'This order has no shipping address on it. Contact V2V.' };
  const cc = a[7] && a[7] !== 'US' ? String(a[7]).toUpperCase() : 'US';
  return { row: row, data: d, intl: cc !== 'US', to: { name: a[0] || row.buyer || 'Buyer', company: a[1] || '', street1: a[2], street2: a[3] || '', city: a[4], state: a[5] || '', zip: a[6] || '', country: cc, email: row.email || '' } };
}
// How a label would be paid: from what V2V holds for the seller first, the rest on their card.
async function payPlan(seller, cents) {
  const [rows, outs] = await Promise.all([M.ledger(seller.slug), M.payouts(seller.slug)]);
  const held = Math.max(0, M.totals(rows, outs).owed);
  const fromEarnings = Math.min(held, cents), fromCard = cents - fromEarnings;
  let card = null;
  if (fromCard > 0) {
    const U = require('./_users'), u = await U.get(seller.email);
    if (u && u.stripe && require('./_stripe').ready()) {
      const c = await require('./_stripe').call('GET', '/customers/' + u.stripe);
      const pm = c.ok && c.body.invoice_settings && c.body.invoice_settings.default_payment_method;
      if (pm) { const p = await require('./_stripe').call('GET', '/payment_methods/' + pm); if (p.ok && p.body.card) card = { pm: pm, customer: u.stripe, brand: String(p.body.card.brand || 'card').toUpperCase(), last4: p.body.card.last4 }; }
    }
  }
  return { cents: cents, held: held, fromEarnings: fromEarnings, fromCard: fromCard, card: card };
}
// Price a label (nothing is bought). q: optional { preset, oz, l, w, h } typed on the label form.
async function quoteLabel(seller, n, q) {
  if (!ready()) return { error: 'Shipping labels are not switched on for V2V yet. Ship it yourself and add the tracking number.' };
  const from = fromOf(seller);
  if (!from) return { error: 'Add your ship-from address in Shop settings first.' };
  const o = await orderFor(seller, n);
  if (o.error) return o;
  const listing = (await M.listings()).filter((x) => x.id === o.row.pid)[0] || {};
  const own = q && (q.preset || q.oz || q.l) ? { pkg: { preset: q.preset || (listing.pkg || {}).preset, oz: q.oz, length: q.l, width: q.w, height: q.h } } : listing;
  if (q && q.preset === 'custom' && ![q.l, q.w, q.h].every((v) => Number(v) > 0 && Number(v) <= 108)) return { error: 'Custom package: type the length, width and height in inches.' };
  // A weight the seller typed is for the whole box already, so it is not multiplied again by the number of pieces.
  const parcel = packageOf(own, own === listing ? o.row.q : 1);
  try {
    // Outside the USA: the label comes with its customs form, valued at what the buyer paid for the pieces.
    const cross = o.intl || (from.country && from.country !== ((o.to && o.to.country) || 'US'));
    const r = cross ? await intlRate(seller, own, o.to, own === listing ? o.row.q : 1, o.row.items || o.row.gross, o.row.product) : await cheapest(from, o.to, parcel);
    const plan = await payPlan(seller, r.cents);
    const paidShip = Math.round(Number(String(o.data.shipping || '0').replace(/[^0-9.]/g, '')) * 100) || 0;
    return { rate: r, parcel: r.parcel || parcel, plan: plan, buyerPaidShipping: paidShip, to: o.to, intl: !!o.intl, test: isTest() };
  } catch (e) {
    console.error('LABEL_QUOTE_FAIL', n, String(e && e.message || e));
    return { error: from.country && from.country !== 'US' ? 'No carrier could price a label from ' + from.country + ' for this package. Ship it your own way and add the tracking number below.' : 'Could not price the label. Check the package size and weight, or try again.' };
  }
}
// Buy the label: pay for it (earnings first, then card), buy it, save the tracking and email the buyer.
async function buyLabel(seller, n, rateId, host) {
  if (!ready()) return { error: 'Shipping labels are not switched on for V2V yet.' };
  if (!/^[a-f0-9]{32}$/i.test(String(rateId || ''))) return { error: 'Price the label first.' };
  const o = await orderFor(seller, n);
  if (o.error) return o;
  const meta0 = (await store.read('meta/' + n + '.json')) || {};
  if (meta0.labelPdf && !(meta0.testLabel && !isTest())) return { error: 'A label was already bought for this order.' };
  const rate = await shippo('/rates/' + rateId).catch(() => null);
  if (!rate || !(Number(rate.amount) > 0)) return { error: 'That price has run out. Get a new price.' };
  const cents = Math.round(Number(rate.amount) * 100);
  const plan = await payPlan(seller, cents);
  // The part the held earnings do not cover goes on the seller's card, before anything is bought.
  let pi = null;
  if (plan.fromCard > 0 && !plan.card) { plan.owed = plan.fromCard; plan.fromCard = 0; } // No card: the rest goes in What you owe.
  if (plan.fromCard > 0) {
    const s = require('./_stripe');
    const r = await s.call('POST', '/payment_intents', { amount: plan.fromCard, currency: 'usd', customer: plan.card.customer, payment_method: plan.card.pm, confirm: 'true', off_session: 'true',
      'payment_method_types[0]': 'card', description: 'V2V shipping label, order ' + n, 'metadata[order]': n, 'metadata[v2v_label]': '1' }, 'label-card-' + n + '-' + rateId);
    if (!r.ok || r.body.status !== 'succeeded') return { error: 'Your card was not charged, so no label was bought: ' + ((r.body.error && r.body.error.message) || (r.body.last_payment_error && r.body.last_payment_error.message) || 'the card was declined') + '. Update your card in My account.' };
    pi = r.body.id;
  }
  let t;
  try { t = await shippo('/transactions/', { rate: String(rateId), label_file_type: 'PDF_4x6', async: false, metadata: 'V2V order ' + n + ' / ' + seller.slug }); } catch (e) { t = { status: 'ERROR', messages: [{ text: String(e && e.message || e) }] }; }
  if (t.status !== 'SUCCESS' || !t.label_url) {
    // No label: give back what was charged.
    if (pi) await require('./_stripe').call('POST', '/refunds', { payment_intent: pi, 'metadata[reason]': 'label not made' }, 'label-refund-' + n + '-' + rateId).catch(() => null);
    const why = Array.isArray(t.messages) ? t.messages.map((m) => m && m.text).filter(Boolean).join(' ') : '';
    console.error('SELLER_LABEL_FAIL', n, why.slice(0, 300));
    return { error: 'Shippo could not make the label. Nothing was charged. ' + why.slice(0, 200) };
  }
  const tracking = t.tracking_number || '';
  const meta = (await store.read('meta/' + n + '.json')) || {};
  await store.write('meta/' + n + '.json', Object.assign(meta, { tracking: tracking, labelPdf: t.label_url, labelTx: t.object_id || '', testLabel: isTest(), shippedAt: Date.now(), shippedBy: seller.slug,
    labelCost: cents, labelFromEarnings: plan.fromEarnings, labelFromCard: plan.fromCard, labelOwed: plan.owed || 0, labelCardPi: pi || '', customsPdf: t.commercial_invoice_url || '' }));
  if (!isTest() && o.row.email && tracking) {
    const { mail } = require('./_lib');
    await mail(o.row.email, 'Your order ' + n + ' has shipped', ['Your ' + o.row.product + ' (order ' + n + ') is on its way from ' + seller.name + ' by USPS.', '', 'Tracking number: ' + tracking].concat(t.tracking_url_provider ? ['Track it here:', t.tracking_url_provider] : []).concat(['', 'Once it arrives, rate ' + seller.name + ' in My account: ' + host + '/me.html']), 'seller-label-' + n).catch(() => null);
  }
  return { ok: true, customs: t.commercial_invoice_url || '', label: t.label_url, tracking: tracking, track: t.tracking_url_provider || '', cents: cents, fromEarnings: plan.fromEarnings, fromCard: plan.fromCard, test: isTest() };
}
const money = (c) => '$' + (c / 100).toFixed(2);
// Cancel a bought label so it can be bought again: Shippo refunds the postage (if the label was never scanned), any
// card charge for it is refunded, and the order goes back to "Paid, ship it" with no tracking. Kept in labelVoids.
async function voidLabel(n) {
  const mk = 'meta/' + n + '.json', m = (await store.read(mk)) || {};
  if (!m.labelPdf && !m.labelTx) return { error: 'This order has no label to cancel.' };
  let shippo_ = 'none';
  if (m.labelTx && !m.testLabel && ready()) {
    try { const r = await shippo('/refunds/', { transaction: m.labelTx, async: false }); shippo_ = r.status || 'QUEUED'; }
    catch (e) { const t = String(e && e.message || e); if (!/already|refund/i.test(t)) return { error: 'Shippo would not cancel this label: ' + t.slice(0, 160) }; shippo_ = 'already'; }
  }
  if (m.labelCardPi) await require('./_stripe').call('POST', '/refunds', { payment_intent: m.labelCardPi, 'metadata[reason]': 'label cancelled' }, 'label-void-' + n + '-' + m.labelCardPi).catch(() => null);
  const keep = { at: Date.now(), tracking: m.tracking || '', tx: m.labelTx || '', cost: m.labelCost || 0, shippo: shippo_ };
  ['tracking', 'labelPdf', 'labelTx', 'testLabel', 'shippedAt', 'shippedBy', 'labelCost', 'labelFromEarnings', 'labelFromCard', 'labelOwed', 'labelCardPi', 'customsPdf'].forEach((k) => { delete m[k]; });
  // An order that counted as paid because its label was bought stays paid.
  if (!m.paidAt) { m.paidAt = Date.now(); m.paidHow = m.paidHow || 'label'; }
  m.labelVoids = (m.labelVoids || []).concat([keep]);
  await store.write(mk, m);
  return { ok: true, shippo: shippo_ };
}

module.exports = { voidLabel, countryCode, shipsIntl, quoteIntl, intlRate, PRESETS, packageOf, fromOf, calcFor, quoteLabel, buyLabel, payPlan, ready, isTest };
