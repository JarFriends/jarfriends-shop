// Build step, run last. It adds to the built pages:
// 1. the party note script, on the checkout and order pages;
// 2. the USA-only shipping line, on checkout;
// 3. the Insights tab, product editing and promo code scripts, on the back office page;
// 4. the checkout click counter, on checkout;
// 5. Vercel's visitor counter, on every page (it counts nothing until Web Analytics is switched on for the project).
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || 'public';
const before = (s, f, tag) => {
  if (s.indexOf('</body>') < 0) throw new Error('No </body> in ' + f);
  return s.replace('</body>', () => tag + '\n</body>');
};
fs.readdirSync(dir).filter((f) => /\.html$/.test(f)).forEach((f) => {
  const p = path.join(dir, f);
  let s = fs.readFileSync(p, 'utf8');
  const note = '<div class="small" id="taxNote" hidden></div>';
  if (f === 'order.html' && s.indexOf('id="usOnly"') < 0) {
    if (s.split(note).length !== 2) throw new Error('No tax note in ' + f);
    s = s.replace(note, '<div class="small" id="usOnly"><b>USA shipping only.</b> We ship to addresses in the United States.</div>\n        ' + note);
  }
  // Checkout tells the shop which piece it was opened for, so the back office can count it.
  if (f === 'order.html' && s.indexOf('kind: \'checkout\'') < 0) s = before(s, f, '<script>(function () { var id = new URLSearchParams(location.search).get(\'product\'); if (id) { try { fetch(\'/api/click\', { method: \'POST\', keepalive: true, body: JSON.stringify({ id: id, kind: \'checkout\' }) }).catch(function () {}); } catch (e) {} } })();</script>');
  if ((f === 'order.html' || f === 'placed.html') && s.indexOf('/party-note.js') < 0) s = before(s, f, '<script src="/party-note.js" defer></script>');
  if (f === 'admin.html' && s.indexOf('/admin-insights.js') < 0) s = before(s, f, '<script src="/admin-insights.js" defer></script>');
  if (f === 'admin.html' && s.indexOf('/admin-edit.js') < 0) s = before(s, f, '<script src="/admin-edit.js" defer></script>');
  if (f === 'admin.html' && s.indexOf('/admin-promos.js') < 0) s = before(s, f, '<script src="/admin-promos.js" defer></script>');
  if (s.indexOf('/_vercel/insights/script.js') < 0 && s.indexOf('</body>') >= 0) s = before(s, f, '<script defer src="/_vercel/insights/script.js"></script>');
  fs.writeFileSync(p, s);
});
