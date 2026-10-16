// Build step: burning jars from the back office.
//   GET ?k=<key>&jars=1                          also returns the burn setting
//   GET ?k=<key>&burncfg=save&open=1|0&title=&note=&each=   open or close a burn
//   GET ?k=<key>&jarburn=<email>&n=&why=         burn that customer's jars
// Runs after patchloyal.js.
const fs = require('fs');
const R = String.raw;
const f = 'api/admin.js';
let s = fs.readFileSync(f, 'utf8');
const a = R`  if (req.query && req.query.jars) return res.json({ need: require('./_jars').NEED, jars: await require('./_jars').all() });`;
if (s.split(a).length !== 2) throw new Error('patchjars2: jars list not found');
s = s.replace(a, () => R`  if (req.query && req.query.burncfg === 'save') {
    const q = req.query, tidy = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n), each = Math.floor(Number(q.each) || 1);
    if (!(each >= 1 && each <= 1000)) return res.status(400).json({ error: 'Jars per burn: 1 to 1,000.' });
    const c = await require('./_jars').setBurnCfg({ open: q.open === '1', title: tidy(q.title, 80), note: tidy(q.note, 600), each: each, at: Date.now() });
    console.log('BURN_CFG', JSON.stringify({ open: c.open, each: c.each }));
    return res.json({ ok: true, burn: c });
  }
  if (req.query && req.query.jarburn) {
    const who = String(req.query.jarburn).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(who)) return res.status(400).json({ error: 'That email address is not valid.' });
    const r = await require('./_jars').burn(who, req.query.n, { why: String(req.query.why || 'Burned by JarFriends').slice(0, 120), by: 'owner' });
    return res.status(r.error ? 400 : 200).json(r);
  }
  if (req.query && req.query.jars) return res.json({ need: require('./_jars').NEED, jars: await require('./_jars').all(), burn: await require('./_jars').burnCfg() });`);
fs.writeFileSync(f, s);
