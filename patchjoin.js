// Build step (after patchmsgs.js): the mailing list. help.html?join=1 is a short form (name, email, and a hello if
// they like) that puts the visitor on the list for the "new safe unlocked" emails (see api/_sweep.js).
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/help.js', R`  const hello = b.kind === 'hello';`, R`  const hello = b.kind === 'hello', join = b.kind === 'join';`],
  ['api/help.js', R`  const topic = hello ? 'Saying hello' :`, R`  const topic = hello ? 'Saying hello' : join ? 'Subscribed' :`],
  ['api/help.js', R`  if (!topic || !issue) return`, R`  if (join) {
    // On the list: list/<email hash>.json. A hello typed with it goes on to the owner like any other message.
    try {
      const st = require('./_store');
      if (st.on()) {
        await st.write('list/' + crypto.createHash('sha1').update(email.toLowerCase()).digest('hex').slice(0, 20) + '.json', { at: Date.now(), email: email.toLowerCase(), name: name });
        // Subscribing again undoes an earlier unsubscribe.
        await st.write('unsub/' + crypto.createHash('sha1').update(email.toLowerCase()).digest('hex').slice(0, 20) + '.json', { back: Date.now() });
        if (!issue) await st.write('msgs/' + Date.now() + '-' + crypto.createHash('sha1').update('join|' + email).digest('hex').slice(0, 8) + '.json', { at: Date.now(), kind: 'join', name: name, email: email, order: '', topic: topic, issue: '', fix: '' });
      }
    } catch (e) { console.error('LIST_SAVE_FAIL', String(e && e.message || e)); return res.status(503).json({ error: 'Could not add you just now. Please try again.' }); }
    if (!issue) return res.json({ ok: true });
  }
  if (!topic || !issue) return`],
  ['api/help.js', R`kind: hello ? 'hello' : 'help',`, R`kind: join ? 'join' : hello ? 'hello' : 'help',`],
  ['api/help.js', R`(hello ? 'Hello from ' : 'Help request from ')`, R`(join ? 'New subscriber, with a hello: ' : hello ? 'Hello from ' : 'Help request from ')`],
  ['public/help.html', R`  if (hello) {
    document.title = 'Say hello';`, R`  var join = /[?&]join=1/.test(location.search);
  if (join) {
    document.title = 'Subscribe';
    document.querySelector('h1').textContent = 'Subscribe';
    document.querySelector('.mono.gold').textContent = 'BE FIRST TO KNOW';
    $('lead').textContent = 'Get an email when a new safe unlocks and when new pieces arrive. Say hello too, if you like.';
    ['order', 'topic', 'fix', 'issue'].forEach(function (n) { F.elements[n].required = false; if (n !== 'issue') F.elements[n].closest('label').hidden = true; });
    F.elements.issue.closest('label').firstChild.textContent = 'Say hello (optional)';
    $('go').textContent = 'Subscribe';
    document.querySelector('#done h2').textContent = 'You are subscribed.';
    document.querySelector('#done .small').textContent = 'We will email you when a new safe unlocks. Every email has an unsubscribe link.';
  }
  if (hello) {
    document.title = 'Say hello';`],
  ['public/help.html', R`if (hello) data.kind = 'hello';`, R`if (hello) data.kind = 'hello'; if (join) data.kind = 'join';`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchjoin: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
