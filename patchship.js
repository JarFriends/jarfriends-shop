// Build step (after patchjars.js): shipping in the back office.
// - A paid order that still needs a label gets a "Buy shipping label" button, whatever way it was paid.
//   Unpaid and cancelled orders do not; once a label is bought the order shows Print label and Cancel label instead.
// - A "Show" picker splits the orders: needs to be shipped, shipped already, waiting for payment, or all.
//   Shipped means a label was bought, a tracking number was added, or (for an NFT) it was marked sent.
const fs = require('fs');
const R = String.raw;
const f = 'public/admin.html';
let s = fs.readFileSync(f, 'utf8');
const changes = [
  [R`<label id="sortBox" style="flex:0 1 220px">Sort orders`, R`<label id="viewBox" style="flex:0 1 240px">Show<select id="viewBy"><option value="all">All orders</option><option value="ship">Needs to be shipped</option><option value="shipped">Shipped already</option><option value="unpaid">Waiting for payment</option></select></label>
      <label id="sortBox" style="flex:0 1 220px">Sort orders`],
  [R`    var sb = $('sortBy').value, amt =`, R`    var cls = function (o) { var nf = /^NFT to wallet /.test(o.ship || ''); var sh = !o.cancelled && !!(o.hasLabel || (o.tracking && !o.testLabel) || o.shippedAt || (nf && o.nftSentAt)); return { nf: nf, shipped: sh, needs: !o.cancelled && !o.due && !sh, unpaid: !o.cancelled && !!o.due }; };
    var cnt = { ship: 0, shipped: 0, unpaid: 0 };
    orders.forEach(function (o) { var c = cls(o); if (c.needs) cnt.ship++; if (c.shipped) cnt.shipped++; if (c.unpaid) cnt.unpaid++; });
    var vbs = $('viewBy'), vb = vbs.value;
    vbs.options[1].text = 'Needs to be shipped (' + cnt.ship + ')'; vbs.options[2].text = 'Shipped already (' + cnt.shipped + ')'; vbs.options[3].text = 'Waiting for payment (' + cnt.unpaid + ')';
    $('viewBox').hidden = tab !== 'orders';
    var sb = $('sortBy').value, amt =`],
  [R`      if (!match([o.n, o.buyer, o.email, o.product, o.pid, o.ship, o.status].join(' '))) return;
      if (tab === 'orders') shown++;`, R`      if (!match([o.n, o.buyer, o.email, o.product, o.pid, o.ship, o.status].join(' '))) return;
      var oc = cls(o);
      if ((vb === 'ship' && !oc.needs) || (vb === 'shipped' && !oc.shipped) || (vb === 'unpaid' && !oc.unpaid)) return;
      if (tab === 'orders') shown++;`],
  [R`      if (o.due) {
        var mk = el('button', 'Mark as paid', 'ghost');`, R`      if (oc.needs && !oc.nf && /^https:\/\//.test(o.label || '')) {
        var bl = el('a', 'Buy shipping label', 'solid'); bl.href = o.label; bl.target = '_blank'; bl.rel = 'noopener';
        bl.style.cssText = 'margin-top:8px;padding:8px 14px;font-size:13px;display:inline-block;text-decoration:none';
        st.appendChild(bl);
      }
      if (oc.needs) st.appendChild(el('div', oc.nf ? 'Needs to be sent' : 'Needs to be shipped', 'small'));
      if (o.due) {
        var mk = el('button', 'Mark as paid', 'ghost');`],
  [R`      [['Shipping label', o.label], ['Payment proof', /^https:\/\//.test(o.proof || '') ? o.proof : '']].forEach(function (x) {`, R`      [['Payment proof', /^https:\/\//.test(o.proof || '') ? o.proof : '']].forEach(function (x) {`],
  [R`  $('sortBy').addEventListener('change', function () { draw(); });`, R`  $('sortBy').addEventListener('change', function () { draw(); });
  $('viewBy').addEventListener('change', function () { draw(); });`]
];
changes.forEach((c) => {
  if (s.split(c[0]).length !== 2) throw new Error('patchship: expected one match for ' + c[0].slice(0, 70));
  s = s.replace(c[0], () => c[1]);
});
fs.writeFileSync(f, s);
