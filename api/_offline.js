// Shop rules that sit on top of _lib.js: ways to pay by hand (cash or ACH, Zelle, Venmo, Cash App),
// promo codes, the ship-to address on an order, the Orders tab row, and the owner's "print the label" notice.
// Zelle, Venmo and Cash App appear at checkout only when ZELLE_TO / VENMO_TO / CASHAPP_TO are set in the
// Vercel environment variables. Orders have no payment plan: the buyer pays the listed price (less any promo
// code, or at an accepted offer price) by the way they choose.
const crypto = require('crypto');
const { COINS, sign, sheetPost, invoiceHtml, mail, esc, payNote } = require('./_lib');

const WAYS = {
  cash: { label: 'Cash or ACH' },
  zelle: { label: 'Zelle', env: 'ZELLE_TO' },
  venmo: { label: 'Venmo', env: 'VENMO_TO' },
  cashapp: { label: 'Cash App', env: 'CASHAPP_TO' }
};
const sendTo = (w) => (WAYS[w] && WAYS[w].env ? (process.env[WAYS[w].env] || '').trim().slice(0, 120) : '');
const ready = () => ({ zelle: !!sendTo('zelle'), venmo: !!sendTo('venmo'), cashapp: !!sendTo('cashapp') });
const wayOf = (inv) => (inv && WAYS[inv.w] ? inv.w : 'cash');
const label = (w) => (WAYS[w] ? WAYS[w].label : WAYS.cash.label);
// What the buyer is told to do. Cash keeps using PAY_INSTRUCTIONS.
function howTo(inv) {
  const w = wayOf(inv);
  if (w === 'cash') return payNote();
  return sendTo(w) ? 'Send your ' + label(w) + ' payment to ' + sendTo(w) + '.' : '';
}
// How an order is being paid, in words.
const payWith = (inv) => (inv.m === 'cash' ? label(wayOf(inv)) : inv.m === 'card' ? 'Card' : 'Crypto');

// Promo codes come from PROMO_CODES, a comma-separated list such as "WELCOME10=10%, FRIEND5=$5".
// A percent takes that share off the order; a dollar amount takes that much off.
function promos() {
  const out = {};
  String(process.env.PROMO_CODES || '').split(',').forEach((part) => {
    const m = /^\s*([A-Za-z0-9_-]{2,20})\s*=\s*(\$?)\s*([0-9]+(?:\.[0-9]+)?)\s*(%?)\s*$/.exec(part);
    if (!m) return;
    const n = Number(m[3]);
    if (m[4] === '%' && !m[2] && n > 0 && n <= 100) out[m[1].toUpperCase()] = { pct: n };
    else if (m[2] === '$' && !m[4] && n > 0) out[m[1].toUpperCase()] = { off: Math.round(n * 100) };
  });
  return out;
}
const hasPromos = () => Object.keys(promos()).length > 0;
function promo(code) {
  const c = String(code == null ? '' : code).trim().toUpperCase();
  const p = c ? promos()[c] : null;
  return p ? Object.assign({ code: c }, p) : null;
}
// Cents a promo takes off a list total. An order never drops below one cent.
function promoCut(p, list) {
  if (!p) return 0;
  const cut = p.pct ? Math.round(list * p.pct / 100) : p.off;
  return Math.max(0, Math.min(cut, list - 1));
}

