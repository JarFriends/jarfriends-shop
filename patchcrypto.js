// Build step (last of the patches): paying with crypto takes 1% off the pieces (not shipping). The checkout page
// shows it as its own line as soon as crypto is chosen, and the invoice and emails list it.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/order.js', R`  const tax = !isNft && (st === 'il' || st === 'ill' || st === 'illinois') ? Math.round((list - cut) * taxPct() / 100) : 0;`, R`  // Crypto discount: 1% off the pieces after any promo code or accepted offer.
  const cd = !cash && !card ? Math.round((list - cut) * 1 / 100) : 0;
  const tax = !isNft && (st === 'il' || st === 'ill' || st === 'illinois') ? Math.round((list - cut - cd) * taxPct() / 100) : 0;`],
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
  ['public/order.html', R`<strong>Crypto</strong>`, R`<strong>Crypto <span style="font-weight:400;font-size:14px">(1% off)</span></strong>`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchcrypto: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
