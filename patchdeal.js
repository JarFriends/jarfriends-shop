// Build step: a Deal of the day piece can have a deal deadline. Runs after patch24.js.
// Until the deadline it sells at its deal price. After it, the pieces left stay in the same safe at a higher price,
// and the next safe still opens only when they are all sold. The price changes on its own; the site shows no clock.
// Each change is [file, text to find, text to put in its place]; the text to find must be there exactly once.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/_edits.js', R`async function apply(list, opts) {`, R`// Deal deadlines, by product id: when the deal price ends, and the price after that.
// Safe 1 (Jolly Jack-O): 24 hours from Saturday October 10, 2026, 7:35 pm Central, then $98.
const AFTER = { JACKO: { at: Date.parse('2026-10-12T00:35:00Z'), price: 98 } };
async function apply(list, opts) {`],
  ['api/_edits.js', R`p, d.e[p.id] || {}));`, R`p, d.e[p.id] || {}, AFTER[p.id] && Date.now() >= AFTER[p.id].at ? { price: AFTER[p.id].price } : {}));`],
  ['api/_edits.js', 'module.exports = { read, apply, save, add };', 'module.exports = { AFTER, read, apply, save, add };']
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchdeal: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
