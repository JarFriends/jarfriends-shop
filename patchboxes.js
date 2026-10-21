// Build step: saved boxes (see public/box-presets.js).
//   GET /api/label?boxes=1                         the saved boxes: [{ name, l, w, h }] (Regular box first)
//   GET /api/admin?k=<key>&boxfrom=<invoice>        the box and weight a bought label used (read from Shippo)
//   GET /api/admin?k=<key>&boxsave=1&name=&l=&w=&h= save a box (same name replaces it)
//   GET /api/admin?k=<key>&boxdel=<name>            remove a saved box
// Runs after patchofferfix.js.
const fs = require('fs');
const R = String.raw;
const files = {};
const read = (f) => files[f] || (files[f] = fs.readFileSync(f, 'utf8'));
files['api/label.js'] = read('api/label.js') + R`
// Saved boxes, and the box a bought label used.
const BOXES = 'boxes/presets.json';
async function savedBoxes() {
  let b = null;
  try { b = await require('./_store').read(BOXES); } catch (e) { b = null; }
  b = Array.isArray(b) ? b : [];
  if (!b.some((x) => Number(x.l) === 12 && Number(x.w) === 9 && Number(x.h) === 6)) b.unshift({ name: 'Regular box', l: 12, w: 9, h: 6 });
  return b;
}
async function sget(path) {
  const r = await fetch(API + path, { signal: AbortSignal.timeout(15000), headers: { authorization: 'ShippoToken ' + key() } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Shippo answered ' + r.status);
  return j;
}
async function boxFromLabel(tx) {
  const t = await sget('/transactions/' + encodeURIComponent(tx));
  const rateId = typeof t.rate === 'object' && t.rate ? t.rate.object_id : t.rate;
  const rate = await sget('/rates/' + encodeURIComponent(rateId));
  const sh = await sget('/shipments/' + encodeURIComponent(rate.shipment));
  const p = (sh.parcels || [])[0] || {};
  if (p.template && !Number(p.length)) return { template: p.template };
  const toIn = (v) => { const x = Number(v) || 0, u = String(p.distance_unit || 'in'); return Math.round((u === 'cm' ? x / 2.54 : u === 'mm' ? x / 25.4 : u === 'ft' ? x * 12 : x) * 10) / 10; };
  const wu = String(p.mass_unit || 'oz'), wx = Number(p.weight) || 0;
  const oz = Math.round((wu === 'lb' ? wx * 16 : wu === 'g' ? wx / 28.35 : wu === 'kg' ? wx * 35.274 : wx) * 10) / 10;
  return { l: toIn(p.length), w: toIn(p.width), h: toIn(p.height), oz: oz };
}
;(() => {
  const inner = module.exports;
  const w = async (req, res) => {
    if (req.method === 'GET' && req.query && req.query.boxes) { res.setHeader('Cache-Control', 'no-store'); return res.json({ boxes: await savedBoxes() }); }
    return inner(req, res);
  };
  Object.assign(w, inner, { savedBoxes: savedBoxes, boxFromLabel: boxFromLabel, BOXES: BOXES });
  module.exports = w;
})();
`;
const a = R`  if (req.query && req.query.jarburn) {`;
const s = read('api/admin.js');
if (s.split(a).length !== 2) throw new Error('patchboxes: admin anchor not found');
files['api/admin.js'] = s.replace(a, () => R`  if (req.query && req.query.boxfrom) {
    const n = String(req.query.boxfrom).replace(/[^A-Za-z0-9-]/g, ''), m = (await store.read('meta/' + n + '.json')) || {};
    if (!m.labelTx) return res.status(404).json({ error: 'No label was bought on this site for that order, so its box size is not known. Type the size instead.' });
    try { return res.json(await require('./label').boxFromLabel(m.labelTx)); } catch (e) { console.error('BOXFROM_FAIL', n, String(e && e.message || e)); return res.status(503).json({ error: 'Could not read that label from Shippo just now. Try again.' }); }
  }
  if (req.query && (req.query.boxsave || req.query.boxdel)) {
    const lab = require('./label'), q = req.query, num = (v) => { const x = Number(v); return x > 0 && x <= 108 ? Math.round(x * 10) / 10 : 0; };
    let list = (await lab.savedBoxes()).filter((b) => !(Number(b.l) === 12 && Number(b.w) === 9 && Number(b.h) === 6 && b.name === 'Regular box'));
    if (q.boxdel) list = list.filter((b) => b.name !== String(q.boxdel));
    else {
      const name = String(q.name || '').replace(/\s+/g, ' ').trim().slice(0, 40), l = num(q.l), w = num(q.w), h = num(q.h);
      if (!name) return res.status(400).json({ error: 'Give the box a name.' });
      if (!(l && w && h)) return res.status(400).json({ error: 'Enter the length, width and height in inches.' });
      list = list.filter((b) => b.name.toLowerCase() !== name.toLowerCase()).concat([{ name: name, l: l, w: w, h: h }]);
    }
    await store.write(lab.BOXES, list);
    return res.json({ ok: true, boxes: await lab.savedBoxes() });
  }
` + a);
// The back office loads the saved-box list before the ship cards.
const ia = "  if (f === 'admin.html' && s.indexOf('/admin-ship.js') < 0)", is = read('inject.js');
if (is.split(ia).length !== 2) throw new Error('patchboxes: inject anchor not found');
files['inject.js'] = is.replace(ia, () => "  if (f === 'admin.html' && s.indexOf('/box-presets.js') < 0) s = before(s, f, '<script src=\"/box-presets.js?v=' + Date.now() + '\" defer></script>');\n" + ia);
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
