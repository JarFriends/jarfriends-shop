// Party pricing on sellers' pieces (set in Seller Hub, on any Buy now piece): the more that sell before the countdown
// ends, the lower the price for everyone. A buyer pays the level reached counting their own units (a checkout key
// that works like an accepted offer, good for 30 minutes). When the party ends, anyone who paid more than the final
// level is owed the difference: the seller and the V2V owner are emailed the list, and it shows in both offices.
const store = require('./_store');
const lib = require('./_lib');

async function piece(id) { const M = require('./_sellers'); return (await M.products()).filter((p) => p.id === id && p.party)[0] || null; }
async function soldIn(p) {
  let n = 0;
  (await store.sales()).forEach((s) => { if (s.pid === p.id && s.at >= p.party.start && s.at <= p.party.ends + 120000) n += s.q; });
  return n;
}
const offAt = (tiers, n) => tiers.reduce((m, t) => (n >= t[0] ? Math.max(m, t[1]) : m), 0);
const each = (p, off) => Math.round(Math.round(p.price * 100) * (100 - off) / 100);
async function state(p) {
  const sold = await soldIn(p), stock = p.stock || 0;
  const off = offAt(p.party.tiers, sold), ended = Date.now() > p.party.ends;
  const next = p.party.tiers.filter((t) => sold < t[0])[0] || null;
  return { id: p.id, name: p.name, price: Math.round(p.price * 100), sold: sold, stock: stock, off: off, now: each(p, off), oneOff: offAt(p.party.tiers, sold + 1), onePrice: each(p, offAt(p.party.tiers, sold + 1)),
    tiers: p.party.tiers.map((t) => ({ need: t[0], off: t[1], reached: sold >= t[0], price: each(p, t[1]) })), next: next ? { need: next[0], off: next[1], more: next[0] - sold } : null, ends: p.party.ends, ended: ended, serverNow: Date.now() };
}
// The party price for q units, and the checkout key that locks it in for 30 minutes.
async function quote(id, q) {
  const p = await piece(id); if (!p) return { error: 'This piece is not in a party.' };
  const st = await state(p);
  if (st.ended) return Object.assign({ error: 'This party has ended.' }, { state: st });
  q = Math.max(1, Math.min(10, Math.floor(Number(q) || 1)));
  const off = offAt(p.party.tiers, st.sold + q), c = each(p, off);
  return { state: st, qty: q, off: off, each: c, key: lib.sign({ oa: 1, n: 'PTY' + off, pid: p.id, q: q, c: c, x: Math.floor(Date.now() / 1000) + 1800 }) };
}
// After it ends: what each paid order is owed back (paid each, minus the final party price each).
async function owed(p) {
  const M = require('./_sellers');
  const st = await state(p);
  const final = each(p, st.off);
  const rows = (await M.ledger(p.seller)).filter((r) => r.pid === p.id && r.paid && r.at >= p.party.start && r.at <= p.party.ends + 120000);
  return { state: st, final: final, orders: rows.map((r) => ({ n: r.n, email: r.email, buyer: r.buyer, q: r.q, pay: r.pay, back: Math.max(0, (Math.round(r.items / Math.max(1, r.q)) - final) * r.q) })).filter((o) => o.back > 0) };
}
// Run from the sweep: tell the seller and the owner once a party has ended, with who is owed what.
async function wrapUp() {
  const M = require('./_sellers');
  const ended = (await M.listings()).filter((p) => p.party && Date.now() > p.party.ends && Date.now() - p.party.ends < 7 * 86400000);
  for (const p of ended) {
    const k = 'partyS/' + p.id + '-' + p.party.ends + '.json';
    if (await store.read(k)) continue;
    const o = await owed(p), shop = await M.bySlug(p.seller), owner = (process.env.OWNER_EMAIL || '').trim();
    // Card orders get the difference back on the card automatically (on the seller's own Stripe for direct sales,
    // with V2V's fee on that part going back too). Anything that cannot be refunded this way is listed to do by hand.
    for (const x of o.orders) {
      x.done = false;
      if (!/card/i.test(x.pay || '')) continue;
      const m = (await store.read('meta/' + x.n + '.json')) || {};
      if (!/^pi_/.test(m.pi || '')) continue;
      const C = require('./_connect'), form = { payment_intent: m.pi, amount: x.back, 'metadata[invoice]': x.n, 'metadata[reason]': 'party price drop' };
      const r = m.direct ? await C.call('POST', '/refunds', Object.assign({ refund_application_fee: 'true' }, form), 'ptyS-' + p.id + '-' + x.n, m.direct).catch(() => ({ ok: false }))
        : await require('./_stripe').call('POST', '/refunds', form, 'ptyS-' + p.id + '-' + x.n).catch(() => ({ ok: false }));
      x.done = !!r.ok;
      if (!r.ok) console.error('PARTY_REFUND_FAIL', x.n, r.status, JSON.stringify(r.body && r.body.error || {}).slice(0, 200));
    }
    const lines = ['The party for ' + p.name + ' has ended with ' + o.state.sold + ' sold.', o.state.off ? 'The final level is ' + o.state.off + '% off ($' + (o.final / 100).toFixed(2) + ' each). These buyers paid more and are owed the difference:' : 'It did not reach the first level, so nobody is owed money back.', ''].concat(o.orders.map((x) => 'Order ' + x.n + ' · ' + (x.buyer || x.email) + ' · $' + (x.back / 100).toFixed(2) + (x.done ? ' · REFUNDED to their card automatically' : ' · TO SEND BY HAND (' + (x.pay || '') + ')')));
    if (o.orders.some((x) => !x.done)) lines.push('', 'Anything marked "to send by hand": V2V sends that money back and takes it off what is owed to the seller.');
    if (owner) await lib.mail(owner, 'Party ended: ' + p.name, lines, 'ptyS-own-' + p.id + '-' + p.party.ends).catch(() => null);
    if (shop) await lib.mail(shop.email, 'Your party ended: ' + p.name, lines, 'ptyS-sel-' + p.id + '-' + p.party.ends).catch(() => null);
    for (const x of o.orders) if (x.email) await lib.mail(x.email, 'Money coming back: ' + p.name, ['The party for ' + p.name + ' ended at ' + o.state.off + '% off, lower than what you paid.', x.done ? '$' + (x.back / 100).toFixed(2) + ' has been refunded to your card for order ' + x.n + '. It shows on your card in about 5 to 10 business days.' : 'You are owed $' + (x.back / 100).toFixed(2) + ' back on order ' + x.n + '. It goes back to the way you paid.'], 'ptyS-buy-' + p.id + '-' + x.n).catch(() => null);
    await store.write(k, { at: Date.now(), owed: o.orders });
  }
}
module.exports = { piece, state, quote, owed, wrapUp };
