// Build step (after patchdeal.js and patchvault.js): the Lava Jack-O uses the Jolly Jack-O picture and has a
// description, on the shop and in the back office (the owner's own edits still win). Also: no automatic price change.
const fs = require('fs');
const D = "'VeeFriends Comic Issue 23: Jolly Jack-O (Burn Island Exclusive), Lava version.'";
const changes = [
  ['api/order.js', "desc: (more[p.id] || {}).desc || '', shelf: !!(more[p.id] || {}).shelf, photo: photoOf(more[p.id]) }));", "desc: (more[p.id] || {}).desc || (p.id === 'LAVAJACK' ? " + D + " : ''), shelf: !!(more[p.id] || {}).shelf, photo: photoOf(more[p.id]) || (p.id === 'LAVAJACK' ? 'https://' + req.headers.host + '/photos/JACKO.jpg' : '') }));"],
  ['api/admin.js', "desc: p.desc || '', hidden: !!p.hidden, onShelf: !!p.shelf, added: !!p.added, photo: p.photo ? '/api/photo?id=' + p.id + '&v=' + p.photo : '',", "desc: p.desc || (p.id === 'LAVAJACK' ? " + D + " : ''), hidden: !!p.hidden, onShelf: !!p.shelf, added: !!p.added, photo: p.photo ? '/api/photo?id=' + p.id + '&v=' + p.photo : (p.id === 'LAVAJACK' ? '/photos/JACKO.jpg' : ''),"],
  ['api/_edits.js', "const AFTER = { JACKO: { at: Date.parse('2026-10-12T00:35:00Z'), price: 98 } };", "const AFTER = {};"]
];
changes.forEach((c) => {
  const s = fs.readFileSync(c[0], 'utf8');
  if (s.split(c[1]).length !== 2) throw new Error('patchlava: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  fs.writeFileSync(c[0], s.replace(c[1], () => c[2]));
});