// The product rows exactly as the sheet lists them, read fresh (20 second memory). _lib.js keeps only the
// id, name, price, minimum and stock, so the extra columns (shipping, section) are read here.
let sheetMemo = null;
async function sheetRows() {
  if (sheetMemo && Date.now() - sheetMemo.at < 20000) return sheetMemo.v;
  const url = (process.env.SHEET_WEBHOOK_URL || '').trim();
  if (!url) throw new Error('No sheet connected');
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' from the sheet');
  const j = await r.json();
  const v = Array.isArray(j.products) ? j.products : [];
  sheetMemo = { at: Date.now(), v: v };
  return v;
}
// Shipping is set per product in the sheet's "shipping" column: a dollar amount, or 0 / free / blank for free
// shipping. It is charged once per order. Returns cents by product id.
async function shipping() {
  const v = {};
  (await sheetRows()).forEach((p) => {
    const n = Number(p.shipping);
    v[String(p.id || '').trim()] = n > 0 && n < 10000 ? Math.round(n * 100) : 0;
  });
  return v;
}
// Sections of the home page. A product's "section" column names one or more of them, separated by commas.
// Returns the list of sections by product id; a name that is not a section is ignored.
const SECTIONS = ['Comics', 'Cards', 'NFTs', 'Graded', 'Pokemon', 'Watches'];
async function sections() {
  const v = {};
  (await sheetRows()).forEach((p) => {
    const want = String(p.section == null ? '' : p.section).toLowerCase().split(/[,;|]+/).map((s) => s.trim());
    v[String(p.id || '').trim()] = SECTIONS.filter((s) => want.indexOf(s.toLowerCase()) >= 0);
  });
  return v;
}
// Deal of the day. Products with a "deal" number in the sheet (1, 2, 3...) are sold one at a time, in that order:
// the first one still in stock is open, the ones after it stay locked and hidden until it sells.
// inventory is the product list from _lib.js. Returns the safes in order and each deal product's state by id.
async function deals(inventory) {
  const by = {};
  inventory.forEach((p) => { by[p.id] = p; });
  const order = (await sheetRows()).map((p) => ({ id: String(p.id || '').trim(), n: Number(p.deal) })).filter((d) => d.id && d.n > 0).sort((a, b) => a.n - b.n);
  const state = {};
  let opened = false;
  const slots = order.map((d, i) => {
    const p = by[d.id];
    const s = !p || p.stock < p.min ? 'sold' : opened ? 'locked' : 'open';
    if (s === 'open') opened = true;
    state[d.id] = s;
    // A locked safe gives nothing away: no id, no name.
    return { n: i + 1, state: s, id: s === 'open' ? d.id : '', name: s === 'sold' && p ? p.name : '' };
  });
  return { slots: slots, state: state };
}
// NFTs. A product with "nft" set to yes in the sheet is digital: nothing ships, and the buyer gives the wallet
// address to send it to instead of a mailing address. Returns true by product id.
async function nfts() {
  const v = {};
  (await sheetRows()).forEach((p) => { if (p.nft === true || /^(yes|true|1)$/i.test(String(p.nft == null ? '' : p.nft).trim())) v[String(p.id || '').trim()] = true; });
  return v;
}
// The package for an order's shipping label. A product can set "weight_oz" (per unit) and "box" in the sheet;
// box names a USPS flat rate box (small, medium or large). Without them the default package is used.
async function parcelFor(pid, qty) {
  let row = {};
  try { row = (await sheetRows()).filter((p) => String(p.id || '').trim() === pid)[0] || {}; } catch (e) { row = {}; }
  const oz = Number(row.weight_oz), box = String(row.box == null ? '' : row.box).toLowerCase();
  const flat = box.indexOf('flat') >= 0;
  return {
    oz: oz > 0 ? oz * Math.max(1, Number(qty) || 1) : 0,
    template: flat && box.indexOf('medium') >= 0 ? 'USPS_MediumFlatRateBox1' : flat && box.indexOf('small') >= 0 ? 'USPS_SmallFlatRateBox' : flat && box.indexOf('large') >= 0 ? 'USPS_LargeFlatRateBox' : '',
    name: String(row.box == null ? '' : row.box).slice(0, 60)
  };
}
const shipText = (inv) => (inv.sh ? money(inv.sh) : 'Free');

// Ship-to address kept on the invoice as [name, company, street, line 2, city, state, zip].
function shipTo(inv) {
  const a = inv && Array.isArray(inv.a) ? inv.a.map((v) => String(v == null ? '' : v)) : null;
  return a && a[2] ? { name: a[0], company: a[1], street: a[2], line2: a[3], city: a[4], state: a[5], zip: a[6] } : null;
}
function shipLine(inv) {
  // An NFT order carries the buyer's wallet (inv.wa) instead of a mailing address.
  if (inv && inv.wa) return 'NFT to wallet ' + inv.wa;
  const s = shipTo(inv);
  return s ? [s.name, s.company, s.street, s.line2, s.city + ', ' + s.state + ' ' + s.zip].filter(Boolean).join(', ') : '';
}

const usd = (cents) => (cents / 100).toFixed(2);
const money = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const promoLine = (inv) => (inv.pc ? inv.pc + ': ' + money(inv.pd || 0) + ' off ' + money(inv.L) : '');

