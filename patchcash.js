// Build step: takes the "Cash or ACH" way to pay off the site, and closes the party listing when the party ends.
// Checkout no longer shows it, offers can no longer name it, and the server turns it down.
const fs = require('fs');
const edit = (file, fn) => {
  const before = fs.readFileSync(file, 'utf8'), after = fn(before);
  if (after === before) throw new Error('patchcash: nothing changed in ' + file);
  fs.writeFileSync(file, after);
};
edit('public/order.html', (s) => {
  const out = s.replace(/\s*<label class="plan" data-m="cash">[\s\S]*?<\/label>/, '').replace("['Cash or ACH', true], ", '');
  if (out.indexOf('data-m="cash"') >= 0 || out.indexOf('Cash or ACH') >= 0) throw new Error('patchcash: cash is still on the checkout page');
  return out;
});
edit('api/order.js', (s) => s.replace("  const cash = b.method === 'cash' || !!way;", "  if (b.method === 'cash') return res.status(400).json({ error: 'Cash and ACH are no longer offered. Choose another way to pay.' });\n  const cash = !!way;"));
// The party listing closes when the party ends (the end time, or sold out): it leaves checkout and cannot be ordered.
edit('api/order.js', (s) => s
  .replace('      const products = inv.filter((p) =>', "      const pty = require('./_party'), over = (await pty.state(0)).ended;\n      const products = inv.filter((p) => !(over && p.id === pty.PARTY.pid)).filter((p) =>")
  .replace("  if ((await offline.deals(products)).state[p.id] === 'locked')", "  if (p.id === require('./_party').PARTY.pid && (await require('./_party').state(0)).ended) return res.status(400).json({ error: 'This party has ended. The next one is coming soon.' });\n  if ((await offline.deals(products)).state[p.id] === 'locked')"));
