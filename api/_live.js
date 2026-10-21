// Live shows, Whatnot style. A seller streams on YouTube, Twitch, TikTok or Instagram and pastes the link; V2V shows
// the stream next to a live bidding panel. The seller puts up one of their pieces at a time with a starting bid and a
// countdown; a bid near the end resets the clock, so nobody wins by sniping. When the clock runs out the top bidder
// wins and is emailed a link to pay (the same checkout as an accepted offer), due within 24 hours.
//
// Storage: live/<slug>.json { slug, title, url, status: 'scheduled'|'live'|'ended', startsAt, startedAt, endedAt,
//            lot: { id, pid, name, photo, start, bid, by, byName, n, endsAt, secs }, sold: [...], at }
//          live/<slug>/chat.json { msgs: [{ who, text, at }] }   (the last 60)
const crypto = require('crypto');
const store = require('./_store');
const M = require('./_sellers');
const lib = require('./_lib');

const RESET = 10000; // a bid in the last 10 seconds puts the clock back to 10 seconds
const inc = (c) => (c < 1000 ? 100 : c < 5000 ? 200 : c < 20000 ? 500 : 1000); // $1 under $10, $2 under $50, $5 under $200, then $10
const HOST = () => 'https://' + String(process.env.SITE_HOST || 'veefam.io').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const hash = (e) => crypto.createHash('sha1').update(String(e).toLowerCase()).digest('hex').slice(0, 12);
const nameOf = (e) => String(e || '').split('@')[0].replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 14) || 'bidder';

// Built-in streaming (go live from the site with your phone or computer camera) runs on LiveKit: sellers publish
// their camera to a room named after their shop, viewers watch it. Needs LIVEKIT_URL, LIVEKIT_API_KEY and
// LIVEKIT_API_SECRET; without them sellers can still paste a link to a stream elsewhere.
const lk = () => ({ url: (process.env.LIVEKIT_URL || '').trim(), key: (process.env.LIVEKIT_API_KEY || '').trim(), secret: (process.env.LIVEKIT_API_SECRET || '').trim() });
const camOn = () => { const c = lk(); return !!(c.url && c.key && c.secret); };
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
// A LiveKit access token (a signed JWT): who you are, which room, and whether you may send video (the seller) or only watch.
function lkToken(slug, identity, name, publish) {
  const c = lk(), now = Math.floor(Date.now() / 1000);
  const body = b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ iss: c.key, sub: identity, name: name, nbf: now - 10, exp: now + 6 * 3600, video: { room: 'v2v-' + slug, roomJoin: true, canPublish: !!publish, canSubscribe: true, canPublishData: false } });
  return body + '.' + crypto.createHmac('sha256', c.secret).update(body).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
