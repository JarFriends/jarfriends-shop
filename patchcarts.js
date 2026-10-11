// Build step (last of the patches): the checkout page tells the site who started a checkout once an email address
// is typed; the back office lists them in a Checkouts tab and can send each one reminder email.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['public/order.html', R`  $('qty').addEventListener('input', total);`, R`  $('qty').addEventListener('input', total);
  // Once an email address is typed, remember who started this checkout (shown in the back office).
  var cartSent = '';
  function cart() {
    var F = $('f').elements, e = String(F.email.value || '').trim(), id = $('product').value;
    if (!id || F.website.value || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return;
    var sig = id + '|' + e + '|' + F.name.value;
    if (sig === cartSent) return;
    cartSent = sig;
    try { fetch('/api/cart', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id, email: e, name: F.name.value }), keepalive: true }).catch(function () {}); } catch (x) {}
  }
  $('f').elements.email.addEventListener('change', cart);
  $('f').elements.name.addEventListener('change', cart);
  $('product').addEventListener('change', cart);`],
  // GET ?k=<key>&carts=1  owner only: the newest 300 started checkouts.
  // GET ?k=<key>&remind=<cart key>&left=<units left>  owner only: sends that person one reminder email.
  ['api/admin.js', R`  if (req.query && req.query.msgs) {`, R`  if (req.query && req.query.carts) {
    const { list } = await import('@vercel/blob');
    const r = await list({ prefix: 'carts/', limit: 1000 });
    const got = await Promise.all((r.blobs || []).map(async (b) => { const c = await store.read(b.pathname); return c ? Object.assign(c, { key: b.pathname.slice(6, -5) }) : null; }));
    return res.json({ carts: got.filter(Boolean).sort((a, b) => b.at - a.at).slice(0, 300) });
  }
  if (req.query && req.query.remind) {
    const ck = String(req.query.remind);
    if (!/^[A-Za-z0-9_-]+~[0-9a-f]{16}$/.test(ck)) return res.status(400).json({ error: 'That checkout was not found.' });
    const c = await store.read('carts/' + ck + '.json');
    if (!c || !c.email) return res.status(404).json({ error: 'That checkout was not found.' });
    if (c.sent) return res.status(409).json({ error: 'A reminder was already sent to this person.' });
    const left = Math.floor(Number(req.query.left)) || 0;
    const out = await mail(c.email, 'Still thinking about ' + c.product + '?', [(c.name ? 'Hi ' + c.name.split(' ')[0] + ',' : 'Hi,'), '', 'You started checking out ' + c.product + ' at JarFriends but did not finish.', left === 1 ? 'There is only 1 left, so do not miss out.' : left > 1 && left <= 5 ? 'There are only ' + left + ' left, so do not miss out.' : 'Do not miss out.', '', 'If this is your first order, take 10% off with promo code JAR10 at checkout.', '', 'Finish your order here:', host + '/order.html?product=' + encodeURIComponent(c.pid), '', 'If you are no longer interested, ignore this email. We will not send another reminder.'], 'cart-' + ck).catch(() => 'failed');
    if (out !== 'sent' && out !== 'duplicate') return res.status(502).json({ error: 'The email could not be sent. Try again.' });
    await store.write('carts/' + ck + '.json', Object.assign(c, { sent: Date.now() }));
    return res.json({ ok: true });
  }
  if (req.query && req.query.msgs) {`],
  ['inject.js', R`  if (f === 'admin.html' && s.indexOf('/admin-offers.js') < 0) s = before(s, f, '<script src="/admin-offers.js" defer></script>');`, R`  if (f === 'admin.html' && s.indexOf('/admin-offers.js') < 0) s = before(s, f, '<script src="/admin-offers.js" defer></script>');
  if (f === 'admin.html' && s.indexOf('/admin-carts.js') < 0) s = before(s, f, '<script src="/admin-carts.js" defer></script>');`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchcarts: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
