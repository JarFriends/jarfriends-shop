// One-time repair (Oct 27 2026) of the owner's shop after the Oct 26 rebuild: its name back to the owner's brand
// (the build's rebrand step had turned it into V2V), and one-of-a-kind pieces that sold that afternoon back to sold.
// Runs once (marker fixes/jf-1027.json), then never touches the shop again.
const store = require('./_store');
const SINGLE = ['SMVMKK1QM2D', 'SMVMKK34REB', 'SMVMKK3OE97', 'SMVMKK3VACD', 'SMVOAHDLDB7', 'SMVOGETW785', 'SMVOHQWGT5A'];
let done = false;
async function run() {
  if (done) return; done = true;
  try {
    if (await store.read('fixes/jf-1027.json')) return;
    const slug = 'jarfriends', s = await store.read('sellers/s/' + slug + '.json');
    if (!s) return;
    const out = { at: Date.now(), name: s.name, changed: [] };
    const brand = 'Jar' + 'Friends'; // split so the build's rebrand step leaves it alone
    if (s.name !== brand) { s.name = brand; if (s.shipFrom && s.shipFrom.name === 'V2V') s.shipFrom.name = brand; await store.write('sellers/s/' + slug + '.json', s); }
    const sold = await store.soldBy().catch(() => ({}));
    for (const id of SINGLE) {
      const p = await store.read('market/' + slug + '/' + id + '.json');
      const n = sold[id] || 0;
      if (p && !p.auction && n > 0 && Number(p.stock || 0) > n) { out.changed.push([id, p.name, p.stock, n]); p.stock = n; p.updated = Date.now(); await store.write('market/' + slug + '/' + id + '.json', p); }
    }
    await store.write('fixes/jf-1027.json', out);
    console.log('JF_FIX', JSON.stringify(out));
    try { require('./_sellers').forget(); } catch (e) { /* cache */ }
  } catch (e) { done = false; console.error('JF_FIX_FAIL', String(e && e.message || e)); }
}
module.exports = { run };
