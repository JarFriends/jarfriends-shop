// My V2V account: one profile for buying and selling.
// GET  ?t=                                  the profile: name, Buyer/Seller mode, saved cards, preferred way to pay,
//                                           ship-to address, and the seller shop if there is one
// POST { do:'mode', t, mode }               buyer or seller (which side of the account to show)
// POST { do:'profile', t, name }
// POST { do:'address', t, name, street, line2, city, state, zip }   the ship-to address checkout fills in
// POST { do:'prefer', t, method }           the way to pay checkout picks first: card, crypto, zelle, venmo, cashapp, cash
// POST { do:'card-add', t }                 opens Stripe's own page to save a card; returns { url }
// GET  ?do=card-done&session=&t=            where Stripe sends the buyer back; the new card becomes the default
// POST { do:'card-default', t, pm }  POST { do:'card-remove', t, pm }
// POST { do:'quickpay', t, inv, pm? }       pay a card order with a saved card, after the buyer confirmed it
// GET  ?do=qp-return&inv=&payment_intent=   back from a bank check (3-D Secure) during a quick payment
//
// Cards are saved with Stripe, never on V2V: Stripe keeps the card and gives V2V a reference (pm_...), the brand and
// the last 4 digits. Card numbers never touch this site.
const gate = require('./_gate');
const U = require('./_users');
const M = require('./_sellers');
const stripe = require('./_stripe');
const connect = require('./_connect');
const offline = require('./_offline');
const { verify, isCard, mail, sendCardPaidEmail } = require('./_lib');

const WAYS = ['card', 'crypto', 'zelle', 'venmo', 'cashapp', 'cash'];
const money = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tidy = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

// The buyer's Stripe customer, made the first time it is needed.
async function customer(email, u) {
  if (u.stripe) return u.stripe;
  const c = await stripe.call('POST', '/customers', { email: email, name: u.name || '', 'metadata[v2v_user]': U.h(email) }, 'v2v-customer-' + U.h(email));
  if (!c.ok || !c.body.id) throw new Error('Stripe customer: ' + c.status);
  await U.put(email, { stripe: c.body.id, stripeMode: stripe.test() ? 'test' : 'live' });
  return c.body.id;
}
async function cards(u) {
  if (!u.stripe || !stripe.ready()) return { cards: [], def: '' };
  const [l, c] = await Promise.all([stripe.call('GET', '/customers/' + u.stripe + '/payment_methods?type=card&limit=20'), stripe.call('GET', '/customers/' + u.stripe)]);
  const def = (c.body && c.body.invoice_settings && c.body.invoice_settings.default_payment_method) || '';
  const list = ((l.body && l.body.data) || []).map((p) => ({ id: p.id, brand: String((p.card && p.card.brand) || 'card').toUpperCase(), last4: (p.card && p.card.last4) || '', exp: p.card ? String(p.card.exp_month).padStart(2, '0') + '/' + String(p.card.exp_year).slice(-2) : '', funding: (p.card && p.card.funding) || '' }));
  return { cards: list, def: def || (list[0] && list[0].id) || '' };
}
// A saved card must belong to this buyer's Stripe customer.
async function owns(u, pm) {
  if (!u.stripe || !/^pm_[A-Za-z0-9]{8,64}$/.test(String(pm || ''))) return false;
  const r = await stripe.call('GET', '/payment_methods/' + pm);
  return r.ok && r.body.customer === u.stripe;
}

