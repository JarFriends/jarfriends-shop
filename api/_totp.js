// Two-step sign-in with an authenticator app (Google Authenticator, Authy, 1Password...): standard 6-digit codes
// that change every 30 seconds (RFC 6238). Sellers and buyers keep theirs in users/totp/<hash>.json; the back office
// in settings/admin-totp.json. A secret only counts once a first code from the app has been typed in (on: true).
const crypto = require('crypto');
const store = require('./_store');
const { sign, verify } = require('./_lib');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32(buf) { let bits = 0, val = 0, out = ''; for (const x of buf) { val = (val << 8) | x; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
function unb32(s) { let bits = 0, val = 0; const out = []; for (const c of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function codeAt(secret, step) {
  const msg = Buffer.alloc(8); msg.writeUInt32BE(Math.floor(step / 0x100000000), 0); msg.writeUInt32BE(step >>> 0, 4);
  const h = crypto.createHmac('sha1', unb32(secret)).update(msg).digest(), o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0');
}
// The code now, or one step either side (a phone clock a little off still works).
function check(secret, code) {
  const c = String(code || '').replace(/\D/g, ''); if (c.length !== 6 || !secret) return false;
  const step = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((d) => crypto.timingSafeEqual(Buffer.from(codeAt(secret, step + d)), Buffer.from(c)));
}
const newSecret = () => b32(crypto.randomBytes(20));
const uri = (secret, label) => 'otpauth://totp/' + encodeURIComponent('VeeFam:' + label) + '?secret=' + secret + '&issuer=VeeFam&digits=6&period=30';

const hashOf = (e) => crypto.createHash('sha1').update(String(e).trim().toLowerCase()).digest('hex').slice(0, 24);
const keyOf = (who) => who === 'admin' ? 'settings/admin-totp.json' : 'users/totp/' + hashOf(who) + '.json';
async function get(who) { return (await store.read(keyOf(who)).catch(() => null)) || null; }
async function isOn(who) { const r = await get(who); return !!(r && r.on && r.secret); }
async function begin(who) { const s = newSecret(); await store.write(keyOf(who), { secret: s, on: false, at: Date.now() }); return { secret: s, uri: uri(s, who === 'admin' ? 'back office' : who) }; }
async function confirm(who, code) { const r = await get(who); if (!r || !r.secret) return { error: 'Start the setup again.' }; if (!check(r.secret, code)) return { error: 'That code is not right. Type the 6 digits the app shows now.' }; await store.write(keyOf(who), Object.assign(r, { on: true, onAt: Date.now() })); return { ok: true }; }
async function off(who, code) { const r = await get(who); if (!r || !r.on) return { ok: true }; if (!check(r.secret, code)) return { error: 'That code is not right.' }; await store.write(keyOf(who), { on: false, offAt: Date.now() }); return { ok: true }; }
async function ok(who, code) { const r = await get(who); return !!(r && r.on && check(r.secret, code)); }

// Sign-in for an account: a normal token, or, with two-step on, a 10-minute ticket that the code turns into a token.
async function issue(email, extra) {
  const e = String(email).toLowerCase();
  if (await isOn(e)) return Object.assign({ need2fa: true, ticket: sign({ t2: 1, e: e, x: Math.floor(Date.now() / 1000) + 600 }) }, extra || {});
  return Object.assign({ token: sign({ a: 1, e: e, x: Math.floor(Date.now() / 1000) + 30 * 86400 }) }, extra || {});
}
async function redeem(ticket, code) {
  const t = verify(String(ticket || ''));
  if (!t || t.t2 !== 1 || !t.e || t.x < Math.floor(Date.now() / 1000)) return { error: 'This sign-in timed out. Sign in again.' };
  if (!(await ok(t.e, code))) return { error: 'That code is not right. Type the 6 digits your authenticator app shows now.' };
  return { token: sign({ a: 1, e: t.e, x: Math.floor(Date.now() / 1000) + 30 * 86400 }) };
}
module.exports = { check, isOn, begin, confirm, off, ok, issue, redeem, codeAt, newSecret };
