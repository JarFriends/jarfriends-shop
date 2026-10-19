// Build step: the marketplace (see api/_sellers.js and api/market.js). Runs after every other patch*.js.
// 1. Approved sellers' listings join the product list, so the shop, checkout, offers and stock treat them like any
//    other piece. Each carries "seller", so the market knows whose it is.
// 2. Promo codes are JarFriends' own discounts, so they do not work on a seller's piece.
const fs = require('fs');
const changes = [
  ['api/_edits.js', 'const full = list.concat(d.added).map(',
    "let sellerItems = [];\n  try { sellerItems = await require('./_sellers').products(); } catch (err) { console.error('SELLERS_READ_FAIL', String(err && err.message || err)); }\n  const full = list.concat(d.added, sellerItems).map("],
  ['api/order.js', '  const promo = code ? offline.promo(code, p.id, await offline.promoGroup(p.id)) : null;',
    "  if (code && /^S[0-9A-Z]{5,19}$/.test(p.id)) return res.status(400).json({ error: 'Promo codes work on JarFriends pieces only, not on pieces from other sellers. Remove the code to continue.' });\n  const promo = code ? offline.promo(code, p.id, await offline.promoGroup(p.id)) : null;"],
  // 3. Card payments for a seller who set up payouts go straight to the seller's Stripe, with V2V's cut as the
  //    application fee (see api/_connect.js). Everything else about the card page stays the same.
  ['api/stripe.js', "  if (!inv || !isCard(inv) || !(inv.u > 0)) return stop(res, 400, 'This payment link is not valid. Place the order again.');\n",
    "  if (!inv || !isCard(inv) || !(inv.u > 0)) return stop(res, 400, 'This payment link is not valid. Place the order again.');\n  const stripe = await require('./_connect').clientFor(inv);\n"],
  ['api/stripe.js', '  const label = offline.labelLink(host, token, inv);', "  await require('./_connect').markDirect(inv, stripe).catch((e) => console.error('MARK_DIRECT_FAIL', inv.n, String(e && e.message || e)));\n  const label = offline.labelLink(host, token, inv);"],
  // 4. Sellers hear about their own sales: a new order waiting for payment, and once it is paid (see _sellers.notifySale).
  ['api/testsheet.js', "      const om = inv && /^[A-Z0-9]{4,20}$/.test(String(inv.of || '')) ? String(inv.of) : '';",
    "      try { await require('./_sellers').notifySale(key, /payment due/i.test(String(row[13] || '')) ? 'placed' : 'paid'); } catch (e) { console.error('SELLER_NOTIFY_FAIL', key, String(e && e.message || e)); }\n      const om = inv && /^[A-Z0-9]{4,20}$/.test(String(inv.of || '')) ? String(inv.of) : '';"],
  ['api/admin.js', "await store.write('meta/' + s.n + '.json', Object.assign(was, { paidAt: Date.now(), paidHow: 'hand' }));",
    "await store.write('meta/' + s.n + '.json', Object.assign(was, { paidAt: Date.now(), paidHow: 'hand' }));\n      await require('./_sellers').notifySale(s.n, 'paid').catch(() => null);"],
  // 5. An offer on a seller's piece goes to that seller to answer, not to the owner.
  ['api/offer.js', "mail(owner(), 'Offer: '", "mail(await require('./_sellers').offerTo(p.id, owner()), 'Offer: '"],
  // 6. A seller's auction that ends with no bids, or whose winners never pay, is the seller's to know about.
  ['api/_sweep.js', "if (owner) await mail(owner, 'Auction ended with no bids: '", "if (owner) await mail(await require('./_sellers').offerTo(p.id, owner), 'Auction ended with no bids: '"],
  ['api/_sweep.js', "if (owner) await mail(owner, 'Auction winner did not pay: '", "if (owner) await mail(await require('./_sellers').offerTo(p.id, owner), 'Auction winner did not pay: '"]
];
changes.forEach(([f, find, put]) => {
  const s = fs.readFileSync(f, 'utf8');
  if (s.split(find).length !== 2) throw new Error('patchmarket: not found once in ' + f + ': ' + find.slice(0, 60));
  fs.writeFileSync(f, s.replace(find, () => put));
});
console.log('patchmarket: seller listings joined to the shop');
// 3. V2V starts empty: none of the JarFriends products. JarFriends lists its pieces as a seller, like everyone else.
//    Pieces the owner adds in the back office (Products tab) still work; they show as sold by V2V.
{
  const f = 'api/_products.js', s = fs.readFileSync(f, 'utf8');
  if (s.indexOf('V2V starts empty') < 0) fs.writeFileSync(f, s + '\n// V2V starts empty: the JarFriends products above are not sold here.\nmodule.exports.splice(0, module.exports.length);\n');
}
