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
async function read() {
  if (!store.on()) return { e: {}, added: [] };
  if (memo && Date.now() - memo.at < 10000) return memo.v;
  const both = await Promise.all([store.read('catalog/edits.json'), store.read('catalog/added.json')]);
  const v = { e: both[0] || {}, added: Array.isArray(both[1]) ? both[1] : [] };
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
  const e = Object.assign({}, (await store.read('catalog/edits.json')) || {});
  e[id] = Object.assign({}, e[id], fields);
  await store.write('catalog/edits.json', e);
  memo = null;
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
