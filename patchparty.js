// Build step: the party (see _party.js). This one, Adventurous Astronaut (Issue 11), starts Thursday, October 15,
// 2026 at 12:00 PM Central and runs 12 hours, to midnight. Its own listing (MPARTY3), 10 units at $33.60 each
// (20% over the $28.00 final price), $6.20 shipping per order.
// Levels: $33.60, then 2 sold $32.48, 4 $31.36, 6 $30.24, 8 $29.12, all 10 $28.00 (exact % off $33.60).
// Before it opens, no price is shown or sold: the home page shows a countdown to the opening.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/_party.js', R`  pid: 'MPARTY',
  total: 11,
  starts: Date.parse('2026-10-10T07:00:00-05:00'),
  ends: Date.parse('2026-10-14T23:00:00-05:00'),
  endsText: 'Wednesday, October 14 at 11:00 PM Central',
  tiers: [[25, 5], [50, 10], [100, 33]]`, R`  pid: 'MPARTY3',
  total: 10,
  starts: Date.parse('2026-10-15T12:00:00-05:00'),
  startsText: 'Thursday, October 15 at 12:00 PM Central',
  ends: Date.parse('2026-10-16T00:00:00-05:00'),
  endsText: 'tonight, Thursday, October 15 at midnight Central',
  // [units sold, % off]: exact dollar prices on $33.60, $1.12 lower every 2 sold, $28.00 if all 10 sell.
  counts: true,
  tiers: [[2, 11200 / 3360], [4, 22400 / 3360], [6, 33600 / 3360], [8, 44800 / 3360], [10, 56000 / 3360]]
};
// The party before this one, so its settle link (sent when it ended) still works.
const PREV = {
  pid: 'MPARTY2',
  total: 8,
  starts: Date.parse('2026-10-12T12:00:00-05:00'),
  startsText: 'Monday, October 12 at 12:00 PM Central',
  ends: Date.parse('2026-10-13T00:00:00-05:00'),
  endsText: 'Monday, October 12 at midnight Central',
  counts: true,
  tiers: [[2, 18000 / 2600], [4, 36000 / 2600], [6, 54000 / 2600], [8, 72000 / 2600]]`],
  ['api/_party.js', R`const tiers = PARTY.tiers.map((t) => { const need = Math.ceil(PARTY.total * t[0] / 100); return { share: t[0], need: need, off: t[1], reached: sold >= need }; });`,
    R`const tiers = PARTY.tiers.map((t) => { const need = PARTY.counts ? t[0] : Math.ceil(PARTY.total * t[0] / 100); return { share: t[0], need: need, off: t[1], label: cents ? money(Math.round(cents * t[1] / 100)) + ' off' : '', price: cents ? money(Math.round(cents * (100 - t[1]) / 100)) : '', reached: sold >= need }; });`],
  ['api/_party.js', R`return PARTY.tiers.reduce((m, t) => (after >= Math.ceil(PARTY.total * t[0] / 100) ? Math.max(m, t[1]) : m), 0);`, R`return PARTY.tiers.reduce((m, t) => (after >= (PARTY.counts ? t[0] : Math.ceil(PARTY.total * t[0] / 100)) ? Math.max(m, t[1]) : m), 0);`],
  ['api/_party.js', R`t.off + '% off once '`, R`(t.price ? t.price + ' each once ' : t.off + '% off once ')`],
  ['api/_party.js', R`  return { on: store.on(), pid: PARTY.pid,`, R`  const upcoming = Date.now() < PARTY.starts;
  return { upcoming: upcoming, starts: PARTY.starts, startsText: PARTY.startsText || '', offText: off && cents ? money(Math.round(cents * off / 100)) + ' off' : off ? off + '% off' : '', on: store.on(), pid: PARTY.pid,`],
  // The listing: the new party piece, and the last party's listing taken off the site.
  ['api/_party.js', R`module.exports = { PARTY, rows, state, money, offFor };`, R`module.exports = { PARTY, PREV, rows, state, money, offFor };`],
  ['api/_products.js', R`  { id: 'MPARTY', name: 'Motivated Monster Comic Pack (Issue 05): Party Pricing', price: 44, min: 1, stock: 11, shipping: 5.3 },`, R`  { id: 'MPARTY', name: 'Motivated Monster Comic Pack (Issue 05): Party Pricing', price: 44, min: 1, stock: 11, shipping: 5.3, hidden: true },
  { id: 'MPARTY2', name: 'Motivated Monster Comic Pack (Issue 05): Party Pricing', price: 26, min: 1, stock: 8, shipping: 6.2, hidden: true },
  { id: 'MPARTY3', name: 'Adventurous Astronaut Comic Pack (Issue 11): Party Pricing', price: 33.6, min: 1, stock: 10, shipping: 6.2 },`],
  // Before the opening the party gives away nothing but the time it opens.
  ['api/party.js', R`  const st = await party.state(cents);`, R`  const st = await party.state(cents);
  if (!(req.query && req.query.settle) && st.upcoming) return res.json({ pid: st.pid, on: st.on, upcoming: true, ended: false, starts: st.starts, startsText: st.startsText, ends: st.ends, endsText: st.endsText, total: st.total });`],
  ['api/party.js', R`    // The party price for an order of this many units.`, R`    out.oneOffText = out.oneOff ? money(cents - each(out.oneOff)) + ' off' : '';
    // The party price for an order of this many units.`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchparty: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
// A settle link from the party before this one runs against that party's settings.
files['api/party.js'] += "\n;(() => { const inner = module.exports, pa = require('./_party'); module.exports = async (req, res) => { let k = null; try { k = require('./_lib').verify(String((req.query && req.query.settle) || '')); } catch (e) { k = null; } if (k && pa.PREV && k.pid === pa.PREV.pid && k.pid !== pa.PARTY.pid) { const keep = Object.assign({}, pa.PARTY), swap = (to) => { Object.keys(pa.PARTY).forEach((x) => { delete pa.PARTY[x]; }); Object.assign(pa.PARTY, to); }; swap(pa.PREV); try { return await inner(req, res); } finally { swap(keep); } } return inner(req, res); }; })();\n";
// Emails at the end say the dollar level, not a long percent.
files['api/party.js'] = files['api/party.js'].split("st.off + '% off").join("(st.offText || st.off + '% off') + '");
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
