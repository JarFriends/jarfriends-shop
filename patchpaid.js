// Build step: payment emails.
//  - Payment reminders stop as soon as an order is paid, marked paid, has a label, tracking or is shipped.
//  - Marking an order paid sends a thank-you email.
//  - The back office sees how many payment reminders went out (reminders, remindedAt on each order).
//  - Every email sent is logged (subject and a hidden address), so it can be checked later.
// Runs after patchmanual.js.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/_sweep.js', R`    if (!d.email || !/payment due/i.test(d.status || '') || m.paidAt || m.cancelledAt || sent >= MOST) continue;`,
    R`    if (!d.email || !/payment due/i.test(d.status || '') || m.paidAt || m.cancelledAt || m.shippedAt || m.labelPdf || m.tracking || m.nftSentAt || sent >= MOST) continue;
    { const again = (await store.read('meta/' + s.n + '.json')) || {}; if (again.paidAt || again.shippedAt || again.labelPdf || again.tracking || again.cancelledAt) continue; }`],
  ['api/admin.js', R`paidAt: m.paidAt || 0, tracking: m.tracking || '',`, R`paidAt: m.paidAt || 0, reminders: m.reminders || 0, remindedAt: m.remindedAt || 0, tracking: m.tracking || '',`],
  ['api/admin.js', R`await mail(d.email, 'Payment received for order ' + s.n, ['Thanks, we have your ' + (d.pay || '') + ' payment for order ' + s.n + ' (' + (d.product || 'your order') + ' x ' + s.q + ').', '', 'Your order is confirmed. We will email your tracking number when it ships.'], 'paid-by-hand-' + s.n)`,
    R`await mail(d.email, 'Thank you! Payment received for order ' + s.n, [(d.buyer ? 'Hi ' + String(d.buyer).split(/[ (]/)[0] + ',' : 'Hi,'), '', 'Thank you for your order! We have your ' + (d.pay || '') + ' payment for order ' + s.n + ' (' + (d.product || 'your order') + ' x ' + s.q + ').', '', 'Your order is confirmed and nothing more is due. We will email your tracking number as soon as it ships.', '', 'You earned a jar with this order. See your orders and jars any time: https://jarfriends.com/account.html', '', 'Thanks again for being a JarFriend!'], 'paid-by-hand-' + s.n)`],
  ['api/_lib.js', R`    if (await send(body, idem)) return 'sent';`, R`    if (await send(body, idem)) { console.log('EMAIL_SENT', JSON.stringify({ to: String(to).replace(/^(.).*?(@.*)$/, '$1***$2'), subject: String(subject).slice(0, 120) })); return 'sent'; }`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchpaid: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
