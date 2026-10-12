// Public: email a customer a sign-in link for their orders page.
const { sign } = require('./_lib');

const recent = new Map();

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (recent.has(email) && Date.now() - recent.get(email) < 60000) return res.json({ ok: true });
  if (recent.size > 1000) recent.clear();
  recent.set(email, Date.now());

  const now = Math.floor(Date.now() / 1000);
  // Where to go after signing in: a page on this site only (for example the Customer Loyalty safe).
  const next = /^\/[A-Za-z0-9._\-\/?=&%]*$/.test(String(b.next || '')) && !/^\/\//.test(String(b.next)) ? String(b.next) : '';
  const link = 'https://' + req.headers.host + '/account.html?t=' + sign({ a: 1, e: email, x: now + 30 * 86400 }) + (next ? '&next=' + encodeURIComponent(next) : '');
  const key = (process.env.RESEND_API_KEY || '').trim(), from = (process.env.EMAIL_FROM || '').trim();
  let sent = 'off';
  if (key && from) {
    const brand = process.env.BRAND_NAME || 'Collectors Page';
    const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#101726;font-size:15px;"><p>Use the button below to sign in' + (next ? '. It takes you straight back to where you were' : ' and see your orders') + '. The link works for 30 days.</p>'
      + '<p><a href="' + link + '" style="display:inline-block;background:#101726;color:#F7F2E6;font-weight:bold;text-decoration:none;padding:14px 24px;">Sign in to my orders</a></p>'
      + '<p style="font-size:13px;color:#5B6478;">If you did not ask for this, ignore this email.</p></div>';
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(9000),
        headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({ from: from, to: [email], subject: 'Your sign-in link for ' + brand, text: 'Sign in to see your orders (link works for 30 days):\n' + link, html: html })
      });
      sent = r.ok ? 'sent' : 'failed';
      if (!r.ok) console.error('LOGIN_EMAIL_FAIL', r.status, (await r.text()).slice(0, 200));
    } catch (e) { sent = 'failed'; console.error('LOGIN_EMAIL_FAIL', String(e)); }
  }
  console.log('LOGIN', JSON.stringify({ email: sent }));
  res.json({ ok: true });
};
