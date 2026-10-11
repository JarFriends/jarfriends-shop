// Public: card page settings (GET) and the card charge for one invoice (POST).
const { verify, isCard, recordOrder, sendCardPaidEmail } = require('./_lib');
const square = require('./_square');

async function finish(inv, pay) {
  const out = await Promise.all([
    recordOrder(inv, inv.p === 'dep' ? 'Deposit paid by card' : 'Paid in full by card', pay.receipt || pay.id),
    sendCardPaidEmail(inv, pay)
  ]);
  return { status: 'paid', receipt: pay.receipt, card: pay.card, email: out[1] };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST.' });
  const b = req.method === 'POST' ? (req.body && typeof req.body === 'object' ? req.body : {}) : req.query;
  const inv = verify(b.inv);
  if (!inv || !isCard(inv) || !(inv.u > 0)) return res.status(400).json({ error: 'This invoice link is not valid.' });
  if (!square.ready()) return res.status(503).json({ error: 'Card payments are not set up yet. Please contact us.' });
  const now = Math.floor(Date.now() / 1000);

  let paid = null, lookup = true;
  try { paid = await square.findPaid(inv); } catch (e) { lookup = false; console.error('SQUARE_LOOKUP_FAIL', String(e && e.message || e)); }

  if (req.method === 'GET') {
    if (paid) return res.json(await finish(inv, paid));
    return res.json({ status: now > inv.d ? 'expired' : 'due', appId: square.appId(), locationId: square.locationId(), sdk: square.sdk(), now: now });
  }

  if (paid) return res.json(await finish(inv, paid));
  if (!lookup) return res.status(503).json({ error: 'Could not reach the card processor just now. You have not been charged. Try again in a moment.' });
  if (now > inv.d) return res.status(410).json({ error: 'This payment window has closed. Place the order again to get a fresh one.' });
  const sourceId = String(b.sourceId || '').slice(0, 300);
  if (!sourceId) return res.status(400).json({ error: 'Enter your card details.' });
  let out;
  try { out = await square.charge(inv, sourceId, b.verificationToken); } catch (e) {
    console.error('SQUARE_FAIL', String(e && e.message || e));
    return res.status(503).json({ error: 'Could not reach the card processor. Reload this page before trying again: it will show whether the payment went through.' });
  }
  if (!out.paid) return res.status(402).json({ error: out.message });
  res.json(await finish(inv, out.paid));
};
