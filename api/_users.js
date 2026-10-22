// V2V accounts. One account per email, for buying and selling alike.
// Sign in with Google (api/google.js) or with an email and password (api/auth.js). A password account must prove it
// owns the email with a 6-digit code before it can sign in, so nobody can open an account on someone else's email.
// ALLOW_UNVERIFIED=1 skips the code (test sites with no email set up). Never set it on a live site.
//
// Storage (private Blob store):
//   bidder/pw-<sha1(email)[0..20]>.json  { salt, hash }   the password (the same file the auction page always used)
//   users/<hash>.json                    the profile: { email, name, mode, verified, stripe, prefer, address, at }
//   users/code/<hash>.json               a pending email code: { h (its hash), x (expires), n (tries) }
const crypto = require('crypto');
const store = require('./_store');
const { sign } = require('./_lib');

const h = (email) => crypto.createHash('sha1').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 24);
const pwKey = (email) => 'bidder/pw-' + crypto.createHash('sha1').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 20) + '.json';
const skipCode = () => /^(1|yes|true)$/i.test((process.env.ALLOW_UNVERIFIED || '').trim());
const validEmail = (e) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(e);
// The sign-in every page uses: an account token, good for 30 days.
const tokenFor = (email) => sign({ a: 1, e: String(email).toLowerCase(), x: Math.floor(Date.now() / 1000) + 30 * 86400 });

async function get(email) { return (await store.read('users/' + h(email) + '.json')) || null; }
async function put(email, fields) {
  const was = (await get(email)) || { email: String(email).toLowerCase(), mode: 'buyer', at: Date.now() };
  const v = Object.assign(was, fields, { updated: Date.now() });
  await store.write('users/' + h(email) + '.json', v);
  return v;
}

function hashPw(pass, salt) { return crypto.scryptSync(pass, salt, 32).toString('hex'); }
async function setPassword(email, pass) {
  const salt = crypto.randomBytes(16).toString('hex');
  await store.write(pwKey(email), { salt: salt, hash: hashPw(pass, salt), at: Date.now() });
}
async function checkPassword(email, pass) {
  const u = await store.read(pwKey(email));
  if (!u || !u.hash) return null;
  return crypto.timingSafeEqual(Buffer.from(hashPw(pass, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
}
async function hasPassword(email) { return !!(await store.read(pwKey(email))); }

// A 6-digit code, emailed. Good for 20 minutes and 6 tries.
async function newCode(email) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await store.write('users/code/' + h(email) + '.json', { h: crypto.createHash('sha256').update(code).digest('hex'), x: Date.now() + 20 * 60000, n: 0 });
  return code;
}
async function checkCode(email, code) {
  const k = 'users/code/' + h(email) + '.json', c = await store.read(k);
  if (!c || Date.now() > c.x) return 'expired';
  if (c.n >= 6) return 'tries';
  const ok = crypto.timingSafeEqual(Buffer.from(c.h, 'hex'), crypto.createHash('sha256').update(String(code || '').trim()).digest());
  if (!ok) { c.n++; await store.write(k, c); return 'wrong'; }
  await store.write(k, { h: '', x: 0, n: 99 });
  return 'ok';
}

// Emails that must always prove they are real with a code, even on a test site with ALLOW_UNVERIFIED on:
// the owner, every seller, and anyone who has placed an order. Otherwise someone could open an account on that
// email and see its orders, addresses or seller shop.
async function guarded(email) {
  email = String(email).trim().toLowerCase();
  const list = [process.env.OWNER_EMAIL || ''].concat(String(process.env.SEED_SELLERS || '').split(',').map((x) => x.split('|')[1] || ''));
  if (list.some((x) => x.trim().toLowerCase() === email)) return true;
  if (await get(email).catch(() => true)) return true; // already has an account (Google, saved cards…)
  try { if (await require('./_sellers').byEmail(email)) return true; } catch (e) { return true; }
  try { return (await Promise.all((await store.sales()).map((s) => store.read(s.path)))).some((d) => d && String(d.email || '').trim().toLowerCase() === email); } catch (e) { return true; }
}

// The Terms of Service (public/terms.html). Everyone signs them electronically; a new version means signing again.
const TERMS_VERSION = '2026-10-20';
const agreed = (u) => !!(u && u.terms && u.terms.v === TERMS_VERSION);
// The signature is also kept in its own file that is written once and never rewritten, so a profile saved from an
// older copy (storage can lag a few seconds right after a write) can never lose it and ask people to sign again.
const termsKey = (email) => 'users/terms/' + h(email) + '-' + TERMS_VERSION + '.json';
async function hasAgreed(email, u) {
  if (agreed(u === undefined ? await get(email) : u)) return true;
  return !!(await store.read(termsKey(email)));
}
// The electronic signature: the version, the typed name, when, and from where (kept with the account).
async function signTerms(email, name, req) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (n.length < 2) return { error: 'Type your full name to sign.' };
  const ip = String((req && req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim().slice(0, 64);
  const ua = String((req && req.headers && req.headers['user-agent']) || '').slice(0, 200);
  const was = await get(email);
  if (await hasAgreed(email, was)) return { ok: true, already: true };
  const at = Date.now();
  const sig = { v: TERMS_VERSION, name: n, at: at, ip: ip, ua: ua };
  await store.write(termsKey(email), sig);
  await put(email, { terms: sig });
  // A copy of what they signed, for their records.
  const host = String(process.env.SITE_HOST || 'veefam.io').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const when = new Date(at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'long', timeStyle: 'short' }) + ' (Central)';
  await require('./_lib').mail(email, 'Your signed VeeFam.io Terms of Service', [
    'Thanks for joining VeeFam.io. This is your copy of the Terms of Service you signed.', '',
    'Signed by: ' + n, 'Email: ' + email, 'Date and time: ' + when, 'Terms version: ' + TERMS_VERSION, '',
    'The key points:',
    '- VeeFam.io is only a marketplace. You are fully responsible for what you buy, sell and trade.',
    '- VeeFam.io is not responsible for any loss of money, items or information.',
    '- Do not deal with anyone you do not trust. Never pay or get paid outside VeeFam.io: that voids any protection.',
    '- VeeFam.io may step in to help with a disagreement, but does not have to.',
    '- Disputes go to individual arbitration, not class actions. Illinois law applies.', '',
    'Read or save the full Terms at any time: https://' + host + '/terms.html', '',
    'You signed electronically by ticking the agreement box and typing your name. You will not be asked again unless the Terms change.'
  ], 'terms-' + TERMS_VERSION + '-' + h(email)).catch(() => null);
  return { ok: true };
}

module.exports = { TERMS_VERSION, agreed, hasAgreed, sign: signTerms, guarded, h, get, put, setPassword, checkPassword, hasPassword, newCode, checkCode, tokenFor, skipCode, validEmail };
