// Build step, run last: small changes to the home page, applied on top of the last design export.
// The home page arrives as one bundled file from the design tool. This step opens the bundle, makes each change
// below in the page's source, and closes it again, so a small design change does not need a fresh export.
// Each change is [text to find, text to put in its place]. One already made (the export has caught up) is skipped;
// one that fits nowhere is reported in the build log and left out, so the rest of the site still goes up.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
// The changes are kept in files named home-changes*.json, read in name order.
const changes = [].concat.apply([], fs.readdirSync(__dirname).filter((f) => /^home-changes.*\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'))));
const file = path.join(process.argv[2] || 'public', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const m = /(<script type="__bundler\/manifest"[^>]*>)([\s\S]*?)(<\/script>)/.exec(html);
if (!m) throw new Error('patchhome: the home page bundle was not found');
const man = JSON.parse(m[2]);
const keys = Object.keys(man).filter((k) => /html|javascript|json|text/.test(man[k].mime || ''));
const text = {};
keys.forEach((k) => { const b = Buffer.from(man[k].data, 'base64'); text[k] = (man[k].compressed ? zlib.gunzipSync(b) : b).toString('utf8'); });
// The source sits inside the bundle as a quoted string, so the text is looked for in that form too.
const quoted = (s) => JSON.stringify(s).slice(1, -1).replace(/<\//g, '<\\u002F');
let made = 0, skipped = 0, missed = 0;
changes.forEach((c, n) => {
  const forms = [[quoted(c[0]), quoted(c[1])], [c[0], c[1]]];
  let done = false, already = false;
  keys.forEach((k) => forms.forEach((f) => {
    if (done) return;
    if (text[k].split(f[0]).length === 2) { text[k] = text[k].replace(f[0], () => f[1]); done = true; }
    else if (text[k].indexOf(f[1]) >= 0) already = true;
  }));
  if (done) made++; else if (already) skipped++; else { missed++; console.warn('patchhome: change ' + (n + 1) + ' did not fit the home page: ' + c[0].slice(0, 70)); }
});
// The on-screen error box also sits in each inner page of the bundle: silence it everywhere (errors go to the console).
{
  const box = "var d = document.getElementById('__bundler_err') || p.appendChild(document.createElement('div'));";
  const quiet = "console.error('[bundle]', e.message || e.type, e.filename || '', e.lineno || ''); return; " + box;
  let n = 0;
  keys.forEach((k) => { [[box, quiet], [quoted(box), quoted(quiet)]].forEach((f) => { if (text[k].indexOf(f[1]) >= 0) return; const parts = text[k].split(f[0]); if (parts.length > 1) { n += parts.length - 1; text[k] = parts.join(f[1]); } }); });
  console.log('patchhome: error box silenced in ' + n + ' inner pages');
}
keys.forEach((k) => { const b = Buffer.from(text[k], 'utf8'); man[k].data = (man[k].compressed ? zlib.gzipSync(b) : b).toString('base64'); });
fs.writeFileSync(file, html.slice(0, m.index) + m[1] + JSON.stringify(man) + m[3] + html.slice(m.index + m[0].length));
console.log('patchhome: ' + made + ' made, ' + skipped + ' already there, ' + missed + ' missed');

// Visitors never see the bundle's on-screen error box (errors from browser wallets and extensions showed up there).
// Errors still go to the browser console.
{
  const f2 = path.join(process.argv[2] || 'public', 'index.html');
  let h = fs.readFileSync(f2, 'utf8');
  const box = "    var p = document.body || document.documentElement;\n    var d = document.getElementById('__bundler_err') || p.appendChild(document.createElement('div'));";
  if (h.split(box).length === 2) {
    h = h.replace(box, () => "    console.error('[bundle]', e.message || e.type, e.filename || '', e.lineno || ''); return;\n" + box);
    fs.writeFileSync(f2, h);
    console.log('patchhome: on-screen error box turned off');
  } else console.warn('patchhome: error box not found (already off, or the export changed)');
}
