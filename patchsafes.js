// Build step: set up the next round of 5 Deal of the day safes in the back office, check them, then go live.
// The next round's pieces are ordinary products kept hidden with nextDeal: 1-5 until the owner presses Go live.
// Going live takes the old round's pieces out of the safes (deal 0, hidden) and puts the new ones in safes 1-5.
// Safe 1 then opens, and the usual "new round" email goes out on its own (see safes() in _sweep.js).
//   GET ?k=<key>&safes=list                    the 5 slots of the next round and where the current round stands
//   GET ?k=<key>&safes=save&n=1-5&name=&desc=&price=&stock=&shipping=&weight=&box=&nft=0|1   save one slot
//   GET ?k=<key>&safes=clear&n=1-5            empty one slot
//   GET ?k=<key>&safes=live[&force=1]         go live (force: even though the current round still has pieces left)
// Photos go up through the existing POST ?photo=<product id>.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/admin.js', R`  if (req.query && req.query.edit) {`, R`  if (req.query && req.query.safes) {
    const q = req.query, what = String(q.safes), tidy = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
    const everything = await edits.apply(catalog, { all: true });
    const draft = (n) => everything.filter((x) => Number(x.nextDeal) === n)[0] || null;
    const card = (p) => p ? { id: p.id, name: p.name, desc: p.desc || '', price: p.price, stock: p.stock, shipping: p.shipping === 'free' ? 0 : Number(p.shipping) || 0, weight: p.weight_oz || '', box: p.box || '', nft: !!(p.nft && p.nft !== 'no'), photo: p.photo ? '/api/photo?id=' + p.id + '&v=' + p.photo : '' } : null;
    const lib = require('./_lib'), off = require('./_offline');
    const roundNow = async () => { let dl = { slots: [] }; try { dl = await off.deals(await lib.getInventory(true)); } catch (e) { console.error('SAFES_ROUND_FAIL', String(e && e.message || e)); } const left = dl.slots.filter((s) => s.state !== 'sold').length; return { total: dl.slots.length, left: left }; };
    try {
      if (what === 'list') return res.json({ slots: [1, 2, 3, 4, 5].map((n) => card(draft(n))), round: await roundNow() });
      const n = Math.floor(Number(q.n));
      if ((what === 'save' || what === 'clear') && !(n >= 1 && n <= 5)) return res.status(400).json({ error: 'Pick a safe from 1 to 5.' });
      if (what === 'clear') { const p = draft(n); if (p) await edits.save(p.id, { nextDeal: 0, hidden: true }); return res.json({ ok: true }); }
      if (what === 'save') {
        const name = tidy(q.name, 140), price = Math.round(Number(q.price) * 100) / 100, stock = Math.floor(Number(q.stock === '' || q.stock == null ? 1 : q.stock)), ship = Math.round(Number(q.shipping || 0) * 100) / 100;
        if (!name) return res.status(400).json({ error: 'Enter a name for safe ' + n + '.' });
        if (!(price >= 0.5 && price <= 100000)) return res.status(400).json({ error: 'Enter a price for safe ' + n + ' between $0.50 and $100,000.' });
        if (!(stock >= 1 && stock <= 10000)) return res.status(400).json({ error: 'Enter how many are in safe ' + n + ' (at least 1).' });
        if (!(ship >= 0 && ship <= 1000)) return res.status(400).json({ error: 'Enter shipping from $0 (free) to $1,000.' });
        const w = Number(q.weight);
        if (q.weight && !(w > 0 && w <= 1600)) return res.status(400).json({ error: 'Enter the weight in ounces, or leave it blank.' });
        const f = { name: name, desc: tidy(q.desc, 1200), price: price, stock: stock, min: 1, shipping: ship > 0 ? ship : 'free', weight_oz: w > 0 ? Math.round(w * 10) / 10 : 0, box: tidy(q.box, 60), nft: q.nft === '1' ? 'yes' : '', section: q.nft === '1' ? 'NFTs' : '', deal: 0, nextDeal: n, hidden: true, shelf: false };
        let p = draft(n);
        if (p) await edits.save(p.id, f); else { p = await edits.add(f); await edits.save(p.id, f); }
        return res.json({ ok: true, id: p.id });
      }
      if (what === 'live') {
        const slots = [1, 2, 3, 4, 5].map(draft), missing = [1, 2, 3, 4, 5].filter((n, i) => !slots[i]);
        if (missing.length) return res.status(400).json({ error: 'Fill in every safe first. Still empty: safe ' + missing.join(', safe ') + '.' });
        const r = await roundNow();
        if (r.left && q.force !== '1') return res.status(409).json({ error: 'The current round still has ' + r.left + (r.left === 1 ? ' safe' : ' safes') + ' not claimed. Going live takes those pieces out of the safes.', left: r.left });
        // The old round leaves the safes. Its pieces stay in the order history but come off the site.
        const old = everything.filter((x) => Number(x.deal) > 0);
        for (const p of old) await edits.save(p.id, { deal: 0, hidden: true });
        for (let i = 0; i < 5; i++) await edits.save(slots[i].id, { deal: i + 1, nextDeal: 0, hidden: false, shelf: false });
        console.log('SAFES_LIVE', JSON.stringify({ out: old.map((p) => p.id), in: slots.map((p) => p.id) }));
        return res.json({ ok: true, live: slots.map((p) => p.id) });
      }
      return res.status(400).json({ error: 'Unknown request.' });
    } catch (e) { console.error('SAFES_FAIL', String(e && e.message || e)); return res.status(503).json({ error: 'Could not do that just now. Try again.' }); }
  }
  if (req.query && req.query.edit) {`],
  ['inject.js', R`  if (f === 'admin.html' && s.indexOf('/admin-digest.js') < 0)`, R`  if (f === 'admin.html' && s.indexOf('/admin-safes.js') < 0) s = before(s, f, '<script src="/admin-safes.js?v=' + Date.now() + '" defer></script>');
  if (f === 'admin.html' && s.indexOf('/admin-digest.js') < 0)`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchsafes: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
