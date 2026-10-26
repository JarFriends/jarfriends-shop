// The party (see _party.js).
// GET                      public: where the party stands, for the home page and checkout.
// GET ?qty=N               public: the same, plus the party price for N units and the checkout key that locks it in.
// GET ?settle=<key>        owner only: what each buyer is owed now that the party has ended.
// GET ?settle=<key>&go=1   owner only: send the card refunds through Stripe and email everyone. Safe to open twice.
const { sign, verify, mail, esc } = require('./_lib');
const store = require('./_store');
const stripe = require('./_stripe');
const party = require('./_party');
const sheet = require('./testsheet');

const P = party.PARTY, money = party.money;
const owner = () => (process.env.OWNER_EMAIL || '').trim();
const product = () => sheet.PRODUCTS.filter((x) => x.id === P.pid)[0] || { name: 'Party piece', price: 0 };
function page(res, title, body) {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(title) + '</title><link rel="stylesheet" href="/site.css"></head><body><header class="top"><div class="wrap bar"><a class="brand" href="/" style="text-decoration:none">' + esc((process.env.BRAND_NAME || 'Collectors Page').trim()) + '</a><span class="mono dim">OWNER ONLY</span></div></header><main class="wrap page"><div class="stack-s"><div class="mono gold">PARTY</div><h1>' + esc(title) + '</h1></div>' + body + '</main></body></html>');
}

// Card payments by invoice number, from Stripe: { invoice: payment_intent id }.
async function cardPayments() {
  const out = {};
  if (!stripe.ready()) return out;
  let after = '';
  for (let i = 0; i < 10; i++) {
    const r = await stripe.call('GET', '/checkout/sessions?limit=100&status=complete' + (after ? '&starting_after=' + after : ''));
    const list = (r.ok && r.body && r.body.data) || [];
    list.forEach((s) => { if (s.client_reference_id && s.payment_intent && s.payment_status === 'paid') out[s.client_reference_id] = String(s.payment_intent); });
    if (!r.ok || !r.body.has_more || !list.length) break;
    after = list[list.length - 1].id;
  }
  return out;
}

