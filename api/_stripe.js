// Stripe card payments, taken on Stripe's own hosted Checkout page. One key lives in the Vercel environment
// variables: STRIPE_SECRET_KEY. A key starting with sk_test_ uses Stripe's test mode by itself; sk_live_ charges real cards.
const key = () => (process.env.STRIPE_SECRET_KEY || '').trim();
const ready = () => /^(sk|rk)_(test|live)_/.test(key());
const test = () => key().indexOf('_test_') > 0;

// form: a flat object of Stripe's form fields, for example { 'line_items[0][quantity]': 1 }.
// idem: an idempotency key, so asking twice for the same thing does not make two of them.
async function call(method, path, form, idem) {
  const headers = { authorization: 'Bearer ' + key() };
  if (form) headers['content-type'] = 'application/x-www-form-urlencoded';
  if (idem) headers['idempotency-key'] = idem;
  const r = await fetch('https://api.stripe.com/v1' + path, { method: method, signal: AbortSignal.timeout(20000), headers: headers, body: form ? new URLSearchParams(form).toString() : undefined });
  let j = {};
  try { j = await r.json(); } catch (e) { /* empty reply */ }
  return { ok: r.ok, status: r.status, body: j };
}

// Stripe ids made in test mode do not exist in live mode (and back). A record keeps one set per mode: when the key
// switches, the other mode's ids are put aside (stripe_test / stripe_live) and the record starts fresh for this mode.
function forMode(r, fields) {
  if (!r || !ready()) return r;
  const m = test() ? 'test' : 'live', was = r.stripeMode || 'test';
  if (was === m) { if (r.stripe && !r.stripeMode) r.stripeMode = m; return r; }
  const keep = {}, back = r['stripe_' + m] || {};
  fields.forEach((f) => { keep[f] = r[f]; r[f] = back[f]; if (r[f] === undefined) delete r[f]; });
  r['stripe_' + was] = keep; delete r['stripe_' + m]; r.stripeMode = m;
  return r;
}
module.exports = { ready, test, call, forMode };
