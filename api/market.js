// The marketplace, wishlists and the sold archive. One function, many small jobs, picked by "do".
//
// Anyone:
//   GET ?do=shop[&seller=<slug>]   every piece for sale (JarFriends' own and approved sellers'), with stock
//   GET ?do=sold                   recently sold pieces (no buyer details)
// Signed in (t = the account or bidder sign-in the site already uses):
//   GET  ?do=wish&t=               my wishlist
//   POST { do:'wish', t, id, on }  add (on true) or remove a piece
//   GET  ?do=me&t=                 my seller shop: listings, sales, fees, payouts
//   POST { do:'apply', t, name, about, payHow, payTo, agree }        open a seller shop
//   POST { do:'profile', t, about, payHow, payTo }                   change it
//   POST { do:'listing', t, id?, name, desc, price, stock, shipping, section, hidden }  add or change a listing
//   POST { do:'remove', t, id }                                      take a listing down for good
//   POST { do:'photo', t, id, data }                                 a listing's photo (JPEG, base64)
//   POST { do:'ship', t, n, tracking }                               I shipped this order: tell the buyer
// The owner (ak = the back-office key):
//   GET  ?do=admin&ak=             every seller with sales, fees and what is owed
//   POST { do:'status', ak, slug, status }                           approve, pause or re-open a seller
//   POST { do:'payout', ak, slug, amount, how, note }                record money sent to a seller
const store = require('./_store');
const gate = require('./_gate');
const M = require('./_sellers');
const PRODUCTS = require('./_products');
const edits = require('./_edits');
const { mail, esc } = require('./_lib');
const connect = require('./_connect');
const stripeBase = require('./_stripe');

const usd = (c) => (c / 100).toFixed(2);
const photoOf = (p) => (p.photo ? '/api/photo?id=' + p.id + '&v=' + p.photo : '');
const wishKey = (e) => 'wish/' + M.hashOf(e) + '.json';
// Party pricing and Deal of the day pieces have pages of their own, so the market lists everything else.


// Every piece that is for sale now, with what is left. Same stock rule as the shop: start, less sold, less held.
async function shopItems() {
  const all = await edits.apply(PRODUCTS);
  let sold = {}, held = {};
  try { sold = await store.soldBy(); } catch (e) { sold = {}; }
  try { held = await require('./_holds').byProduct(); } catch (e) { held = {}; }
  return all.filter((p) => !p.draft && !(Number(p.deal) > 0) && !/^MPARTY/.test(p.id) && !p.buyers).map((p) => {
    const left = Math.max(0, Number(p.stock || 0) - (sold[p.id] || 0) - (held[p.id] || 0));
    const free = p.shipping === 'free' || !Number(p.shipping);
    return { id: p.id, name: p.name, price: Number(p.price).toFixed(2), left: left, ship: free ? '0.00' : Number(p.shipping).toFixed(2), section: p.section || '', desc: p.desc || '',
      photo: photoOf(p), seller: p.seller || '', sellerName: p.sellerName || 'JarFriends', auction: p.auction && p.auction.ends ? { ends: Date.parse(p.auction.ends) || 0, start: Number(p.auction.start) || 0 } : null, nft: !!(p.nft && p.nft !== 'no'), added: p.created || p.updated || 0 };
  });
}

