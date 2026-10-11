// The party: one piece where the price drops for everyone as more of it sells.
// The discount is taken off at checkout, at the level reached counting the buyer's own units. When the party ends
// (the end time, or sold out), anyone who paid more than the final level gets the difference back.
// tiers are [share of the units sold %, % off the piece price].
const store = require('./_store');

const PARTY = {
  pid: 'MPARTY',
  total: 11,
  starts: Date.parse('2026-10-10T07:00:00-05:00'),
  ends: Date.parse('2026-10-14T23:00:00-05:00'),
  endsText: 'Wednesday, October 14 at 11:00 PM Central',
  tiers: [[25, 5], [50, 10], [100, 33]]
};
const money = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Sales that count: this piece, bought while the party was open.
async function rows() {
  return (await store.sales()).filter((s) => s.pid === PARTY.pid && s.at >= PARTY.starts && s.at <= PARTY.ends + 120000);
}
// cents: the listed price of one unit, for the wording.
async function state(cents) {
  let sold = 0;
  try { (await rows()).forEach((s) => { sold += s.q; }); } catch (e) { console.error('PARTY_COUNT_FAIL', String(e && e.message || e)); }
  sold = Math.min(sold, PARTY.total);
  const tiers = PARTY.tiers.map((t) => { const need = Math.ceil(PARTY.total * t[0] / 100); return { share: t[0], need: need, off: t[1], reached: sold >= need }; });
  const off = tiers.reduce((m, t) => (t.reached ? Math.max(m, t.off) : m), 0);
  const next = tiers.filter((t) => !t.reached)[0] || null;
  const ended = Date.now() > PARTY.ends || sold >= PARTY.total;
  const levels = tiers.map((t) => t.off + '% off once ' + t.need + (t.need === PARTY.total ? ' (all of them)' : '') + ' are sold').join(', ');
  const note = 'This piece is in a party: the more that sell, the lower the price for everyone. The listed price is ' + (cents ? money(cents) : 'shown above') + ', with ' + levels + ' out of ' + PARTY.total + '. Your own units count, and the discount is taken off at checkout. So far ' + sold + ' of ' + PARTY.total + ' are sold' + (off ? ', so ' + off + '% off is already in place' : '') + (next ? '. ' + (next.need - sold) + ' more to reach ' + next.off + '% off.' : '.') + ' If the price drops further after you buy, you get the difference back when the party ends on ' + PARTY.endsText + ' (or sooner if it sells out). Money back goes to the way you paid. Shipping and any card fee are not part of the discount.';
  return { on: store.on(), pid: PARTY.pid, total: PARTY.total, sold: sold, left: PARTY.total - sold, off: off, tiers: tiers, next: next, ends: PARTY.ends, endsText: PARTY.endsText, ended: ended, note: note };
}

// The % off for an order of q units when `sold` are already sold: the buyer's own units count toward the level.
function offFor(sold, q) {
  const after = Math.min(PARTY.total, sold + q);
  return PARTY.tiers.reduce((m, t) => (after >= Math.ceil(PARTY.total * t[0] / 100) ? Math.max(m, t[1]) : m), 0);
}

module.exports = { PARTY, rows, state, money, offFor };
