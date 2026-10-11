// Square card payments. The three keys live in the Vercel environment variables:
// SQUARE_APPLICATION_ID, SQUARE_LOCATION_ID and SQUARE_ACCESS_TOKEN.
// Sandbox keys (application ID starting with "sandbox-") use Square's test system by themselves.
const crypto = require('crypto');

const appId = () => (process.env.SQUARE_APPLICATION_ID || '').trim();
const locationId = () => (process.env.SQUARE_LOCATION_ID || '').trim();
const accessToken = () => (process.env.SQUARE_ACCESS_TOKEN || '').trim();
const sandbox = () => {
  const e = (process.env.SQUARE_ENVIRONMENT || '').trim().toLowerCase();
  return e ? e === 'sandbox' : appId().indexOf('sandbox-') === 0;
};
const ready = () => !!(appId() && locationId() && accessToken());
const base = () => (sandbox() ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com');
const sdk = () => (sandbox() ? 'https://sandbox.web.squarecdn.com/v1/square.js' : 'https://web.squarecdn.com/v1/square.js');
const ref = (inv) => String(inv.n).slice(0, 40);

async function call(method, path, body) {
  const r = await fetch(base() + path, {
    method: method, signal: AbortSignal.timeout(20000),
    headers: { authorization: 'Bearer ' + accessToken(), 'content-type': 'application/json', 'square-version': '2025-01-23' },
    body: body ? JSON.stringify(body) : undefined
  });
  let j = {};
  try { j = await r.json(); } catch (e) { /* empty reply */ }
  return { ok: r.ok, status: r.status, body: j };
}

const shape = (p) => ({
  id: p.id, receipt: p.receipt_url || '', time: Math.floor(new Date(p.created_at || Date.now()).getTime() / 1000) || Math.floor(Date.now() / 1000),
  card: p.card_details && p.card_details.card ? [p.card_details.card.card_brand, p.card_details.card.last_4 ? 'ending ' + p.card_details.card.last_4 : ''].filter(Boolean).join(' ').replace(/_/g, ' ') : ''
});
const good = (p, inv) => p && p.reference_id === ref(inv) && p.status === 'COMPLETED' && p.amount_money && Number(p.amount_money.amount) === inv.u;

// Has this invoice already been paid by card? Square is the record, so a reload can never charge twice.
const paidMemo = new Map();
async function findPaid(inv) {
  if (paidMemo.has(inv.n)) return paidMemo.get(inv.n);
  let cursor = '';
  for (let page = 0; page < 5; page++) {
    const q = '?location_id=' + encodeURIComponent(locationId()) + '&begin_time=' + encodeURIComponent(new Date((inv.c - 120) * 1000).toISOString()) + '&sort_order=ASC&limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const r = await call('GET', '/v2/payments' + q);
    if (!r.ok) throw new Error('Square list payments failed: HTTP ' + r.status);
    const hit = (r.body.payments || []).filter((p) => good(p, inv))[0];
    if (hit) return remember(inv, shape(hit));
    cursor = r.body.cursor || '';
    if (!cursor) break;
  }
  return null;
}
function remember(inv, pay) { if (paidMemo.size > 500) paidMemo.clear(); paidMemo.set(inv.n, pay); return pay; }

const REASONS = {
  CARD_DECLINED: 'Your card was declined. Try another card.',
  GENERIC_DECLINE: 'Your card was declined. Try another card.',
  CVV_FAILURE: 'The security code did not match. Check it and try again.',
  ADDRESS_VERIFICATION_FAILURE: 'The postal code did not match the card. Check it and try again.',
  INVALID_EXPIRATION: 'The expiry date is not valid. Check it and try again.',
  CARD_EXPIRED: 'This card has expired. Try another card.',
  INSUFFICIENT_FUNDS: 'The card does not have enough funds. Try another card.',
  CARD_NOT_SUPPORTED: 'This card is not supported. Try another card.',
  TRANSACTION_LIMIT: 'This amount is over the limit for this card. Try another card.'
};

// Charge the amount due on the invoice. The amount always comes from the signed invoice, never from the browser.
async function charge(inv, sourceId, verificationToken) {
  const body = {
    source_id: sourceId,
    idempotency_key: crypto.createHash('sha256').update(inv.n + '|' + inv.c + '|' + sourceId).digest('hex').slice(0, 45),
    amount_money: { amount: inv.u, currency: 'USD' },
    location_id: locationId(),
    reference_id: ref(inv),
    note: ((process.env.BRAND_NAME || 'Collectors Page') + ' invoice ' + inv.n + ': ' + (inv.i || 'Order') + (inv.q ? ' x ' + inv.q : '')).slice(0, 500),
    autocomplete: true
  };
  if (inv.e) body.buyer_email_address = inv.e;
  if (verificationToken) body.verification_token = String(verificationToken).slice(0, 300);
  const r = await call('POST', '/v2/payments', body);
  const p = r.body.payment;
  if (r.ok && p && p.status === 'COMPLETED') return { paid: remember(inv, shape(p)) };
  const err = (r.body.errors || [])[0] || {};
  console.error('SQUARE_FAIL', JSON.stringify({ invoice: inv.n, http: r.status, code: err.code || '', status: p ? p.status : '' }));
  if (r.status === 401 || r.status === 403) return { message: 'Card payments are not available right now. Please contact us. You have not been charged.' };
  return { message: REASONS[err.code] || 'The card payment did not go through. You have not been charged. Check the card details or try another card.' };
}

module.exports = { ready, appId, locationId, sdk, findPaid, charge };
