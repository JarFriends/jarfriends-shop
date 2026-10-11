// Build step: the fuller back office. Runs after patchhold.js.
// - Products carry a description, a photo, a shelf switch, a hidden switch and a Deal of the day safe number.
// - The owner can add a product, upload a photo, and mark an order shipped with a tracking number.
// - Each product's click counts are shown.
// Each change is [file, text to find, text to put in its place]; the text to find must be there exactly once.
const fs = require('fs');
const R = String.raw;
const changes = [
  // The shop sends each piece's description, shelf switch and photo to the home page.
  ['api/order.js', '      const products = inv.filter(', R`      const more = {};
      (await require('./_edits').apply(require('./_products'))).forEach((x) => { more[x.id] = x; });
      const photoOf = (x) => (x && x.photo ? 'https://' + req.headers.host + '/api/photo?id=' + x.id + '&v=' + x.photo : '');
      const products = inv.filter(`],
  ['api/order.js', R`deal: dl.state[p.id] === 'open', nft: !!nftBy[p.id] }));`, R`deal: dl.state[p.id] === 'open', nft: !!nftBy[p.id], desc: (more[p.id] || {}).desc || '', shelf: !!(more[p.id] || {}).shelf, photo: photoOf(more[p.id]) }));`],

  // The back office sees every product, hidden ones too, with its clicks.
  ['api/admin.js', R`  const catalog = await edits.apply(require('./_products'));`, R`  const catalog = await edits.apply(require('./_products'), { all: true });`],
  ['api/admin.js', 'catalog.filter((p) => p.deal > 0)', 'catalog.filter((p) => p.deal > 0 && !p.hidden)'],
  ['api/admin.js', R`  try { held = await require('./_holds').byProduct(); } catch (e) { held = {}; }
`, R`  try { held = await require('./_holds').byProduct(); } catch (e) { held = {}; }
  let clicks = {};
  try { clicks = await require('./click').all(); } catch (e) { clicks = {}; }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
`],
  ['api/admin.js', 'held: held[p.id] || 0, left:', R`desc: p.desc || '', hidden: !!p.hidden, onShelf: !!p.shelf, added: !!p.added, photo: p.photo ? '/api/photo?id=' + p.id + '&v=' + p.photo : '', views: (clicks[p.id] || {}).view || 0, checkouts: (clicks[p.id] || {}).checkout || 0, viewsToday: (((clicks[p.id] || {}).days || {})[today] || {}).view || 0, held: held[p.id] || 0, left:`],

  // Saving an edit: any product (added ones too), with the description and the three switches.
  ['api/admin.js', 'const q = req.query, p = catalog.filter((x) => x.id === String(q.edit))[0];', 'const q = req.query, everything = await edits.apply(catalog, { all: true }), p = everything.filter((x) => x.id === String(q.edit))[0];'],
  ['api/admin.js', '    if (!p.deal) f.section =', R`    if (q.desc !== undefined) f.desc = String(q.desc || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (q.shelf !== undefined) f.shelf = q.shelf === '1';
    if (q.hidden !== undefined) f.hidden = q.hidden === '1';
    if (q.deal !== undefined) {
      const dn = Math.floor(Number(q.deal)) || 0;
      if (dn < 0 || dn > 50) return res.status(400).json({ error: 'Enter a safe number from 1 to 50, or 0 for none.' });
      const taken = dn ? everything.filter((x) => x.id !== p.id && Number(x.deal) === dn && !x.hidden)[0] : null;
      if (taken) return res.status(400).json({ error: 'Safe ' + dn + ' already holds ' + taken.name + '. Move that one first.' });
      f.deal = dn;
    }
    if (!p.deal) f.section =`],

  // A photo arrives as a POST with the picture in it.
  ['api/admin.js', "  if (req.method === 'POST') return passIn(req, res, now, host);", "  if (req.method === 'POST' && req.query && req.query.photo) return photoIn(req, res, now);\n  if (req.method === 'POST') return passIn(req, res, now, host);"],
  ['api/admin.js', '// Days a link keeps working.', R`// POST ?k=<key>&photo=<product id> with { data: <the JPEG, base64> }  owner only: saves a product's photo.
async function photoIn(req, res, now) {
  const k = verify(String(req.query.k || ''));
  if (!k || k.adm !== 1 || now > k.x) return res.status(401).json({ error: 'Your sign-in is not valid or has run out. Sign in again.' });
  const id = String(req.query.photo);
  if (!(await edits.apply(catalog, { all: true })).some((x) => x.id === id)) return res.status(404).json({ error: 'That product was not found.' });
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const buf = Buffer.from(String(b.data || ''), 'base64');
  if (buf.length < 1000 || buf.length > 1500000 || buf[0] !== 0xFF || buf[1] !== 0xD8) return res.status(400).json({ error: 'That photo could not be used. Try another one.' });
  const { put } = await import('@vercel/blob');
  await put('photos/' + id + '.jpg', buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/jpeg' });
  await edits.save(id, { photo: Date.now() });
  return res.json({ ok: true });
}
// Days a link keeps working.`],

  // GET ?k=<key>&add=1&name=&desc=&price=&stock=&shipping=&section=  owner only: adds a product.
  // GET ?k=<key>&ship=<invoice>&tracking=&carrier=  owner only: marks an order shipped and emails the buyer the number.
  ['api/admin.js', '  // Mark one order as paid.', R`  if (req.query && req.query.add) {
    const q = req.query, tidy = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
    const name = tidy(q.name, 140), price = Math.round(Number(q.price) * 100) / 100, stock = Math.floor(Number(q.stock)), ship = Math.round(Number(q.shipping) * 100) / 100;
    if (!name) return res.status(400).json({ error: 'Enter a name.' });
    if (!(price >= 0.5 && price <= 100000)) return res.status(400).json({ error: 'Enter a price between $0.50 and $100,000.' });
    if (!(stock >= 0 && stock <= 10000)) return res.status(400).json({ error: 'Enter how many you have, from 0 to 10,000.' });
    if (!(ship >= 0 && ship <= 1000)) return res.status(400).json({ error: 'Enter shipping from $0 (free) to $1,000.' });
    const np = await edits.add({ name: name, desc: tidy(q.desc, 600), price: price, stock: stock, shipping: ship > 0 ? ship : 'free', section: tidy(q.section, 80).replace(/[^A-Za-z, ]/g, '') });
    return res.json({ ok: true, id: np.id });
  }
  if (req.query && req.query.ship) {
    const s = sales.filter((x) => x.n === String(req.query.ship))[0];
    if (!s) return res.status(404).json({ error: 'That order was not found.' });
    const tracking = String(req.query.tracking || '').replace(/\s+/g, ' ').trim().slice(0, 60), carrier = String(req.query.carrier || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (!tracking) return res.status(400).json({ error: 'Enter the tracking number.' });
    const d = (await store.read(s.path)) || {}, was = (await store.read('meta/' + s.n + '.json')) || {};
    await store.write('meta/' + s.n + '.json', Object.assign(was, { tracking: tracking, carrier: carrier, testLabel: false, shippedAt: Date.now() }, was.paidAt ? {} : { paidAt: Date.now(), paidHow: 'label' }));
    let sent = 'none';
    if (d.email) sent = await mail(d.email, 'Your order ' + s.n + ' has shipped', ['Your order ' + s.n + ' (' + (d.product || 'your order') + ' x ' + s.q + ') is on its way.', '', 'Tracking number: ' + tracking + (carrier ? ' (' + carrier + ')' : ''), '', 'Thank you for your order.'], 'shipped-' + s.n + '-' + tracking).catch(() => 'failed');
    return res.json({ ok: true, emailed: sent === 'sent' || sent === 'duplicate' });
  }
  // Mark one order as paid.`],

  // Orders: an "Add tracking" button on anything not yet shipped.
  ['public/admin.html', "      if (o.cancelled) { tr.style.opacity = '.6';", R`      if (!o.cancelled && (!o.tracking || o.testLabel)) {
        var tk = el('button', 'Add tracking', 'ghost'); tk.type = 'button'; tk.style.cssText = 'margin-top:6px;padding:6px 12px;font-size:13px;display:block';
        tk.addEventListener('click', function () {
          var num = prompt('Tracking number for order ' + o.n + '. The buyer is emailed this number and the order is marked shipped.');
          if (!num || !num.trim()) return;
          var car = prompt('Carrier (USPS, UPS, FedEx). Leave blank to skip.', 'USPS') || '';
          tk.disabled = true; tk.textContent = 'Saving...';
          fetch('/api/admin?k=' + encodeURIComponent(key) + '&ship=' + encodeURIComponent(o.n) + '&tracking=' + encodeURIComponent(num.trim()) + '&carrier=' + encodeURIComponent(car.trim()), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
            if (r.error) { tk.disabled = false; tk.textContent = 'Add tracking'; alert(r.error); return; }
            if (!r.emailed) alert('Saved, but the email to the buyer did not go out. Send them the number yourself.');
            load();
          }, function () { tk.disabled = false; tk.textContent = 'Add tracking'; alert('Could not reach the site. Try again.'); });
        });
        st.appendChild(tk);
      }
      if (o.cancelled) { tr.style.opacity = '.6';`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchmore: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
