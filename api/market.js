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
      const sellers = (await M.all()).filter((s) => s.status === 'approved').map(M.pub);
      const one = q.seller ? sellers.filter((s) => s.slug === String(q.seller))[0] : null;
      if (q.seller === '_house') items = items.filter((p) => !p.seller);
      else if (q.seller) items = one ? items.filter((p) => p.seller === one.slug) : [];
      return res.json({ fee: M.feePct(), products: items, sellers: sellers, seller: one || null, sections: M.SECTIONS });
    }
    // Which seller a piece belongs to, for "Sold by" on checkout.
    if (req.method === 'GET' && what === 'item') {
      const p = (await shopItems()).filter((x) => x.id === String(q.id || ''))[0];
      return p ? res.json({ id: p.id, seller: p.seller, sellerName: p.sellerName }) : res.status(404).json({ error: 'Not found.' });
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
    if (what === 'admin' || what === 'status' || what === 'payout') {
      if (!gate.isAdmin(req.method === 'POST' ? b.ak : q.ak)) return res.status(401).json({ error: 'Sign in to the back office again.' });
      if (req.method === 'GET') {
        const [sellers, rows, outs, listings] = await Promise.all([M.all(), M.ledger(null), M.payouts(null), M.listings()]);
        const list = sellers.map((s) => {
          const mine = rows.filter((r) => r.seller === s.slug), paid = outs.filter((p) => p.seller === s.slug);
          return Object.assign({}, s, { listings: listings.filter((p) => p.seller === s.slug).length, totals: M.totals(mine, paid), payouts: paid });
        });
        const all = M.totals(rows, outs);
        return res.json({ fee: M.feePct(), sellers: list, sales: rows, totals: all });
      }
      const s = await M.bySlug(String(b.slug || ''));
      if (!s) return res.status(404).json({ error: 'That seller was not found.' });
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
      const feed = (await M.posts(seller.slug, 50)).map((x) => Object.assign({}, x, { photoUrl: x.photo ? '/api/photo?id=' + x.id + '&v=' + x.photo : '' }));
      return res.json({ email: me, seller: seller, fee: M.feePct(), sections: M.SECTIONS, listings: listings, orders: orders, payouts: outs, totals: M.totals(rows, outs), posts: feed });
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

    if (what === 'profile') {
      const tidy = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
      if (b.about != null) seller.about = tidy(b.about, 400);
      if (['zelle', 'venmo', 'cashapp', 'paypal'].indexOf(b.payHow) >= 0) seller.payHow = b.payHow;
      if (b.payTo != null && tidy(b.payTo, 80).length >= 3) seller.payTo = tidy(b.payTo, 80);
      await M.save(seller);
      return res.json({ ok: true, seller: seller });
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
        await mail(row.email, 'Your order ' + n + ' has shipped', ['Your ' + row.product + ' (order ' + n + ') is on its way from ' + seller.name + '.', '', 'Tracking number: ' + tracking].concat(link ? [link] : []), 'seller-ship-' + n).catch(() => null);
      }
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown request.' });
  } catch (e) {
    console.error('MARKET_FAIL', what, String(e && e.stack || e));
    return res.status(503).json({ error: 'Something went wrong. Try again in a moment.' });
  }
};
