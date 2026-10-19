// Automatic seller payouts with Stripe Connect.
//
// A seller links their bank once, on Stripe's own sign-up page (their name, date of birth, tax ID and bank stay
// with Stripe, never on V2V). After that, a card sale of one of their pieces is charged on the seller's own Stripe
// account: Stripe pays the seller out to their bank and bills the seller its own card fees, and V2V's cut arrives
// in V2V's Stripe as the "application fee":
//   PLATFORM_FEE_PERCENT (5.55) of the pieces plus shipping, plus any Illinois sales tax (V2V files that tax as the
//   marketplace, so it comes to V2V). The buyer's card fee stays with the seller, to cover what Stripe charges them.
// Sales paid another way (Zelle, Venmo, Cash App, cash, crypto) still come to the owner, who pays the seller by hand.
//
// Each seller's Stripe account id is on their seller record as "stripe". meta/<invoice>.json gets
// { direct: <account>, platformFee } when a sale was paid straight to the seller, so the ledger knows it is settled.
const store = require('./_store');
const base = require('./_stripe');
const M = require('./_sellers');

async function call(method, path, form, idem, account) {
  const headers = { authorization: 'Bearer ' + (process.env.STRIPE_SECRET_KEY || '').trim() };
  if (form) headers['content-type'] = 'application/x-www-form-urlencoded';
  if (idem) headers['idempotency-key'] = idem;
  if (account) headers['stripe-account'] = account;
  const r = await fetch('https://api.stripe.com/v1' + path, { method: method, signal: AbortSignal.timeout(20000), headers: headers, body: form ? new URLSearchParams(form).toString() : undefined });
  let j = {};
  try { j = await r.json(); } catch (e) { /* empty reply */ }
  return { ok: r.ok, status: r.status, body: j };
}

// The seller's Stripe account: made the first time they set up payouts. Stripe collects their details and bills
// them its fees directly; they get the full Stripe dashboard to see sales and payouts.
async function accountFor(seller, host) {
  if (seller.stripe) return seller.stripe;
  const fields = {
    'controller[fees][payer]': 'account', 'controller[losses][payments]': 'stripe',
    'controller[requirement_collection]': 'stripe', 'controller[stripe_dashboard][type]': 'full',
    country: 'US', email: seller.email, 'business_profile[url]': host + '/shop.html?s=' + seller.slug,
    'business_profile[product_description]': 'Collectibles sold on V2V', 'metadata[v2v_seller]': seller.slug
  };
  // Weekly payouts on Fridays, as the owner wants; if Stripe will not take a schedule for this kind of account,
  // the seller keeps Stripe's default and can change it in their own dashboard.
  let r = await call('POST', '/accounts', Object.assign({ 'settings[payouts][schedule][interval]': 'weekly', 'settings[payouts][schedule][weekly_anchor]': 'friday' }, fields), 'v2v-acct-' + seller.slug);
  if (!r.ok) r = await call('POST', '/accounts', fields, 'v2v-acct2-' + seller.slug);
  if (!r.ok || !r.body.id) throw new Error('Stripe account: ' + r.status + ' ' + JSON.stringify(r.body && r.body.error || {}).slice(0, 200));
  seller.stripe = r.body.id;
  await M.save(seller);
  return seller.stripe;
}
// The link to Stripe's sign-up (or "finish setting up") page.
async function onboardingLink(seller, host, as) {
  const acct = await accountFor(seller, host);
  const back = host + '/seller.html?' + (as ? 'as=' + encodeURIComponent(as) + '&' : '');
  const r = await call('POST', '/account_links', { account: acct, type: 'account_onboarding', return_url: back + 'stripe=done', refresh_url: back + 'stripe=again' });
  if (!r.ok || !r.body.url) throw new Error('Stripe link: ' + r.status);
  return r.body.url;
}
// Where a seller's payouts stand: none, started (details still due), or on (taking card payments).
async function status(seller) {
  if (!seller.stripe) return { state: 'none' };
  const r = await call('GET', '/accounts/' + seller.stripe);
  if (!r.ok) return { state: 'unknown' };
  const a = r.body, due = ((a.requirements && a.requirements.currently_due) || []).length;
  const on = !!(a.charges_enabled && a.payouts_enabled);
  if (on !== !!seller.stripeOn) { seller.stripeOn = on; await M.save(seller).catch(() => null); }
  const sch = a.settings && a.settings.payouts && a.settings.payouts.schedule;
  return { state: on ? 'on' : 'started', due: due, schedule: sch ? (sch.interval === 'weekly' ? 'weekly on ' + (sch.weekly_anchor || '') : sch.interval) : '' };
}

// V2V's cut of one sale, in cents: the fee on pieces plus shipping, plus Illinois sales tax.
function platformFee(inv) {
  const gross = Math.max(0, (Number(inv.L) || 0) - (Number(inv.pd) || 0) + (Number(inv.sh) || 0));
  return Math.round(gross * M.feePct() / 100) + (Number(inv.tx) || 0);
}
// The seller whose piece an invoice is for, if they take card payments on their own Stripe account.
async function directSeller(inv) {
  if (!base.ready() || !inv || !M.isSellerPid(inv.pid)) return null;
  const p = (await M.listings()).filter((x) => x.id === inv.pid)[0];
  const s = p && (await M.bySlug(p.seller));
  return s && s.stripe && s.stripeOn && s.status === 'approved' ? s : null;
}
// A Stripe client for one card invoice. For a seller with payouts on, every call goes to the seller's account, and
// the payment carries V2V's cut as the application fee; otherwise it is the plain client (the money comes to V2V).
async function clientFor(inv) {
  const s = await directSeller(inv).catch((e) => { console.error('CONNECT_LOOKUP_FAIL', String(e && e.message || e)); return null; });
  if (!s) return base;
  const fee = platformFee(inv);
  return {
    ready: base.ready, test: base.test, acct: s.stripe, fee: fee, seller: s.slug,
    call: (method, path, form, idem) => {
      let f = form;
      if (method === 'POST' && /^\/checkout\/sessions$/.test(path) && f) {
        f = Object.assign({}, f, { 'payment_intent_data[application_fee_amount]': fee, 'payment_intent_data[metadata][v2v_fee]': fee });
        // Stripe Tax would add tax on the seller's account; V2V adds Illinois tax itself, so it is left off here.
        delete f['automatic_tax[enabled]']; delete f['line_items[0][price_data][tax_behavior]'];
      }
      return call(method, path, f, idem ? idem + '-' + s.stripe : idem, s.stripe);
    }
  };
}
// The sale was paid straight to the seller: note it beside the order, so nobody pays the seller a second time.
async function markDirect(inv, client) {
  if (!client || !client.acct) return;
  const was = (await store.read('meta/' + inv.n + '.json')) || {};
  if (was.direct) return;
  await store.write('meta/' + inv.n + '.json', Object.assign(was, { direct: client.acct, platformFee: client.fee, directAt: Date.now() }));
}

module.exports = { call, accountFor, onboardingLink, status, platformFee, directSeller, clientFor, markDirect };
