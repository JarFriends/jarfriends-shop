// Build step: small changes to source files that are otherwise kept as they are.
// Each change is [file, text to find, text to put in its place] and must match exactly once.
// 1. ETH on the Base network is added to the coins in api/_lib.js.
// 2. api/label.js passes the signed invoice along when a label is bought, so the order can be marked shipped.
// 3. Illinois sales tax: orders shipping to Illinois pay SALES_TAX_IL_PERCENT (8.25 unless set) on the pieces.
//    Orders shipping anywhere else pay none. Shipping is not taxed. Set it to 0 to turn the tax off.
const fs = require('fs');
const IL = "(st === 'il' || st === 'ill' || st === 'illinois')";
const changes = [
  ['api/label.js', "out.test ? 'Test label' : 'Bought', out.tracking, out.label] })];", "out.test ? 'Test label' : 'Bought', out.tracking, out.label, String(b.inv || '')] })];"],
  ['api/_lib.js', "  SOL: { dec: 9, network: 'Solana'", "  'ETH-BASE': { dec: 18, sym: 'ETH', label: 'ETH (Base)', network: 'Base', env: 'WALLET_BASE', env2: 'WALLET_ETH', confs: 10, chain: 'base', api: 'https://base.blockscout.com/api', explorer: 'https://basescan.org/tx/' },\n  SOL: { dec: 9, network: 'Solana'"],
  ['api/_lib.js', 'const price = await usdPrice(coin);', 'const price = await usdPrice(COINS[coin].sym || coin);'],
  ['api/_lib.js', "if (coin === 'ETH') return", "if (coin === 'ETH' || coin === 'ETH-BASE') return"],

  ['api/order.js', "const offline = require('./_offline');\n\nmodule.exports", "const offline = require('./_offline');\n// Illinois sales tax, in percent, for orders shipping to Illinois.\nconst taxPct = () => { const v = Number((process.env.SALES_TAX_IL_PERCENT || '').trim() || 8.25); return v >= 0 && v <= 15 ? v : 8.25; };\n\nmodule.exports"],
  ['api/order.js', 'cardFeeFixed: offline.cardFeeFixed(),', 'cardFeeFixed: offline.cardFeeFixed(), taxIL: taxPct(),'],
  ['api/order.js', '  const fee = card ? offline.cardFee(list - cut + ship) : 0;\n  const total = list - cut + ship + fee;', "  // Sales tax: only for orders shipping to Illinois, on the pieces after any discount. An NFT ships nowhere, so none.\n  const st = state.toLowerCase().replace(/\\.$/, '');\n  const tax = !isNft && " + IL + " ? Math.round((list - cut) * taxPct() / 100) : 0;\n  const fee = card ? offline.cardFee(list - cut + ship + tax) : 0;\n  const total = list - cut + ship + tax + fee;"],
  ['api/order.js', 'fee ? { cf: fee, cp: offline.cardFeeLabel() } : {},', 'tax ? { tx: tax, tp: taxPct() } : {}, fee ? { cf: fee, cp: offline.cardFeeLabel() } : {},'],
  ['api/status.js', "    wallet: inv.wa || '',", "    wallet: inv.wa || '',\n    tax: inv.tx ? (inv.tx / 100).toFixed(2) : '', taxPct: inv.tp || '',"],
  ['api/_offline.js', "inv.cf ? [['Card fee', esc(feeText(inv))]] : []);", "inv.tx ? [['Illinois sales tax', esc(money(inv.tx) + ' (' + inv.tp + '%)')]] : [], inv.cf ? [['Card fee', esc(feeText(inv))]] : []);"],
  ['api/_offline.js', "inv.cf ? ['Card fee: ' + feeText(inv)] : []);", "inv.tx ? ['Illinois sales tax: ' + money(inv.tx) + ' (' + inv.tp + '%)'] : [], inv.cf ? ['Card fee: ' + feeText(inv)] : []);"],

  ['public/order.html', '        <div class="row" id="rFee" hidden>', '        <div class="row" id="rTax" hidden><span class="dim" id="sTaxL">Illinois sales tax</span><span id="sTax"></span></div>\n        <div class="row" id="rFee" hidden>'],
  ['public/order.html', 'pattern="[0-9]{5}(-[0-9]{4})?"></label>\n      </fieldset>', 'pattern="[0-9]{5}(-[0-9]{4})?"></label>\n        <div class="small" id="taxNote" hidden></div>\n      </fieldset>'],
  ['public/order.html', "feeRate = '';", "feeRate = '', taxPct = 0;"],
  ['public/order.html', '    var base = list - cut + ship;', "    // Illinois ship-to addresses pay Illinois sales tax on the pieces. Everywhere else pays none.\n    var st = String(fe.state.value || '').trim().toLowerCase().replace(/\\.$/, '');\n    var tax = !nft && taxPct && " + IL + " ? Math.round((list - cut) * taxPct / 100) : 0;\n    $('rTax').hidden = !tax; $('sTaxL').textContent = 'Illinois sales tax (' + taxPct + '%)'; $('sTax').textContent = '+' + usd(tax);\n    var base = list - cut + ship + tax;"],
  ['public/order.html', "$('sTotal').textContent = usd(list - cut + ship + fee) + ' USD';", "$('sTotal').textContent = usd(base + fee) + ' USD';"],
  ['public/order.html', '    feePct = Number(r.cardFee) || 0;', "    taxPct = Number(r.taxIL) || 0;\n    if (taxPct) { $('taxNote').textContent = 'Shipping to Illinois adds ' + taxPct + '% Illinois sales tax on the pieces. Other states pay no sales tax.'; $('taxNote').hidden = false; }\n    feePct = Number(r.cardFee) || 0;"],
  ['public/order.html', "  $('qty').addEventListener('input', total);", "  $('qty').addEventListener('input', total);\n  $('f').elements.state.addEventListener('input', total);\n  $('f').elements.state.addEventListener('change', total);"],
  ['public/placed.html', '      <div class="row" id="rFee" hidden>', '      <div class="row" id="rTax" hidden><span class="dim" id="lTax">Illinois sales tax</span><span id="oTax"></span></div>\n      <div class="row" id="rFee" hidden>'],
  ['public/placed.html', '    if (Number(inv.fee) > 0) {', "    if (Number(inv.tax) > 0) { $('lTax').textContent = 'Illinois sales tax' + (inv.taxPct ? ' (' + inv.taxPct + '%)' : ''); $('oTax').textContent = '+' + usd(inv.tax); $('rTax').hidden = false; }\n    if (Number(inv.fee) > 0) {"]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.indexOf(c[2]) >= 0) return;
  if (s.split(c[1]).length !== 2) throw new Error('patchlib: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
