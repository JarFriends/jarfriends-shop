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
  ['api/stripe.js', '  const label = offline.labelLink(host, token, inv);', "  await require('./_connect').markDirect(inv, stripe, pay.id).catch((e) => console.error('MARK_DIRECT_FAIL', inv.n, String(e && e.message || e)));\n  const label = offline.labelLink(host, token, inv);"],
  // 4. Sellers hear about their own sales: a new order waiting for payment, and once it is paid (see _sellers.notifySale).
  ['api/testsheet.js', "      const om = inv && /^[A-Z0-9]{4,20}$/.test(String(inv.of || '')) ? String(inv.of) : '';",
    "      try { await require('./_sellers').notifySale(key, /payment due/i.test(String(row[13] || '')) ? 'placed' : 'paid'); } catch (e) { console.error('SELLER_NOTIFY_FAIL', key, String(e && e.message || e)); }\n      const om = inv && /^[A-Z0-9]{4,20}$/.test(String(inv.of || '')) ? String(inv.of) : '';"],
  ['api/admin.js', "await store.write('meta/' + s.n + '.json', Object.assign(was, { paidAt: Date.now(), paidHow: 'hand' }));",
    "await store.write('meta/' + s.n + '.json', Object.assign(was, { paidAt: Date.now(), paidHow: 'hand' }));\n      await require('./_sellers').notifySale(s.n, 'paid').catch(() => null);"],
  // 5. An offer on a seller's piece goes to that seller to answer, not to the owner.
  ['api/offer.js', "mail(owner(), 'Offer: '", "mail(await require('./_sellers').offerTo(p.id, owner()), 'Offer: '"],
  // 6. A seller's auction that ends with no bids, or whose winners never pay, is the seller's to know about.
  ['api/_sweep.js', "if (owner) await mail(owner, 'Auction ended with no bids: '", "if (owner) await mail(await require('./_sellers').offerTo(p.id, owner), 'Auction ended with no bids: '"],
  ['api/_sweep.js', "if (owner) await mail(owner, 'Auction winner did not pay: '", "if (owner) await mail(await require('./_sellers').offerTo(p.id, owner), 'Auction winner did not pay: '"],
  // 7. Calculated shipping (see _ship.js): a seller's piece can be priced from the seller's ZIP to the buyer's address.
  //    The order page asks for the price the same way it already does for addresses outside the USA.
  ['api/order.js', "nft: !!nftBy[p.id], desc:", "nft: !!nftBy[p.id], calc: (more[p.id] || {}).shipMode === 'calc', desc:"],
  ['api/order.js', "if (!/^[A-Z]{2}$/.test(cc) || cc === 'US') return res.status(400).json({ error: 'Pick your country.' });",
    "if (cc === 'US') {\n        const cs = await require('./_ship').calcFor(String(q.product || ''), { street1: String(q.street || '').slice(0, 120), street2: String(q.line2 || '').slice(0, 60), city: String(q.city || '').slice(0, 60), state: String(q.state || '').slice(0, 30), zip: String(q.zip || '').slice(0, 10) }, qty);\n        if (!cs) return res.status(400).json({ error: 'This piece has a set shipping price.' });\n        return cs.error ? res.status(400).json({ error: cs.error }) : res.json({ ship: cs.cents, service: cs.service });\n      }\n      if (!/^[A-Z]{2}$/.test(cc)) return res.status(400).json({ error: 'Pick your country.' });"],
  ['api/order.js', "  let ship = isNft ? 0 : shipBy[p.id] || 0;\n",
    "  let ship = isNft ? 0 : shipBy[p.id] || 0;\n  // A seller's piece: sellers ship inside the USA, and calculated shipping is priced now for this address.\n  if (/^S[0-9A-Z]{5,19}$/.test(p.id) && intl) return res.status(400).json({ error: 'This seller ships inside the USA only.' });\n  if (!isNft && !intl) {\n    const cs = await require('./_ship').calcFor(p.id, { name: name, street1: street, street2: line2, city: city, state: state, zip: zip }, qty).catch((e) => ({ error: String(e && e.message || e) }));\n    if (cs && cs.error) return res.status(400).json({ error: cs.error });\n    if (cs) ship = cs.cents;\n  }\n"],
  ['public/order.html', "if (!p || p.nft || cc() === 'US') { iq = ", "if (!p || p.nft || (cc() === 'US' && !p.calc)) { iq = "],
  ['public/order.html', "var ship = intl ? (iq.cents || 0) : Math.round(Number(p.ship || 0) * 100);", "var ship = (intl || (p.calc && !p.nft)) ? (iq.cents || 0) : Math.round(Number(p.ship || 0) * 100);"],
  ['public/order.html', "$('sShip').textContent = intl ?", "$('sShip').textContent = (intl || (p.calc && !p.nft)) ?"],
  ['public/order.html', "var bad = p.stock < p.min || q > p.stock || (intl && !iq.cents);", "var bad = p.stock < p.min || q > p.stock || ((intl || (p.calc && !p.nft)) && !iq.cents);"],
  ['public/order.html', "if (cc() !== 'US') { iq.cents = 0; total(); soon(); }", "if (cc() !== 'US' || (cur() && cur().calc)) { iq.cents = 0; total(); soon(); }"],
  // Shopping cart, combined shipping: a seller's second and later pieces in one cart ship in the same box, so they
  // carry no shipping of their own (api/market.js cart-place sets req.v2vBundle; a buyer cannot set it).
  ['api/order.js', '  // Paying by card adds the card fee on top of the order and shipping', "  if (req.v2vBundle && !isNft) ship = 0;\n  // Paying by card adds the card fee on top of the order and shipping"],
  // Offers never hold a piece: while an offer is waiting, accepted or countered, anyone can still buy it, and the
  // first to pay gets it. (Set OFFER_HOLDS=on to hold pieces for offers again.)
  ['api/_holds.js', 'async function add(pid, n, q, until) {\n  await release(n);', "async function add(pid, n, q, until) {\n  await release(n);\n  if (!/^on$/i.test((process.env.OFFER_HOLDS || '').trim())) { memo = null; return; }"],
  // A short message with an offer (up to 200 characters): carried in the offer, shown to the seller everywhere.
  ['api/offer.js', "const o = { o: 1, w: pay,", "const note = clip(b.note, 200).replace(/\\s+/g, ' ');\n  const o = { o: 1, m: note, w: pay,"],
  ['api/offer.js', "await saveOffer(o, tok, 'pending');", "await saveOffer(o, tok, 'pending', o.m ? { note: o.m } : {});"],
  ['api/offer.js', "'Wants to pay with: ' + pay, '',", "'Wants to pay with: ' + pay, o.m ? 'Their message: ' + o.m : '', '',"],
  ['api/offer.js', "' · would pay with ' + pay + ' · answer it: '", "' · would pay with ' + pay + (o.m ? '\\nMessage: ' + o.m : '') + ' · answer it: '"],
  ['api/offer.js', "buyer: o.b, email: o.e, pay: o.w || '' });", "buyer: o.b, email: o.e, pay: o.w || '', note: o.m || '' });"],
  // International shipping for sellers who switch it on (Shop settings): their own postage with a customs form.
  ['api/label.js', 'module.exports.quoteIntl = async (o) => {\n', "module.exports.quoteIntl = async (o) => {\n  if (/^S[0-9A-Z]{5,19}$/.test(String(o.pid || ''))) return require('./_ship').quoteIntl(o);\n"],
  ['api/order.js', "  if (/^S[0-9A-Z]{5,19}$/.test(p.id) && intl) return res.status(400).json({ error: 'This seller ships inside the USA only.' });", "  if (/^S[0-9A-Z]{5,19}$/.test(p.id) && intl) { const li0 = (await require('./_sellers').listings()).filter((x) => x.id === p.id)[0], sl0 = li0 && (await require('./_sellers').bySlug(li0.seller)); if (!sl0 || !require('./_ship').shipsIntl(sl0)) return res.status(400).json({ error: 'This seller ships inside the USA only.' }); }"],
  // NFTs from sellers: a piece in the NFTs category is sent to a wallet, so checkout asks the buyer for their wallet
  // address instead of a mailing address (and charges no shipping).
  ['api/_offline.js', 'async function nfts() {\n  const v = {};', "async function nfts() {\n  const v = {};\n  try { const SL = require('./_sellers'); (await SL.listings()).forEach((p) => { if (!p.removed && SL.sectionOf(p) === 'NFTs') v[p.id] = true; }); } catch (e) { console.error('SELLER_NFTS_FAIL', String(e && e.message || e)); }"],
  // Sales tax by the buyer's state, wherever VeeFam collects (back office > Sellers > Sales tax; see api/_tax.js).
  ['api/order.js', "  const tax = !isNft && !intl && (st === 'il' || st === 'ill' || st === 'illinois') ? Math.round((list - cut - cd) * taxPct() / 100) : 0;", "  const taxRate = !isNft && !intl ? await require('./_tax').rateFor(st) : 0;\n  const tax = taxRate ? Math.round((list - cut - cd) * taxRate / 100) : 0;"],
  ['api/order.js', 'taxIL: taxPct(),', "taxIL: taxPct(), taxRates: (await require('./_tax').get()).rates, taxStates: require('./_tax').STATES,"],
  ['public/order.html', "    var tax = !nft && !intl && taxPct && (st === 'il' || st === 'ill' || st === 'illinois') ? Math.round((list - cut - cd) * taxPct / 100) : 0;", "    var tcode = taxCode(st), trate = !nft && !intl ? Number(taxRates[tcode]) || 0 : 0;\n    var tax = trate ? Math.round((list - cut - cd) * trate / 100) : 0;"],
  ['public/order.html', "$('sTaxL').textContent = 'Illinois sales tax (' + taxPct + '%)';", "$('sTaxL').textContent = 'Sales tax (' + tcode + ' ' + trate + '%)';"],
  ['public/order.html', "    taxPct = Number(r.taxIL) || 0;", "    taxPct = Number(r.taxIL) || 0; taxRates = r.taxRates || (taxPct ? { IL: taxPct } : {}); taxStates = r.taxStates || {}; taxPct = Object.keys(taxRates).length ? 1 : 0;"],
  ['public/order.html', "    if (taxPct) { $('taxNote').textContent = 'Shipping to Illinois adds ' + taxPct + '% Illinois sales tax on the pieces. Other states pay no sales tax.'; $('taxNote').hidden = false; }", "    if (taxPct) { $('taxNote').textContent = 'Sales tax is added for orders shipping to ' + Object.keys(taxRates).sort().join(', ') + ', at that state\\u2019s rate, as the law requires of marketplaces. VeeFam collects it and pays it to the state.'; $('taxNote').hidden = false; }"],
  ['public/order.html', "var products = [], promo = null, feePct = 0, feeFix = 0, feeRate = '', taxPct = 0;", "var products = [], promo = null, feePct = 0, feeFix = 0, feeRate = '', taxPct = 0, taxRates = {}, taxStates = {};\n  var taxCode = function (v) { var s = String(v || '').trim().toLowerCase().replace(/\\.$/, ''); if (!s) return ''; if (taxStates[s.toUpperCase()]) return s.toUpperCase(); if (s === 'ill') return 'IL'; return Object.keys(taxStates).filter(function (k) { return taxStates[k] === s; })[0] || ''; };"],
  // Crypto: every coin button names its network, Ethereum mainnet or Base, so buyers send on the right one.
  ['public/pay.html', "b.type = 'button'; b.className = 'pill'; b.dataset.c = c; b.textContent = inv.coins[c].label || c;", "b.type = 'button'; b.className = 'pill'; b.dataset.c = c; b.textContent = /-BASE$/.test(c) ? c.replace(/-BASE$/, '') + ' · Base' : ['ETH', 'USDC', 'USDT'].indexOf(c) >= 0 ? c + ' · Ethereum mainnet' : (inv.coins[c].label || c);"],
  ['public/order.html', 'Pay online now with Ethereum, USDC or USDT.', 'Pay online now with ETH, USDC or USDT, on Ethereum mainnet or Base.'],
  ['api/offer.js', "'It is held for you until the link runs out.'", "'It is not held for you: others can still buy it, so pay soon to make sure it is yours.'"],
  ['api/offer.js', "'It is held for you until the link runs out. If the price does not work, you are welcome to send another offer.'", "'It is not held for you: others can still buy it, so pay soon to make sure it is yours. If the price does not work, you are welcome to send another offer.'"]
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
