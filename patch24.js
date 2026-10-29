// Build step: an accepted or countered offer is good for 48 hours (it was 3 for a while: too short, buyers missed it).
const fs = require('fs');
[['api/offer.js', 'const HOLD_HOURS = 48;', 'const HOLD_HOURS = 48;'], ['public/offer.html', 'good for 48 hours', 'good for 48 hours']].forEach((c) => {
  const s = fs.readFileSync(c[0], 'utf8');
  if (s.split(c[1]).length !== 2) throw new Error('patch24: expected one match in ' + c[0] + ' for ' + c[1]);
  fs.writeFileSync(c[0], s.replace(c[1], () => c[2]));
});
