// Build step (last of the patches): paying with crypto takes 1% off the pieces (not shipping). The checkout page
// shows it as its own line as soon as crypto is chosen, and the invoice and emails list it.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/order.js', R`  const tax = !isNft && (st === 'il' || st === 'ill' || st === 'illinois') ? Math.round((list - cut) * taxPct() / 100) : 0;`, R`  // Crypto discount: 1% off the pieces after any promo code or accepted offer.
  const cd = !cash && !card ? Math.round((list - cut) * 1 / 100) : 0;
  const tax = !isNft && (st === 'il' || st === 'ill' || st === 'illinois') ? Math.round((list - cut - cd) * taxPct() / 100) : 0;`],
  // JAR10 is the first-order code from the checkout reminder email: it only works for an email with no order yet.
  ['api/order.js', R`  if (promo && deal) return res.status(400).json({ error: 'A promo code cannot be added to an accepted offer. Remove the code to continue.' });`, R`  if (promo && deal) return res.status(400).json({ error: 'A promo code cannot be added to an accepted offer. Remove the code to continue.' });
  if (promo && promo.code === 'JAR10') {
    const led = require('./_store');
    let before = false;
    try { before = (await Promise.all((await led.sales()).map((s) => led.read(s.path)))).some((d) => d && String(d.email || '').trim().toLowerCase() === email.toLowerCase()); } catch (e) { before = false; }
    if (before) return res.status(400).json({ error: 'JAR10 is for first orders only. Remove the code to continue.' });
  }`],
  ['api/order.js', R`  const total = list - cut + ship + tax + fee;`, R`  const total = list - cut - cd + ship + tax + fee;`],
  ['api/order.js', R`promo ? { pc: promo.code, pd: cut } : {}, `, R`promo ? { pc: promo.code, pd: cut } : {}, cd ? { cd: cd } : {}, `],
  ['api/_offline.js', R`const costRows = (inv) => (inv.pc ? [['Promo code', esc(promoLine(inv))]] : []).concat(`, R`const costRows = (inv) => (inv.pc ? [['Promo code', esc(promoLine(inv))]] : []).concat(inv.cd ? [['Crypto discount (1%)', esc('-' + money(inv.cd))]] : [], `],
  ['api/_offline.js', R`const costLines = (inv) => (inv.pc ? ['Promo code ' + promoLine(inv)] : []).concat(`, R`const costLines = (inv) => (inv.pc ? ['Promo code ' + promoLine(inv)] : []).concat(inv.cd ? ['Crypto discount (1%): -' + money(inv.cd)] : [], `],
  ['public/order.html', R`        <div class="row" id="rShip">`, R`        <div class="row" id="rCrypto" hidden><span class="dim">Crypto discount (1%)</span><span id="sCrypto"></span></div>
        <div class="row" id="rShip">`],
  ['public/order.html', R`    var tax = !nft && taxPct && (st === 'il' || st === 'ill' || st === 'illinois') ? Math.round((list - cut) * taxPct / 100) : 0;`, R`    var cd = m === 'crypto' ? Math.round((list - cut) * 1 / 100) : 0;
    $('rCrypto').hidden = !cd; $('sCrypto').textContent = '-' + usd(cd);
    var tax = !nft && taxPct && (st === 'il' || st === 'ill' || st === 'illinois') ? Math.round((list - cut - cd) * taxPct / 100) : 0;`],
  ['public/order.html', R`    var base = list - cut + ship + tax;`, R`    var base = list - cut - cd + ship + tax;`],
  // An NFT also shows roughly what its price comes to in ETH (see the end of this file).
  ['public/order.html', R`    $('unit').textContent = '$' + p.price + ' per unit. ' +`, R`    $('unit').textContent = '$' + p.price + (p.eth ? ' (about ' + p.eth + ' ETH)' : '') + ' per unit. ' +`],
  ['public/order.html', R`<strong>Crypto</strong>`, R`<strong>Crypto <span style="font-weight:400;font-size:14px">(1% off)</span></strong>`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchcrypto: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));

// The shop's product list gives each NFT its price in ETH at the going rate (Coinbase spot, remembered for five
// minutes), so the home page and checkout can show "about 0.04 ETH" beside the dollar price.
const f = 'api/order.js';
fs.writeFileSync(f, fs.readFileSync(f, 'utf8') + `
;(() => {
  let px = 0, at = 0;
  const ethUsd = async () => {
    if (px && Date.now() - at < 300000) return px;
    try {
      const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', { signal: AbortSignal.timeout(4000) });
      const v = Number(((await r.json()).data || {}).amount);
      if (v > 0) { px = v; at = Date.now(); }
    } catch (e) { console.error('ETH_PRICE_FAIL', String(e && e.message || e)); }
    return px;
  };
  const inner = module.exports;
  const w = async (req, res) => {
    if (req.method === 'GET') {
      const rate = await ethUsd(), send = res.json.bind(res);
      res.json = (body) => {
        try { if (rate > 0 && body && Array.isArray(body.products)) body.products.forEach((p) => { if (p.nft) { const e = Number(p.price) / rate; p.eth = e.toFixed(e < 0.1 ? 3 : 2); } }); } catch (e) { /* the list goes out without it */ }
        return send(body);
      };
    }
    return inner(req, res);
  };
  Object.assign(w, inner);
  module.exports = w;
})();
`);