// Add the order to the Orders tab and take the units out of stock. The sheet ignores repeats of the same invoice.
// o: { paid, proof, label } where paid is true once the money has arrived and label is the link that prints the shipping label.
const recorded = new Map();
async function record(inv, status, o) {
  o = o || {};
  if (recorded.has(inv.n)) return 'duplicate';
  const paid = o.paid ? inv.T : 0;
  const when = new Date().toLocaleString('en-US', { timeZone: process.env.LEADS_TZ || 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });
  const out = await sheetPost({
    tab: 'Orders', key: inv.n, stock: { product: inv.pid, qty: Number(inv.q) },
    headers: ['Placed', 'Invoice', 'Product No', 'Product', 'Units', 'Pay with', 'Items total (USD)', 'Shipping (USD)', 'Order total (USD)', 'Paid (USD)', 'Balance due (USD)', 'Buyer', 'Email', 'Status', 'Proof', 'Promo code', 'Ship to', 'Print label'],
    row: [when, inv.n, inv.pid, inv.i, inv.q, payWith(inv), usd(inv.L), usd(inv.sh || 0), usd(inv.T), usd(paid), usd(inv.T - paid), inv.b, inv.e, status, o.proof || '', inv.pc || '', shipLine(inv), o.label || '']
  });
  if (out === 'ok' || out === 'duplicate' || out === 'short') { if (recorded.size > 500) recorded.clear(); recorded.set(inv.n, 1); }
  console.log('ORDER', JSON.stringify({ invoice: inv.n, sheet: out }));
  return out;
}

// The lines between the item and the total: promo code and shipping.
// Card orders carry a card fee that covers the full amount Stripe takes: 2.9% + 30 cents of what the buyer pays.
// CARD_FEE_PERCENT and CARD_FEE_FIXED_CENTS change the rate; set both to 0 to turn the fee off.
const cardFeePct = () => { const v = Number((process.env.CARD_FEE_PERCENT || '').trim() || 2.9); return v >= 0 && v <= 10 ? v : 2.9; };
const cardFeeFixed = () => { const v = Number((process.env.CARD_FEE_FIXED_CENTS || '').trim() || 30); return v >= 0 && v <= 500 ? Math.round(v) : 30; };
// Stripe takes its cut of the total charged, fee included, so the fee is worked out on the grossed-up total.
const cardFee = (cents) => Math.ceil((cents + cardFeeFixed()) / (1 - cardFeePct() / 100) - 1e-9) - cents;
// The rate in words, without the last percent sign: "$0.30 + 2.9".
const cardFeeLabel = () => (cardFeeFixed() ? money(cardFeeFixed()) + ' + ' : '') + cardFeePct();
const feeText = (inv) => money(inv.cf) + ' (' + (inv.cp || cardFeeLabel()) + '% for paying by card)';
const costRows = (inv) => (inv.pc ? [['Promo code', esc(promoLine(inv))]] : []).concat(inv.wa ? [] : [['Shipping', esc(shipText(inv))]], inv.cf ? [['Card fee', esc(feeText(inv))]] : []);
const costLines = (inv) => (inv.pc ? ['Promo code ' + promoLine(inv)] : []).concat(inv.wa ? [] : ['Shipping: ' + shipText(inv)], inv.cf ? ['Card fee: ' + feeText(inv)] : []);

// Invoice email with the pay link, for an order paid online in crypto.
function sendPayLinkEmail(inv, link) {
  const by = new Date(inv.d * 1000).toUTCString().replace('GMT', 'UTC');
  const coins = Object.keys(inv.k || {}).map((c) => (COINS[c] && COINS[c].label) || c).join(', ');
  const intro = 'Thanks for your order. Use the button below to pay this invoice in full.';
  const details = [['Pay by', esc(by)], ['Pay with', esc(coins)]].concat(costRows(inv));
  if (shipLine(inv)) details.push([inv.wa ? 'Delivery' : 'Ship to', esc(shipLine(inv))]);
  const html = invoiceHtml(inv, {
    badge: 'PAYMENT DUE', solid: false, paid: false, intro: intro, details: details,
    cta: { label: 'Pay this invoice', url: link },
    foot: 'The payment page shows the exact amount and the wallet address to send it to. Keep it open after you send so it can confirm your payment.'
  });
  const lines = [intro, '', 'Invoice: ' + inv.n, 'Order: ' + (inv.i || '-') + (inv.q ? ' x ' + inv.q : '')].concat(costLines(inv), ['Total due: ' + money(inv.u) + ' USD', 'Pay by: ' + by, '', 'Payment link:', link]);
  return mail(inv.e, 'Invoice ' + inv.n + ': payment link', lines, hash('link|' + inv.n + '|' + inv.c), html);
}

