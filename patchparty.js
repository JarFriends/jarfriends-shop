// Build step: when the party ends. Set to 24 hours from Saturday October 10, 2026, 10:35 pm Central.
const fs = require('fs');
const f = 'api/_party.js';
let s = fs.readFileSync(f, 'utf8');
[["ends: Date.parse('2026-10-14T23:00:00-05:00'),", "ends: Date.parse('2026-10-11T22:35:00-05:00'),"], ["endsText: 'Wednesday, October 14 at 11:00 PM Central',", "endsText: 'Sunday, October 11 at 10:35 PM Central',"]].forEach((c) => {
  if (s.split(c[0]).length !== 2) throw new Error('patchparty: expected one match for ' + c[0]);
  s = s.replace(c[0], () => c[1]);
});
fs.writeFileSync(f, s);