// What each buyer is owed at the level the party reached: what they paid for the pieces, less what the pieces
// cost at the final level. Never below zero.
async function owed(st, cents) {
  const out = [];
  for (const s of await party.rows()) {
    const d = (await store.read(s.path)) || {};
    const paid = Math.round(Number(d.items) * 100) || cents * s.q;
    out.push({ n: s.n, q: s.q, pay: d.pay || '?', buyer: d.buyer || '', email: d.email || '', proof: d.proof || '', back: Math.max(0, paid - Math.round(cents * s.q * (100 - st.off) / 100)) });
  }
  return out;
}
// For the owner: the buyers to pay back by hand, one per line, with how they paid and where to reach them.
function byHand(orders) {
  const list = orders.filter((o) => o.back > 0 && o.pay !== 'Card');
  if (!list.length) return ['Nobody needs paying back by hand.'];
  const sum = list.reduce((m, o) => m + o.back, 0);
  return ['Pay these back by hand (' + list.length + (list.length === 1 ? ' buyer, ' : ' buyers, ') + money(sum) + ' in all):'].concat(list.map((o) => '- ' + money(o.back) + ' by ' + o.pay + ' to ' + o.buyer + ' <' + o.email + '>, order ' + o.n + ' (' + o.q + ' x)' + (/^https:/.test(o.proof) ? '. Their payment: ' + o.proof : '')), ['', 'Each of them is asked to email you where to send it (their Zelle, Venmo or Cash App name, or wallet address). For crypto, the payment link shows the wallet they paid from.']);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  // The daily job also checks where VeeFam stands on each state's sales tax line (see _tax.js).
  if (/vercel-cron/i.test(String(req.headers['user-agent'] || ''))) await require('./_backup').snapshot().catch((e) => console.error('BACKUP_FAIL', String(e && e.message || e)));
  if (/vercel-cron/i.test(String(req.headers['user-agent'] || ''))) await require('./_tax').watch().catch((e) => console.error('TAX_WATCH_FAIL', String(e && e.message || e)));
  const p = product(), cents = Math.round(p.price * 100), host = 'https://' + req.headers.host;
  const st = await party.state(cents);
  const key = String((req.query && req.query.settle) || '');

  if (!key) {
    // Once the party is over, the owner gets the link that settles it. Sent one time.
    if (st.on && st.ended && owner()) {
      try {
        if (!(await store.read('party/' + P.pid + '/told.json'))) {
          await store.write('party/' + P.pid + '/told.json', { at: Date.now() });
          const due = st.off ? await owed(st, cents) : [], cards = due.filter((o) => o.back > 0 && o.pay === 'Card');
          await mail(owner(), 'Your party has ended: ' + p.name, ['The party for ' + p.name + ' has ended with ' + st.sold + ' of ' + st.total + ' sold.', st.off ? 'The final level is ' + st.off + '% off. Anyone who paid more than that is owed the difference.' : 'It did not reach the first level, so nobody is owed money back.', ''].concat(st.off ? byHand(due) : [], st.off ? ['', cards.length ? 'Card buyers owed money: ' + cards.length + ', ' + money(cards.reduce((m, o) => m + o.back, 0)) + ' in all. The button on this page sends those through Stripe and emails every buyer:' : 'Open this page to email every buyer what is coming back:', host + '/api/party?settle=' + sign({ ps: 1, pid: P.pid })] : []), 'party-end-' + P.pid);
        }
      } catch (e) { console.error('PARTY_TELL_FAIL', String(e && e.message || e)); }
    }
    const each = (off) => Math.round(cents * (100 - off) / 100);
    const out = Object.assign({ name: p.name, price: (cents / 100).toFixed(2), nowPrice: (each(st.off) / 100).toFixed(2), oneOff: party.offFor(st.sold, 1), onePrice: (each(party.offFor(st.sold, 1)) / 100).toFixed(2) }, st);
    // The party price for an order of this many units. The key works like an accepted offer at checkout
    // (see order.js): it fixes the piece, the units and the price each, for 30 minutes.
    const q = Math.floor(Number(req.query && req.query.qty));
    if (q >= 1 && q <= st.left && st.on && !st.ended) {
      const off = party.offFor(st.sold, q);
      out.order = { qty: q, off: off, each: (each(off) / 100).toFixed(2), save: ((cents - each(off)) * q / 100).toFixed(2), key: off ? sign({ oa: 1, n: 'PARTY' + off, pid: P.pid, q: q, c: each(off), x: Math.floor(Date.now() / 1000) + 1800 }) : '' };
    }
    return res.json(out);
  }

  const k = verify(key);
  if (!k || k.ps !== 1 || k.pid !== P.pid) return page(res, 'Link not valid', '<div class="small">This link is not valid.</div>');
  if (!st.ended) return page(res, 'Party still open', '<div class="small">' + esc(st.sold + ' of ' + st.total + ' sold so far. The party ends ' + P.endsText + '. Come back to this link then.') + '</div>');
  const orders = await owed(st, cents);
  const done = (await store.read('party/' + P.pid + '/settled.json')) || null;
  const go = String(req.query.go || '') === '1' && !done && st.off > 0;
  let pis = {};
  if (go) pis = await cardPayments();
  const out = [];
  for (const o of orders) {
    let how = !o.back ? 'Already paid the final price' : o.pay === 'Card' ? 'Card refund through Stripe' : 'Send back by hand (' + o.pay + ')';
    if (go && o.back > 0) {
      if (o.pay === 'Card' && pis[o.n]) {
        const rf = await stripe.call('POST', '/refunds', { payment_intent: pis[o.n], amount: o.back, 'metadata[invoice]': o.n, 'metadata[reason]': 'party price drop' }, 'party-' + P.pid + '-' + o.n).catch(() => ({ ok: false }));
        how = rf.ok ? 'Refunded to the card' : 'CARD REFUND FAILED: refund it by hand in Stripe';
        if (!rf.ok) console.error('PARTY_REFUND_FAIL', o.n, rf.status);
      } else if (o.pay === 'Card') how = 'CARD PAYMENT NOT FOUND: refund it by hand in Stripe';
      if (o.email) {
        await mail(o.email, 'The party ended: ' + money(o.back) + ' is coming back to you', ['The party for ' + p.name + ' has ended with ' + st.sold + ' of ' + st.total + ' sold, so the final price is ' + st.off + '% off for everyone.', '', 'Your order ' + o.n + ': ' + money(o.back) + ' back.', o.pay === 'Card' ? 'It is being refunded to the card you paid with. It can take a few days to show.' : 'We will send it back to you by ' + o.pay + '. Email ' + (owner() || 'us') + ' with where to send it (your Zelle, Venmo or Cash App name, or your wallet address).', '', 'Thanks for being part of it.'], 'party-back-' + P.pid + '-' + o.n).catch(() => null);
      }
    }
    out.push(Object.assign({}, o, { how: how }));
  }
  if (go) {
    await store.write('party/' + P.pid + '/settled.json', { at: Date.now(), off: st.off, orders: out });
    if (owner()) await mail(owner(), 'Party settled: ' + p.name, ['The party ended with ' + st.sold + ' of ' + st.total + ' sold: ' + st.off + '% off for everyone.', ''].concat(byHand(out), ['', 'Every order:'], out.map((o) => o.n + ' / ' + o.buyer + ' <' + o.email + '> / ' + o.q + ' x / ' + money(o.back) + ' back / ' + o.how)), 'party-settled-' + P.pid).catch(() => null);
  }
  const shown = done && done.orders ? done.orders : out;
  const rowsHtml = shown.map((o) => '<div class="row"><span>' + esc(o.n + ' / ' + o.buyer + ' / ' + o.q + ' x') + '<br><span class="dim">' + esc(o.email + ' / ' + o.how) + '</span></span><span>' + esc(money(o.back)) + '</span></div>').join('');
  const lead = st.off ? st.sold + ' of ' + st.total + ' sold, so the final price is ' + st.off + '% off. Each buyer below gets back the difference from what they paid.' : st.sold + ' of ' + st.total + ' sold. The first level was not reached, so nobody is owed money back.';
  const action = done || go ? '<div class="small">' + esc('Settled. Card refunds were sent through Stripe and every buyer was emailed. Anything marked by hand is yours to send.') + '</div>' : st.off && orders.length ? '<a class="solid" style="display:inline-block;text-decoration:none;padding:12px 18px" href="/api/party?settle=' + encodeURIComponent(key) + '&go=1">Send the card refunds and email the buyers</a><div class="small">Card orders are refunded through Stripe. Orders paid another way are listed for you to send back by hand.</div>' : '';
  page(res, done || go ? 'Party settled' : 'Party ended', '<div class="small">' + esc(lead) + '</div><section class="card side" style="max-width:640px"><div class="rows">' + (rowsHtml || '<div class="row"><span class="dim">No orders</span><span></span></div>') + '</div>' + action + '</section>');
};
