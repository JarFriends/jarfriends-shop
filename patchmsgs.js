// Build step: messages people send from the site (Say hello and the Help form) are kept for the back office,
// where each sender is shown as a paid customer or someone who has never bought. Runs after patchextra.js.
// Each change is [file, text to find, text to put in its place]; the text to find must be there exactly once.
const fs = require('fs');
const R = String.raw;
const changes = [
  // help.html?hello=1 is the short "Say hello" form: name, email and a message.
  ['api/help.js', R`  const topic = clip(b.topic, 200),`, R`  const hello = b.kind === 'hello';
  const topic = hello ? 'Saying hello' : clip(b.topic, 200),`],
  ['api/help.js', R`error: 'Tell us what you need help with and what the issue is.'`, R`error: hello ? 'Write your message.' : 'Tell us what you need help with and what the issue is.'`],
  ['api/help.js', R`  const out = await mail(owner, 'Help request from ' + name + ': '`, R`  try {
    const store = require('./_store');
    if (store.on()) await store.write('msgs/' + Date.now() + '-' + key.slice(5, 13) + '.json', { at: Date.now(), kind: hello ? 'hello' : 'help', name: name, email: email, order: order, topic: topic, issue: issue, fix: fix });
  } catch (e) { console.error('MSG_SAVE_FAIL', String(e && e.message || e)); }
  const out = await mail(owner, (hello ? 'Hello from ' : 'Help request from ') + name + ': '`],
  // GET ?k=<key>&msgs=1  owner only: the newest 200 messages.
  ['api/admin.js', R`  if (req.query && req.query.note) {`, R`  if (req.query && req.query.msgs) {
    const { list } = await import('@vercel/blob');
    const r = await list({ prefix: 'msgs/', limit: 1000 });
    const paths = (r.blobs || []).map((b) => b.pathname).sort().reverse().slice(0, 200);
    return res.json({ msgs: (await Promise.all(paths.map((p) => store.read(p)))).filter(Boolean) });
  }
  if (req.query && req.query.note) {`],
  ['public/help.html', R`  $('f').addEventListener('submit', function (ev) {`, R`  var hello = /[?&]hello=1/.test(location.search), F = $('f');
  if (hello) {
    document.title = 'Say hello';
    document.querySelector('h1').textContent = 'Say hello';
    document.querySelector('.mono.gold').textContent = 'GOOD TO HEAR FROM YOU';
    $('lead').textContent = 'Send us a note and we will email you back.';
    ['order', 'topic', 'fix'].forEach(function (n) { F.elements[n].required = false; F.elements[n].closest('label').hidden = true; });
    F.elements.issue.closest('label').firstChild.textContent = 'Your message';
  }
  $('f').addEventListener('submit', function (ev) {`],
  ['public/help.html', R`new FormData($('f')).forEach(function (v, k) { data[k] = v; });`, R`new FormData($('f')).forEach(function (v, k) { data[k] = v; }); if (hello) data.kind = 'hello';`],
  ['inject.js', R`s = before(s, f, '<script src="/admin-promos.js" defer></script>');`, R`s = before(s, f, '<script src="/admin-promos.js" defer></script>');
  if (f === 'admin.html' && s.indexOf('/admin-messages.js') < 0) s = before(s, f, '<script src="/admin-messages.js" defer></script>');`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchmsgs: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