// Only a confirmed sign-in (Google, or an email and password whose email was confirmed with a code).
async function signedIn(t) { return gate.emailOf(t); }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const what = String(req.method === 'POST' ? b.do : q.do || '');
  if (!store.on()) return res.status(503).json({ error: 'The shop storage is not connected yet.' });
  try {
    // ---------- Anyone ----------
    if (req.method === 'GET' && what === 'shop') {
      let items = await shopItems();
      const open = (await M.all()).filter((s) => s.status === 'approved');
      const st = await M.statsAll(open);
      // Each shop with its rating and checkmark; pieces carry their seller's checkmark for the cards.
      const sellers = open.map((s) => Object.assign(M.pub(s), { rating: st[s.slug].rating, reviews: st[s.slug].reviews, verified: st[s.slug].verified }));
      items.forEach((p) => { if (p.seller && st[p.seller]) p.sellerVerified = st[p.seller].verified; });
      const one = q.seller ? sellers.filter((s) => s.slug === String(q.seller))[0] : null;
      if (q.seller === '_house') items = items.filter((p) => !p.seller);
      else if (q.seller) items = one ? items.filter((p) => p.seller === one.slug) : [];
      // The giveaway wallet: GIVEAWAY_PERCENT (2) of every paid sale (pieces plus shipping), in cents.
      const wallet = Math.round((await M.ledger(null)).filter((r) => r.paid).reduce((t, r) => t + r.gross, 0) * M.giveawayPct() / 100);
      return res.json({ fee: M.feePct(), products: items, sellers: sellers, seller: one || null, sections: M.SECTIONS, wallet: wallet, giveaway: M.giveawayPct() });
    }
    // Which seller a piece belongs to, for "Sold by" on checkout.
    if (req.method === 'GET' && what === 'item') {
      const p = (await shopItems()).filter((x) => x.id === String(q.id || ''))[0];
      if (!p) return res.status(404).json({ error: 'Not found.' });
      const s = p.seller ? await M.bySlug(p.seller) : null, st = s ? await M.stats(s) : null;
      return res.json({ id: p.id, seller: p.seller, sellerName: p.sellerName, rating: st ? st.rating : 0, reviews: st ? st.reviews : 0, verified: st ? st.verified : false });
    }
    // A shop's rating, checkmark and reviews (newest first). Reviewers show as first name and initial.
    if (req.method === 'GET' && what === 'reviews') {
      const s = await M.bySlug(String(q.seller || ''));
      if (!s || s.status !== 'approved') return res.json({ stats: null, reviews: [] });
      const revs = await M.reviews(s.slug);
      return res.json({ stats: await M.stats(s), reviews: revs.slice(0, 100).map((r) => ({ stars: r.stars, text: r.text || '', name: r.name, product: r.product || '', at: r.at, reply: r.reply || '', replyAt: r.replyAt || 0 })) });
    }
    // Community posts: one seller's (?seller=) or the newest from every open seller.
    if (req.method === 'GET' && what === 'posts') {
      const open = {};
      (await M.all()).filter((x) => x.status === 'approved').forEach((x) => { open[x.slug] = x; });
      const slug = String(q.seller || '');
      if (slug && !open[slug]) return res.json({ posts: [] });
      const items = {};
      (await shopItems()).forEach((p) => { items[p.id] = p; });
      const list = (await M.posts(slug || null, slug ? 50 : 40)).filter((x) => open[x.slug]).slice(0, slug ? 50 : 12);
      return res.json({ posts: list.map((x) => ({ id: x.id, text: x.text, at: x.at, photo: x.photo ? '/api/photo?id=' + x.id + '&v=' + x.photo : '', seller: x.slug, sellerName: open[x.slug].name,
        piece: items[x.pid] ? { id: x.pid, name: items[x.pid].name, price: items[x.pid].price, photo: items[x.pid].photo, left: items[x.pid].left } : null })) });
    }
    if (req.method === 'GET' && what === 'sold') {
      const names = {};
      (await edits.apply(PRODUCTS, { all: true })).forEach((p) => { names[p.id] = p; });
      const recent = (await store.sales()).sort((a, b) => b.at - a.at).slice(0, 80);
      const rows = (await Promise.all(recent.map(async (s) => {
        const d = (await store.read(s.path)) || {};
        if (/^(Test|Deal) Piece/.test(d.product || '')) return null;
        // Only pieces that are paid for: an order still waiting for its by-hand payment is not sold yet.
        if (/payment due/i.test(d.status || '')) { const m = (await store.read('meta/' + s.n + '.json')) || {}; if (!(m.paidAt || m.shippedAt || m.labelPdf)) return null; }
        const p = names[s.pid] || {};
        const each = Math.round(Number(String(d.items || '').replace(/[^0-9.]/g, '')) * 100 / Math.max(1, s.q));
        return { id: s.pid, name: p.name || d.product || 'A piece', q: s.q, each: each > 0 ? usd(each) : '', at: s.at, photo: photoOf(p), seller: p.sellerName || 'JarFriends' };
      }))).filter(Boolean);
      return res.json({ sold: rows });
    }

    // ---------- The owner ----------
    if (what === 'admin' || what === 'status' || what === 'payout' || what === 'issue' || what === 'review-remove' || what === 'verify' || what === 'charge' || what === 'import' || what === 'emails' || what === 'email-save' || what === 'email-ai' || what === 'email-test') {
      if (!gate.isAdmin(req.method === 'POST' ? b.ak : q.ak)) return res.status(401).json({ error: 'Sign in to the back office again.' });
      // The Emails tab: every automatic email, which are off, and the owner's own words in them (see _emails.js).
      if (what === 'emails' || what === 'email-save' || what === 'email-ai' || what === 'email-test') {
        const E = require('./_emails');
        if (req.method === 'GET') return res.json(await E.list());
        const r = what === 'email-save' ? await E.save(String(b.id || ''), b) : what === 'email-ai' ? await E.polish(b.text, b.how, b.about) : await E.test(String(b.id || ''));
        return res.status(r.error ? 400 : 200).json(r);
      }
      // Bring the JarFriends shop's pieces into a seller shop (see _import.js). ?do=import&ak=&slug=jarfriends&from=0
      if (req.method === 'GET' && what === 'import') {
        const r = await require('./_import').run(String(q.slug || 'jarfriends'), Math.max(0, Math.floor(Number(q.from) || 0)), Math.min(10, Math.max(1, Math.floor(Number(q.limit) || 5))));
        return res.status(r.error ? 400 : 200).json(r);
      }
      if (req.method === 'GET') {
        const [sellers, rows, outs, listings] = await Promise.all([M.all(), M.ledger(null), M.payouts(null), M.listings()]);
        // Sellers part-way through Stripe setup: check again, so card sales start going to them once Stripe says yes.
        if (stripeBase.ready()) await Promise.all(sellers.filter((x) => x.stripe && !x.stripeOn).map((x) => connect.status(x).catch(() => null)));
        const list = sellers.map((s) => {
          const mine = rows.filter((r) => r.seller === s.slug), paid = outs.filter((p) => p.seller === s.slug);
          return Object.assign({}, s, { listings: listings.filter((p) => p.seller === s.slug).length, totals: M.totals(mine, paid), payouts: paid });
        });
        const all = M.totals(rows, outs);
        const st = await M.statsAll(sellers);
        await Promise.all(list.map(async (x) => { x.stats = st[x.slug]; x.reviewList = (await M.reviews(x.slug)).map((r) => ({ n: r.n, stars: r.stars, text: r.text || '', name: r.name, product: r.product || '', at: r.at })); }));
        all.wallet = Math.round(rows.filter((r) => r.paid).reduce((t, r) => t + r.gross, 0) * M.giveawayPct() / 100);
        return res.json({ fee: M.feePct(), giveaway: M.giveawayPct(), sellers: list, sales: rows, totals: all });
      }
      // Flag an order as a problem (or clear it). A flagged order counts as an issue against the seller's checkmark.
      if (what === 'issue') {
        const n = String(b.n || '');
        if (!/^[A-Z0-9]{4,20}$/.test(n)) return res.status(400).json({ error: 'That order was not found.' });
        const was = (await store.read('meta/' + n + '.json')) || {};
        await store.write('meta/' + n + '.json', Object.assign(was, { issue: b.on ? { note: String(b.note || '').slice(0, 300), at: Date.now() } : null }));
        return res.json({ ok: true });
      }
      const s = await M.bySlug(String(b.slug || ''));
      if (!s) return res.status(404).json({ error: 'That seller was not found.' });
      if (what === 'review-remove') return res.json({ ok: await M.removeReview(s.slug, String(b.n || '')) });
      // Charge a seller (a USPS charge after a label, say): from money V2V holds for them first, the rest on their card.
      if (what === 'charge') {
        const cents = Math.round(Number(String(b.amount || '').replace(/[^0-9.]/g, '')) * 100);
        if (!(cents > 0 && cents < 100000)) return res.status(400).json({ error: 'Enter the amount to charge.' });
        const note = String(b.note || 'Charge').slice(0, 200);
        const plan = await require('./_ship').payPlan(s, cents);
        let card = 0;
        if (plan.fromCard > 0) {
          if (!plan.card) return res.status(400).json({ error: 'V2V holds ' + usd(plan.held) + ' for this seller and they have no card saved, so only part of it can be taken. Record it as a deduction later, or ask them to add a card.' });
          const r = await stripeBase.call('POST', '/payment_intents', { amount: plan.fromCard, currency: 'usd', customer: plan.card.customer, payment_method: plan.card.pm, confirm: 'true', off_session: 'true', 'payment_method_types[0]': 'card', description: 'V2V charge: ' + note, 'metadata[v2v_charge]': s.slug }, 'charge-' + s.slug + '-' + Date.now());
          if (!r.ok || r.body.status !== 'succeeded') return res.status(400).json({ error: 'Their card was declined, so nothing was taken.' });
          card = plan.fromCard;
        }
        if (plan.fromEarnings > 0) await M.addPayout(s.slug, plan.fromEarnings, 'Taken from earnings', note, 'deduct');
        await mail(s.email, 'V2V charge: $' + usd(cents), ['V2V charged you $' + usd(cents) + ' for: ' + note + '.', plan.fromEarnings ? '$' + usd(plan.fromEarnings) + ' came out of the money V2V was holding for you.' : '', card ? '$' + usd(card) + ' was charged to your ' + plan.card.brand + ' ending ' + plan.card.last4 + '.' : '', '', 'See it in your seller portal: https://' + req.headers.host + '/seller.html'], 'charge-' + s.slug + '-' + cents + '-' + Math.floor(Date.now() / 60000)).catch(() => null);
        return res.json({ ok: true, fromEarnings: plan.fromEarnings, fromCard: card });
      }
      if (what === 'verify') {
        s.verify = b.mode === 'on' || b.mode === 'off' ? b.mode : '';
        await M.save(s);
        return res.json({ ok: true, stats: await M.stats(s) });
      }
      if (what === 'status') {
        if (['approved', 'paused', 'pending'].indexOf(b.status) < 0) return res.status(400).json({ error: 'Pick approve or pause.' });
        const was = s.status;
        s.status = b.status; s.statusAt = Date.now();
        await M.save(s);
        if (was !== 'approved' && s.status === 'approved') {
          await mail(s.email, 'Your JarFriends seller shop is open', ['Good news: your seller shop "' + s.name + '" is approved.', '', 'List your pieces here:', 'https://' + req.headers.host + '/seller.html'], 'seller-ok-' + s.slug + '-' + s.statusAt,
            '<div style="background:#0B1712;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#E6EFE9"><div style="max-width:520px;margin:0 auto"><div style="font-size:13px;letter-spacing:2px;color:#C9A45C">SELLER SHOP</div><h1 style="font-size:24px;margin:8px 0 14px;color:#8FD3AE">You are open for business</h1><p style="font-size:16px;line-height:1.5">Your shop <b>' + esc(s.name) + '</b> is approved. Add your pieces and they show in the JarFriends market right away.</p><p style="margin:18px 0"><a href="https://' + req.headers.host + '/seller.html" style="background:#C9A45C;color:#0B1712;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:24px;display:inline-block">Open my seller portal</a></p></div></div>').catch(() => null);
        }
        return res.json({ ok: true, seller: s });
      }
      const cents = Math.round(Number(String(b.amount || '').replace(/[^0-9.]/g, '')) * 100);
      if (!(cents > 0 && cents < 10000000)) return res.status(400).json({ error: 'Enter the amount you sent.' });
      const p = await M.addPayout(s.slug, cents, b.how, b.note);
      await mail(s.email, 'JarFriends sent you $' + usd(cents), ['We just sent you $' + usd(cents) + (p.how ? ' by ' + p.how : '') + ' for your sales on JarFriends.', p.note ? 'Note: ' + p.note : '', '', 'See every sale and payout in your seller portal:', 'https://' + req.headers.host + '/seller.html'], 'payout-' + s.slug + '-' + p.at).catch(() => null);
      return res.json({ ok: true, payout: p });
    }

    // ---------- Signed in ----------
    // The owner can open any seller's portal from the back office (Sellers tab, "Open their portal").
    let me = '';
    const as = String((req.method === 'POST' ? b.as : q.as) || '');
    let actAs = false;
    if (as && gate.isAdmin(req.method === 'POST' ? b.ak : q.ak)) { const who = await M.bySlug(as); if (who) { me = who.email; actAs = true; } }
    if (!me) me = await signedIn(req.method === 'POST' ? b.t : q.t);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });

    if (what === 'wish') {
      const was = (await store.read(wishKey(me))) || { ids: [] };
      let ids = Array.isArray(was.ids) ? was.ids.slice() : [];
      if (req.method === 'POST') {
        const id = String(b.id || '');
        if (!/^[A-Za-z0-9_-]{1,20}$/.test(id)) return res.status(400).json({ error: 'That piece was not found.' });
        ids = ids.filter((x) => x !== id);
        if (b.on) ids.unshift(id);
        ids = ids.slice(0, 200);
        await store.write(wishKey(me), { ids: ids, at: Date.now() });
      }
      const live = {};
      (await shopItems()).forEach((p) => { live[p.id] = p; });
      const names = {};
      (await edits.apply(PRODUCTS, { all: true })).forEach((p) => { names[p.id] = p; });
      return res.json({ ids: ids, items: ids.map((id) => live[id] || (names[id] ? { id: id, name: names[id].name, price: Number(names[id].price).toFixed(2), left: 0, gone: true, photo: photoOf(names[id]), sellerName: names[id].sellerName || 'JarFriends' } : null)).filter(Boolean) });
    }

    // My completed orders from sellers, with my review of each (if any).
    if (what === 'reviewable') {
      const sellers = {};
      (await M.all()).forEach((x) => { sellers[x.slug] = x; });
      const mine = (await M.ledger(null)).filter((r) => String(r.email || '').toLowerCase() === me && M.completed(r) && sellers[r.seller]);
      const out = await Promise.all(mine.map(async (r) => {
        const rv = await store.read('reviews/' + r.seller + '/' + r.n + '.json');
        return { n: r.n, product: r.product, at: r.at, seller: r.seller, sellerName: sellers[r.seller].name, review: rv ? { stars: rv.stars, text: rv.text || '', reply: rv.reply || '' } : null };
      }));
      return res.json({ orders: out });
    }
    if (what === 'review' && req.method === 'POST') {
      const n = String(b.n || ''), stars = Math.round(Number(b.stars));
      if (!(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'Pick 1 to 5 stars.' });
      const row = (await M.ledger(null)).filter((r) => r.n === n)[0];
      if (!row || String(row.email || '').toLowerCase() !== me) return res.status(404).json({ error: 'That order was not found on your account.' });
      if (!M.completed(row)) return res.status(400).json({ error: 'You can review this order once it has shipped.' });
      const was = (await store.read('reviews/' + row.seller + '/' + n + '.json')) || {};
      const r = Object.assign(was, { n: n, stars: stars, text: String(b.text || '').replace(/\r/g, '').trim().slice(0, 1000), name: M.shortName(row.buyer), product: row.product, at: Date.now() });
      await M.saveReview(row.seller, r);
      return res.json({ ok: true });
    }
    let seller = await M.byEmail(me);
    // The owner's own shops (SEED_SELLERS) open only from the back office or an emailed sign-in link, never from a
    // password sign-in, since anyone could set a password for an email they do not own.
    const verified = actAs || !!gate.emailOf(req.method === 'POST' ? b.t : q.t);
    if (seller && seller.seeded && !verified) return res.status(403).json({ error: 'Open this shop from the V2V back office (Sellers tab, Open their portal).' });
    if (what === 'me') {
      if (!seller) return res.json({ email: me, seller: null, fee: M.feePct(), sections: M.SECTIONS });
      const [rows, outs, all] = await Promise.all([M.ledger(seller.slug), M.payouts(seller.slug), M.listings()]);
      const sold = {};
      rows.forEach((r) => { sold[r.pid] = (sold[r.pid] || 0) + r.q; });
      const listings = all.filter((p) => p.seller === seller.slug).sort((a, b2) => (b2.created || 0) - (a.created || 0))
        .map((p) => Object.assign({}, p, { sold: sold[p.id] || 0, left: Math.max(0, p.stock - (sold[p.id] || 0)), photoUrl: photoOf(p) }));
      // The seller ships their own orders, so they see the ship-to address, but only once the order is paid.
      const orders = rows.map((r) => Object.assign({}, r, r.paid ? {} : { ship: '', email: '' }));
      const myStats = M.statsFrom(seller, rows, await M.reviews(seller.slug));
      const myReviews = (await M.reviews(seller.slug)).map((r) => ({ n: r.n, stars: r.stars, text: r.text || '', name: r.name, product: r.product || '', at: r.at, reply: r.reply || '' }));
      const feed = (await M.posts(seller.slug, 50)).map((x) => Object.assign({}, x, { photoUrl: x.photo ? '/api/photo?id=' + x.id + '&v=' + x.photo : '' }));
      const st = stripeBase.ready() ? await connect.status(seller).catch(() => ({ state: 'unknown' })) : { state: 'off' };
      return res.json({ email: me, seller: seller, fee: M.feePct(), sections: M.SECTIONS, listings: listings, orders: orders, payouts: outs, totals: M.totals(rows, outs), posts: feed, stripe: st, stats: myStats, reviews: myReviews, presets: require('./_ship').PRESETS, labelsOn: require('./_ship').ready() });
    }
    // Offers on my pieces. A pending one carries its answer key (t) for /api/offer: accept, counter or decline.
    if (what === 'offers') {
      if (!seller) return res.status(403).json({ error: 'Open a seller shop first.' });
      const mine = {};
      (await M.listings()).forEach((p) => { if (p.seller === seller.slug) mine[p.id] = p; });
      const { list: ls } = await import('@vercel/blob');
      const r = await ls({ prefix: 'offers/', limit: 1000 });
      const all = (await Promise.all((r.blobs || []).map((x) => store.read(x.pathname)))).filter((o) => o && mine[o.pid]);
      all.sort((a, b2) => (b2.at || 0) - (a.at || 0));
      return res.json({ offers: all.slice(0, 100).map((o) => ({ n: o.n, pid: o.pid, item: o.item, q: o.q, offer: o.offer, list: o.list, buyer: o.buyer, pay: o.pay, status: o.status, at: o.at, until: o.until || 0, counter: o.counter || 0, t: o.status === 'pending' ? o.t : '' })) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

    if (what === 'apply') {
      const r = await M.apply(me, b);
      if (r.error) return res.status(400).json(r);
      const owner = (process.env.OWNER_EMAIL || '').trim();
      if (owner) await mail(owner, 'New seller: ' + r.seller.name + (r.seller.status === 'pending' ? ' (needs your OK)' : ''), ['A new seller signed up on JarFriends.', '', 'Shop: ' + r.seller.name, 'Email: ' + r.seller.email, 'About: ' + (r.seller.about || '-'), 'Pay them by: ' + r.seller.payHow + ' ' + r.seller.payTo, '', r.seller.status === 'pending' ? 'Approve or decline them in the back office, Sellers tab.' : 'They were approved automatically.'], 'seller-new-' + r.seller.slug).catch(() => null);
      return res.json(r);
    }
    if (!seller) return res.status(403).json({ error: 'Open a seller shop first.' });
    if (seller.status === 'paused') return res.status(403).json({ error: 'Your seller shop is paused. Contact JarFriends.' });

    // Automatic card payouts: opens Stripe's own page where the seller links their bank (see _connect.js).
    if (what === 'stripe-setup') {
      if (!stripeBase.ready()) return res.status(503).json({ error: 'Automatic payouts are not switched on for V2V yet.' });
      try { return res.json({ url: await connect.onboardingLink(seller, 'https://' + req.headers.host, actAs ? seller.slug : '') }); }
      catch (e) { console.error('STRIPE_SETUP_FAIL', seller.slug, String(e && e.message || e)); return res.status(502).json({ error: 'Stripe could not open the payout setup just now. Try again in a minute.' }); }
    }
    // The seller answers a review on their shop page.
    if (what === 'reply') {
      const n = String(b.n || ''), r = /^[A-Z0-9]{4,20}$/.test(n) ? await store.read('reviews/' + seller.slug + '/' + n + '.json') : null;
      if (!r) return res.status(404).json({ error: 'That review was not found.' });
      r.reply = String(b.text || '').replace(/\r/g, '').trim().slice(0, 600); r.replyAt = r.reply ? Date.now() : 0;
      await M.saveReview(seller.slug, r);
      return res.json({ ok: true });
    }
    if (what === 'profile') {
      const tidy = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
      if (b.about != null) seller.about = tidy(b.about, 400);
      if (['zelle', 'venmo', 'cashapp', 'paypal'].indexOf(b.payHow) >= 0) seller.payHow = b.payHow;
      if (b.payTo != null && tidy(b.payTo, 80).length >= 3) seller.payTo = tidy(b.payTo, 80);
      // Where packages ship from: needed for calculated shipping and labels.
      if (b.shipFrom && typeof b.shipFrom === 'object') {
        const a = b.shipFrom, f = { name: tidy(a.name, 60), street1: tidy(a.street1, 120), street2: tidy(a.street2, 60), city: tidy(a.city, 60), state: tidy(a.state, 30), zip: tidy(a.zip, 10), phone: tidy(a.phone, 20) };
        if (f.street1 || f.city || f.zip) {
          if (!/[0-9]/.test(f.street1) || !/[A-Za-z]/.test(f.street1)) return res.status(400).json({ error: 'Ship from: enter the street address with its number.' });
          if (f.city.length < 2 || f.state.length < 2) return res.status(400).json({ error: 'Ship from: enter the city and state.' });
          if (!/^[0-9]{5}(-[0-9]{4})?$/.test(f.zip)) return res.status(400).json({ error: 'Ship from: enter a 5-digit ZIP code.' });
          seller.shipFrom = f;
        } else seller.shipFrom = null;
      }
      await M.save(seller);
      return res.json({ ok: true, seller: seller });
    }
    // Shipping labels (see _ship.js): price one, then buy it. Paid from money V2V holds for the seller, the rest by card.
    if (what === 'label-quote') return res.json(await require('./_ship').quoteLabel(seller, String(b.n || ''), { preset: b.preset, oz: b.oz, l: b.l, w: b.w, h: b.h }));
    if (what === 'label-buy') {
      const r = await require('./_ship').buyLabel(seller, String(b.n || ''), String(b.rate || ''), 'https://' + req.headers.host);
      return res.status(r.error ? 400 : 200).json(r);
    }
    if (what === 'listing') {
      const r = await M.saveListing(seller, b);
      return res.status(r.error ? 400 : 200).json(r);
    }
    if (what === 'remove') {
      const id = String(b.id || '');
      if (!M.isSellerPid(id)) return res.status(400).json({ error: 'That listing was not found.' });
      // A piece that has sold stays on record (hidden), so its sales and fees keep their name.
      const rows = await M.ledger(seller.slug);
      if (rows.some((r) => r.pid === id)) { await M.setListing(seller, id, { hidden: true, removed: true }); return res.json({ ok: true, hidden: true }); }
      return res.json({ ok: await M.removeListing(seller, id) });
    }
    if (what === 'photo') {
      const id = String(b.id || '');
      if (!M.isSellerPid(id)) return res.status(400).json({ error: 'Save the listing first, then add its photo.' });
      const buf = Buffer.from(String(b.data || '').replace(/^data:image\/jpeg;base64,/, ''), 'base64');
      if (buf.length < 1000 || buf.length > 1500000 || buf[0] !== 0xFF || buf[1] !== 0xD8) return res.status(400).json({ error: 'That photo could not be used. Try another one.' });
      const was = await store.read('market/' + seller.slug + '/' + id + '.json');
      if (!was || was.seller !== seller.slug) return res.status(404).json({ error: 'That listing was not found.' });
      const { put } = await import('@vercel/blob');
      await put('photos/' + id + '.jpg', buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/jpeg' });
      const p = await M.setListing(seller, id, { photo: Date.now() });
      return res.json({ ok: true, photo: photoOf(p) });
    }
    if (what === 'post') {
      let photo = 0, buf = null;
      if (b.data) {
        buf = Buffer.from(String(b.data).replace(/^data:image\/jpeg;base64,/, ''), 'base64');
        if (buf.length < 1000 || buf.length > 1500000 || buf[0] !== 0xFF || buf[1] !== 0xD8) return res.status(400).json({ error: 'That photo could not be used. Try another one.' });
        photo = Date.now();
      }
      const r = await M.addPost(seller, { text: b.text, pid: b.pid, photo: photo });
      if (r.error) return res.status(400).json(r);
      if (buf) { const { put } = await import('@vercel/blob'); await put('photos/' + r.post.id + '.jpg', buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/jpeg' }); }
      return res.json(r);
    }
    if (what === 'unpost') return res.json({ ok: await M.removePost(seller, b.id) });
    if (what === 'ship') {
      const n = String(b.n || ''), tracking = String(b.tracking || '').replace(/\s+/g, '').slice(0, 40);
      if (!/^[A-Za-z0-9]{8,40}$/.test(tracking)) return res.status(400).json({ error: 'Enter the tracking number.' });
      const row = (await M.ledger(seller.slug)).filter((r) => r.n === n)[0];
      if (!row) return res.status(404).json({ error: 'That order was not found.' });
      if (!row.paid) return res.status(400).json({ error: 'Wait until this order is paid before you ship it.' });
      const was = (await store.read('meta/' + n + '.json')) || {};
      await store.write('meta/' + n + '.json', Object.assign(was, { tracking: tracking, shippedAt: Date.now(), shippedBy: seller.slug }));
      if (row.email) {
        // USPS numbers are all digits (20 to 22 long); other carriers get the number alone.
        const link = /^9\d{19,21}$/.test(tracking) ? 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + tracking : '';
        await mail(row.email, 'Your order ' + n + ' has shipped', ['Your ' + row.product + ' (order ' + n + ') is on its way from ' + seller.name + '.', '', 'Tracking number: ' + tracking].concat(link ? [link] : []).concat(['', 'Once it arrives, rate ' + seller.name + ' in My account: https://' + req.headers.host + '/me.html']), 'seller-ship-' + n).catch(() => null);
      }
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown request.' });
  } catch (e) {
    console.error('MARKET_FAIL', what, String(e && e.stack || e));
    return res.status(503).json({ error: 'Something went wrong. Try again in a moment.' });
  }
};
