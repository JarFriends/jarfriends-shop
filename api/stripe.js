// Public: pay one card invoice through Stripe Checkout.
// GET ?inv=<invoice>                  opens Stripe's card page for that invoice.
// GET ?inv=<invoice>&session=<id>     where Stripe sends the buyer back: checks the payment with Stripe, records the
//                                     order as paid, emails the receipt, and shows the confirmation page.
const crypto = require('crypto');
const { verify, isCard, mail, esc, sendCardPaidEmail } = require('./_lib');
const offline = require('./_offline');
const stripe = require('./_stripe');

const money = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
function go(res, url) { res.statusCode = 303; res.setHeader('Location', url); res.end(); }
// A small page for the buyer when the payment cannot go ahead.
function stop(res, code, text) {
  const brand = esc((process.env.BRAND_NAME || 'Collectors Page').trim());
  res.statusCode = code;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Card payment</title><link rel="stylesheet" href="/site.css"></head><body><header class="top"><div class="wrap bar"><a class="brand" href="/" style="text-decoration:none">' + brand + '</a><a class="home" href="/">Home</a></div></header><main class="wrap page"><div class="stack-s"><div class="mono gold">CARD PAYMENT</div><h1>Payment not completed</h1><div class="small">' + esc(text) + '</div></div></main></body></html>');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return stop(res, 405, 'Open this link in your browser.');
  const token = String(req.query.inv || ''), inv = verify(token);
  if (!inv || !isCard(inv) || !(inv.u > 0)) return stop(res, 400, 'This payment link is not valid. Place the order again.');
  if (!stripe.ready()) return stop(res, 503, 'Card payments are not set up yet. Choose another way to pay.');
  const host = 'https://' + req.headers.host, me = host + '/api/stripe?inv=' + encodeURIComponent(token);
  const now = Math.floor(Date.now() / 1000);
  const sid = String(req.query.session || '');

  if (!sid) {
    if (now > inv.d) return stop(res, 410, 'This order has run out. Place it again to pay.');
    const fields = {
      mode: 'payment', client_reference_id: inv.n,
      'line_items[0][quantity]': 1, 'line_items[0][price_data][currency]': 'usd', 'line_items[0][price_data][unit_amount]': inv.u,
      'line_items[0][price_data][product_data][name]': String((inv.i || 'Order') + (inv.q ? ' x ' + inv.q : '')).slice(0, 200),
      'line_items[0][price_data][product_data][description]': 'Invoice ' + inv.n + (inv.cf ? '. Includes ' + money(inv.cf) + ' card fee (' + (inv.cp || '') + '%)' : ''),
      'metadata[invoice]': inv.n, 'payment_intent_data[description]': 'Invoice ' + inv.n,
      success_url: me + '&session={CHECKOUT_SESSION_ID}',
      cancel_url: host + '/order.html' + (inv.pid ? '?product=' + encodeURIComponent(inv.pid) : '')
    };
    const oops = (e) => ({ ok: false, body: { error: { message: String(e && e.message || e) } } });
    // Sales tax through Stripe Tax: Stripe works it out from where the order ships and adds it on its payment page.
    // It needs Stripe Tax switched on in the Stripe account. If Stripe will not open a taxed page, the plain one is used.
    let s = { ok: false, body: {} };
    if ((process.env.STRIPE_TAX || 'on').trim().toLowerCase() !== 'off') {
      const a = Array.isArray(inv.a) ? inv.a : [];
      let extra = { customer_email: inv.e || '', billing_address_collection: 'required' };
      if (a[2]) {
        // The ship-to address goes to Stripe on a customer record, so tax follows the destination.
        const c = await stripe.call('POST', '/customers', { email: inv.e || '', name: a[0] || inv.b || '', 'shipping[name]': a[0] || inv.b || 'Buyer', 'shipping[address][line1]': a[2], 'shipping[address][line2]': a[3] || '', 'shipping[address][city]': a[4] || '', 'shipping[address][state]': a[5] || '', 'shipping[address][postal_code]': a[6] || '', 'shipping[address][country]': 'US', 'metadata[invoice]': inv.n }, 'customer-' + inv.n).catch(oops);
        if (c.ok && c.body.id) extra = { customer: c.body.id };
      }
      s = await stripe.call('POST', '/checkout/sessions', Object.assign({}, fields, extra, { 'automatic_tax[enabled]': 'true', 'line_items[0][price_data][tax_behavior]': 'exclusive' }), 'checkout-tax-' + inv.n).catch(oops);
      if (!s.ok) console.error('STRIPE_TAX_OFF', inv.n, s.status, JSON.stringify(s.body && s.body.error || {}).slice(0, 300));
    }
    // The same invoice always gets the same Stripe page, so reloading cannot start a second payment.
    if (!s.ok) s = await stripe.call('POST', '/checkout/sessions', Object.assign({ customer_email: inv.e || '' }, fields), 'checkout-' + inv.n).catch(oops);
    if (s.ok && s.body.status === 'complete' && s.body.id) return go(res, me + '&session=' + s.body.id);
    if (!s.ok || !s.body.url) {
      console.error('STRIPE_OPEN_FAIL', s.status, JSON.stringify(s.body && s.body.error || {}).slice(0, 300));
      return stop(res, 502, 'Could not open the card page just now. Go back and try again, or choose another way to pay.');
    }
    return go(res, s.body.url);
  }

  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sid)) return stop(res, 400, 'This payment link is not valid.');
  const s = await stripe.call('GET', '/checkout/sessions/' + sid + '?expand[]=payment_intent.latest_charge').catch(() => ({ ok: false, body: {} }));
  const b = s.body || {};
  // The payment must be for this invoice and this exact amount. Sales tax, if Stripe added any, sits on top.
  const tax = (b.total_details && Number(b.total_details.amount_tax)) || 0;
  if (!s.ok || b.client_reference_id !== inv.n || b.amount_total !== inv.u + tax || String(b.currency).toLowerCase() !== 'usd') {
    console.error('STRIPE_MATCH_FAIL', inv.n, s.status);
    return stop(res, 400, 'We could not match this payment to your order. If your card was charged, contact us with invoice ' + inv.n + '.');
  }
  if (b.payment_status !== 'paid') return stop(res, 402, 'The card payment was not completed. Go back and try again.');

  const ch = (b.payment_intent && b.payment_intent.latest_charge) || {};
  const cd = ch.payment_method_details && ch.payment_method_details.card;
  const pay = { id: (b.payment_intent && b.payment_intent.id) || sid, receipt: ch.receipt_url || '', card: cd ? String(cd.brand || 'card').toUpperCase() + ' ending ' + cd.last4 : 'Card' };
  // The card fee is for credit cards only. A debit or prepaid card gets the fee back straight away.
  // Asking twice is safe: Stripe treats the repeat as the same refund, and a charge already refunded is left alone.
  let back = '';
  if (inv.cf && cd && (cd.funding === 'debit' || cd.funding === 'prepaid') && !(ch.amount_refunded > 0) && b.payment_intent && b.payment_intent.id) {
    const rf = await stripe.call('POST', '/refunds', { payment_intent: b.payment_intent.id, amount: inv.cf, 'metadata[invoice]': inv.n, 'metadata[reason]': 'card fee back, not a credit card' }, 'feeback-' + inv.n).catch(() => ({ ok: false, body: {} }));
    back = rf.ok ? 'Debit card: the ' + money(inv.cf) + ' card fee was refunded to the buyer.' : 'Debit card: the ' + money(inv.cf) + ' card fee refund did NOT go through. Refund it by hand in Stripe.';
    if (!rf.ok) console.error('STRIPE_FEEBACK_FAIL', inv.n, rf.status);
  }
  const label = offline.labelLink(host, token, inv);
  const owner = (process.env.OWNER_EMAIL || '').trim();
  // Each of these is safe to repeat: the sheet and the emails ignore a second copy of the same invoice.
  await Promise.all([
    offline.record(inv, 'Paid in full by card', { paid: true, proof: pay.receipt || pay.id, label: label }),
    Promise.resolve().then(() => sendCardPaidEmail(inv, pay)).catch((e) => { console.error('STRIPE_RECEIPT_FAIL', String(e && e.message || e)); }),
    owner ? mail(owner, 'Paid by card: order ' + inv.n, [
      'Order ' + inv.n + ' was paid by card (' + pay.card + ').', '',
      'Order: ' + (inv.i || '-') + (inv.q ? ' x ' + inv.q : ''), 'Paid: ' + money(inv.u + tax) + ' USD' + (inv.cf ? ' (includes ' + money(inv.cf) + ' card fee)' : '') + (tax ? ' (includes ' + money(tax) + ' sales tax collected by Stripe)' : ''),
      'Buyer: ' + inv.b + ' <' + inv.e + '>', 'Send to: ' + (offline.shipLine(inv) || '-'), '',
      inv.wa ? 'This is an NFT order. Send it to the wallet above.' : 'Print the shipping label:', inv.wa ? '' : label,
      pay.receipt ? 'Stripe receipt: ' + pay.receipt : '', back
    ], hash('owner-paid|' + inv.n)).catch(() => null) : null
  ]);
  go(res, host + '/placed.html?inv=' + encodeURIComponent(token) + '&paid=1' + (back ? '&feeback=1' : ''));
};
