// A 4 x 6 shipping label laid out on the top half of a letter sheet (for half-sheet label paper), the way the
// JarFriends back office prints them. A tall label is turned on its side. Falls back to the label as it was.
async function halfSheet(src) {
  try {
    const { PDFDocument, degrees } = require('pdf-lib');
    const doc = await PDFDocument.create(), pg = (await doc.embedPdf(src, [0]))[0], page = doc.addPage([612, 792]);
    const w = pg.width, h = pg.height;
    if (h > w) { const s = Math.min(1, 540 / h, 360 / w); page.drawPage(pg, { x: (612 + h * s) / 2, y: 396 + (396 - w * s) / 2, xScale: s, yScale: s, rotate: degrees(90) }); }
    else { const s = Math.min(1, 540 / w, 360 / h); page.drawPage(pg, { x: (612 - w * s) / 2, y: 396 + (396 - h * s) / 2, xScale: s, yScale: s }); }
    return Buffer.from(await doc.save());
  } catch (e) { console.error('LABEL_LAYOUT_FAIL', String(e && e.message || e)); return src; }
}
module.exports = { halfSheet };
