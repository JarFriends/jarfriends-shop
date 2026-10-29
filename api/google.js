// Sign in with Google: hand the page the public client ID (GET), and swap a verified Google sign-in for an account token (POST).
const { sign } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const cid = (process.env.GOOGLE_CLIENT_ID || '').trim();
  if (req.method === 'GET') return res.json({ clientId: cid });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!cid) return res.status(503).json({ error: 'Google sign-in is not set up yet.' });
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const cred = String(b.credential || '');
  if (!cred || cred.length > 4000) return res.status(400).json({ error: 'Google sign-in could not be verified.' });
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(cred), { signal: AbortSignal.timeout(9000) });
    const j = await r.json();
    const now = Math.floor(Date.now() / 1000);
    const ok = r.ok && j.aud === cid && (j.email_verified === 'true' || j.email_verified === true) && j.email && Number(j.exp) > now
      && (j.iss === 'accounts.google.com' || j.iss === 'https://accounts.google.com');
    if (!ok) { console.error('GOOGLE_REJECT', r.status, String(j.error_description || j.error || 'claims did not match')); return res.status(401).json({ error: 'Google sign-in could not be verified.' }); }
    const em = String(j.email).toLowerCase(), U = require('./_users');
    res.json(await require('./_totp').issue(em, { terms: await U.hasAgreed(em).catch(() => false) }));
  } catch (e) {
    console.error('GOOGLE_FAIL', String(e && e.message || e));
    res.status(503).json({ error: 'Could not reach Google just now. Try again.' });
  }
};
