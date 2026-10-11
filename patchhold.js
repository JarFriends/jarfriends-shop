// Build step: an offer holds its units: 24 hours from when it is sent, then until the checkout link runs out once accepted.
// A declined offer lets them go. Runs after patchedit.js.
// Each change is [file, text to find, text to put in its place]; the text to find must be there exactly once.
const fs = require('fs');
const changes = [
  // Accepting an offer sets the units aside. Accepting it again restarts the clock.
  ['api/offer.js', "const offline = require('./_offline');\n", "const offline = require('./_offline');\nconst holds = require('./_holds');\n"],
  ['api/offer.js', '      const deal = sign({ oa: 1, n: o.n, pid: o.pid, q: o.q, c: o.c, x: now + HOLD_HOURS * 3600 });', "      const until = now + HOLD_HOURS * 3600;\n      let left = null, mine = 0;\n      try { left = (await getInventory(true)).filter((x) => x.id === o.pid)[0]; mine = await holds.mine(o.n); } catch (e) { console.error('HOLD_CHECK_FAIL', o.n, String(e && e.message || e)); }\n      if (left && left.stock + mine < o.q) return res.status(409).json({ error: 'There are not enough left in stock to accept this offer.' });\n      try { await holds.add(o.pid, o.n, o.q, until); } catch (e) { console.error('HOLD_FAIL', o.n, String(e && e.message || e)); }\n      const deal = sign({ oa: 1, n: o.n, pid: o.pid, q: o.q, c: o.c, x: until });"],
  ['api/offer.js', "'The piece is not held until you check out.'", "'It is held for you until the link runs out.'"],
  // A new offer holds its units for 24 hours while the owner decides. Declining lets them go at once.
  ['api/offer.js', "  const review = host + '/offer.html?t=' + sign(o);", "  try { await holds.add(p.id, o.n, qty, now + 24 * 3600); } catch (e) { console.error('HOLD_FAIL', o.n, String(e && e.message || e)); }\n  const review = host + '/offer.html?t=' + sign(o);"],
  ['api/offer.js', "    if (b.do === 'decline') {\n", "    if (b.do === 'decline') {\n      try { await holds.release(o.n); } catch (e) { console.error('HOLD_RELEASE_FAIL', o.n, String(e && e.message || e)); }\n"],
  // The acceptance email says what is due and where to pay.
  ['api/offer.js', "'Your offer on ' + o.i + ' was accepted'", "'Offer accepted: complete your order for ' + o.i"],
  ['api/offer.js', "'Finish your order at that price here. The link is good for ' + HOLD_HOURS + ' hours:', link, '',", "'Amount due: ' + money(o.c * o.q) + ', plus any shipping and tax shown at checkout.', '', 'Complete your order and pay here. The link is good for ' + HOLD_HOURS + ' hours:', link, '',"],
  // Held units are out of stock for everyone except the buyer they are held for.
  ['api/order.js', '  if (qty > p.stock) return res.status(409)', "  let own = 0;\n  if (b.offer) { const od = verify(b.offer); if (od && od.oa === 1 && od.pid === p.id) { try { own = await require('./_holds').mine(od.n); } catch (e) { own = 0; } } }\n  if (qty > p.stock + own) return res.status(409)"],
  // The order's invoice carries the offer number, so the hold can be let go when the order is on record.
  ['api/order.js', 'promo ? { pc: promo.code, pd: cut } : {},', 'promo ? { pc: promo.code, pd: cut } : {}, deal ? { of: deal.n } : {},'],
  ['api/testsheet.js', "const edits = require('./_edits');\n", "const edits = require('./_edits');\nconst holds = require('./_holds');\n"],
  ['api/testsheet.js', '  res.json({ products: (await edits.apply(PRODUCTS))', "  let held = {};\n  try { held = await holds.byProduct(); } catch (e) { console.error('HOLDS_READ_FAIL', String(e && e.message || e)); }\n  res.json({ products: (await edits.apply(PRODUCTS))"],
  ['api/testsheet.js', 'p.stock - (sold[p.id] || 0)) })) });', 'p.stock - (sold[p.id] || 0) - (held[p.id] || 0)) })) });'],
  // Once the buyer's order is on record, the sale takes the units and the hold is let go.
  ['api/testsheet.js', '      // A party piece: tell the buyer what they are in for.', "      const om = inv && /^[A-Z0-9]{4,20}$/.test(String(inv.of || '')) ? String(inv.of) : '';\n      if (om) { try { await holds.release(om); } catch (e) { console.error('HOLD_RELEASE_FAIL', om, String(e && e.message || e)); } }\n      // A party piece: tell the buyer what they are in for."],
  // The back office counts held units as not left.
  ['api/admin.js', "  const catalog = await edits.apply(require('./_products'));\n", "  const catalog = await edits.apply(require('./_products'));\n  let held = {};\n  try { held = await require('./_holds').byProduct(); } catch (e) { held = {}; }\n"],
  ['api/admin.js', 'left: Math.max(0, p.stock - n),', 'held: held[p.id] || 0, left: Math.max(0, p.stock - n - (held[p.id] || 0)),']
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchhold: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
