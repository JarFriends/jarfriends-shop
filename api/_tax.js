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
// When a marketplace must start collecting in a state (2026): sales into the state in the current or prior calendar
// year, and in some states a number of orders instead ('or') or as well ('and'). DC has no threshold.
const THRESH = { AL: [250000], AK: [100000], AZ: [100000], AR: [100000, 200, 'or'], CA: [500000], CO: [100000], CT: [250000], DC: [0], FL: [100000], GA: [100000], HI: [100000, 200, 'or'], ID: [100000], IL: [100000], IN: [100000], IA: [100000], KS: [100000], KY: [100000], LA: [100000], ME: [100000], MD: [100000, 200, 'or'], MA: [100000], MI: [100000, 200, 'or'], MN: [100000, 200, 'or'], MS: [250000], MO: [100000], NE: [100000, 200, 'or'], NV: [100000, 200, 'or'], NJ: [100000, 200, 'or'], NM: [100000], NY: [500000, 100, 'and'], NC: [100000], ND: [100000], OH: [100000, 200, 'or'], OK: [10000], PA: [100000], RI: [100000, 200, 'or'], SC: [100000], SD: [100000], TN: [100000], TX: [500000], UT: [100000], VT: [100000, 200, 'or'], VA: [100000, 200, 'or'], WA: [100000], WV: [100000, 200, 'or'], WI: [100000], WY: [100000] };
const NO_TAX = ['DE', 'MT', 'NH', 'OR'];
// Sales into each state, this calendar year and last (dollars and orders), from every order on the site, and where
// each state stands against its threshold: 'collecting', 'over' (must register and collect), 'near' (80%+), 'under'.
async function tracker() {
  const now = new Date(), y = now.getFullYear(), per = {};
  const sales = await store.sales();
  const rows = await Promise.all(sales.map((x) => store.read(x.path).then((d) => (d ? { d: d, at: d.at || x.at } : null)).catch(() => null)));
  rows.forEach((r) => {
    if (!r) return; const yr = new Date(r.at).getFullYear(); if (yr !== y && yr !== y - 1) return;
    const m = /,\s*([A-Za-z .]+?)\s+\d{5}(-\d{4})?\s*$/.exec(String(r.d.ship || '').split('\n')[0]) || /\b([A-Z]{2})\s+\d{5}\b/.exec(String(r.d.ship || ''));
    const c = m ? code(m[1]) : ''; if (!c) return;
    const k = per[c] = per[c] || { cur: 0, curN: 0, prev: 0, prevN: 0 };
    const amt = Math.round(Number(String(r.d.total || '0').replace(/[^0-9.]/g, '')) * 100) || 0;
    if (yr === y) { k.cur += amt; k.curN++; } else { k.prev += amt; k.prevN++; }
  });
  const rates = (await get()).rates, out = [];
  Object.keys(STATES).forEach((c) => {
    const t = THRESH[c], k = per[c] || { cur: 0, curN: 0, prev: 0, prevN: 0 };
    if (NO_TAX.indexOf(c) >= 0) { out.push({ code: c, name: STATES[c], cur: k.cur, curN: k.curN, prev: k.prev, prevN: k.prevN, status: 'none', avg: 0 }); return; }
    const best = Math.max(k.cur, k.prev), bestN = Math.max(k.curN, k.prevN);
    let status = 'under', pct = 0;
    if (t) {
      const $ok = t[0] ? best >= t[0] * 100 : bestN > 0, nOk = t[1] ? bestN >= t[1] : false;
      const hit = t[2] === 'and' ? $ok && nOk : t[2] === 'or' ? $ok || nOk : $ok;
      pct = Math.max(t[0] ? best / (t[0] * 100) : (bestN > 0 ? 1 : 0), t[1] ? bestN / t[1] : 0);
      status = hit ? 'over' : pct >= 0.8 ? 'near' : 'under';
    }
    if (rates[c]) status = 'collecting';
    const own = !rates[c] && c === HOME();
    out.push({ code: c, name: STATES[c], cur: k.cur, curN: k.curN, prev: k.prev, prevN: k.prevN, threshold: t ? t[0] : null, orders: t && t[1] ? t[1] : null, rule: t && t[2] ? t[2] : '', pct: Math.round(pct * 100), status: status, avg: AVG[c] || 0, rate: rates[c] || 0, own: own });
  });
  const rank = { over: 0, near: 1, collecting: 2, under: 3, none: 4 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || b.cur + b.prev - (a.cur + a.prev));
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
module.exports = { ownShops, HOME, watch, STATES, AVG, THRESH, NO_TAX, tracker, code, get, rateFor, save };
