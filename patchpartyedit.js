// Build step: party pricing editable from the back office (Products, on the party piece).
// The party's settings in _party.js are the starting point; what the owner saves is kept in party/config-<pid>.json
// and laid over them: starting price, final price (if all sell), how many, the price drop every N sold, start and end.
//   GET ?k=<key>&partycfg=save&start=&final=&total=&step=&starts=<ISO>&ends=<ISO>
// Every handler that uses the party settings loads them first (party.load()).
// Runs after patchauction2.js.
const fs = require('fs');
const R = String.raw;
const files = {};
const read = (f) => files[f] || (files[f] = fs.readFileSync(f, 'utf8'));
const swap = (f, a, b) => { const s = read(f); if (s.split(a).length !== 2) throw new Error('patchpartyedit: expected one match in ' + f + ' for ' + a.slice(0, 60)); files[f] = s.replace(a, () => b); };

// _party.js: the loader.
files['api/_party.js'] = read('api/_party.js') + R`
// Saved changes from the back office, laid over the settings above. Read at most every 20 seconds.
const BASE = JSON.parse(JSON.stringify(PARTY));
let loadedAt = 0;
async function load(force) {
  if (!force && Date.now() - loadedAt < 20000) return PARTY;
  loadedAt = Date.now();
  let cfg = null;
  try { cfg = await store.read('party/config-' + BASE.pid + '.json'); } catch (e) { cfg = null; }
  if (PARTY.pid !== BASE.pid) return PARTY; // a settle link for the party before is running
  Object.keys(PARTY).forEach((k) => { delete PARTY[k]; });
  Object.assign(PARTY, JSON.parse(JSON.stringify(BASE)), cfg && cfg.pid === BASE.pid ? cfg : {});
  return PARTY;
}
module.exports.load = load;
module.exports.BASE = BASE;
`;

// Load before each use: the checkout, the party page, the back office and the sweep.
const wrap = (f) => { files[f] = read(f) + "\n;(() => { const inner = module.exports; const w = async (req, res) => { try { await require('./_party').load(); } catch (e) { /* the settings in the code stay */ } return inner(req, res); }; Object.assign(w, inner); module.exports = w; })();\n"; };
['api/order.js', 'api/party.js', 'api/admin.js'].forEach(wrap);
files['api/_sweep.js'] = read('api/_sweep.js') + "\n;(() => { const r = module.exports.run; module.exports.run = async function () { try { await require('./_party').load(); } catch (e) { /* the settings in the code stay */ } return r.apply(this, arguments); }; })();\n";

// The party page uses the saved price.
swap('api/party.js', R`const product = () => sheet.PRODUCTS.filter((x) => x.id === P.pid)[0] || { name: 'Party piece', price: 0 };`,
  R`const product = () => Object.assign({}, sheet.PRODUCTS.filter((x) => x.id === P.pid)[0] || { name: 'Party piece', price: 0 }, P.price ? { price: P.price } : {});`);

// Back office: save the party settings. The party piece's own Edit stays locked; this is how it changes.
swap('api/admin.js', R`  if (req.query && req.query.edit) {`, R`  if (req.query && req.query.partycfg === 'save') {
    const q = req.query, P = party.PARTY, cents = (v) => Math.round(Number(v) * 100);
    const start = cents(q.start), fin = cents(q.final), total = Math.floor(Number(q.total)), step = Math.floor(Number(q.step));
    const starts = Date.parse(String(q.starts || '')), ends = Date.parse(String(q.ends || ''));
    if (!(start >= 50 && start <= 10000000)) return res.status(400).json({ error: 'Enter a starting price.' });
    if (!(fin >= 50 && fin <= start)) return res.status(400).json({ error: 'The final price has to be at or below the starting price.' });
    if (!(total >= 1 && total <= 1000)) return res.status(400).json({ error: 'Enter how many are in the party (1 to 1,000).' });
    if (!(step >= 1 && step <= total)) return res.status(400).json({ error: 'Enter how many sales between price drops (1 to ' + total + ').' });
    if (!(starts > 0 && ends > starts)) return res.status(400).json({ error: 'The party has to end after it starts.' });
    let sold = 0;
    try { sold = (await party.state(start)).sold || 0; } catch (e) { sold = 0; }
    if (total < sold) return res.status(400).json({ error: sold + ' are already sold, so the party needs at least ' + sold + '.' });
    // Price levels: every "step" sold, ending at the final price when all of them sell.
    const needs = []; for (let n = step; n < total; n += step) needs.push(n); needs.push(total);
    const tiers = fin < start ? needs.map((n, i) => { const c = Math.round(start - (start - fin) * (i + 1) / needs.length); return [n, (start - c) * 100 / start]; }) : [];
    const when = (t) => { const d = new Date(t), o = { timeZone: 'America/Chicago' }, h = Number(d.toLocaleString('en-US', Object.assign({ hour: 'numeric', hour12: false }, o))), m = d.toLocaleString('en-US', Object.assign({ minute: '2-digit' }, o));
      const mid = (h === 0 || h === 24) && Number(m) === 0, day = new Date(t - (mid ? 60000 : 0)).toLocaleString('en-US', Object.assign({ weekday: 'long', month: 'long', day: 'numeric' }, o)).replace(/^(\w+) /, '$1, ');
      return day + ' at ' + (mid ? 'midnight' : d.toLocaleString('en-US', Object.assign({ hour: 'numeric', minute: '2-digit' }, o))) + ' Central'; };
    const cfg = { pid: party.BASE.pid, price: start / 100, total: total, step: step, counts: true, tiers: tiers, starts: starts, startsText: when(starts), ends: ends, endsText: when(ends), at: Date.now() };
    await store.write('party/config-' + cfg.pid + '.json', cfg);
    await edits.save(cfg.pid, { price: start / 100, stock: total });
    await party.load(true);
    console.log('PARTY_EDIT', JSON.stringify({ start: start, fin: fin, total: total, step: step, starts: starts, ends: ends }));
    return res.json({ ok: true, endsText: cfg.endsText });
  }
  if (req.query && req.query.edit) {`);

Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
