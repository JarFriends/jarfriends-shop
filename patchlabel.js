// Build step (after patchnft.js): the label bought for an order can be opened again from the back office, and it
// prints sideways on the top half of a letter sheet (see api/labelpdf.js). One label per order: a second can only
// be bought after the first is cancelled from the back office, which asks Shippo for a refund.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/admin.js', R`nftSentAt: m.nftSentAt || 0,`, R`nftSentAt: m.nftSentAt || 0, hasLabel: /^https:\/\//.test(m.labelPdf || ''),`],
  ['public/admin.html', R`      if (o.tracking) st.appendChild(el('small', (o.testLabel ? 'Test label made. ' : 'Shipped. ') + 'Tracking ' + o.tracking));`, R`      if (o.tracking) st.appendChild(el('small', (o.testLabel ? 'Test label made. ' : 'Shipped. ') + 'Tracking ' + o.tracking));
      if (o.hasLabel) {
        var lp = el('a', 'Print label (half sheet)'); lp.href = '/api/labelpdf?n=' + encodeURIComponent(o.n) + '&k=' + encodeURIComponent(key); lp.target = '_blank'; lp.rel = 'noopener'; lp.style.cssText = 'display:block;margin-top:6px;font-size:13px';
        st.appendChild(lp);
        var cl = el('button', 'Cancel label', 'ghost'); cl.type = 'button'; cl.style.cssText = 'margin-top:6px;padding:6px 12px;font-size:13px;display:block';
        cl.addEventListener('click', function () {
          if (!confirm('Cancel the shipping label for order ' + o.n + '? Shippo is asked to refund it and the order goes back to not shipped. Do not use a cancelled label.')) return;
          cl.disabled = true; cl.textContent = 'Cancelling...';
          fetch('/api/admin?k=' + encodeURIComponent(key) + '&voidlabel=' + encodeURIComponent(o.n), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
            if (r.error) { cl.disabled = false; cl.textContent = 'Cancel label'; alert(r.error); return; }
            alert('Label cancelled. You can buy a new one for this order now.');
            load();
          }, function () { cl.disabled = false; cl.textContent = 'Cancel label'; alert('Could not reach the site. Try again.'); });
        });
        st.appendChild(cl);
      }`],
  // GET ?k=<key>&voidlabel=<invoice>  owner only: cancels the label bought for an order (Shippo refunds it).
  ['api/admin.js', R`  if (req.query && req.query.msgs) {`, R`  if (req.query && req.query.voidlabel) {
    const r = await require('./label').voidLabel(String(req.query.voidlabel)).catch((e) => ({ error: String(e && e.message || e) }));
    return res.status(r.error ? 400 : 200).json(r);
  }
  if (req.query && req.query.msgs) {`],
  // One label per order. A second can only be bought after the first is cancelled.
  ['api/label.js', R`  const guard = await sheetPost({ tab: 'Labels', key: 'label-' + inv.n + (b.again ?`, R`  const mt = (await require('./_store').read('meta/' + inv.n + '.json').catch(() => null)) || {};
  if (mt.labelPdf) return res.status(409).json({ error: 'A label was already bought for this order. To buy another, cancel that one first: back office, Orders, Cancel label.' });
  b.again = !!mt.labelVoidAt;
  const guard = await sheetPost({ tab: 'Labels', key: 'label-' + inv.n + (b.again ?`],
  ['api/label.js', R`out.tracking, out.label, String(b.inv || '')] })];`, R`out.tracking, out.label, String(b.inv || ''), String(t.object_id || '')] })];`],
  ['api/testsheet.js', R`labelPdf: String(row[4] || ''),`, R`labelPdf: String(row[4] || ''), labelTx: String(row[6] || ''), labelVoidAt: 0,`],
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
// Cancelling a label: Shippo is asked for a refund, then the order goes back to having no label.
fs.appendFileSync('api/label.js', `
module.exports.voidLabel = async (n) => {
  const store = require('./_store');
  if (!/^[A-Z0-9]{4,20}$/.test(n)) return { error: 'That order was not found.' };
  const m = (await store.read('meta/' + n + '.json')) || {};
  if (!m.labelPdf) return { error: 'There is no label on this order.' };
  let tx = m.labelTx || '', status = '';
  try {
    if (!tx && m.tracking) {
      const r = await fetch(API + '/transactions/?results=100', { signal: AbortSignal.timeout(25000), headers: { authorization: 'ShippoToken ' + key() } });
      const l = await r.json().catch(() => ({}));
      const hit = (Array.isArray(l.results) ? l.results : []).filter((x) => x && x.tracking_number === m.tracking)[0];
      tx = hit ? hit.object_id : '';
    }
    if (!tx) return { error: 'This label could not be found in Shippo from here. Void it in your Shippo account instead.' };
    const rf = await shippo('/refunds/', { transaction: tx, async: false });
    if (rf.status === 'ERROR') return { error: 'Shippo would not cancel this label. ' + notes(rf) };
    status = rf.status || '';
  } catch (e) {
    const why = String(e && e.message || e);
    // A refund that was already asked for counts as cancelled. A test label has nothing to refund.
    if (!/already/i.test(why) && !m.testLabel) { console.error('LABEL_VOID_FAIL', n, why); return { error: 'Could not cancel the label. ' + why }; }
  }
  await store.write('meta/' + n + '.json', Object.assign(m, { voidedTracking: m.tracking || '', labelPdf: '', labelTx: '', tracking: '', carrier: '', testLabel: false, shippedAt: 0, labelVoidAt: Date.now() }));
  console.log('LABEL_VOID', JSON.stringify({ invoice: n, status: status }));
  return { ok: true, status: status };
};
`);
