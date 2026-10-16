// Build step: Orders tab views (photo boxes / thin list / table, see public/admin-orders.js) and manual orders.
//   GET /api/admin?k=<key>&neworder=1&pid=&qty=&each=&ship=&name=&email=&street=&line2=&city=&state=&zip=&pay=&paid=1&note=
//   (fields: pid, qty, each, ship, name, email, street, line2, city, state, zip, pay, paid, note }
//   makes a real order (in the ledger, stock taken off, a label link) for a sale made by hand.
// Runs after patchaddr.js.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['public/admin.html', "      var tr = el('tr');\n      tr.appendChild(el('td', when(o.at)));", "      var tr = el('tr'); tr.dataset.n = o.n;\n      tr.appendChild(el('td', when(o.at)));"],
  ['public/admin.html', "      orders = r.orders || []; items = r.products || []; party = r.party || null;", "      orders = r.orders || []; items = r.products || []; party = r.party || null; window.jfOrders = orders; window.jfItems = items; window.jfReload = load;"],
  ['inject.js', "  if (f === 'admin.html' && s.indexOf('/admin-safes.js') < 0)", "  if (f === 'admin.html' && s.indexOf('/admin-orders.js') < 0) s = before(s, f, '<script src=\"/admin-orders.js?v=' + Date.now() + '\" defer></script>');\n  if (f === 'admin.html' && s.indexOf('/admin-safes.js') < 0)"],
  ['api/admin.js', R`  if (req.query && req.query.jarburn) {`, R`  if (req.query && req.query.neworder) {
    const b = req.query, tidy = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
    const all = await edits.apply(catalog, { all: true }), p = all.filter((x) => x.id === String(b.pid || ''))[0];
    if (!p) return res.status(400).json({ error: 'Pick the product that was sold.' });
    const qty = Math.floor(Number(b.qty)), each = Math.round(Number(b.each) * 100), ship = Math.round(Number(b.ship || 0) * 100);
    if (!(qty >= 1 && qty <= 1000)) return res.status(400).json({ error: 'Enter how many were sold.' });
    if (!(each >= 0 && each <= 10000000)) return res.status(400).json({ error: 'Enter the price each.' });
    if (!(ship >= 0 && ship <= 100000)) return res.status(400).json({ error: 'Enter shipping from $0 (free) up.' });
    const name = tidy(b.name, 80), email = tidy(b.email, 160).toLowerCase();
    if (!name) return res.status(400).json({ error: 'Enter the buyer name.' });
    if (email && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return res.status(400).json({ error: 'That email does not look right. Fix it or leave it blank.' });
    const a = [name, '', tidy(b.street, 120), tidy(b.line2, 60), tidy(b.city, 60), tidy(b.state, 30), tidy(b.zip, 12)];
    const ways = { cash: ['cash', 'cash'], zelle: ['cash', 'zelle'], venmo: ['cash', 'venmo'], cashapp: ['cash', 'cashapp'], card: ['card', ''], crypto: ['crypto', ''] }, w = ways[String(b.pay)] || ways.cash;
    const L = each * qty, T = L + ship, lib = require('./_lib'), off = require('./_offline');
    const r = await lib.createInvoice({ no: 'M' + Date.now().toString(36).toUpperCase(), item: p.name, qty: String(qty), buyer: name, terms: '', email: email, cents: T, hours: 24 * 30, noCoins: true,
      extra: Object.assign({ p: 'shop', pid: p.id, L: L, T: T, sh: ship, a: a, m: w[0] }, w[1] ? { w: w[1] } : {}) });
    if (r.error) return res.status(503).json({ error: r.error });
    const note = tidy(b.note, 80), paid = b.paid === '1';
    const status = (paid ? 'Paid in full' : 'Placed, payment due by ' + off.payWith(r.inv)) + ' (manual order' + (note ? ': ' + note : '') + ')';
    const out = await off.record(r.inv, status, { paid: paid, label: a[2] ? off.labelLink('https://' + req.headers.host, r.token, r.inv) : '' });
    console.log('MANUAL_ORDER', r.inv.n, out);
    if (!(out === 'ok' || out === 'duplicate' || out === 'short')) return res.status(503).json({ error: 'Could not save the order just now. Try again.' });
    return res.json({ ok: true, n: r.inv.n, short: out === 'short' });
  }
  if (req.query && req.query.jarburn) {`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchmanual: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
