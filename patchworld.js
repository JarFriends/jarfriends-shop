// Build step: worldwide shipping. Runs after patchsafes.js.
// Outside the USA the buyer picks their country at checkout. Shipping is the real USPS postage to their address
// (priced through Shippo with a customs form) plus 25%, and replaces the piece's US shipping, even free shipping.
// Customs duties and import taxes are the buyer's, paid on delivery (DDU). International orders pay by card or crypto,
// carry no Illinois sales tax, and are capped at $2,500 of goods (above that USPS needs an export filing).
const fs = require('fs');
const R = String.raw;
// Countries the USA does not ship to (embargoed). US territories use a US address instead.
const NO = "['CU', 'IR', 'KP', 'SY']";
const changes = [
  // --- Labels and the postage quote (api/label.js) ---
  ['api/label.js', R`      const s = await shippo('/shipments/', {
        address_from: from,
        address_to: { name: to.name, company: to.company, street1: to.street, street2: to.line2, city: to.city, state: to.state, zip: to.zip, country: 'US', email: inv.e || '' },
        parcels: [order.parcel], async: false
      });`, R`      const s = to.country && to.country !== 'US'
        ? await intlShipment(order.parcel, { name: to.name, company: to.company, street1: to.street, street2: to.line2, city: to.city, state: to.state, zip: to.zip, country: to.country, email: inv.e || '' }, inv.q, inv.L, inv.i)
        : await shippo('/shipments/', {
        address_from: from,
        address_to: { name: to.name, company: to.company, street1: to.street, street2: to.line2, city: to.city, state: to.state, zip: to.zip, country: 'US', email: inv.e || '' },
        parcels: [order.parcel], async: false
      });`],
  // --- Order page API (api/order.js) ---
  ['api/order.js', R`    // ?promo=CODE checks one promo code for the order page.`, R`    // ?quote=1&product=&qty=&country=&street=&city=&state=&zip=  shipping for an address outside the USA, in cents.
    if (req.query && req.query.quote) {
      const q = req.query, cc = String(q.country || '').toUpperCase(), qty = Math.max(1, Math.floor(Number(q.qty) || 1));
      if (!/^[A-Z]{2}$/.test(cc) || cc === 'US') return res.status(400).json({ error: 'Pick your country.' });
      if (${NO}.indexOf(cc) >= 0) return res.status(400).json({ error: 'We cannot ship to that country.' });
      try {
        const p = (await getInventory()).filter((x) => x.id === String(q.product || ''))[0];
        if (!p) return res.status(400).json({ error: 'Choose a product.' });
        if (p.cents * qty > 250000) return res.status(400).json({ error: 'Orders over $2,500 cannot ship outside the USA from the site. Email us and we will sort it out.' });
        const out = await require('./label').quoteIntl({ pid: p.id, qty: qty, value: p.cents * qty, item: p.name, to: { name: 'Buyer', street1: String(q.street || '').slice(0, 120), street2: String(q.line2 || '').slice(0, 60), city: String(q.city || '').slice(0, 60), state: String(q.state || '').slice(0, 30), zip: String(q.zip || '').slice(0, 12), country: cc } });
        return out.error ? res.status(400).json({ error: out.error }) : res.json({ ship: out.cents });
      } catch (e) { console.error('QUOTE_FAIL', String(e && e.message || e)); return res.status(503).json({ error: 'Could not price shipping to that address. Check the address and try again.' }); }
    }
    // ?promo=CODE checks one promo code for the order page.`],
  ['api/order.js', R`state = clip(b.state, 30), zip = clip(b.zip, 10);`, R`state = clip(b.state, 30), zip = clip(b.zip, 12);
  // Outside the USA: the country picked at checkout (two letters, e.g. CA). Anything else is a US address.
  const country = /^[A-Za-z]{2}$/.test(String(b.country || '')) ? String(b.country).toUpperCase() : 'US', intl = country !== 'US';`],
  ['api/order.js', R`    if (!/[0-9]/.test(street) || !/[A-Za-z]/.test(street)) return res.status(400).json({ error: 'Enter the street address with its number, for example 120 Main St.' });
    if (city.length < 2) return res.status(400).json({ error: 'Enter the city.' });
    if (state.length < 2) return res.status(400).json({ error: 'Enter the state.' });
    if (!/^[0-9]{5}(-[0-9]{4})?$/.test(zip)) return res.status(400).json({ error: 'Enter a 5-digit ZIP code.' });`, R`    if (intl ? street.length < 4 : (!/[0-9]/.test(street) || !/[A-Za-z]/.test(street))) return res.status(400).json({ error: intl ? 'Enter the street address.' : 'Enter the street address with its number, for example 120 Main St.' });
    if (city.length < 2) return res.status(400).json({ error: 'Enter the city.' });
    if (!intl && state.length < 2) return res.status(400).json({ error: 'Enter the state.' });
    if (!intl && !/^[0-9]{5}(-[0-9]{4})?$/.test(zip)) return res.status(400).json({ error: 'Enter a 5-digit ZIP code.' });
    if (intl && ${NO}.indexOf(country) >= 0) return res.status(400).json({ error: 'We cannot ship to that country.' });
    if (intl && cash) return res.status(400).json({ error: 'Orders shipping outside the USA pay by card or crypto. Choose one of those.' });`],
  ['api/order.js', R`  const ship = isNft ? 0 : shipBy[p.id] || 0;`, R`  let ship = isNft ? 0 : shipBy[p.id] || 0;
  // Outside the USA: the real postage to this address plus 25%, in place of the US shipping. Customs is the buyer's.
  if (intl && !isNft) {
    if (list - cut > 250000) return res.status(400).json({ error: 'Orders over $2,500 cannot ship outside the USA from the site. Email us and we will sort it out.' });
    let qt = null;
    try { qt = await require('./label').quoteIntl({ pid: p.id, qty: qty, value: list - cut, item: p.name, to: { name: name, company: company, street1: street, street2: line2, city: city, state: state, zip: zip, country: country, email: email } }); } catch (e) { console.error('QUOTE_FAIL', String(e && e.message || e)); }
    if (!qt || qt.error) return res.status(400).json({ error: (qt && qt.error) || 'Could not price shipping to that address. Check the address and try again.' });
    ship = qt.cents;
  }`],
  ['api/order.js', R`  const tax = !isNft && (st === 'il'`, R`  const tax = !isNft && !intl && (st === 'il'`],
  ['api/order.js', R`a: isNft ? [name, company, '', '', '', '', ''] : [name, company, street, line2, city, state, zip] }`, R`a: isNft ? [name, company, '', '', '', '', ''] : [name, company, street, line2, city, state, zip].concat(intl ? [country] : []) }`],
  // --- Addresses carry the country (api/_offline.js) ---
  ['api/_offline.js', R`  return a && a[2] ? { name: a[0], company: a[1], street: a[2], line2: a[3], city: a[4], state: a[5], zip: a[6] } : null;`, R`  return a && a[2] ? { name: a[0], company: a[1], street: a[2], line2: a[3], city: a[4], state: a[5], zip: a[6], country: a[7] || 'US' } : null;`],
  ['api/_offline.js', R`  return s ? [s.name, s.company, s.street, s.line2, s.city + ', ' + s.state + ' ' + s.zip].filter(Boolean).join(', ') : '';`, R`  return s ? [s.name, s.company, s.street, s.line2, (s.city + ', ' + s.state + ' ' + s.zip).replace(/,\s+$/, '').replace(/\s+/g, ' ').trim(), s.country !== 'US' ? countryName(s.country) : ''].filter(Boolean).join(', ') : '';`],
  ['api/_offline.js', R`function shipTo(inv) {`, R`function countryName(c) { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(c) || c; } catch (e) { return c; } }
function shipTo(inv) {`],
  // --- Checkout page (public/order.html) ---
  ['public/order.html', R`        <div class="two">
          <label>Street address<input name="street"`, R`        <label style="max-width:340px">Country<select name="country" id="country" autocomplete="country"><option value="US">United States</option></select></label>
        <div class="two">
          <label>Street address<input name="street"`],
  ['public/order.html', R`<label>State<input name="state"`, R`<label><span id="stL">State</span><input name="state"`],
  ['public/order.html', R`<label style="max-width:220px">ZIP code<input name="zip" maxlength="10"`, R`<label style="max-width:220px"><span id="zipL">ZIP code</span><input name="zip" maxlength="12"`],
  ['public/order.html', R`        <div class="small" id="taxNote" hidden></div>`, R`        <div class="small" id="taxNote" hidden></div>
        <div class="small" id="intlNote" hidden><b>Shipping outside the USA:</b> shipping and handling is calculated for your address and shown above. Customs duties, import taxes and any fees in your country are not included: you pay them when the package arrives. Orders outside the USA pay by card or crypto.</div>`],
  ['public/order.html', R`    // Shipping is set per piece and charged once per order.
    var ship = Math.round(Number(p.ship || 0) * 100);`, R`    // Shipping is set per piece and charged once per order. Outside the USA it is priced for the address instead.
    var intl = !p.nft && cc() !== 'US';
    var ship = intl ? (iq.cents || 0) : Math.round(Number(p.ship || 0) * 100);`],
  ['public/order.html', R`    ['street', 'city', 'state', 'zip'].forEach(function (k) { fe[k].required = !nft; });`, R`    ['street', 'city', 'state', 'zip'].forEach(function (k) { fe[k].required = !nft && !(intl && (k === 'state' || k === 'zip')); });
    if (intl) fe.zip.removeAttribute('pattern'); else fe.zip.setAttribute('pattern', '[0-9]{5}(-[0-9]{4})?');
    fe.zip.inputMode = intl ? 'text' : 'numeric';
    $('stL').textContent = intl ? 'State / province / region (if any)' : 'State';
    $('zipL').textContent = intl ? 'Postal code (if any)' : 'ZIP code';
    $('intlNote').hidden = !intl; if (taxPct) $('taxNote').hidden = intl;
    ['mZelle', 'mVenmo', 'mCashapp'].forEach(function (id) { var el = $(id); if (!el) return; if (intl) { el.dataset.was = el.dataset.was || (el.hidden ? 'h' : 's'); el.hidden = true; if (el.querySelector('input').checked) { el.querySelector('input').checked = false; document.querySelector('input[name="method"][value="crypto"]').checked = true; } } else if (el.dataset.was) { el.hidden = el.dataset.was === 'h'; delete el.dataset.was; } });`],
  ['public/order.html', R`    $('sShip').textContent = ship > 0 ? usd(ship) : 'Free';`, R`    $('sShip').textContent = intl ? (iq.cents ? usd(ship) : iq.busy ? 'Calculating...' : (iq.err || 'Enter your address')) : ship > 0 ? usd(ship) : 'Free';
    $('rShip').firstChild.textContent = intl ? 'Shipping and handling' : 'Shipping';`],
  ['public/order.html', R`    var bad = p.stock < p.min || q > p.stock;`, R`    var bad = p.stock < p.min || q > p.stock || (intl && !iq.cents);`],
  ['public/order.html', R`  function applyPromo() {`, R`  // Countries for the picker: every one the post office ships to. The US stays first.
  var CC = 'AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK FO FR GA GB GD GE GF GH GI GL GM GN GP GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IS IT JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NZ OM PA PE PF PG PH PK PL PT PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SZ TC TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG UY UZ VA VC VE VG VN VU WS YE ZA ZM ZW'.split(' ');
  (function () {
    var dn = null; try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { dn = null; }
    CC.map(function (c) { return [c, dn ? dn.of(c) : c]; }).sort(function (a, b) { return a[1].localeCompare(b[1]); }).forEach(function (c) { var o = document.createElement('option'); o.value = c[0]; o.textContent = c[1]; $('country').appendChild(o); });
  })();
  function cc() { return $('country').value || 'US'; }
  // The shipping price for an address outside the USA, asked for once the address is filled in.
  var iq = { key: '', cents: 0, busy: false, err: '' }, iqTimer = null;
  function quote() {
    var p = cur(), F = $('f').elements; if (!p || p.nft || cc() === 'US') { iq = { key: '', cents: 0, busy: false, err: '' }; total(); return; }
    var q = Math.max(1, Math.floor(Number($('qty').value) || 1));
    var key = [p.id, q, cc(), F.street.value.trim(), F.line2.value.trim(), F.city.value.trim(), F.state.value.trim(), F.zip.value.trim()].join('|');
    if (key === iq.key && (iq.cents || iq.busy)) return;
    if (F.street.value.trim().length < 4 || F.city.value.trim().length < 2) { iq = { key: '', cents: 0, busy: false, err: 'Enter your address' }; total(); return; }
    iq = { key: key, cents: 0, busy: true, err: '' }; total();
    fetch('/api/order?quote=1&product=' + encodeURIComponent(p.id) + '&qty=' + q + '&country=' + cc() + '&street=' + encodeURIComponent(F.street.value) + '&line2=' + encodeURIComponent(F.line2.value) + '&city=' + encodeURIComponent(F.city.value) + '&state=' + encodeURIComponent(F.state.value) + '&zip=' + encodeURIComponent(F.zip.value), { cache: 'no-store' })
      .then(function (r) { return r.json(); }).then(function (r) { if (iq.key !== key) return; iq = { key: key, cents: Number(r.ship) || 0, busy: false, err: r.error ? 'Not available' : '' }; if (r.error) $('msg').textContent = r.error; total(); },
        function () { if (iq.key !== key) return; iq = { key: '', cents: 0, busy: false, err: 'Could not calculate' }; total(); });
  }
  function soon() { clearTimeout(iqTimer); iqTimer = setTimeout(quote, 700); }
  $('country').addEventListener('change', function () { $('msg').textContent = ''; iq = { key: '', cents: 0, busy: false, err: '' }; quote(); });
  ['street', 'line2', 'city', 'state', 'zip'].forEach(function (k) { $('f').elements[k].addEventListener('input', function () { if (cc() !== 'US') { iq.cents = 0; total(); soon(); } }); });
  $('qty').addEventListener('change', soon);
  $('product').addEventListener('change', soon);
  function applyPromo() {`],
  ['public/order.html', R`    var tax = !nft && taxPct && (st === 'il'`, R`    var tax = !nft && !intl && taxPct && (st === 'il'`],
  // The address-only label prints the country for an order going abroad.
  ['public/label.html', R`    line($('to'), s.city + ', ' + s.state + ' ' + s.zip);`, R`    line($('to'), (s.city + ', ' + s.state + ' ' + s.zip).replace(/,\s+$/, '').replace(/\s+/g, ' ').trim());
    if (s.country && s.country !== 'US') { var cn = s.country; try { cn = new Intl.DisplayNames(['en'], { type: 'region' }).of(s.country) || s.country; } catch (e) { cn = s.country; } line($('to'), cn.toUpperCase()); }`],
  // The note under the address now says where we ship.
  ['inject.js', R`'<div class="small" id="usOnly"><b>USA shipping only.</b> We ship to addresses in the United States.</div>\n        '`, R`'<div class="small" id="usOnly"><b>We ship worldwide.</b> Pick your country above. Outside the USA, shipping is priced for your address and customs duties are paid by you on delivery.</div>\n        '`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchworld: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 70));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
