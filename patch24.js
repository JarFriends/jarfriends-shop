// Build step: an accepted or countered offer is good for 24 hours, not 48. Runs after patchcounter.js.
const fs = require('fs');
[['api/offer.js', 'const HOLD_HOURS = 48;', 'const HOLD_HOURS = 24;'], ['public/offer.html', 'good for 48 hours', 'good for 24 hours']].forEach((c) => {
  const s = fs.readFileSync(c[0], 'utf8');
  if (s.split(c[1]).length !== 2) throw new Error('patch24: expected one match in ' + c[0] + ' for ' + c[1]);
  fs.writeFileSync(c[0], s.replace(c[1], () => c[2]));
});
