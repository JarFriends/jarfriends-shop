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
let memo = null;
async function get() {
  if (memo && Date.now() - memo.at < 60000) return memo.v;
  let v = null;
  try { v = store.on() ? await store.read('settings/salestax.json') : null; } catch (e) { v = null; }
  if (!v || !v.rates) { const il = Number((process.env.SALES_TAX_IL_PERCENT || '').trim() || 8.25); v = { rates: il > 0 && il <= 15 ? { IL: il } : {}, at: 0 }; }
  memo = { at: Date.now(), v: v };
  return v;
}
// The rate (percent) for a ship-to state, or 0 where VeeFam does not collect.
async function rateFor(state) { const c = code(state); return c ? Number((await get()).rates[c]) || 0 : 0; }
// The owner saves the list: { TX: 8.25, ... }. Rates from 0.01% to 15%.
async function save(rates) {
  const out = {};
  for (const k of Object.keys(rates || {})) {
    const c = code(k), r = Math.round(Number(rates[k]) * 1000) / 1000;
    if (!c) return { error: 'Unknown state: ' + k };
    if (!(r > 0 && r <= 15)) return { error: c + ': the rate must be between 0.01% and 15%.' };
    out[c] = r;
  }
  const v = { rates: out, at: Date.now() };
  await store.write('settings/salestax.json', v);
  memo = { at: Date.now(), v: v };
  return { ok: true, rates: out };
}
module.exports = { STATES, code, get, rateFor, save };