// Invoice email for an order to be paid by hand: cash or ACH, Zelle, Venmo or Cash App.
function sendEmail(inv) {
  const w = wayOf(inv), name = label(w), note = howTo(inv);
  const intro = 'Thanks for your order. The full amount of ' + money(inv.u) + ' is due now by ' + name + '.' + (note ? '' : ' We will reach out with payment details.');
  const details = [['Pay with', esc(name)]];
  if (note) details.push(['How to pay', esc(note).replace(/\n/g, '<br>')]);
  costRows(inv).forEach((r) => details.push(r));
  if (shipLine(inv)) details.push([inv.wa ? 'Delivery' : 'Ship to', esc(shipLine(inv))]);
  const html = invoiceHtml(inv, {
    badge: 'PAYMENT DUE', solid: false, paid: false, intro: intro, details: details,
    foot: 'Your order is confirmed once we receive your payment. Put invoice ' + esc(inv.n) + ' ' + (w === 'cash' ? 'on the payment' : 'in the payment note') + ' so we can match it.'
  });
  const lines = [intro, '', 'Invoice: ' + inv.n, 'Order: ' + (inv.i || '-') + (inv.q ? ' x ' + inv.q : '')];
  costLines(inv).forEach((l) => lines.push(l));
  lines.push('Total due: ' + money(inv.u) + ' USD');
  if (note) lines.push('', 'How to pay:', note);
  if (shipLine(inv)) lines.push('', 'Ship to: ' + shipLine(inv));
  return mail(inv.e, 'Invoice ' + inv.n + ': order received', lines, hash(w + '|' + inv.n + '|' + inv.c), html);
}

// Tell the owner about a new order, with the link that prints its shipping label. Needs OWNER_EMAIL.
function notifyOwner(inv, link, note) {
  const owner = (process.env.OWNER_EMAIL || '').trim();
  if (!owner) return Promise.resolve('off');
  return mail(owner, 'New order ' + inv.n + ': ' + note, [
    'New order ' + inv.n + ' (' + note + ').', '',
    'Order: ' + (inv.i || '-') + (inv.q ? ' x ' + inv.q : ''),
    'Order total: ' + money(inv.T) + ' USD (shipping: ' + shipText(inv) + (inv.pc ? ', promo code ' + promoLine(inv) : '') + ')',
    'Buyer: ' + inv.b + ' <' + inv.e + '>',
    'Ship to: ' + (shipLine(inv) || '-'), '',
    'Print the shipping label:', link
  ], hash('owner|' + inv.n + '|' + inv.c));
}

// The owner's link for an order's shipping label. With Shippo connected it opens the page that buys a postage-paid
// USPS label; the signed key in it is what lets only the owner buy. Without Shippo it prints the address label.
function labelLink(host, token, inv) {
  if (!(process.env.SHIPPO_API_KEY || '').trim()) return host + '/label.html?inv=' + encodeURIComponent(token);
  return host + '/ship.html?inv=' + encodeURIComponent(token) + '&k=' + encodeURIComponent(sign({ lb: 1, n: inv.n }));
}

// Offers are answered by email, so they open only once the owner's email and the email sender are set.
const offersOpen = () => !!((process.env.OWNER_EMAIL || '').trim() && (process.env.RESEND_API_KEY || '').trim() && (process.env.EMAIL_FROM || '').trim());

module.exports = { cardFeePct, cardFeeFixed, cardFeeLabel, cardFee, offersOpen, WAYS, ready, wayOf, label, howTo, payWith, hasPromos, promo, promoCut, shipping, SECTIONS, sections, deals, nfts, parcelFor, sendPayLinkEmail, labelLink, shipTo, shipLine, record, sendEmail, notifyOwner };
