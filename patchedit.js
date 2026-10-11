// Build step: lets the owner edit products from the back office. Runs after patchadmin.js.
// Each change is [file, text to find, text to put in its place]; the text to find must be there exactly once.
const fs = require('fs');
const changes = [
  // The shop reads its products with the owner's edits applied.
  ['api/testsheet.js', "const PRODUCTS = require('./_products');\n", "const PRODUCTS = require('./_products');\nconst edits = require('./_edits');\n"],
  ['api/testsheet.js', 'res.json({ products: PRODUCTS.map((p) =>', 'res.json({ products: (await edits.apply(PRODUCTS)).map((p) =>'],
  ['api/admin.js', "const party = require('./_party');\n", "const party = require('./_party');\nconst edits = require('./_edits');\n"],
  ['api/admin.js', 'async function shelf(sales) {\n', "async function shelf(sales) {\n  const catalog = await edits.apply(require('./_products'));\n"],
  // GET ?k=<key>&edit=<product id>&name=&price=&stock=&shipping=&section=  owner only: saves an edit to one product.
  ['api/admin.js', '  // Mark one order as paid.', "  if (req.query && req.query.edit) {\n    const q = req.query, p = catalog.filter((x) => x.id === String(q.edit))[0];\n    if (!p) return res.status(404).json({ error: 'That product was not found.' });\n    if (p.id === party.PARTY.pid) return res.status(400).json({ error: 'The party piece is locked while the party runs. Ask Claude to change it.' });\n    const name = String(q.name || '').replace(/\\s+/g, ' ').trim().slice(0, 140);\n    const price = Math.round(Number(q.price) * 100) / 100, stock = Math.floor(Number(q.stock)), ship = Math.round(Number(q.shipping) * 100) / 100;\n    if (!name) return res.status(400).json({ error: 'Enter a name.' });\n    if (!(price >= 0.5 && price <= 100000)) return res.status(400).json({ error: 'Enter a price between $0.50 and $100,000.' });\n    if (!(stock >= 0 && stock <= 10000)) return res.status(400).json({ error: 'Enter a starting count from 0 to 10,000.' });\n    if (!(ship >= 0 && ship <= 1000)) return res.status(400).json({ error: 'Enter shipping from $0 (free) to $1,000.' });\n    const f = { name: name, price: price, stock: stock, shipping: ship > 0 ? ship : 'free' };\n    // Deal of the day pieces stay out of the shop sections.\n    if (!p.deal) f.section = String(q.section || '').replace(/[^A-Za-z, ]/g, '').trim().slice(0, 80);\n    await edits.save(p.id, f);\n    return res.json({ ok: true });\n  }\n  // Mark one order as paid."]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchedit: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