// A card order is paid: the same steps as Stripe's own card page (api/stripe.js) — record it, email the receipt,
// tell the owner, and give the card fee back on a debit or prepaid card.
async function paid(inv, token, host, pi, client) {
  client = client || stripe;
  const ch = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : {};
  const cd = ch.payment_method_details && ch.payment_method_details.card;
  const pay = { id: pi.id, receipt: ch.receipt_url || '', card: cd ? String(cd.brand || 'card').toUpperCase() + ' ending ' + cd.last4 : 'Saved card' };
  let back = '';
  if (inv.cf && cd && (cd.funding === 'debit' || cd.funding === 'prepaid') && !(ch.amount_refunded > 0)) {
    const rf = await client.call('POST', '/refunds', { payment_intent: pi.id, amount: inv.cf, 'metadata[invoice]': inv.n, 'metadata[reason]': 'card fee back, not a credit card' }, 'feeback-' + inv.n).catch(() => ({ ok: false }));
    back = rf.ok ? 'Debit card: the ' + money(inv.cf) + ' card fee was refunded to the buyer.' : 'Debit card: the ' + money(inv.cf) + ' card fee refund did NOT go through. Refund it by hand in Stripe.';
  }
  await connect.markDirect(inv, client, pi.id).catch((e) => console.error('MARK_DIRECT_FAIL', inv.n, String(e && e.message || e)));
  const label = offline.labelLink(host, token, inv);
  const owner = (process.env.OWNER_EMAIL || '').trim();
  await Promise.all([
    offline.record(inv, 'Paid in full by card (saved card)', { paid: true, proof: pay.receipt || pay.id, label: label }),
    Promise.resolve().then(() => sendCardPaidEmail(inv, pay)).catch((e) => { console.error('QP_RECEIPT_FAIL', String(e && e.message || e)); }),
    owner ? mail(owner, 'Paid by saved card: order ' + inv.n, ['Order ' + inv.n + ' was paid with a saved card (' + pay.card + ').', '', 'Order: ' + (inv.i || '-') + (inv.q ? ' x ' + inv.q : ''), 'Paid: ' + money(inv.u) + ' USD', 'Buyer: ' + inv.b + ' <' + inv.e + '>', 'Send to: ' + (offline.shipLine(inv) || '-'), '', inv.wa ? 'This is an NFT order.' : 'Print the shipping label:', inv.wa ? '' : label, pay.receipt ? 'Stripe receipt: ' + pay.receipt : '', back], 'owner-paid-qp-' + inv.n).catch(() => null) : null
  ]);
  return host + '/placed.html?inv=' + encodeURIComponent(token) + '&paid=1' + (back ? '&feeback=1' : '');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const host = 'https://' + req.headers.host;
  const what = String(req.method === 'POST' ? b.do : q.do || '');
  try {
    // Back from a bank check during a quick payment. The invoice link itself proves which order this is.
    if (req.method === 'GET' && what === 'qp-return') {
      const token = String(q.inv || ''), inv = verify(token), pid = String(q.payment_intent || '');
      const go = (url) => { res.statusCode = 303; res.setHeader('Location', url); res.end(); };
      if (!inv || !isCard(inv) || !/^pi_[A-Za-z0-9_]{8,80}$/.test(pid)) return go(host + '/');
      const client = await connect.clientFor(inv);
      const pi = await client.call('GET', '/payment_intents/' + pid + '?expand[]=latest_charge');
      if (!pi.ok || pi.body.metadata.invoice !== inv.n || pi.body.amount !== inv.u || pi.body.status !== 'succeeded') return go(host + '/api/stripe?inv=' + encodeURIComponent(token));
      return go(await paid(inv, token, host, pi.body, client));
    }

    const me = gate.emailOf(req.method === 'POST' ? b.t : q.t);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    // A Google or confirmed-email sign-in: the profile is made the first time it is seen.
    let u = (await U.get(me)) || (await U.put(me, { verified: true }));
    // Everyone signs the Terms (public/terms.html) before using their account.
    if (!(await U.hasAgreed(u && u.email ? u.email : me, u))) return res.status(403).json({ needTerms: true, error: 'Please read and sign the VeeFam.io Terms of Service to continue.' });

    if (req.method === 'GET' && what === 'card-done') {
      const sid = String(q.session || '');
      if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sid)) return res.status(400).json({ error: 'That card page was not found.' });
      const s = await stripe.call('GET', '/checkout/sessions/' + sid + '?expand[]=setup_intent');
      const si = s.body && s.body.setup_intent;
      if (!s.ok || s.body.customer !== u.stripe || !si || si.status !== 'succeeded') return res.status(400).json({ error: 'The card was not saved. Try again.' });
      await stripe.call('POST', '/customers/' + u.stripe, { 'invoice_settings[default_payment_method]': si.payment_method });
      if (!u.prefer) u = await U.put(me, { prefer: 'card' });
      return res.json(Object.assign({ ok: true }, await cards(u)));
    }

    if (req.method === 'GET') {
      const seller = await M.byEmail(me);
      const c = await cards(u).catch(() => ({ cards: [], def: '' }));
      return res.json({ email: me, name: u.name || '', mode: u.mode === 'seller' ? 'seller' : 'buyer', prefer: u.prefer || '', address: u.address || null,
        cards: c.cards, defaultCard: c.def, cardsOn: stripe.ready(), cardTest: stripe.ready() && stripe.test(),
        seller: seller ? { slug: seller.slug, name: seller.name, status: seller.status } : null });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST.' });

    if (what === 'mode') { u = await U.put(me, { mode: b.mode === 'seller' ? 'seller' : 'buyer' }); return res.json({ ok: true, mode: u.mode }); }
    if (what === 'profile') { u = await U.put(me, { name: tidy(b.name, 80) }); return res.json({ ok: true, name: u.name }); }
    if (what === 'prefer') {
      if (WAYS.indexOf(b.method) < 0 && b.method !== '') return res.status(400).json({ error: 'Pick a way to pay.' });
      u = await U.put(me, { prefer: b.method });
      return res.json({ ok: true, prefer: u.prefer });
    }
    if (what === 'address') {
      const a = { name: tidy(b.name, 80), street: tidy(b.street, 120), line2: tidy(b.line2, 60), city: tidy(b.city, 60), state: tidy(b.state, 30), zip: tidy(b.zip, 10) };
      if (!a.street && !a.city && !a.zip) { await U.put(me, { address: null }); return res.json({ ok: true, address: null }); }
      if (!/[0-9]/.test(a.street) || !/[A-Za-z]/.test(a.street)) return res.status(400).json({ error: 'Enter the street address with its number, for example 120 Main St.' });
      if (a.city.length < 2 || a.state.length < 2) return res.status(400).json({ error: 'Enter the city and state.' });
      // US ZIP codes, or a postal code with letters from outside the US (Canada, the UK and so on).
      if (!/^[0-9]{5}(-[0-9]{4})?$/.test(a.zip) && !/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(a.zip)) return res.status(400).json({ error: 'Enter your ZIP or postal code.' });
      u = await U.put(me, { address: a });
      return res.json({ ok: true, address: u.address });
    }

    // ---- Cards (Stripe) ----
    if (/^card-|^quickpay$/.test(what) && !stripe.ready()) return res.status(503).json({ error: 'Saving cards is not set up yet on this site.' });
    if (what === 'card-add') {
      const cus = await customer(me, u);
      const s = await stripe.call('POST', '/checkout/sessions', { mode: 'setup', currency: 'usd', customer: cus, 'payment_method_types[0]': 'card',
        success_url: host + (b.back === 'cart' ? '/cart.html' : '/me.html') + '?added={CHECKOUT_SESSION_ID}', cancel_url: host + (b.back === 'cart' ? '/cart.html' : '/me.html') });
      if (!s.ok || !s.body.url) { console.error('CARD_ADD_FAIL', s.status, JSON.stringify(s.body && s.body.error || {}).slice(0, 200)); return res.status(502).json({ error: 'Could not open the card page just now. Try again.' }); }
      return res.json({ url: s.body.url });
    }
    if (what === 'card-default' || what === 'card-remove') {
      if (!(await owns(u, b.pm))) return res.status(404).json({ error: 'That card was not found.' });
      if (what === 'card-default') await stripe.call('POST', '/customers/' + u.stripe, { 'invoice_settings[default_payment_method]': b.pm });
      else await stripe.call('POST', '/payment_methods/' + b.pm + '/detach', {});
      return res.json(Object.assign({ ok: true }, await cards(u)));
    }
    if (what === 'quickpay') {
      const token = String(b.inv || ''), inv = verify(token);
      if (!inv || !isCard(inv) || !(inv.u > 0)) return res.status(400).json({ error: 'This order cannot be paid with a saved card. Use the card page.' });
      if (String(inv.e || '').toLowerCase() !== me) return res.status(403).json({ error: 'This order is under a different email than your account. Use the card page to pay.' });
      if (Math.floor(Date.now() / 1000) > inv.d) return res.status(410).json({ error: 'This order has run out. Place it again.' });
      const c = await cards(u);
      const pm = b.pm || c.def;
      if (!pm || !(await owns(u, pm))) return res.status(400).json({ error: 'Pick a saved card.' });
      const client = await connect.clientFor(inv);
      const base = { amount: inv.u, currency: 'usd', confirm: 'true', 'payment_method_types[0]': 'card',
        description: 'Invoice ' + inv.n, 'metadata[invoice]': inv.n, receipt_email: me,
        return_url: host + '/api/me?do=qp-return&inv=' + encodeURIComponent(token) };
      let pi;
      if (client.acct) {
        // A seller with payouts on: the saved card is copied onto the seller's Stripe account for this one payment
        // (V2V keeps the card; the seller's account gets a one-time copy), and V2V's cut rides along as the fee.
        const cp = await client.call('POST', '/payment_methods', { customer: u.stripe, payment_method: pm }, 'qp-pm-' + inv.n + '-' + pm);
        if (!cp.ok || !cp.body.id) { console.error('QP_CLONE_FAIL', inv.n, cp.status); return res.json({ fallback: host + '/api/stripe?inv=' + encodeURIComponent(token), error: 'Your saved card could not be used for this seller. Opening the card page instead.' }); }
        pi = await client.call('POST', '/payment_intents?expand[]=latest_charge', Object.assign({}, base, { payment_method: cp.body.id, application_fee_amount: client.fee, 'metadata[v2v_fee]': client.fee }), 'qp-' + inv.n + '-' + pm);
      } else {
        pi = await stripe.call('POST', '/payment_intents?expand[]=latest_charge', Object.assign({}, base, { customer: u.stripe, payment_method: pm }), 'qp-' + inv.n + '-' + pm);
      }
      const p = pi.body || {};
      if (pi.ok && p.status === 'succeeded') return res.json({ ok: true, link: await paid(inv, token, host, p, client) });
      if (pi.ok && p.status === 'requires_action' && p.next_action && p.next_action.type === 'redirect_to_url') return res.json({ redirect: p.next_action.redirect_to_url.url });
      const why = (p.error && p.error.message) || (p.last_payment_error && p.last_payment_error.message) || '';
      console.error('QUICKPAY_FAIL', inv.n, pi.status, p.status || '', why.slice(0, 200));
      // Anything else (a bank check this page cannot show, a declined card): Stripe's own card page takes over.
      return res.json({ fallback: host + '/api/stripe?inv=' + encodeURIComponent(token), error: why ? 'Your card was not charged: ' + why : 'Your saved card could not be used. Opening the card page instead.' });
    }
    return res.status(400).json({ error: 'Unknown request.' });
  } catch (e) {
    console.error('ME_FAIL', what, String(e && e.stack || e));
    return res.status(503).json({ error: 'Something went wrong. Try again in a moment.' });
  }
};
