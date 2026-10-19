// Build step, run after inject.js: puts the site menu (Market, Auctions, Wishlist, Sold, Sell) on every page,
// and the Sellers tab on the back office.
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || 'public';
let n = 0;
fs.readdirSync(dir).filter((f) => /\.html$/.test(f)).forEach((f) => {
  const p = path.join(dir, f);
  let s = fs.readFileSync(p, 'utf8');
  if (s.indexOf('</body>') < 0) return;
  const add = [];
  if (s.indexOf('/nav.js') < 0 && f !== 'label.html') add.push('<script src="/nav.js" defer></script>');
  if (f === 'order.html' && s.indexOf('/soldby.js') < 0) add.push('<script src="/soldby.js" defer></script>');
  if (f === 'order.html' && s.indexOf('/trade.js') < 0) add.push('<script src="/trade.js" defer></script>');
  if (f === 'order.html' && s.indexOf('/quickpay.js') < 0) { add.push('<link rel="stylesheet" href="/market.css">'); add.push('<script src="/quickpay.js"></script>'); }
  if (f === 'admin.html' && s.indexOf('/admin-sellers.js') < 0) add.push('<script src="/admin-sellers.js" defer></script>');
  if (f === 'admin.html' && s.indexOf('/admin-emails.js') < 0) add.push('<script src="/admin-emails.js" defer></script>');
  if (!add.length) return;
  s = s.replace(/<\/body>(?![\s\S]*<\/body>)/, () => add.join('\n') + '\n</body>');
  fs.writeFileSync(p, s);
  n++;
});
console.log('marketpages: menu on ' + n + ' pages');
