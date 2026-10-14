// Build step: a product added in the back office can be saved as a draft (hidden, off the site), checked and
// finished, then put on the site with one Go live press. Runs after patchworld.js.
//   GET ?k=<key>&add=1&draft=1&...&weight=&box=   adds the product as a draft
//   GET ?k=<key>&golive=<product id>              puts a draft on the site (and on the shop shelf)
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/admin.js', R`hidden: !!p.hidden, buyers: !!p.buyers,`, R`hidden: !!p.hidden, draft: !!p.draft, nextSafe: Number(p.nextDeal) || 0, buyers: !!p.buyers,`],
  ['api/admin.js', R`    const np = await edits.add({ name: name, desc: tidy(q.desc, 600)`, R`    const wt = Number(q.weight);
    if (q.weight && !(wt > 0 && wt <= 1600)) return res.status(400).json({ error: 'Enter the weight in ounces, or leave it blank.' });
    // An auction: the price is the starting bid, one piece, and bidding ends at the time given.
    let auc = null;
    if (q.auction === '1') {
      const endsAt = Date.parse(String(q.ends || ''));
      if (!(endsAt > Date.now() + 10 * 60000 && endsAt < Date.now() + 60 * 86400000)) return res.status(400).json({ error: 'Pick when the auction ends: at least 10 minutes from now and within 60 days.' });
      auc = { start: Math.round(Number(q.price) * 100) / 100, ends: new Date(endsAt).toISOString() };
    }
    const np = await edits.add({ name: name, desc: tidy(q.desc, 600)`],
  ['api/admin.js', R`  if (req.query && req.query.add) {`, R`  if (req.query && req.query.golive) {
    const p = (await edits.apply(catalog, { all: true })).filter((x) => x.id === String(req.query.golive))[0];
    if (!p) return res.status(404).json({ error: 'That product was not found.' });
    if (!p.draft) return res.status(400).json({ error: 'That product is not a draft.' });
    await edits.save(p.id, { hidden: false, draft: false, shelf: true });
    console.log('DRAFT_LIVE', p.id);
    return res.json({ ok: true });
  }
  if (req.query && req.query.add) {`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchdraft: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
// After the product is added: a draft stays hidden and off the shelf, with its weight and box for the label.
const A = 'api/admin.js';
let s = files[A];
const at = "section: tidy(q.section, 80).replace(/[^A-Za-z, ]/g, '') });\n    return res.json({ ok: true, id: np.id });";
if (s.split(at).length !== 2) throw new Error('patchdraft: add handler end not found');
s = s.replace(at, () => "section: tidy(q.section, 80).replace(/[^A-Za-z, ]/g, ''), ...(q.draft === '1' ? { hidden: true, draft: true, shelf: false } : {}), ...(auc ? { auction: auc, stock: 1 } : {}) });\n    if (q.draft === '1' || wt > 0 || q.box) await edits.save(np.id, Object.assign({}, q.draft === '1' ? { hidden: true, draft: true, shelf: false } : {}, wt > 0 ? { weight_oz: Math.round(wt * 10) / 10 } : {}, q.box ? { box: tidy(q.box, 60) } : {}));\n    return res.json({ ok: true, id: np.id });");
fs.writeFileSync(A, s);
Object.keys(files).filter((f) => f !== A).forEach((f) => fs.writeFileSync(f, files[f]));
