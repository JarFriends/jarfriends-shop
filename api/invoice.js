// Owner only: create a signed invoice with a fixed amount per coin, wallet and deadline.
const { COINS, safeEqual, display, createInvoice } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const pass = process.env.OWNER_PASSCODE || '';
  if (!pass || !process.env.INVOICE_SECRET) return res.status(500).json({ error: 'The site is missing its OWNER_PASSCODE or INVOICE_SECRET setting.' });
  if (!safeEqual(b.passcode || '', pass)) return res.status(401).json({ error: 'Wrong owner passcode.' });

  const cents = Math.round(Number(b.usd) * 100);
  const hours = Number(b.hours);
  if (!(cents >= 100 && cents <= 100000000000)) return res.status(400).json({ error: 'Enter a total in US dollars of at least 1.' });
  if (!(hours >= 0.25 && hours <= 168)) return res.status(400).json({ error: 'Time to pay must be between 15 minutes and 168 hours.' });
  const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const email = clip(b.email, 160);
  if (email && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return res.status(400).json({ error: 'The customer email does not look right.' });

  const r = await createInvoice({ no: clip(b.no, 40), item: clip(b.item, 120), qty: clip(b.qty, 20), buyer: clip(b.buyer, 120), terms: clip(b.terms, 160), email: email, cents: cents, hours: hours });
  if (r.error) return res.status(400).json({ error: r.error });
  const amounts = {};
  for (const coin of Object.keys(r.inv.k)) amounts[COINS[coin].label || coin] = display(r.inv.k[coin][0], COINS[coin].dec);
  res.json({ link: 'https://' + req.headers.host + '/pay.html?inv=' + r.token, amounts: amounts, skipped: r.skipped, deadline: r.inv.d });
};
