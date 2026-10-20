// Trades: a buyer who likes a piece offers something of their own for it, with a photo, a message, and money
// either way (they add money, they want money back, or an even swap). The seller accepts or declines from their
// Seller Hub; on accept both sides get each other's email to arrange the swap.
//
// Storage: trades/<seller slug>/<id>.json
//   { id, slug, pid, product, email, name, text, dir: 'even'|'add'|'ask', diff (cents), photo (time saved),
//     status: 'pending'|'accepted'|'declined'|'withdrawn', reply, at, answeredAt }
// The photo is photos/<id>.jpg, served by /api/photo like other photos.
const store = require('./_store');
const crypto = require('crypto');
const M = require('./_sellers');

async function paths(prefix) {
  if (!store.on()) return [];
  const { list } = await import('@vercel/blob');
  const out = [];
  let cursor;
  do { const r = await list({ prefix: prefix, cursor: cursor, limit: 1000 }); r.blobs.forEach((x) => out.push(x.pathname)); cursor = r.hasMore ? r.cursor : null; } while (cursor);
  return out;
}
const read = async (prefix) => (await Promise.all((await paths(prefix)).map((p) => store.read(p)))).filter((x) => x && x.id).sort((a, b) => b.at - a.at);
const pub = (t) => Object.assign({}, t, { photoUrl: t.photo ? '/api/photo?id=' + t.id + '&v=' + t.photo : '' });
const money = (c) => '$' + (c / 100).toFixed(2);
const terms = (t) => t.dir === 'add' ? 'they add ' + money(t.diff) : t.dir === 'ask' ? 'they want ' + money(t.diff) + ' back' : 'an even swap';

// A new trade request from a signed-in buyer. photo: a JPEG buffer (required).
async function create(email, f, photo) {
  const l = (await M.products()).filter((p) => p.id === String(f.pid || ''))[0];
  if (!l) return { error: 'That piece is not for sale right now.' };
  const seller = await M.bySlug(l.seller);
  if (!seller) return { error: 'That piece is not for sale right now.' };
  if (String(seller.email).toLowerCase() === email) return { error: 'This is your own piece.' };
  const text = String(f.text || '').replace(/\r/g, '').trim().slice(0, 1000);
  if (text.length < 5) return { error: 'Describe what you are offering to trade.' };
  if (!photo) return { error: 'Add a photo of what you are offering.' };
  const dir = ['add', 'ask'].indexOf(f.dir) >= 0 ? f.dir : 'even';
  const diff = dir === 'even' ? 0 : Math.round(Number(String(f.diff || '').replace(/[^0-9.]/g, '')) * 100);
  if (dir !== 'even' && !(diff > 0 && diff <= 10000000)) return { error: 'Enter the money amount, or pick an even swap.' };
  const mine = await read('trades/' + seller.slug + '/');
  if (mine.some((t) => t.email === email && t.pid === l.id && t.status === 'pending')) return { error: 'You already sent a trade for this piece. Wait for the seller to answer.' };
  if (mine.filter((t) => t.email === email && Date.now() - t.at < 86400000).length >= 10) return { error: 'That is a lot of trades for one day. Try again tomorrow.' };
  const id = 'T' + crypto.randomBytes(12).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 15);
  const t = { id: id, slug: seller.slug, pid: l.id, product: l.name, email: email, name: String(f.name || '').trim().slice(0, 60), text: text, dir: dir, diff: diff, photo: Date.now(), status: 'pending', reply: '', at: Date.now() };
  const { put } = await import('@vercel/blob');
  await put('photos/' + id + '.jpg', photo, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/jpeg' });
  await store.write('trades/' + seller.slug + '/' + id + '.json', t);
  return { ok: true, trade: pub(t), seller: seller };
}

const forSeller = async (slug) => (await read('trades/' + slug + '/')).map(pub);
const forBuyer = async (email) => (await read('trades/')).filter((t) => t.email === email).map((t) => pub(Object.assign({}, t, { email: undefined })));

async function answer(slug, id, yes, reply) {
  const p = 'trades/' + slug + '/' + String(id || '').replace(/[^A-Za-z0-9]/g, '') + '.json';
  const t = await store.read(p);
  if (!t || !t.id) return { error: 'That trade was not found.' };
  if (t.status !== 'pending') return { error: 'This trade was already answered.' };
  Object.assign(t, { status: yes ? 'accepted' : 'declined', reply: String(reply || '').replace(/\r/g, '').trim().slice(0, 1000), answeredAt: Date.now() });
  await store.write(p, t);
  return { ok: true, trade: t };
}
async function withdraw(email, slug, id) {
  const p = 'trades/' + String(slug || '').replace(/[^a-z0-9-]/g, '') + '/' + String(id || '').replace(/[^A-Za-z0-9]/g, '') + '.json';
  const t = await store.read(p);
  if (!t || t.email !== email) return { error: 'That trade was not found.' };
  if (t.status !== 'pending') return { error: 'The seller already answered this trade.' };
  t.status = 'withdrawn'; t.answeredAt = Date.now();
  await store.write(p, t);
  return { ok: true };
}

module.exports = { create, forSeller, forBuyer, answer, withdraw, terms, money };
