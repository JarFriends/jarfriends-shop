// Owner only: the shipping label bought for an order, laid out to print sideways on the top half of a letter sheet
// (for half-sheet label paper). The label Shippo made is kept with the order (meta/<invoice>.json, labelPdf).
// GET ?n=<invoice>&k=<back office key>     from the back office
// GET ?inv=<invoice link>&k=<label key>    from the label page, right after buying
// Add &plain=1 for the label exactly as Shippo made it (4 x 6 in).
const { verify } = require('./_lib');
const store = require('./_store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {}, now = Math.floor(Date.now() / 1000), k = verify(String(q.k || ''));
  let n = '';
  if (k && k.adm === 1 && now <= k.x) n = String(q.n || '');
  else if (k && k.lb === 1) { const inv = verify(String(q.inv || '')); if (inv && inv.n === k.n) n = inv.n; }
  if (!/^[A-Z0-9]{4,20}$/.test(n)) return res.status(403).send('This link cannot open labels. Open the label from the back office.');
  const m = store.on() ? await store.read('meta/' + n + '.json') : null, url = (m && m.labelPdf) || '';
  if (!/^https:\/\//.test(url)) return res.status(404).send('No label has been bought for this order yet.');
  let src;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('status ' + r.status);
    src = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.error('LABEL_FETCH_FAIL', n, String(e && e.message || e));
    return res.status(502).send('The label file could not be fetched from Shippo. Reprint it from your Shippo account.');
  }
  let out = src;
  if (!q.plain) {
    try {
      const { PDFDocument, degrees } = require('pdf-lib');
      const doc = await PDFDocument.create(), pg = (await doc.embedPdf(src, [0]))[0], page = doc.addPage([612, 792]);
      const w = pg.width, h = pg.height;
      // A tall label is turned on its side; either way it sits centered in the top half of the sheet.
      if (h > w) { const s = Math.min(1, 540 / h, 360 / w); page.drawPage(pg, { x: (612 + h * s) / 2, y: 396 + (396 - w * s) / 2, xScale: s, yScale: s, rotate: degrees(90) }); }
      else { const s = Math.min(1, 540 / w, 360 / h); page.drawPage(pg, { x: (612 - w * s) / 2, y: 396 + (396 - h * s) / 2, xScale: s, yScale: s }); }
      out = Buffer.from(await doc.save());
    } catch (e) { console.error('LABEL_LAYOUT_FAIL', n, String(e && e.message || e)); out = src; }
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="label-' + n + '.pdf"');
  res.send(out);
};
