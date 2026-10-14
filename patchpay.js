// Build step: each product can limit how it may be paid for (for example crypto only).
// A product's `pay` is a list of card, crypto, zelle, venmo, cashapp. Empty (the default) means every way to pay.
// Runs after patchdraft.js.
const fs = require('fs');
const R = String.raw;
const PAYS = R`String(q.pay || '').split(',').filter((x, i, a) => ['card', 'crypto', 'zelle', 'venmo', 'cashapp'].indexOf(x) >= 0 && a.indexOf(x) === i)`;
const changes = [
  // Back office product list shows the choice.
  ['api/admin.js', R`auction: p.auction || null,`, R`auction: p.auction || null, pay: p.pay || [],`],
  // Edit: pay= (blank = every way to pay).
  ['api/admin.js', R`if (q.box !== undefined) f.box = String(q.box || '')`, R`if (q.pay !== undefined) f.pay = ${PAYS};
    if (q.box !== undefined) f.box = String(q.box || '')`],
  // Add a product: pay= as well.
  ['api/admin.js', R`...(auc ? { auction: auc, stock: 1 } : {}) });`, R`...(auc ? { auction: auc, stock: 1 } : {}), ...(${PAYS}.length ? { pay: ${PAYS} } : {}) });`],
  // The order page learns each product's ways to pay.
  ['api/order.js', R`shelf: !!(more[p.id] || {}).shelf,`, R`pay: (more[p.id] || {}).pay || [], shelf: !!(more[p.id] || {}).shelf,`],
  // And an order paid a way the product does not take is turned away.
  ['api/order.js', R`const p = products.filter((x) => x.id === id)[0];`, R`const p = products.filter((x) => x.id === id)[0];
  if (p) {
    const pe = (await require('./_edits').apply(require('./_products'), { all: true })).filter((x) => x.id === p.id)[0] || {}, okPay = Array.isArray(pe.pay) ? pe.pay : [];
    const m = card ? 'card' : way || 'crypto', NAMES = { card: 'card', crypto: 'crypto', zelle: 'Zelle', venmo: 'Venmo', cashapp: 'Cash App' };
    if (okPay.length && okPay.indexOf(m) < 0) return res.status(400).json({ error: 'This piece can only be paid for by ' + okPay.map((x) => NAMES[x]).join(' or ') + '. Choose that way to pay.' });
  }`],
  // Order page: only the ways to pay this product takes are shown.
  ['public/order.html', R`function total() {`, R`function payLimit() {
    var sel = $('product'), pr = sel ? products.filter(function (x) { return x.id === sel.value; })[0] : null, ok = pr && pr.pay && pr.pay.length ? pr.pay : null;
    var all = document.querySelectorAll('input[name="method"]'), pick = null;
    Array.prototype.forEach.call(all, function (i) { var l = i.closest('label'); l.style.display = ok && ok.indexOf(i.value) < 0 ? 'none' : ''; if (ok && ok.indexOf(i.value) < 0 && i.checked) { i.checked = false; pick = true; } });
    if (pick) { var f = Array.prototype.filter.call(all, function (i) { var l = i.closest('label'); return !l.hidden && l.style.display !== 'none'; })[0]; if (f) f.checked = true; }
    Array.prototype.forEach.call(all, function (i) { var l = i.closest('label'); l.classList.toggle('on', i.checked); });
    var note = $('payOnly'); if (!note) { note = document.createElement('p'); note.id = 'payOnly'; note.className = 'small'; note.style.cssText = 'color:#C9A45C;font-weight:700;margin:6px 0 0'; var c = document.querySelector('label[data-m="crypto"]'); if (c) c.parentNode.insertBefore(note, c.parentNode.querySelector('label.plan')); }
    var NM = { card: 'card', crypto: 'crypto', zelle: 'Zelle', venmo: 'Venmo', cashapp: 'Cash App' };
    note.textContent = ok ? 'This piece can only be paid for by ' + ok.map(function (x) { return NM[x]; }).join(' or ') + '.' : ''; note.hidden = !ok;
  }
  function total() { try { payLimit(); } catch (e) {}`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchpay: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
