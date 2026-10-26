// Sales tax, collected by VeeFam as the marketplace (a "marketplace facilitator"): on every order shipping to a state
// where the owner has registered to collect, at the rate the owner sets for that state, on the pieces (after any
// discount). It goes to VeeFam to file and pay the state, never to the seller. Set in the back office (Sellers tab,
// Sales tax). Saved in settings/salestax.json = { rates: { IL: 8.25, TX: 8.25 }, at }. Until it is saved, Illinois
// uses SALES_TAX_IL_PERCENT (8.25), as before.
const store = require('./_store');

const STATES = { AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado', CT: 'connecticut', DE: 'delaware', DC: 'district of columbia', FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa', KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi', MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new hampshire', NJ: 'new jersey', NM: 'new mexico', NY: 'new york', NC: 'north carolina', ND: 'north dakota', OH: 'ohio', OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania', PR: 'puerto rico', RI: 'rhode island', SC: 'south carolina', SD: 'south dakota', TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington', WV: 'west virginia', WI: 'wisconsin', WY: 'wyoming' };
// "TX", "Tx.", "Texas", "texas " all become TX. Anything else is ''.
function code(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ');
  if (!s) return '';
  if (STATES[s.toUpperCase()]) return s.toUpperCase();
  if (s === 'ill') return 'IL';
  return Object.keys(STATES).filter((k) => STATES[k] === s)[0] || '';
}
// The usual combined rate (state plus average local), percent, 2026 (Tax Foundation). Used as the starting rate when
// a state is added; the owner can change it. Five states have no statewide sales tax (0).
const AVG = { AL: 9.46, AK: 1.82, AZ: 8.54, AR: 9.48, CA: 9.03, CO: 7.89, CT: 6.35, DE: 0, DC: 6, FL: 6.98, GA: 7.56, HI: 4.5, ID: 6.03, IL: 8.98, IN: 7, IA: 6.94, KS: 8.71, KY: 6, LA: 10.13, ME: 5.5, MD: 6, MA: 6.25, MI: 6, MN: 8.14, MS: 7.06, MO: 8.44, MT: 0, NE: 6.98, NV: 8.24, NH: 0, NJ: 6.6, NM: 7.68, NY: 8.54, NC: 7.1, ND: 7.09, OH: 7.29, OK: 9.06, OR: 0, PA: 6.34, RI: 7, SC: 7.49, SD: 6.11, TN: 9.61, TX: 8.2, UT: 7.42, VT: 6.43, VA: 5.77, WA: 9.57, WV: 6.6, WI: 5.72, WY: 5.39 };
// When a marketplace must start collecting in each state (2026), from each state's marketplace facilitator rules:
// [dollars, orders, 'or' | 'and', how sales are counted]. How they are counted:
//   cy   this calendar year or last calendar year     py   last calendar year only
//   12m  the last 12 months (NY: last four quarters)  ct   Connecticut: the 12 months ending September 30, ALL of
//        VeeFam's facilitated sales (not only Connecticut's)   any  from the first sale (DC: no threshold)
// Sources: Numeral and Kintsugi state tables, Connecticut DRS OCG-8, DC OTR marketplace FAQ, Illinois bulletin
// FY 2026-13. Oklahoma's $10,000 marketplace line only chooses between collecting and mailing buyers notices;
// collecting is required at $100,000. Kentucky dropped its 200-order test on August 1, 2026.
const THRESH = {
  AL: [250000, 0, '', '12m'], AK: [100000, 0, '', 'cy'], AZ: [100000, 0, '', 'cy'], AR: [100000, 200, 'or', 'cy'],
  CA: [500000, 0, '', 'cy'], CO: [100000, 0, '', 'cy'], CT: [250000, 0, '', 'ct'], DC: [0, 0, '', 'any'],
  FL: [100000, 0, '', 'py'], GA: [100000, 0, '', 'cy'], HI: [100000, 200, 'or', 'cy'], ID: [100000, 0, '', 'cy'],
  IL: [100000, 0, '', '12m'], IN: [100000, 0, '', 'cy'], IA: [100000, 0, '', 'cy'], KS: [100000, 0, '', 'cy'],
  KY: [100000, 0, '', 'cy'], LA: [100000, 0, '', 'cy'], ME: [100000, 0, '', 'cy'], MD: [100000, 200, 'or', 'cy'],
  MA: [100000, 0, '', 'py'], MI: [100000, 200, 'or', 'cy'], MN: [100000, 200, 'or', '12m'], MS: [250000, 0, '', '12m'],
  MO: [100000, 0, '', '12m'], NE: [100000, 200, 'or', 'cy'], NV: [100000, 200, 'or', 'cy'], NJ: [100000, 200, 'or', 'cy'],
  NM: [100000, 0, '', 'py'], NY: [500000, 101, 'and', '12m'], NC: [100000, 0, '', 'cy'], ND: [100000, 0, '', 'cy'],
  OH: [100000, 200, 'or', 'py'], OK: [100000, 0, '', 'cy'], PA: [100000, 0, '', '12m'], RI: [100000, 200, 'or', 'py'],
  SC: [100000, 0, '', 'cy'], SD: [100000, 0, '', 'cy'], TN: [100000, 0, '', '12m'], TX: [500000, 0, '', '12m'],
  UT: [100000, 0, '', 'cy'], VT: [100000, 200, 'or', '12m'], VA: [100000, 200, 'or', 'cy'], WA: [100000, 0, '', 'cy'],
  WV: [100000, 200, 'or', 'cy'], WI: [100000, 0, '', 'cy'], WY: [100000, 0, '', 'cy']
};
const PERIOD = { cy: 'this or last calendar year', py: 'last calendar year', '12m': 'the last 12 months', ct: 'all VeeFam sales, 12 months to Sept 30', any: 'from the first sale' };
const NO_TAX = ['DE', 'MT', 'NH', 'OR'];
// States that tax the shipping charge on a taxable sale (separately stated shipping is exempt everywhere else).
// Florida and Illinois tax it unless the buyer could have picked the piece up instead, which VeeFam buyers cannot;
// Hawaii's excise and DC have no shipping exclusion. Source: Kintsugi shipping taxability table (2026).
const SHIP_TAX = ['AR', 'CT', 'DC', 'FL', 'GA', 'HI', 'IL', 'IN', 'KY', 'LA', 'MN', 'MS', 'NE', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'VT', 'WA', 'WV', 'WI'];
// Sales into each state measured each state's way, and where each state stands against its line:
// 'collecting', 'over' (must register and collect), 'near' (80%+), 'under', 'none' (no sales tax).
async function tracker() {
  const now = new Date(), y = now.getFullYear(), yr0 = Date.UTC(y, 0, 1), d12 = Date.now() - 365 * 86400000;
  // Connecticut: the most recent 12 months ending September 30.
  const ctEnd = Date.UTC(now.getMonth() >= 9 ? y : y - 1, 9, 1), ctStart = Date.UTC(now.getMonth() >= 9 ? y - 1 : y - 2, 9, 1);
  const per = {}, all = { ct: 0, ctN: 0 };
  const sales = await store.sales();
  const rows = await Promise.all(sales.map((x) => store.read(x.path).then((d) => (d ? { d: d, at: d.at || x.at } : null)).catch(() => null)));
  const money = (v) => Math.round(Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')) * 100) || 0;
  rows.forEach((r) => {
    if (!r) return;
    const at = Number(r.at) || 0, yr = new Date(at).getUTCFullYear();
    // Gross sales: the pieces plus shipping (not the sales tax or card fee).
    const amt = r.d.items != null && r.d.items !== '' ? money(r.d.items) + money(r.d.shipping) : money(r.d.total);
    if (at >= ctStart && at < ctEnd) { all.ct += amt; all.ctN++; }
    const m = /,\s*([A-Za-z .]+?)\s+\d{5}(-\d{4})?\s*$/.exec(String(r.d.ship || '').split('\n')[0]) || /\b([A-Z]{2})\s+\d{5}\b/.exec(String(r.d.ship || ''));
    const c = m ? code(m[1]) : ''; if (!c) return;
    const k = per[c] = per[c] || { cur: 0, curN: 0, prev: 0, prevN: 0, m12: 0, m12N: 0, ever: 0 };
    k.ever++;
    if (yr === y) { k.cur += amt; k.curN++; } else if (yr === y - 1) { k.prev += amt; k.prevN++; }
    if (at >= d12) { k.m12 += amt; k.m12N++; }
  });
  const v = await get(), rates = v.rates, out = [];
  Object.keys(STATES).forEach((c) => {
    if (c === 'PR') return;
    const k = per[c] || { cur: 0, curN: 0, prev: 0, prevN: 0, m12: 0, m12N: 0, ever: 0 };
    const base = { code: c, name: STATES[c], cur: k.cur, curN: k.curN, prev: k.prev, prevN: k.prevN, m12: k.m12, m12N: k.m12N, avg: AVG[c] || 0, shipTaxed: SHIP_TAX.indexOf(c) >= 0 };
    if (NO_TAX.indexOf(c) >= 0) { out.push(Object.assign(base, { status: 'none' })); return; }
    const t = THRESH[c], mode = t[3];
    let $, n;
    if (mode === 'py') { $ = k.prev; n = k.prevN; }
    else if (mode === '12m') { $ = k.m12; n = k.m12N; }
    else if (mode === 'ct') { $ = all.ct; n = all.ctN; }
    else if (mode === 'any') { $ = 0; n = k.ever; }
    else { $ = Math.max(k.cur, k.prev); n = Math.max(k.curN, k.prevN); }
    let hit, pct;
    if (mode === 'any') { hit = n > 0; pct = hit ? 100 : 0; }
    else {
      const $ok = $ >= t[0] * 100, nOk = t[1] ? n >= t[1] : false;
      hit = t[2] === 'and' ? $ok && nOk : t[2] === 'or' ? $ok || nOk : $ok;
      const pd = $ / (t[0] * 100), pn = t[1] ? n / t[1] : 0;
      pct = Math.round(Math.min(t[2] === 'and' ? Math.min(pd, pn) : Math.max(pd, pn), 9.99) * 100);
    }
    let status = hit ? 'over' : pct >= 80 ? 'near' : 'under';
    if (rates[c]) status = 'collecting';
    out.push(Object.assign(base, { measured: $, measuredN: n, period: PERIOD[mode], threshold: t[0], orders: t[1] || null, rule: t[2], pct: pct, status: status, rate: rates[c] || 0, own: !rates[c] && c === HOME() }));
  });
  const rank = { over: 0, near: 1, collecting: 2, under: 3, none: 4 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || b.measured - a.measured);
}
let memo = null;
// Two kinds of collecting:
//   rates: states where VeeFam is registered as the marketplace (past that state's line): tax on every seller's pieces.
//   home:  VeeFam's home state (Illinois). Below Illinois' $100,000 marketplace line, Illinois only taxes the
//          marketplace's OWN sales (the owner's own shop, or pieces that are not a seller's), not other sellers'.
//          (35 ILCS 105/2d; Illinois bulletin FY 2026-13.) Once Illinois is added to rates, it covers everyone.
const HOME = () => code(process.env.TAX_HOME_STATE || 'IL') || 'IL';
const homeRate = () => { const r = Number((process.env.SALES_TAX_IL_PERCENT || '').trim() || 8.25); return r > 0 && r <= 15 ? r : 8.25; };
async function get() {
  if (memo && Date.now() - memo.at < 60000) return memo.v;
  let v = null;
  try { v = store.on() ? await store.read('settings/salestax.json') : null; } catch (e) { v = null; }
  if (!v || !v.rates) v = { rates: {}, at: 0 };
  v = Object.assign({}, v, { rates: Object.assign({}, v.rates) });
  // Saved before the home-state rule: Illinois was charged on everyone's pieces. Move it to home-only.
  if (!v.mig) { const h = HOME(); if (v.rates[h]) { v.home = { [h]: v.rates[h] }; delete v.rates[h]; } v.mig = 2; }
  if (!v.home) v.home = { [HOME()]: homeRate() };
  memo = { at: Date.now(), v: v };
  return v;
}
// Is this piece VeeFam's own sale: not a seller's listing, or a listing in the owner's own shop?
let ownMemo = null;
async function ownShops() {
  if (ownMemo && Date.now() - ownMemo.at < 60000) return ownMemo.v;
  const M = require('./_sellers'), owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const slugs = owner ? (await M.all()).filter((s) => String(s.email || '').toLowerCase() === owner).map((s) => s.slug) : [];
  const ids = {}; (await M.listings()).forEach((p) => { if (slugs.indexOf(p.seller) >= 0) ids[p.id] = true; });
  ownMemo = { at: Date.now(), v: { slugs: slugs, ids: ids } };
  return ownMemo.v;
}
async function isOwn(pid) { if (!require('./_sellers').isSellerPid(pid)) return true; return !!(await ownShops()).ids[pid]; }
// The rate (percent) for a ship-to state and piece, or 0 where VeeFam does not collect.
async function rateFor(state, pid) {
  const c = code(state); if (!c) return 0;
  const v = await get();
  if (Number(v.rates[c])) return Number(v.rates[c]);
  if (Number(v.home[c]) && pid && (await isOwn(pid))) return Number(v.home[c]);
  return 0;
}
// The tax on one order: the rate for the ship-to state and piece (0 where VeeFam does not collect), on the pieces
// after any discount, plus the shipping where that state taxes shipping. With TAX_EXACT=stripe (Stripe Tax turned
// on, with the same states registered in Stripe), the exact rate for the street address comes from Stripe Tax;
// otherwise, or if Stripe has no answer, the state's usual combined rate set in the back office.
async function quote(o) {
  const c = code(o.state), rate = await rateFor(o.state, o.pid);
  const base = Math.max(0, Math.round(Number(o.base) || 0)), ship = Math.max(0, Math.round(Number(o.ship) || 0));
  if (!rate || !base) return { rate: 0, tax: 0, ship: false, exact: false };
  const shipTaxed = SHIP_TAX.indexOf(c) >= 0;
  if ((process.env.TAX_EXACT || '').trim().toLowerCase() === 'stripe' && /^\d{5}/.test(String(o.zip || ''))) {
    try {
      const S = require('./_stripe');
      if (S.ready()) {
        const f = { currency: 'usd', 'customer_details[address][country]': 'US', 'customer_details[address][state]': c, 'customer_details[address][postal_code]': String(o.zip).slice(0, 10), 'customer_details[address][city]': String(o.city || '').slice(0, 60), 'customer_details[address][line1]': String(o.street || '').slice(0, 120), 'customer_details[address_source]': 'shipping', 'line_items[0][amount]': base, 'line_items[0][reference]': String(o.pid || 'piece').slice(0, 60), 'line_items[0][tax_code]': 'txcd_99999999', 'line_items[0][tax_behavior]': 'exclusive' };
        if (ship) { f['shipping_cost[amount]'] = ship; f['shipping_cost[tax_behavior]'] = 'exclusive'; }
        const r = await S.call('POST', '/tax/calculations', f);
        const tx = r.ok && r.body ? Number(r.body.tax_amount_exclusive) || 0 : 0;
        if (tx > 0) { const br = (r.body.tax_breakdown || []).reduce((n, x) => n + (Number(x.tax_rate_details && x.tax_rate_details.percentage_decimal) || 0), 0); return { rate: br ? Math.round(br * 1000) / 1000 : rate, tax: tx, ship: shipTaxed, exact: true }; }
        if (!r.ok) console.error('STRIPE_TAX_CALC_FAIL', r.status, JSON.stringify(r.body && r.body.error || {}).slice(0, 200));
      }
    } catch (e) { console.error('STRIPE_TAX_CALC_FAIL', String(e && e.message || e)); }
  }
  return { rate: rate, tax: Math.round(base * rate / 100) + (shipTaxed ? Math.round(ship * rate / 100) : 0), ship: shipTaxed, exact: false };
}
// The owner saves the list: { TX: 8.25, ... }. Rates from 0.01% to 15%.
async function save(rates) {
  const out = {};
  for (const k of Object.keys(rates || {})) {
    const c = code(k), r = Math.round(Number(rates[k]) * 1000) / 1000;
    if (!c) return { error: 'Unknown state: ' + k };
    if (!(r > 0 && r <= 15)) return { error: c + ': the rate must be between 0.01% and 15%.' };
    out[c] = r;
  }
  const v = { rates: out, home: (await get()).home, mig: 2, at: Date.now() };
  await store.write('settings/salestax.json', v);
  memo = { at: Date.now(), v: v };
  return { ok: true, rates: out };
}
// Once a day (the daily job): email the owner and post in the orders Discord when a state first gets close to its
// marketplace line (80%) or passes it, so registering is never missed. Each state and level is told once.
async function watch() {
  if (!store.on()) return { skipped: true };
  const seen = (await store.read('settings/taxalerts.json').catch(() => null)) || {};
  if (seen.day === new Date().toISOString().slice(0, 10)) return { skipped: true };
  const news = (await tracker()).filter((x) => (x.status === 'over' || x.status === 'near') && (x.cur || x.prev || x.curN || x.prevN) && seen[x.code] !== x.status && !(x.status === 'near' && seen[x.code] === 'over'));
  news.forEach((x) => { seen[x.code] = x.status; });
  seen.day = new Date().toISOString().slice(0, 10);
  await store.write('settings/taxalerts.json', seen);
  if (!news.length) return { told: 0 };
  const name = (c) => String(STATES[c]).replace(/\b\w/g, (y) => y.toUpperCase());
  const lines = news.map((x) => (x.status === 'over' ? '🔴 ' + name(x.code) + ': over the line. Register with the state, then turn it on in the back office (Sellers, Sales tax).' : '🟠 ' + name(x.code) + ': ' + x.pct + '% of the way to the line. Get ready to register.') + ' Sales this year $' + Math.round(x.cur / 100).toLocaleString() + ' (' + x.curN + ' orders).');
  const owner = (process.env.OWNER_EMAIL || '').trim();
  if (owner) await require('./_lib').mail(owner, 'Sales tax: ' + news.length + ' state' + (news.length > 1 ? 's' : '') + ' need' + (news.length > 1 ? '' : 's') + ' attention', ['As the marketplace, VeeFam must collect sales tax in a state once its sales there pass that state\'s line.', ''].concat(lines), 'tax-watch-' + seen.day).catch(() => null);
  await require('./_discord')('🧾 Sales tax\n' + lines.join('\n')).catch(() => null);
  return { told: news.length };
}
module.exports = { quote, SHIP_TAX, PERIOD, ownShops, HOME, watch, STATES, AVG, THRESH, NO_TAX, tracker, code, get, rateFor, save };
