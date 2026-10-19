// Build step: the marketplace (see api/_sellers.js and api/market.js). Runs after every other patch*.js.
// 1. Approved sellers' listings join the product list, so the shop, checkout, offers and stock treat them like any
//    other piece. Each carries "seller", so the market knows whose it is.
// 2. Promo codes are JarFriends' own discounts, so they do not work on a seller's piece.
const fs = require('fs');
const changes = [
  ['api/_edits.js', 'const full = list.concat(d.added).map(',
    "let sellerItems = [];\n  try { sellerItems = await require('./_sellers').products(); } catch (err) { console.error('SELLERS_READ_FAIL', String(err && err.message || err)); }\n  const full = list.concat(d.added, sellerItems).map("],
  ['api/order.js', '  const promo = code ? offline.promo(code, p.id, await offline.promoGroup(p.id)) : null;',
    "  if (code && /^S[0-9A-Z]{5,19}$/.test(p.id)) return res.status(400).json({ error: 'Promo codes work on JarFriends pieces only, not on pieces from other sellers. Remove the code to continue.' });\n  const promo = code ? offline.promo(code, p.id, await offline.promoGroup(p.id)) : null;"]
];
changes.forEach(([f, find, put]) => {
  const s = fs.readFileSync(f, 'utf8');
  if (s.split(find).length !== 2) throw new Error('patchmarket: not found once in ' + f + ': ' + find.slice(0, 60));
  fs.writeFileSync(f, s.replace(find, () => put));
});
console.log('patchmarket: seller listings joined to the shop');
