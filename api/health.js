// Checks that the site's ledger storage can be written and read. Shows no data.
const store = require('./_store');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const out = { storage: store.on(), write: false, read: false, list: false };
  try { await store.write('check/ping.json', { at: Date.now() }); out.write = true; } catch (e) { out.error = String(e && e.message || e).slice(0, 200); }
  try { out.read = !!(await store.read('check/ping.json')); } catch (e) { out.error = String(e && e.message || e).slice(0, 200); }
  try { await store.sales(); out.list = true; } catch (e) { out.error = String(e && e.message || e).slice(0, 200); }
  res.json(out);
};
