// Build step: promo codes the owner manages, and private notes on orders. Runs after patchmore.js.
// Promo codes: the ones in the PROMO_CODES setting still work; the owner's own list (catalog/promos.json in the
// site's storage) sits on top of them and can add a code, change one, or switch one off.
// Each change is [file, text to find, text to put in its place]; the text to find must be there exactly once.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/_offline.js', R`  return out;
}
const hasPromos = `, R`  // The owner's list: a code there replaces the setting's, and one switched off is gone.
  Object.keys(promoBox || {}).forEach((c) => {
    const v = promoBox[c] || {};
    if (v.on === false) delete out[c];
    else if (v.pct > 0 && v.pct <= 100) out[c] = { pct: v.pct };
    else if (v.off > 0) out[c] = { off: v.off };
  });
  return out;
}
// The owner's list is read from storage before an order is priced (order.js) and kept for 15 seconds.
let promoBox = null, promoAt = 0;
async function loadPromos(fresh) {
  const store = require('./_store');
  if (!store.on()) return {};
  if (!fresh && promoBox && Date.now() - promoAt < 15000) return promoBox;
  try { promoBox = (await store.read('catalog/promos.json')) || {}; promoAt = Date.now(); } catch (e) { console.error('PROMOS_READ_FAIL', String(e && e.message || e)); }
  return promoBox || {};
}
async function savePromo(code, v) {
  const store = require('./_store');
  const box = Object.assign({}, (await store.read('catalog/promos.json')) || {});
  box[code] = v;
  await store.write('catalog/promos.json', box);
  promoBox = box; promoAt = Date.now();
}
const hasPromos = `],
  ['api/_offline.js', 'module.exports = { cardFeePct,', 'module.exports = { promos, loadPromos, savePromo, cardFeePct,'],
  ['api/order.js', R`  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET') {`, R`  res.setHeader('Access-Control-Allow-Origin', '*');
  await offline.loadPromos();
  if (req.method === 'GET') {`],

  // GET ?k=<key>&promos=1  owner only: every promo code, on or off.
  // GET ?k=<key>&promo=<CODE>&kind=pct|off&amount=<number>&on=1|0  owner only: adds or changes a code.
  // GET ?k=<key>&note=<invoice>&text=<words>  owner only: a private note on an order.
  ['api/admin.js', R`  if (req.query && req.query.add) {`, R`  if (req.query && (req.query.promos || req.query.promo)) {
    const off = require('./_offline'), q = req.query;
    if (q.promo) {
      const code = String(q.promo).trim().toUpperCase(), n = Number(q.amount), on = q.on !== '0';
      if (!/^[A-Z0-9_-]{2,20}$/.test(code)) return res.status(400).json({ error: 'A code is 2 to 20 letters or numbers, with no spaces.' });
      if (q.kind === 'pct' ? !(n > 0 && n <= 100) : !(n > 0 && n <= 10000)) return res.status(400).json({ error: q.kind === 'pct' ? 'Enter a percent from 1 to 100.' : 'Enter a dollar amount above 0.' });
      await off.savePromo(code, Object.assign({ on: on }, q.kind === 'pct' ? { pct: n } : { off: Math.round(n * 100) }));
    }
    const box = await off.loadPromos(true), live = off.promos(), codes = {};
    Object.keys(live).forEach((c) => { codes[c] = Object.assign({ code: c, on: true, yours: !!box[c] }, live[c]); });
    Object.keys(box).forEach((c) => { if (!codes[c]) codes[c] = Object.assign({ code: c, on: false, yours: true }, box[c].pct ? { pct: box[c].pct } : { off: box[c].off }); });
    return res.json({ promos: Object.keys(codes).sort().map((c) => codes[c]) });
  }
  if (req.query && req.query.note) {
    const s = sales.filter((x) => x.n === String(req.query.note))[0];
    if (!s) return res.status(404).json({ error: 'That order was not found.' });
    const was = (await store.read('meta/' + s.n + '.json')) || {};
    await store.write('meta/' + s.n + '.json', Object.assign(was, { note: String(req.query.text || '').replace(/\s+/g, ' ').trim().slice(0, 500) }));
    return res.json({ ok: true });
  }
  if (req.query && req.query.add) {`],
  ['api/admin.js', R`tracking: m.tracking || '',`, R`tracking: m.tracking || '', note: m.note || '',`],

  // Orders: the note shows under the status, with a button to write or change it.
  ['public/admin.html', R`      if (!o.cancelled && (!o.tracking || o.testLabel)) {`, R`      if (o.note) st.appendChild(el('small', 'Note: ' + o.note));
      var nb = el('button', o.note ? 'Change note' : 'Add note', 'ghost'); nb.type = 'button'; nb.style.cssText = 'margin-top:6px;padding:6px 12px;font-size:13px;display:block';
      nb.addEventListener('click', function () {
        var words = prompt('Private note for order ' + o.n + '. Only you see it. Clear it to remove the note.', o.note || '');
        if (words === null) return;
        fetch('/api/admin?k=' + encodeURIComponent(key) + '&note=' + encodeURIComponent(o.n) + '&text=' + encodeURIComponent(words), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
          if (r.error) { alert(r.error); return; }
          load();
        }, function () { alert('Could not reach the site. Try again.'); });
      });
      st.appendChild(nb);
      if (!o.cancelled && (!o.tracking || o.testLabel)) {`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchextra: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
