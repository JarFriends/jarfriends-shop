// The owner's changes to the product list, made on the back office page and kept in the site's storage.
// _products.js is the starting list. On top of it:
//   catalog/edits.json  { <product id>: { name, desc, price, stock, shipping, section, deal, shelf, hidden, photo } }
//   catalog/added.json  [ products the owner added: { id, name, price, min, stock, shipping, section, desc, added } ]
// shelf: the piece shows on the home page shelf and in the chat. hidden: the piece is off the site and cannot be ordered.
// photo: when the owner uploaded a photo (the time it was saved); the picture itself is photos/<id>.jpg (see photo.js).
const store = require('./_store');
// Pieces from the starting list that are on the shelf unless the owner says otherwise.
const SHELF = ['MONSTER', 'HARPIK', 'ASTRO'];
let memo = null;
// Each save of a product is its own new file: catalog/e/<product id>/<time>.json, holding everything saved for it.
// A new file name is never served stale, and the newest one wins, so an edit shows at once and two edits made close
// together cannot undo each other. catalog/edits.json is the older single file, still read underneath.
async function versions() {
  const { list } = await import('@vercel/blob');
  const by = {};
  let cursor;
  do {
    const r = await list({ prefix: 'catalog/e/', cursor: cursor, limit: 1000 });
    (r.blobs || []).forEach((b) => {
      const m = /^catalog\/e\/([A-Za-z0-9_-]+)\/(\d+)\.json$/.exec(b.pathname);
      if (m) (by[m[1]] = by[m[1]] || []).push({ t: Number(m[2]), path: b.pathname, url: b.url });
    });
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  Object.keys(by).forEach((k) => by[k].sort((x, y) => y.t - x.t));
  return by;
}
async function read() {
  if (!store.on()) return { e: {}, added: [] };
  if (memo && Date.now() - memo.at < 4000) return memo.v;
  const got = await Promise.all([store.read('catalog/edits.json'), store.read('catalog/added.json'), versions().catch((err) => { console.error('EDITS_LIST_FAIL', String(err && err.message || err)); return {}; })]);
  const e = Object.assign({}, got[0] || {}), by = got[2];
  await Promise.all(Object.keys(by).map(async (id) => { const v = await store.read(by[id][0].path); if (v) e[id] = Object.assign({}, e[id], v); }));
  const v = { e: e, added: Array.isArray(got[1]) ? got[1] : [], by: by };
  memo = { at: Date.now(), v: v };
  return v;
}
// The product list as the owner has it. Hidden pieces are left out unless opts.all is set (the back office).
// If the storage cannot be read, the starting list is used.
async function apply(list, opts) {
  let d = { e: {}, added: [] };
  try { d = await read(); } catch (err) { console.error('EDITS_READ_FAIL', String(err && err.message || err)); }
  const full = list.concat(d.added).map((p) => Object.assign({ shelf: SHELF.indexOf(p.id) >= 0 || !!p.added }, p, d.e[p.id] || {}));
  return opts && opts.all ? full : full.filter((p) => !p.hidden);
}
async function save(id, fields) {
  memo = null;
  const now = await read();
  await store.write('catalog/e/' + id + '/' + Date.now() + '.json', Object.assign({}, now.e[id], fields));
  memo = null;
  // Keep the last three saves of a product and clear out the rest.
  const old = ((now.by || {})[id] || []).slice(2).map((x) => x.url).filter(Boolean);
  if (old.length) { try { const { del } = await import('@vercel/blob'); await del(old); } catch (err) { console.error('EDITS_PRUNE_FAIL', String(err && err.message || err)); } }
}
// A new product. Its id is made here: a letter and the time, so it never clashes with another.
async function add(fields) {
  const was = await store.read('catalog/added.json');
  const added = Array.isArray(was) ? was.slice() : [];
  const p = Object.assign({ min: 1 }, fields, { id: 'P' + Date.now().toString(36).toUpperCase(), added: true });
  added.push(p);
  await store.write('catalog/added.json', added);
  memo = null;
  return p;
}
module.exports = { read, apply, save, add };
// The back office asks for the saved state afresh, never a remembered copy.
module.exports.fresh = () => { memo = null; };