// The international shipment: the customs form (contents, value, buyer pays duties) and the shipment with it.
fs.appendFileSync('api/label.js', R`

// Outside the USA. parcel: the package; to: the Shippo address; value: the goods in cents; item: what it is.
// A USPS flat rate box template is domestic, so its size is used instead.
const FLAT = { USPS_SmallFlatRateBox: ['8.69', '5.44', '1.75'], USPS_MediumFlatRateBox1: ['11.25', '8.75', '6'], USPS_LargeFlatRateBox: ['12.25', '12.25', '6'] };
async function intlShipment(parcel, to, qty, value, item) {
  const from = shipFrom();
  if (!from) throw new Error('The ship-from address is not set yet.');
  const pc = Object.assign({}, parcel);
  if (pc.template) { const d = FLAT[pc.template] || ['9', '6', '1']; delete pc.template; pc.length = d[0]; pc.width = d[1]; pc.height = d[2]; pc.distance_unit = 'in'; }
  const cd = await shippo('/customs/declarations/', {
    contents_type: 'MERCHANDISE', non_delivery_option: 'RETURN', certify: true, certify_signer: from.name, incoterm: 'DDU', eel_pfc: 'NOEEI_30_37_a',
    items: [{ description: ('Collectible ' + String(item || 'trading cards')).slice(0, 45), quantity: Math.max(1, Number(qty) || 1), net_weight: String(pc.weight), mass_unit: 'oz', value_amount: (Math.max(100, Number(value) || 0) / 100).toFixed(2), value_currency: 'USD', origin_country: 'US' }]
  });
  return shippo('/shipments/', { address_from: from, address_to: to, parcels: [pc], customs_declaration: cd.object_id, async: false });
}
// The price of shipping outside the USA, in cents: the cheapest USPS rate (any carrier if USPS has none) plus 25%.
module.exports.quoteIntl = async (o) => {
  if (!key()) return { error: 'Shipping outside the USA is not available right now.' };
  const pk = await parcel({ pid: o.pid, q: o.qty });
  const s = await intlShipment(pk.parcel, o.to, o.qty, o.value, o.item);
  const rates = (Array.isArray(s.rates) ? s.rates : []).filter((r) => r && r.object_id && Number(r.amount) > 0);
  const usps = rates.filter((r) => String(r.provider || '').toUpperCase() === 'USPS');
  const pick = (usps.length ? usps : rates).sort((a, c) => Number(a.amount) - Number(c.amount))[0];
  if (!pick) return { error: 'We could not get a shipping price to that address. Check the address, or email us.' };
  return { cents: Math.ceil(Number(pick.amount) * 125), base: Number(pick.amount), service: ((pick.provider || '') + ' ' + ((pick.servicelevel && pick.servicelevel.name) || '')).trim() };
};
module.exports.intlShipment = intlShipment;
`);
