// Owner only: add the test products to the Inventory tab, skipping any that already exist.
const { safeEqual, getInventory, sheetPost } = require('./_lib');

const TEST = [
  ['B', 'Test Product B', 3.5, 1, 25], ['C', 'Test Product C', 5, 1, 40], ['D', 'Test Product D', 7.25, 2, 12], ['E', 'Test Product E', 10, 1, 8],
  ['F', 'Test Product F', 12.5, 5, 60], ['G', 'Test Product G', 18, 1, 3], ['H', 'Test Product H', 24, 10, 100], ['I', 'Test Product I', 30, 1, 0]
];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const pass = process.env.OWNER_PASSCODE || '';
  if (!pass || !safeEqual(String(req.query.passcode || ''), pass)) return res.status(401).json({ error: 'Wrong owner passcode.' });
  let have;
  try { have = (await getInventory(true)).map((p) => p.id); } catch (e) { return res.status(503).json({ error: 'Could not read the Inventory tab.' }); }
  const out = [];
  for (const t of TEST) {
    if (have.indexOf(t[0]) >= 0) { out.push(t[0] + ': already there'); continue; }
    out.push(t[0] + ': ' + await sheetPost({ tab: 'Inventory', headers: ['Product No', 'Name', 'Price per unit (USD)', 'Minimum order', 'In stock'], row: t }));
  }
  res.json({ result: out });
};
