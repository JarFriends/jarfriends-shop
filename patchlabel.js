// Build step (after patchnft.js): the label bought for an order can be opened again from the back office, and it
// prints sideways on the top half of a letter sheet (see api/labelpdf.js).
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/admin.js', R`nftSentAt: m.nftSentAt || 0,`, R`nftSentAt: m.nftSentAt || 0, hasLabel: /^https:\/\//.test(m.labelPdf || ''),`],
  ['public/admin.html', R`      if (o.tracking) st.appendChild(el('small', (o.testLabel ? 'Test label made. ' : 'Shipped. ') + 'Tracking ' + o.tracking));`, R`      if (o.tracking) st.appendChild(el('small', (o.testLabel ? 'Test label made. ' : 'Shipped. ') + 'Tracking ' + o.tracking));
      if (o.hasLabel) {
        var lp = el('a', 'Print label (half sheet)'); lp.href = '/api/labelpdf?n=' + encodeURIComponent(o.n) + '&k=' + encodeURIComponent(key); lp.target = '_blank'; lp.rel = 'noopener'; lp.style.cssText = 'display:block;margin-top:6px;font-size:13px';
        st.appendChild(lp);
      }`],
  ['public/ship.html', R`        $('pdf').href = r.label;`, R`        $('pdf').href = '/api/labelpdf?inv=' + encodeURIComponent(inv) + '&k=' + encodeURIComponent(k);
        $('pdf').textContent = 'Open label to print (half sheet)';
        var raw = document.createElement('a'); raw.href = r.label; raw.target = '_blank'; raw.rel = 'noopener'; raw.textContent = 'Original 4 x 6 label'; raw.className = 'small'; raw.style.cssText = 'display:block;margin-top:10px';
        $('pdf').parentNode.appendChild(raw);
        $('msg').textContent = 'It prints sideways on the top half of a letter sheet. Print at 100% (actual size). The label is saved with this order in the back office.';`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchlabel: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
