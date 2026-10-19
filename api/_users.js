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

module.exports = { guarded, h, get, put, setPassword, checkPassword, hasPassword, newCode, checkCode, tokenFor, skipCode, validEmail };
