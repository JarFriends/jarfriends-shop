// Build step (after patchcarts.js): the automatic emails in api/_sweep.js are checked whenever the shop's product
// list is asked for; an accepted or countered offer keeps its checkout link so the "runs out soon" email can carry it.
const fs = require('fs');
const changes = [
  ['api/offer.js', "await saveOffer(o, b.t, 'accepted', { until: until * 1000, counter: 0 });", "await saveOffer(o, b.t, 'accepted', { until: until * 1000, counter: 0, deal: deal, warned: 0 });"],
  ['api/offer.js', "await saveOffer(o, b.t, 'countered', { until: until * 1000, counter: cents });", "await saveOffer(o, b.t, 'countered', { until: until * 1000, counter: cents, deal: deal, warned: 0 });"]
];
changes.forEach((c) => {
  const s = fs.readFileSync(c[0], 'utf8');
  if (s.split(c[1]).length !== 2) throw new Error('patchsweep: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  fs.writeFileSync(c[0], s.replace(c[1], () => c[2]));
});
const f = 'api/order.js';
fs.writeFileSync(f, fs.readFileSync(f, 'utf8') + "\n// Automatic emails are checked when the shop is visited (see _sweep.js).\n;(() => { const inner = module.exports; const w = async (req, res) => { if (req.method === 'GET') { try { await require('./_sweep').run(); } catch (e) { console.error('SWEEP_FAIL', String(e && e.message || e)); } } return inner(req, res); }; Object.assign(w, inner); module.exports = w; })();\n");
