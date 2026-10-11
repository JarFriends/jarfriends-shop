// Build step: a Discord message for every new order and every new offer. Runs after patchoffers.js.
// Each change is [file, text to find, text to put in its place]; the text to find must be there exactly once.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/_offline.js', R`function notifyOwner(inv, link, note) {`, R`function notifyOwner(inv, link, note) {
  const ping = require('./_discord')('**ORDER** ' + money(inv.T) + ' · ' + (inv.i || '-') + (inv.q ? ' x ' + inv.q : '') + '\n' + inv.b + ' · ' + note + ' · order ' + inv.n);
  return Promise.all([notifyOwnerMail(inv, link, note), ping]).then((x) => x[0]);
}
function notifyOwnerMail(inv, link, note) {`],
  ['api/offer.js', R`  await saveOffer(o, tok, 'pending');`, R`  await saveOffer(o, tok, 'pending');
  await require('./_discord')('**OFFER** ' + money(cents) + ' each · ' + qty + ' x ' + p.name + ' (listed ' + money(p.cents) + ')\n' + name + ' · would pay with ' + pay + ' · answer it: ' + host + '/admin.html');`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchdiscord: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
