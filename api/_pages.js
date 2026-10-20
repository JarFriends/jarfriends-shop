// Pages the owner makes in the back office (Pages tab), shown at /p/<address>, plus built-in pages the owner has
// turned off. A page is a list of blocks: headings, text, pictures and buttons.
// Storage: pages/p/<slug>.json { slug, title, blocks, menu, live, at, updated }   pages/off.json { off: [paths] }
const store = require('./_store');

// Built-in pages the owner may turn off (the rest keep the shop working: checkout, accounts, Seller Hub, Terms).
const OPTIONAL = { '/sold.html': 'Sold prices', '/giveaway.html': 'Giveaway and vote', '/market.html': 'Shops and sellers', '/wishlist.html': 'My wishlist', '/help.html': 'Help' };
const RESERVED = ['admin', 'api', 'seller', 'me', 'order', 'terms', 'shop', 'market', 'giveaway', 'sold', 'p', 'index', 'help', 'account', 'wishlist'];

async function paths(prefix) {
  if (!store.on()) return [];
  const { list } = await import('@vercel/blob');
  const out = []; let cursor;
  do { const r = await list({ prefix: prefix, cursor: cursor, limit: 1000 }); r.blobs.forEach((x) => out.push(x.pathname)); cursor = r.hasMore ? r.cursor : null; } while (cursor);
  return out;
}
const slugOf = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
const clean = (x, n) => String(x == null ? '' : x).replace(/\r/g, '').slice(0, n);

let memo = null;
async function all() {
  if (memo && Date.now() - memo.at < 10000) return memo.v;
  const pages = (await Promise.all((await paths('pages/p/')).map((p) => store.read(p)))).filter((x) => x && x.slug);
  const off = ((store.on() && await store.read('pages/off.json')) || {}).off || [];
  pages.sort((a, b) => (a.at || 0) - (b.at || 0));
  memo = { at: Date.now(), v: { pages: pages, off: off } };
  return memo.v;
}
const forget = () => { memo = null; };
// What every page needs: the menu links to the owner's pages, and which built-in pages are off.
async function menu() { const a = await all(); return { menu: a.pages.filter((p) => p.live && p.menu).map((p) => ({ title: p.title, href: '/p/' + p.slug })), off: a.off }; }
async function one(slug, admin) { const p = await store.read('pages/p/' + slugOf(slug) + '.json'); return p && (p.live || admin) ? p : null; }

function blocks(list) {
  if (!Array.isArray(list)) return { error: 'The page has no content.' };
  if (list.length > 80) return { error: 'Keep a page to 80 blocks or fewer.' };
  const out = [];
  for (const b of list) {
    const type = ['heading', 'text', 'image', 'button'].indexOf(b && b.type) >= 0 ? b.type : null;
    if (!type) continue;
    const x = { type: type };
    if (type === 'heading' || type === 'text' || type === 'button') x.text = clean(b.text, type === 'text' ? 6000 : 200).trim();
    if (type === 'image') { x.url = String(b.url || ''); if (!/^\/api\/photo\?id=[A-Za-z0-9_-]{1,20}$/.test(x.url)) return { error: 'A picture on the page needs to be uploaded again.' }; x.alt = clean(b.alt, 150).trim(); x.size = ['small', 'medium', 'full'].indexOf(b.size) >= 0 ? b.size : 'full'; }
    if (type === 'image' || type === 'button') { x.link = clean(b.link, 300).trim(); if (x.link && !/^(https?:\/\/|\/|mailto:)/.test(x.link)) return { error: 'Links should start with https://, / or mailto:.' }; }
    if (type === 'button' && (!x.text || !x.link)) return { error: 'Each button needs words and a link.' };
    if ((type === 'heading' || type === 'text') && !x.text) continue;
    out.push(x);
  }
  return { list: out };
}
async function save(b) {
  const title = clean(b.title, 120).trim();
  if (title.length < 2) return { error: 'Give the page a title.' };
  const slug = slugOf(b.slug || title);
  if (slug.length < 2) return { error: 'Give the page an address (letters and numbers).' };
  if (RESERVED.indexOf(slug) >= 0) return { error: 'That address is used by the site. Pick another one.' };
  const was = slugOf(b.was || '');
  const bl = blocks(b.blocks); if (bl.error) return bl;
  const old = await store.read('pages/p/' + slug + '.json');
  if (old && was !== slug) return { error: 'There is already a page at /p/' + slug + '. Pick another address.' };
  const prev = was ? await store.read('pages/p/' + was + '.json') : null;
  const p = { slug: slug, title: title, blocks: bl.list, menu: !!b.menu, live: b.live !== false, at: (prev && prev.at) || (old && old.at) || Date.now(), updated: Date.now() };
  await store.write('pages/p/' + slug + '.json', p);
  if (was && was !== slug && prev) await remove(was);
  forget();
  return { ok: true, page: p };
}
async function remove(slug) {
  slug = slugOf(slug);
  const { list, del } = await import('@vercel/blob');
  const r = await list({ prefix: 'pages/p/' + slug + '.json', limit: 5 });
  const hit = (r.blobs || []).filter((x) => x.pathname === 'pages/p/' + slug + '.json');
  if (hit.length) await del(hit.map((x) => x.url));
  forget();
  return { ok: true };
}
async function setOff(path, off) {
  if (!OPTIONAL[path]) return { error: 'That page keeps the shop working, so it cannot be turned off.' };
  const cur = ((await store.read('pages/off.json')) || {}).off || [];
  const next = cur.filter((x) => x !== path).concat(off ? [path] : []);
  await store.write('pages/off.json', { off: next, at: Date.now() });
  forget();
  return { ok: true, off: next };
}
module.exports = { OPTIONAL, all, menu, one, save, remove, setOff };
