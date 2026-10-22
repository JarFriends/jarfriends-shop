// Sign in and sign up with an email and password. (Google sign-in is api/google.js.)
// POST { do:'signup', email, password, name }   make an account; emails a 6-digit code to prove the email is theirs
// POST { do:'login', email, password }          sign in; an account that never confirmed its email gets a code first
// POST { do:'verify', email, code }             the code from the email: returns the sign-in
// POST { do:'resend', email }                   a fresh code
// Every success returns { token }, the same account sign-in Google gives. Pages keep it as acct_token.
const U = require('./_users');
const { mail } = require('./_lib');

// Accounts made before pwOk existed were confirmed when verified was set.
const pwConfirmed = (u) => !!u && (u.pwOk === true || (u.pwOk === undefined && u.verified === true));
const tries = new Map();
const slow = (email) => { const t = tries.get(email); return t && t.n >= 8 && Date.now() - t.at < 15 * 60000; };
const miss = (email) => { const t = tries.get(email) || { n: 0, at: 0 }; if (tries.size > 2000) tries.clear(); tries.set(email, { n: t.n + 1, at: Date.now() }); };

async function sendCode(email, host) {
  const code = await U.newCode(email);
  const brand = (process.env.BRAND_NAME || 'V2V').trim();
  const out = await mail(email, code + ' is your ' + brand + ' code', ['Your ' + brand + ' code is ' + code + '.', '', 'Type it on the sign-in page to confirm this is your email. It works for 20 minutes.', 'If you did not ask for this, ignore this email.'], 'code-' + U.h(email) + '-' + Date.now(),
    '<div style="background:#0B1712;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#E6EFE9"><div style="max-width:480px;margin:0 auto"><div style="font-size:13px;letter-spacing:2px;color:#C9A45C">' + brand.toUpperCase() + '</div><h1 style="font-size:22px;margin:8px 0 14px;color:#E6EFE9">Your sign-in code</h1><div style="font:700 34px/1.2 monospace;letter-spacing:8px;color:#C9A45C;margin:10px 0 16px">' + code + '</div><p style="font-size:15px;line-height:1.5">Type it on the sign-in page to confirm this is your email. It works for 20 minutes. If you did not ask for this, ignore this email.</p></div></div>').catch(() => 'failed');
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  // Sign the Terms from an existing account (made before the Terms, or with Google): { do:'agree', t, name, agree }.
  if (b.do === 'agree') {
    const who = require('./_gate').emailOf(b.t);
    if (!who) return res.status(401).json({ error: 'Sign in again first.' });
    if (b.agree !== true) return res.status(400).json({ error: 'Tick the box to agree to the Terms.' });
    try { const r = await U.sign(who, b.name, req); return res.status(r.error ? 400 : 200).json(r); } catch (e) { return res.status(503).json({ error: 'Could not save that just now. Try again.' }); }
  }
  const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
  if (!U.validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const pass = String(b.password || '');
  const host = 'https://' + req.headers.host;
  try {
    if (b.do === 'signup' || b.do === 'login') {
      if (pass.length < 8) return res.status(400).json({ error: b.do === 'signup' ? 'Use a password of at least 8 characters.' : 'Enter your password.' });
      if (pass.length > 200) return res.status(400).json({ error: 'That password is too long.' });
      if (slow(email)) return res.status(429).json({ error: 'Too many tries. Wait 15 minutes, or sign in with Google.' });
      const has = await U.hasPassword(email);
      // Test sites can skip the emailed code, but never for the owner, sellers or past buyers (see _users.guarded).
      // The owner, already signed in to the back office on this browser (ak), proves the owner's email is theirs.
      const ownerKey = !!b.ak && email === String(process.env.OWNER_EMAIL || '').trim().toLowerCase() && require('./_gate').isAdmin(b.ak);
      const skip = ownerKey || (U.skipCode() && !(await U.guarded(email)));
      if (b.do === 'signup') {
        // The Terms: a ticked box and a typed full name are the electronic signature.
        if (b.agree !== true) return res.status(400).json({ error: 'Read and agree to the VeeFam.io Terms of Service to create an account.' });
        if (String(b.name || '').trim().length < 2) return res.status(400).json({ error: 'Type your full name. It is your signature on the Terms.' });
        // An account that never confirmed its email can be started again (by whoever really owns the email).
        if (has) { const u0 = await U.get(email); if (!u0 || pwConfirmed(u0)) return res.status(409).json({ error: 'This email already has an account. Sign in instead.' }); }
        await U.setPassword(email, pass);
        // pwOk: this password has been confirmed with the emailed code. A new password always starts unconfirmed,
        // even on an account that already exists through Google.
        await U.put(email, Object.assign({ name: String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 80), pwOk: skip }, skip ? { verified: true } : {}));
        await U.sign(email, b.name, req);
      } else {
        if (!has) return res.status(404).json({ error: 'No account with this email yet. Create one, or sign in with Google.' });
        if (!(await U.checkPassword(email, pass))) { miss(email); return res.status(401).json({ error: 'That password is not right. Try again, or sign in with Google.' }); }
        tries.delete(email);
      }
      const u = await U.get(email);
      if ((u && pwConfirmed(u)) || skip) {
        if (!u || !pwConfirmed(u)) await U.put(email, { verified: true, pwOk: true });
        return res.json({ token: U.tokenFor(email), created: b.do === 'signup', terms: await U.hasAgreed(email) });
      }
      const sent = await sendCode(email, host);
      if (sent !== 'sent' && sent !== 'duplicate') return res.status(503).json({ error: 'We could not email your code just now. Try again in a minute, or sign in with Google.' });
      return res.json({ code: true, email: email });
    }
    if (b.do === 'verify') {
      const r = await U.checkCode(email, b.code);
      if (r === 'ok') { await U.put(email, { verified: true, pwOk: true }); return res.json({ token: U.tokenFor(email), terms: await U.hasAgreed(email) }); }
      return res.status(400).json({ error: r === 'wrong' ? 'That code is not right. Check the email and try again.' : r === 'tries' ? 'Too many wrong codes. Ask for a new one.' : 'That code has run out. Ask for a new one.' });
    }
    if (b.do === 'resend') {
      if (!(await U.hasPassword(email))) return res.json({ ok: true });
      const sent = await sendCode(email, host);
      return res.json({ ok: sent === 'sent' || sent === 'duplicate' });
    }
    return res.status(400).json({ error: 'Unknown request.' });
  } catch (e) {
    console.error('AUTH_FAIL', String(e && e.stack || e));
    return res.status(503).json({ error: 'Could not sign you in just now. Try again.' });
  }
};