async function watchToken(slug) {
  const show = await get(slug);
  if (!camOn() || !show || show.status !== 'live' || show.mode !== 'camera') return { error: 'This show is not streaming here right now.' };
  return { url: lk().url, token: lkToken(slug, 'v-' + crypto.randomBytes(6).toString('hex'), 'viewer', false) };
}
async function sellerToken(seller) {
  const show = await mine(seller);
  if (!camOn()) return { error: 'Going live from the site is not switched on yet.' };
  if (show.status !== 'live' || show.mode !== 'camera') return { error: 'Press Go live with my camera first.' };
  return { url: lk().url, token: lkToken(seller.slug, 's-' + seller.slug, seller.name, true) };
}
// What kind of stream a link is, and how to show it on the page.
function streamOf(url) {
  const u = String(url || '').trim();
  let m;
  if ((m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(u))) return { kind: 'youtube', embed: 'https://www.youtube.com/embed/' + m[1] + '?autoplay=1&mute=1&playsinline=1', url: u };
  if ((m = /twitch\.tv\/([A-Za-z0-9_]{3,25})(?:[/?#]|$)/.exec(u))) {
    const host = HOST().replace('https://', '');
    return { kind: 'twitch', embed: 'https://player.twitch.tv/?channel=' + m[1] + '&parent=' + host + '&parent=www.' + host + '&muted=true', url: u };
  }
  if (/tiktok\.com/.test(u)) return { kind: 'tiktok', embed: '', url: u };
  if (/instagram\.com/.test(u)) return { kind: 'instagram', embed: '', url: u };
  if (/facebook\.com|fb\.watch/.test(u)) return { kind: 'facebook', embed: '', url: u };
  if (/youtube\.com/.test(u)) return { kind: 'youtube', embed: '', url: u };
  return { kind: 'link', embed: '', url: u };
}

let memo = {};
async function get(slug) {
  const c = memo[slug];
  if (c && Date.now() - c.at < 900) return c.v;
  const v = await store.read('live/' + slug + '.json');
  memo[slug] = { at: Date.now(), v: v };
  return v;
}
async function put(show) { show.at = Date.now(); await store.write('live/' + show.slug + '.json', show); memo[show.slug] = { at: Date.now(), v: show }; }

// The pay link for a winner: the same signed checkout as an accepted offer, good for 24 hours.
function payLink(lot, email) {
  return HOST() + '/order.html?offer=' + lib.sign({ oa: 1, n: 'LIVE-' + lot.id, pid: lot.pid, q: 1, c: lot.bid, x: Math.floor(Date.now() / 1000) + 24 * 3600 }) + '&email=' + encodeURIComponent(email);
}
// When a piece's clock has run out: the top bidder wins (or it passes with no bids).
async function settle(show) {
  const lot = show.lot;
  if (!lot || Date.now() < lot.endsAt) return false;
  const shop = await M.bySlug(show.slug);
  const done = { id: lot.id, pid: lot.pid, name: lot.name, photo: lot.photo, price: lot.bid || 0, by: lot.by || '', byName: lot.byName || '', at: Date.now(), n: lot.n };
  show.lot = null;
  show.sold = [done].concat(show.sold || []).slice(0, 50);
  await put(show);
  if (lot.byEmail) {
    const pay = payLink(lot, lot.byEmail);
    const body = ['You won ' + lot.name + ' in the ' + (shop ? shop.name : 'V2V') + ' live show for $' + (lot.bid / 100).toFixed(2) + '.', 'Pay within 24 hours to claim it. The seller ships it once it is paid.'];
    await lib.mail(lot.byEmail, 'You won: ' + lot.name, body.concat(['', 'Pay here:', pay]), 'live-win-' + lot.id).catch(() => null);
    await store.write('live/' + show.slug + '/won/' + lot.id + '.json', { email: lot.byEmail, pay: pay, name: lot.name, price: lot.bid, at: Date.now() });
    if (shop) await lib.mail(shop.email, 'Sold live: ' + lot.name + ' for $' + (lot.bid / 100).toFixed(2), ['Sold in your live show to @' + lot.byName + ' for $' + (lot.bid / 100).toFixed(2) + '.', 'They have 24 hours to pay. You get the usual "Paid, ship it" email once they do.'], 'live-sold-' + lot.id).catch(() => null);
  }
  return true;
}

// Every show that is live or coming up, for the Live page and the home page.
async function list() {
  if (!store.on()) return [];
  const { list: ls } = await import('@vercel/blob');
  const r = await ls({ prefix: 'live/', limit: 1000 });
  const paths = (r.blobs || []).map((b) => b.pathname).filter((p) => /^live\/[a-z0-9-]+\.json$/.test(p));
  const shops = {}; (await M.all()).forEach((s) => { shops[s.slug] = s; });
  const shows = (await Promise.all(paths.map((p) => store.read(p)))).filter((s) => s && shops[s.slug] && shops[s.slug].status === 'approved' && (s.status === 'live' || (s.status === 'scheduled' && s.startsAt > Date.now() - 3 * 3600000)));
  return shows.map((s) => ({ slug: s.slug, shop: shops[s.slug].name, title: s.title, status: s.status, startsAt: s.startsAt || 0, kind: s.mode === 'camera' ? 'camera' : streamOf(s.url).kind, lot: s.lot ? { name: s.lot.name, photo: s.lot.photo } : null }))
    .sort((a, b) => (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1) || a.startsAt - b.startsAt);
}
// One show, as a viewer sees it. me: the viewer's email if signed in (to show their own win and pay link).
async function view(slug, me) {
  let show = await get(slug);
  if (!show) return null;
  if (show.lot && Date.now() >= show.lot.endsAt) { show = JSON.parse(JSON.stringify(show)); await settle(show); }
  const shop = await M.bySlug(slug);
  const chat = (await store.read('live/' + slug + '/chat.json')) || { msgs: [] };
  const lot = show.lot ? { id: show.lot.id, pid: show.lot.pid, name: show.lot.name, photo: show.lot.photo, desc: show.lot.desc || '', start: show.lot.start, bid: show.lot.bid, byName: show.lot.byName || '', n: show.lot.n, endsAt: show.lot.endsAt, next: show.lot.bid ? show.lot.bid + inc(show.lot.bid) : show.lot.start, mine: !!(me && show.lot.by === hash(me)) } : null;
  let won = null;
  if (me) { const h = hash(me); const w = (show.sold || []).filter((x) => x.by === h && Date.now() - x.at < 24 * 3600000)[0]; if (w) { const rec = await store.read('live/' + slug + '/won/' + w.id + '.json'); if (rec) won = { name: w.name, price: w.price, pay: rec.pay }; } }
  return { slug: slug, shop: shop ? shop.name : slug, title: show.title, status: show.status, startsAt: show.startsAt || 0, stream: show.mode === 'camera' && camOn() ? { kind: 'camera' } : streamOf(show.url), lot: lot, sold: (show.sold || []).slice(0, 12).map((x) => ({ name: x.name, price: x.price, byName: x.byName, photo: x.photo, at: x.at })), chat: chat.msgs.slice(-40), now: Date.now(), won: won };
}
async function bid(slug, me, amt) {
  const show = await store.read('live/' + slug + '.json');
  if (!show || show.status !== 'live') return { error: 'This show is not live right now.' };
  if (show.lot && Date.now() >= show.lot.endsAt) { await settle(show); return { error: 'Too late: that piece just sold.' }; }
  const lot = show.lot;
  if (!lot) return { error: 'Nothing is up for bids right now. Hang on for the next piece.' };
  const shop = await M.bySlug(slug);
  if (shop && String(shop.email).toLowerCase() === me) return { error: 'You cannot bid on your own piece.' };
  const min = lot.bid ? lot.bid + inc(lot.bid) : lot.start;
  amt = Math.round(Number(amt) || 0);
  if (amt < min) return { error: 'The bid is now at least $' + (min / 100).toFixed(2) + '.', next: min };
  if (amt > lot.start * 50 + 500000) return { error: 'That bid is too high. Check the amount.' };
  if (lot.by === hash(me) && lot.bid) return { error: 'You already have the top bid.' };
  Object.assign(lot, { bid: amt, by: hash(me), byName: nameOf(me), byEmail: me, n: (lot.n || 0) + 1 });
  if (lot.endsAt - Date.now() < RESET) lot.endsAt = Date.now() + RESET;
  await put(show);
  return { ok: true, bid: amt, next: amt + inc(amt), endsAt: lot.endsAt };
}
async function say(slug, me, text, seller) {
  text = String(text || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (text.length < 1) return { error: 'Write something first.' };
  const show = await get(slug);
  if (!show || show.status === 'ended') return { error: 'This show is not on right now.' };
  const c = (await store.read('live/' + slug + '/chat.json')) || { msgs: [] };
  c.msgs.push({ who: seller ? '⭐ ' + seller : nameOf(me), text: text, at: Date.now() });
  c.msgs = c.msgs.slice(-60);
  await store.write('live/' + slug + '/chat.json', c);
  return { ok: true };
}

// ---- The seller's controls ----
async function mine(seller) { return (await store.read('live/' + seller.slug + '.json')) || { slug: seller.slug, title: '', url: '', status: 'off', sold: [] }; }
async function setShow(seller, b) {
  const show = await mine(seller);
  const tidy = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  if (b.title != null) show.title = tidy(b.title, 80);
  if (b.url != null) { const u = tidy(b.url, 300); if (u && !/^https:\/\//.test(u)) return { error: 'Paste the full link to your stream, starting with https://' }; show.url = u; }
  if (b.action === 'schedule') { const t = Date.parse(b.startsAt); if (!(t > Date.now())) return { error: 'Pick a time in the future.' }; show.status = 'scheduled'; show.startsAt = t; }
  else if (b.action === 'go') { show.mode = b.mode === 'camera' ? 'camera' : 'link'; if (show.mode === 'camera' && !camOn()) return { error: 'Going live from the site is not switched on yet.' }; if (show.mode === 'link' && !show.url) return { error: 'Paste your stream link first.' }; show.status = 'live'; show.startedAt = Date.now(); show.endedAt = 0; if (!show.title) show.title = seller.name + ' live'; }
  else if (b.action === 'end') { if (show.lot) { show.lot.endsAt = Date.now(); await settle(show); } show.status = 'ended'; show.endedAt = Date.now(); show.lot = null; }
  await put(show);
  return { ok: true, show: show };
}
async function putUp(seller, b) {
  const show = await mine(seller);
  if (show.status !== 'live') return { error: 'Go live first, then put pieces up.' };
  if (show.lot && Date.now() < show.lot.endsAt) return { error: 'A piece is still up. Wait for it to sell, or end it.' };
  if (show.lot) await settle(show);
  const p = (await M.listings()).filter((x) => x.id === String(b.pid || '') && x.seller === seller.slug && !x.removed)[0];
  if (!p) return { error: 'Pick one of your pieces.' };
  if (p.hidden) return { error: 'That piece is hidden from the market, so the winner could not check out. Untick "Hide it from the market" on it first.' };
  const start = Math.round(Number(b.start) * 100);
  if (!(start >= 100)) return { error: 'The starting bid must be at least $1.' };
  const secs = [15, 20, 30, 45, 60, 90].indexOf(Number(b.secs)) >= 0 ? Number(b.secs) : 30;
  show.lot = { id: 'L' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase(), pid: p.id, name: p.name, desc: String(p.desc || '').slice(0, 300), photo: p.photo ? '/api/photo?id=' + p.id + '&v=' + p.photo : '', start: start, bid: 0, by: '', byName: '', n: 0, secs: secs, endsAt: Date.now() + secs * 1000 };
  await put(show);
  return { ok: true, show: show };
}
async function endLot(seller) {
  const show = await mine(seller);
  if (!show.lot) return { error: 'Nothing is up right now.' };
  show.lot.endsAt = Date.now();
  await settle(show);
  return { ok: true, show: show };
}
// What the seller sees: their show, plus who is bidding (names only).
const forSeller = (show) => { const s = JSON.parse(JSON.stringify(show)); if (s.lot) delete s.lot.byEmail; return s; };
module.exports = { camOn, watchToken, sellerToken, list, view, bid, say, mine, setShow, putUp, endLot, forSeller, streamOf, inc };
