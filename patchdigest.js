// Build step (after patchauction.js): the daily update button in the back office (see api/_digest.js).
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/admin.js', R`  if (req.query && req.query.voidlabel) {`, R`  if (req.query && req.query.digest) {
    const d = require('./_digest'), what = String(req.query.digest);
    try {
      if (what === 'preview') return res.json(await d.preview());
      if (what === 'send') { const r = await d.send(req.query.start === '1'); return res.status(r.error ? 400 : 200).json(r); }
    } catch (e) { console.error('DIGEST_FAIL', String(e && e.message || e)); return res.status(503).json({ error: 'Could not do that just now. Try again.' }); }
    return res.status(400).json({ error: 'Unknown request.' });
  }
  if (req.query && req.query.voidlabel) {`],
  ['inject.js', R`  if (f === 'admin.html' && s.indexOf('/admin-jars.js') < 0) s = before(s, f, '<script src="/admin-jars.js" defer></script>');`, R`  if (f === 'admin.html' && s.indexOf('/admin-jars.js') < 0) s = before(s, f, '<script src="/admin-jars.js" defer></script>');
  if (f === 'admin.html' && s.indexOf('/admin-digest.js') < 0) s = before(s, f, '<script src="/admin-digest.js" defer></script>');
  if (f === 'admin.html' && s.indexOf('/admin-ship.js') < 0) s = before(s, f, '<script src="/admin-ship.js" defer></script>');`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchdigest: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
