// Counts how often a piece is looked at. POST { id, kind } with kind "view" (its details were opened on the home
// page, or its safe was opened) or "checkout" (its checkout page was opened). One small file per piece in the
// site's storage: clicks/<product id>.json = { view, checkout, days: { "2026-10-10": { view, checkout } } }.
// Only the counts are kept: nothing about the visitor. Two clicks at the same instant can count as one.
const store = require('./_store');
const edits = require('./_edits');
const everything = () => edits.apply(require('./_products'), { all: true });

async function all() {
  const out = {};
  if (!store.on()) return out;
  await Promise.all((await everything()).map(async (p) => { const c = await store.read('clicks/' + p.id + '.json').catch(() => null); if (c) out[p.id] = c; }));
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  let b = req.body || {};
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const id = String(b.id || ''), kind = b.kind === 'checkout' ? 'checkout' : 'view';
  if (!store.on() || !(await everything()).some((p) => p.id === id)) return res.json({ ok: true });
  try {
    const c = (await store.read('clicks/' + id + '.json')) || {};
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    c[kind] = (c[kind] || 0) + 1;
    c.days = c.days || {};
    c.days[day] = c.days[day] || {};
    c.days[day][kind] = (c.days[day][kind] || 0) + 1;
    // Keep the last 60 days of daily counts.
    Object.keys(c.days).sort().slice(0, -60).forEach((d) => { delete c.days[d]; });
    await store.write('clicks/' + id + '.json', c);
  } catch (e) { console.error('CLICK_FAIL', id, String(e && e.message || e)); }
  res.json({ ok: true });
};
module.exports.all = all;
