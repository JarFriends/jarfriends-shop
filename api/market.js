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
const photoHits = new Map();
// The giveaway wallet in cents: GIVEAWAY_PERCENT (2) of every paid sale. Worked out at most once a minute.
let walletMemo = null;
async function walletCents() {
  if (walletMemo && Date.now() - walletMemo.at < 60000) return walletMemo.v;
  // The wallet was set to $30.00 on Oct 27 2026 (3:31 PM Chicago). From then on, each paid sale adds its 2% on top.
  // It only ever goes up: a cancelled label, refund or edited order never takes money back out of it.
  const BASE = 3000, SINCE = 1793133000000;
  const live = BASE + Math.round((await M.ledger(null)).filter((r) => r.paid && (r.at || 0) >= SINCE).reduce((t, r) => t + (r.items || 0), 0) * M.giveawayPct() / 100);
  const fl = (await store.read('settings/wallet-floor-2.json').catch(() => null)) || { v: BASE };
  const v = Math.max(live, fl.v || 0);
  if (v > (fl.v || 0)) await store.write('settings/wallet-floor-2.json', { v: v, at: Date.now() }).catch(() => null);
  walletMemo = { at: Date.now(), v: v };
  return v;
}
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
    return { id: p.id, name: p.name, price: Number(p.price).toFixed(2), left: left, ship: free ? '0.00' : Number(p.shipping).toFixed(2), calc: p.shipMode === 'calc', returns: p.returns || 'no', section: p.section || '', desc: p.desc || '',
      photo: photoOf(p), seller: p.seller || '', sellerName: p.sellerName || 'JarFriends', auction: p.auction && p.auction.ends ? { ends: Date.parse(p.auction.ends) || 0, start: Number(p.auction.start) || 0 } : null, nft: !!(p.nft && p.nft !== 'no') || !!(p.seller && M.sectionOf(p) === 'NFTs'), added: p.created || p.updated || 0, party: p.party && p.party.ends > Date.now() ? { ends: p.party.ends, top: Math.max.apply(null, p.party.tiers.map((t) => t[1])) } : null };
  });
}

// Only a confirmed sign-in (Google, or an email and password whose email was confirmed with a code).
async function signedIn(t) { return gate.emailOf(t); }

// What happened to an offer, oldest first: [{ kind: offer|auto|accepted|countered|declined|expired, at, c }].
function offerEvents(o) {
  const ev = [{ kind: o.status === 'auto' ? 'auto' : 'offer', at: o.at || 0, c: o.offer }];
  const hist = (o.hist || []).filter((h) => h.s !== 'pending' && h.s !== 'auto');
  if (hist.length) hist.forEach((h) => ev.push({ kind: h.s, at: h.at, c: h.c || 0 }));
  else if (o.status && o.status !== 'pending' && o.status !== 'auto') ev.push({ kind: o.status, at: o.statusAt || o.at || 0, c: o.counter || 0 });
  return ev;
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  require('./_ai').take(req);
  const q = req.query || {};
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const what = String(req.method === 'POST' ? b.do : q.do || '');
  if (!store.on()) return res.status(503).json({ error: 'The shop storage is not connected yet.' });
  try {
    // ---------- Anyone ----------
    // A seller's short link, veefam.io/s/<shop>: a small page with the shop's name, blurb and a photo for social
    // previews (Facebook, X, iMessage and the rest read these tags), which then opens the shop page.
    // Public: the exact sales tax for a ship-to address at checkout (only where VeeFam collects; see _tax.js quote).
    // Public: how many shoppers have each piece in their cart or an offer out (counts only; see _buzz.js).
    if (req.method === 'GET' && what === 'buzz') { res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60'); return res.json({ buzz: await require('./_buzz').counts().catch(() => ({})) }); }
    if (req.method === 'POST' && what === 'cart-ping') return res.json(await require('./_buzz').ping(b.id, b.dev, !!b.on).catch(() => ({ ok: false })));
    if (req.method === 'GET' && what === 'tax-quote') {
      const q = req.query || {}, T = require('./_tax');
      const r = await T.quote({ state: String(q.st || '').slice(0, 30), zip: String(q.zip || '').slice(0, 10), city: String(q.city || '').slice(0, 60), street: String(q.street || '').slice(0, 120), pid: String(q.pid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20), base: Math.min(Number(q.base) || 0, 10000000), ship: Math.min(Number(q.ship) || 0, 1000000) }).catch(() => ({ rate: 0, tax: 0 }));
      return res.json(r);
    }
    if (req.method === 'GET' && what === 'share') {
      const sl = String(q.s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
      const s = sl && (await M.bySlug(sl));
      const host = 'https://' + req.headers.host, to = s && s.status === 'approved' ? '/shop.html?s=' + encodeURIComponent(sl) : '/';
      const live = s ? (await M.listings()).filter((p) => p.seller === sl && !p.removed && !p.hidden && p.photo) : [];
      const img = live[0] ? host + '/api/photo?id=' + encodeURIComponent(live[0].id) + '&v=' + live[0].photo : '';
      const title = s ? s.name + ' on VeeFam' : 'VeeFam', desc = s ? (String(s.about || s.bio || '').trim().slice(0, 180) || 'Shop ' + s.name + '\u2019s VeeFriends collectibles on VeeFam: buy now, bid, and watch live shows.') : 'A unique community needs a 1 of a kind marketplace.';
      res.setHeader('content-type', 'text/html; charset=utf-8'); res.setHeader('cache-control', 'public, max-age=300');
      return res.status(200).send('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>'
        + '<meta property="og:type" content="website"><meta property="og:site_name" content="VeeFam"><meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(desc) + '"><meta property="og:url" content="' + esc(host + '/s/' + sl) + '">'
        + (img ? '<meta property="og:image" content="' + esc(img) + '"><meta name="twitter:image" content="' + esc(img) + '">' : '') + '<meta name="twitter:card" content="' + (img ? 'summary_large_image' : 'summary') + '"><meta name="twitter:title" content="' + esc(title) + '"><meta name="twitter:description" content="' + esc(desc) + '">'
        + '<meta http-equiv="refresh" content="0;url=' + esc(to) + '"><script>location.replace(' + JSON.stringify(to) + ')</script></head><body style="background:#0B1A13;color:#F7F2E6;font-family:sans-serif;padding:24px"><a style="color:#C9A45C" href="' + esc(to) + '">Open ' + esc(title) + '</a></body></html>');
    }
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
      const wallet = await walletCents();
      return res.json({ fee: M.feePct(), products: items, sellers: sellers, seller: one || null, sections: M.SECTIONS, wallet: wallet, giveaway: M.giveawayPct() });
    }
    // Which seller a piece belongs to, for "Sold by" on checkout.
    if (req.method === 'GET' && what === 'item') {
      const p = (await shopItems()).filter((x) => x.id === String(q.id || ''))[0];
      if (!p) return res.status(404).json({ error: 'Not found.' });
      const s = p.seller ? await M.bySlug(p.seller) : null, st = s ? await M.stats(s) : null;
      return res.json({ party: !!p.party, id: p.id, name: p.name, price: p.price, ship: p.ship, calc: !!p.calc, returns: p.returns || 'no', left: p.left, photo: p.photo, desc: p.desc || '', auction: p.auction, nft: p.nft, section: p.section || '', seller: p.seller, sellerName: p.sellerName, rating: st ? st.rating : 0, reviews: st ? st.reviews : 0, verified: st ? st.verified : false });
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
      const recent = (await store.sales()).sort((a, b) => b.at - a.at).slice(0, 600);
      const rows = (await Promise.all(recent.map(async (s) => {
        const d = (await store.read(s.path)) || {};
        if (/^(Test|Deal) Piece/.test(d.product || '')) return null;
        // Only pieces that are paid for: an order still waiting for its by-hand payment is not sold yet.
        if (/payment due/i.test(d.status || '')) { const m = (await store.read('meta/' + s.n + '.json')) || {}; if (!(m.paidAt || m.shippedAt || m.labelPdf)) return null; }
        const p = names[s.pid] || {};
        const each = Math.round(Number(String(d.items || '').replace(/[^0-9.]/g, '')) * 100 / Math.max(1, s.q));
        const nm = p.name || d.product || 'A piece';
        return { id: s.pid, name: nm, q: s.q, each: each > 0 ? usd(each) : '', at: s.at, photo: photoOf(p), seller: p.sellerName || 'JarFriends', slug: p.seller || '', section: M.sectionOf({ name: nm, desc: p.desc, section: p.section, nft: p.nft, jfid: p.jfid, sectionSet: p.sectionSet }) };
      }))).filter(Boolean);
      return res.json({ sold: rows });
    }

    // The help bubble on every page: a visitor writes what they need and it is emailed to the owner straight away.
    // Subscribe: an email address joins the news list (back office > Emails > Send an email to members).
    if ((what === 'ask' || what === 'subscribe') && req.method === 'POST') {
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x', now = Date.now(), k = what + '|' + ip;
      const seen = (photoHits.get(k) || []).filter((t) => now - t < 3600000);
      if (seen.length >= 8) return res.status(429).json({ error: 'That is a lot of messages. Try again in a little while.' });
      seen.push(now); photoHits.set(k, seen);
      if (String(b.website || '')) return res.json({ ok: true });
      const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(email)) return res.status(400).json({ error: 'Enter your email so we can reach you.' });
      const crypto3 = require('crypto'), hh = crypto3.createHash('sha1').update(email).digest('hex').slice(0, 20);
      if (what === 'subscribe') {
        await store.write('subs/' + hh + '.json', { email: email, at: now });
        const un = await store.read('unsub/' + hh + '.json');
        if (un && un.at) await store.write('unsub/' + hh + '.json', Object.assign(un, { back: now }));
        return res.json({ ok: true });
      }
      const text = String(b.text || '').replace(/\r/g, '').trim().slice(0, 3000), page = String(b.page || '').slice(0, 200);
      if (text.length < 3) return res.status(400).json({ error: 'Write what you need help with.' });
      const owner = (process.env.OWNER_EMAIL || '').trim();
      if (!owner) return res.status(503).json({ error: 'Help is not set up yet. Email jarvisfriends@gmail.com instead.' });
      const out = await mail(owner, 'Help request from ' + email, ['From: ' + email, page ? 'Page: ' + page : '', '', text, '', 'Reply to ' + email + ' to answer.'].filter((x, i) => x || i > 1), 'ask-' + crypto3.createHash('sha1').update(email + '|' + text).digest('hex').slice(0, 20)).catch(() => 'failed');
      if (out !== 'sent' && out !== 'duplicate') return res.status(502).json({ error: 'Could not send just now. Email jarvisfriends@gmail.com instead.' });
      return res.json({ ok: true });
    }
    // A quick check that AI is reachable (through Vercel AI Gateway): answers { ok } and nothing else. A few an hour.
    if (what === 'ai-check') {
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x', now = Date.now(), k = 'aic|' + ip;
      const seen = (photoHits.get(k) || []).filter((t) => now - t < 3600000);
      if (seen.length >= 5) return res.status(429).json({ error: 'Try again later.' });
      seen.push(now); photoHits.set(k, seen);
      const A = require('./_ai');
      if (!A.on()) return res.json({ ok: false, why: 'off' });
      const r = await fetch(A.url(), { method: 'POST', signal: AbortSignal.timeout(20000), headers: A.headers(), body: JSON.stringify({ model: A.model(), max_tokens: 5, messages: [{ role: 'user', content: 'Reply with the word OK.' }] }) }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
      if (!r.ok) { const t = (await r.text()).slice(0, 300); console.error('AI_CHECK_FAIL', r.status, t); return res.json({ ok: false, status: r.status, why: t.replace(/sk-[A-Za-z0-9_-]+/g, '') }); }
      return res.json({ ok: true, via: A.url().indexOf('vercel') > 0 ? 'Vercel AI Gateway' : 'Anthropic', model: A.model() });
    }
    // Live shows (see _live.js): which are on, and one show as a viewer sees it (polled every couple of seconds).
    // Party pricing on a seller's piece (see _partyS.js): where it stands, and the price and checkout key for q units.
    if (what === 'party') { const P2 = require('./_partyS'), pc = await P2.piece(String(q.id || '')); return pc ? res.json(await P2.state(pc)) : res.status(404).json({ error: 'This piece is not in a party.' }); }
    if (what === 'party-quote') { const r = await require('./_partyS').quote(String(q.id || ''), q.q); return res.status(r.error ? 400 : 200).json(r); }
    if (what === 'live') return res.json({ shows: await require('./_live').list() });
    if (what === 'clips') return res.json({ clips: await require('./_live').clips(String(q.s || '').toLowerCase().slice(0, 30)) });
    // One clip's video, with byte ranges so phones (Safari) can play and seek it.
    if (what === 'clip-file') {
      const f = await require('./_live').clipFile(String(q.id || ''), String(q.k || ''));
      if (!f) return res.status(404).send('Not found');
      res.setHeader('Content-Type', f.type); res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Cache-Control', 'public, max-age=86400');
      const m = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range || ''));
      if (m) {
        const total = f.buf.length, start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2] || 0)), end = m[1] && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
        if (start >= total || start > end) { res.setHeader('Content-Range', 'bytes */' + total); return res.status(416).end(); }
        res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + total); res.setHeader('Content-Length', String(end - start + 1));
        return res.status(206).send(f.buf.subarray(start, end + 1));
      }
      res.setHeader('Content-Length', String(f.buf.length));
      return res.status(200).send(f.buf);
    }
    if (what === 'show-token') { const r = await require('./_live').watchToken(String(q.s || '').toLowerCase().slice(0, 30)); return res.status(r.error ? 400 : 200).json(r); }
    if (what === 'show' && req.method === 'GET') {
      const v = await require('./_live').view(String(q.s || '').toLowerCase().slice(0, 30), q.t ? gate.emailOf(String(q.t)) : '');
      return v ? res.json(v) : res.status(404).json({ error: 'That show was not found.' });
    }
    // The owner's own pages (/p/<address>) and the menu links to them (see _pages.js).
    if (what === 'pages-menu') { res.setHeader('cache-control', 'public, max-age=0, s-maxage=20'); return res.json(await require('./_pages').menu()); }
    if (what === 'page' && req.method === 'GET') { const pg = await require('./_pages').one(String(q.slug || ''), gate.isAdmin(q.ak)); return pg ? res.json({ page: pg }) : res.status(404).json({ error: 'This page was not found.' }); }
    // The owner's own wording for the site's pages (see _wording.js); nav.js swaps the words on every page.
    if (what === 'wording' && req.method === 'GET') { res.setHeader('cache-control', 'public, max-age=0, s-maxage=20'); return res.json({ rules: (await require('./_wording').get()).rules }); }
    // ---------- The owner ----------
    if (what === 'tax-get' || what === 'tax-save' || what === 'discord-test' || what === 'subs-import' || what === 'pages' || what === 'page-save' || what === 'page-delete' || what === 'page-off' || what === 'wording-save' || what === 'site-photo' || what === 'broadcast' || what === 'broadcast-count' || what === 'broadcasts' || what === 'admin' || what === 'status' || what === 'payout' || what === 'issue' || what === 'review-remove' || what === 'verify' || what === 'charge' || what === 'stripe-transfer' || what === 'backup' || what === 'fee-paid' || what === 'import' || what === 'emails' || what === 'email-save' || what === 'email-ai' || what === 'email-test' || what === 'giveaway-round' || what === 'bank' || what === 'ebay-ok') {
      if (!gate.isAdmin(req.method === 'POST' ? b.ak : q.ak)) return res.status(401).json({ error: 'Sign in to the back office again.' });
      // Confirm (or un-confirm) that a seller's eBay user name is really theirs, so they can bring all their listings over.
      if (what === 'ebay-ok' && req.method === 'POST') { const s2 = await M.bySlug(String(b.slug || '')); if (!s2) return res.status(404).json({ error: 'That seller was not found.' }); s2.ebayOk = !!b.on; await M.save(s2); return res.json({ ok: true }); }
      // The full bank details of one seller, to send them a payout by hand.
      if (what === 'bank' && req.method === 'POST') { const s = await M.bySlug(String(b.slug || '')); const k = s && M.bankOf(s); return k ? res.json({ bank: k }) : res.status(404).json({ error: 'This seller has no bank account on file.' }); }
      // Emails the owner writes to members (see _broadcast.js), and a picture for the site or an email.
      if (what === 'pages') { const P = require('./_pages'), a = await P.all(); return res.json({ pages: a.pages, off: a.off, optional: P.OPTIONAL }); }
      if (what === 'page-save' && req.method === 'POST') { const r = await require('./_pages').save(b); return res.status(r.error ? 400 : 200).json(r); }
      if (what === 'page-delete' && req.method === 'POST') return res.json(await require('./_pages').remove(String(b.slug || '')));
      if (what === 'page-off' && req.method === 'POST') { const r = await require('./_pages').setOff(String(b.path || ''), !!b.off); return res.status(r.error ? 400 : 200).json(r); }
      // Bring the JarFriends news list over as VeeFam subscribers (people who unsubscribed on either site are skipped).
      if (what === 'subs-import' && req.method === 'POST') {
        const key = (process.env.SUBS_EXPORT_KEY || '').trim(), src = String(process.env.JARFRIENDS_URL || 'https://jar' + 'friends.com').replace(/\/+$/, '');
        if (!key) return res.status(503).json({ error: 'The subscriber move is not switched on yet (SUBS_EXPORT_KEY).' });
        let list = [];
        try { const r2 = await fetch(src + '/api/admin?subsx=' + encodeURIComponent(key), { signal: AbortSignal.timeout(30000) }); const j = await r2.json(); if (!r2.ok) throw new Error(j.error || r2.status); list = j.subscribers || []; }
        catch (e) { return res.status(502).json({ error: 'Could not read the JarFriends list: ' + String(e && e.message || e).slice(0, 120) }); }
        const crypto4 = require('crypto'); let added = 0, had = 0, skipped = 0;
        for (const x of list) {
          const e = String(x.email || '').trim().toLowerCase(); if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(e)) continue;
          const hh = crypto4.createHash('sha1').update(e).digest('hex').slice(0, 20);
          const un = await store.read('unsub/' + hh + '.json'); if (un && un.at && !(un.back > un.at)) { skipped++; continue; }
          if (await store.read('subs/' + hh + '.json')) { had++; continue; }
          await store.write('subs/' + hh + '.json', { email: e, name: String(x.name || '').slice(0, 80), at: Date.now(), from: 'jarfriends' }); added++;
        }
        return res.json({ ok: true, total: list.length, added: added, already: had, skipped: skipped });
      }
      if (what === 'broadcast-count') return res.json(await require('./_broadcast').count(String(q.aud || '')));
      if (what === 'broadcasts') return res.json({ sent: await require('./_broadcast').history() });
      if (what === 'broadcast' && req.method === 'POST') { const r = await require('./_broadcast').send(b, process.env.OWNER_EMAIL); return res.status(r.error ? 400 : 200).json(r); }
      if (what === 'site-photo' && req.method === 'POST') {
        const buf = Buffer.from(String(b.data || '').replace(/^data:image\/jpeg;base64,/, ''), 'base64');
        if (buf.length < 1000 || buf.length > 3000000 || buf[0] !== 0xFF || buf[1] !== 0xD8) return res.status(400).json({ error: 'That picture could not be used. Try another one.' });
        const id = 'site' + Date.now().toString(36);
        const { put } = await import('@vercel/blob');
        await put('photos/' + id + '.jpg', buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/jpeg' });
        return res.json({ ok: true, url: '/api/photo?id=' + id });
      }
      if (what === 'wording-save' && req.method === 'POST') { const r = await require('./_wording').save(b.rules); return res.status(r.error ? 400 : 200).json(r); }
      // A test message to each Discord channel, written like a real order and a real new seller.
      if (what === 'discord-test' && req.method === 'POST') {
        const D = require('./_discord'), host = 'https://' + req.headers.host;
        const o = await D('**ORDER** $25.00 · TEST Zombie card x 1\nTest Buyer · paying by Card · order TEST123\n(This is a test message from the VeeFam back office.)');
        const s2 = await D('**NEW SELLER** Test Shop (open)\ntest@example.com\n(This is a test message from the VeeFam back office.)\n' + host + '/s/test-shop', 'sellers');
        return res.json({ orders: o, sellers: s2 });
      }
      // Sales tax: the states where VeeFam collects, and the rate for each (see _tax.js).
      if (what === 'tax-get') { const T = require('./_tax'); return res.json(Object.assign({ states: T.STATES, avg: T.AVG, track: await T.tracker().catch((e) => { console.error('TAX_TRACK_FAIL', String(e && e.message || e)); return []; }) }, await T.get())); }
      // Backups (see _backup.js): list them, make one now, or download one (the whole file).
      if (what === 'backup') {
        const B = require('./_backup');
        if (req.method === 'POST') return res.json(await B.snapshot());
        if (q.day) { const day = String(q.day).replace(/[^0-9-]/g, '').slice(0, 10); const { get } = await import('@vercel/blob'); const g = await get('backups/' + day + '.json', { access: 'private', useCache: false }).catch(() => null);
          if (!g || g.statusCode !== 200) return res.status(404).json({ error: 'That backup was not found.' });
          res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Disposition', 'attachment; filename="veefam-backup-' + day + '.json"'); return res.end(await new Response(g.stream).text()); }
        return res.json({ backups: await B.latest() });
      }
      if (what === 'tax-save' && req.method === 'POST') { const r = await require('./_tax').save(b.rates); return res.status(r.error ? 400 : 200).json(r); }
      if (what === 'giveaway-round') { const r = await require('./_giveaway').setRound(String(b.action || '')); return res.status(r.error ? 400 : 200).json(r); }
      // The Emails tab: every automatic email, which are off, and the owner's own words in them (see _emails.js).
      if (what === 'emails' || what === 'email-save' || what === 'email-ai' || what === 'email-test') {
        const E = require('./_emails');
        if (req.method === 'GET') return res.json(await E.list());
        const r = what === 'email-save' ? await E.save(String(b.id || ''), b) : what === 'email-ai' ? await E.polish(b.text, b.how, b.about) : await E.test(String(b.id || ''));
        return res.status(r.error ? 400 : 200).json(r);
      }
      if (req.method === 'GET') {
        const [sellers, rows, outs, listings] = await Promise.all([M.all(), M.ledger(null), M.payouts(null), M.listings()]);
        // Sellers part-way through Stripe setup: check again, so card sales start going to them once Stripe says yes.
        if (stripeBase.ready()) await Promise.all(sellers.filter((x) => x.stripe && !x.stripeOn).map((x) => connect.status(x).catch(() => null)));
        const list = sellers.map((s) => {
          const mine = rows.filter((r) => r.seller === s.slug), paid = outs.filter((p) => p.seller === s.slug);
          return Object.assign(M.safe(s), { listings: listings.filter((p) => p.seller === s.slug).length, totals: M.totals(mine, paid), payouts: paid });
        });
        const all = M.totals(rows, outs);
        const st = await M.statsAll(sellers);
        await Promise.all(list.map(async (x) => { x.stats = st[x.slug]; x.reviewList = (await M.reviews(x.slug)).map((r) => ({ n: r.n, stars: r.stars, text: r.text || '', name: r.name, product: r.product || '', at: r.at })); }));
        all.wallet = Math.round(rows.filter((r) => r.paid).reduce((t, r) => t + (r.items || 0), 0) * M.giveawayPct() / 100);
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
      // Pay a seller what is ready for them (sales paid to you by Zelle, crypto and so on) straight into their
      // Stripe, from your own Stripe balance: a Stripe transfer, then Stripe pays their bank on their schedule.
      // Recorded as a payout like one sent by hand. Needs that much available in your Stripe balance.
      // The seller paid you the fees on their direct sales (Zelle and so on): record it.
      if (what === 'fee-paid') {
        const cents = Math.round(Number(String(b.amount || '').replace(/[^0-9.]/g, '')) * 100);
        if (!(cents > 0 && cents < 10000000)) return res.status(400).json({ error: 'Enter the amount they paid.' });
        return res.json({ ok: true, payout: await M.addPayout(s.slug, cents, String(b.how || 'By hand').slice(0, 30), 'Fees paid to VeeFam', 'fee') });
      }
      if (what === 'stripe-transfer') {
        if (!stripeBase.ready()) return res.status(503).json({ error: 'Stripe is not connected.' });
        if (!s.stripe || !s.stripeOn) return res.status(400).json({ error: s.name + ' has not finished setting up Stripe payouts, so pay them by hand.' });
        const t = M.totals(await M.ledger(s.slug), await M.payouts(s.slug));
        const want = Math.round(Number(String(b.amount || '').replace(/[^0-9.]/g, '')) * 100) || t.payNow;
        const cents = Math.min(want, t.payNow);
        if (!(cents >= 50)) return res.status(400).json({ error: 'Nothing is ready to pay ' + s.name + ' right now.' });
        const bal = await connect.call('GET', '/balance');
        const avail = bal.ok ? ((bal.body.available || []).filter((x) => x.currency === 'usd')[0] || {}).amount || 0 : 0;
        if (avail < cents) return res.status(400).json({ error: 'Your Stripe balance has ' + usd(avail) + ' available, and this payout is ' + usd(cents) + '. Card fees you earn land there over time; or add funds to your Stripe balance (Stripe Dashboard, Balances, Add funds), then try again.' });
        const tr = await connect.call('POST', '/transfers', { amount: cents, currency: 'usd', destination: s.stripe, description: 'V2V payout to ' + s.name, 'metadata[v2v_payout]': s.slug }, 'v2v-po-' + s.slug + '-' + cents + '-' + Math.floor(Date.now() / 600000));
        if (!tr.ok) { const msg = (tr.body && tr.body.error && tr.body.error.message) || ''; console.error('STRIPE_TRANSFER_FAIL', s.slug, tr.status, msg.slice(0, 200)); return res.status(400).json({ error: 'Stripe did not send it: ' + (msg || 'try again in a minute.') }); }
        const p = await M.addPayout(s.slug, cents, 'Stripe', 'Stripe transfer ' + tr.body.id);
        await mail(s.email, 'VeeFam sent you $' + usd(cents), ['We just sent $' + usd(cents) + ' to your Stripe account for your sales on VeeFam.', 'Stripe pays it to your bank on your usual payout schedule.', '', 'See every sale and payout in Seller Hub:', 'https://' + req.headers.host + '/seller.html'], 'po-stripe-' + tr.body.id).catch(() => null);
        return res.json({ ok: true, payout: p, transfer: tr.body.id });
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
        if (b.status === 'paused') s.pauseReason = String(b.reason || '').trim().slice(0, 800); else delete s.pauseReason;
        await M.save(s);
        if (b.status === 'paused' && was !== 'paused') await mail(s.email, 'Your V2V seller shop is paused', ['Your seller shop "' + s.name + '" on V2V is paused for now, so your pieces are not showing.', '', s.pauseReason ? 'Why: ' + s.pauseReason : 'V2V will be in touch about why.', '', 'To get your shop re-opened, DM us on X: https://x.com/' + (process.env.X_HANDLE || 'JarFriends').replace(/^@/, '') + ' (or just reply to this email).', '', 'Your Seller Hub: https://' + req.headers.host + '/seller.html'], 'seller-pause-' + s.slug + '-' + s.statusAt).catch(() => null);
        if (was !== 'approved' && s.status === 'approved') {
          await mail(s.email, 'Your JarFriends seller shop is open', ['Good news: your seller shop "' + s.name + '" is approved.', '', 'List your pieces here:', 'https://' + req.headers.host + '/seller.html'], 'seller-ok-' + s.slug + '-' + s.statusAt,
            '<div style="background:#0B1712;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#E6EFE9"><div style="max-width:520px;margin:0 auto"><div style="font-size:13px;letter-spacing:2px;color:#C9A45C">SELLER SHOP</div><h1 style="font-size:24px;margin:8px 0 14px;color:#8FD3AE">You are open for business</h1><p style="font-size:16px;line-height:1.5">Your shop <b>' + esc(s.name) + '</b> is approved. Add your pieces and they show in the JarFriends market right away.</p><p style="margin:18px 0"><a href="https://' + req.headers.host + '/seller.html" style="background:#C9A45C;color:#0B1712;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:24px;display:inline-block">Open my seller portal</a></p></div></div>').catch(() => null);
        }
        return res.json({ ok: true, seller: M.safe(s) });
      }
      const cents = Math.round(Number(String(b.amount || '').replace(/[^0-9.]/g, '')) * 100);
      if (!(cents > 0 && cents < 10000000)) return res.status(400).json({ error: 'Enter the amount you sent.' });
      const p = await M.addPayout(s.slug, cents, b.how, b.note);
      await mail(s.email, 'JarFriends sent you $' + usd(cents), ['We just sent you $' + usd(cents) + (p.how ? ' by ' + p.how : '') + ' for your sales on JarFriends.', p.note ? 'Note: ' + p.note : '', '', 'See every sale and payout in your seller portal:', 'https://' + req.headers.host + '/seller.html'], 'payout-' + s.slug + '-' + p.at).catch(() => null);
      return res.json({ ok: true, payout: p });
    }

    // ---------- The community giveaway (public): the wallet, the vote and, when signed in, your own vote ----------
    // TEMPORARY wallet check (counts only, no names): removed after checking.
    if (req.method === 'GET' && what === 'giveaway') {
      const G = require('./_giveaway');
      const out = Object.assign({ wallet: await walletCents(), pct: M.giveawayPct(), fee: M.feePct() }, await G.results());
      const who = q.t ? await signedIn(q.t) : '';
      if (who) out.me = await G.mine(who);
      return res.json(out);
    }
    // ---------- A view of a seller's piece (public), for the Traffic card in the Seller Hub ----------
    // views/<seller>/<day>.json { <piece id>: views }. The page sends this once per piece per visit.
    if (what === 'view') {
      const id = String(q.id || b.id || '');
      if (!M.isSellerPid(id)) return res.json({ ok: false });
      const l = (await M.listings()).filter((p) => p.id === id)[0];
      if (!l) return res.json({ ok: false });
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      const k = 'views/' + l.seller + '/' + day + '.json';
      const v = (await store.read(k)) || {};
      v[id] = (v[id] || 0) + 1;
      await store.write(k, v).catch(() => null);
      return res.json({ ok: true });
    }
    // A quick look at an eBay listing (public, read-only): what would come over. Limited per visitor.
    if (req.method === 'GET' && what === 'ebay-peek') {
      const ip = 'E' + (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x');
      const now = Date.now(), seen = (photoHits.get(ip) || []).filter((t) => now - t < 3600000);
      if (seen.length >= 20) return res.status(429).json({ error: 'Too many look-ups. Try again later.' });
      seen.push(now); photoHits.set(ip, seen);
      const E = require('./_ebay'), id = E.idOf(String(q.url || q.id || ''));
      if (!id) return res.status(400).json({ error: 'Not an eBay listing link.' });
      const e = await E.read(id).catch((x) => ({ error: String(x && x.message || x) }));
      return res.json({ id: id, via: E.apiOn() ? 'api' : 'page', error: e.error || '', live: e.live, title: e.title || '', price: e.price || 0, ship: e.ship, auction: !!e.auction, image: !!e.image, desc: (e.desc || '').slice(0, 160) });
    }
    // ---------- Search by photo (public) ----------
    // A buyer's photo goes to AI with the list of pieces for sale; it answers what the photo shows and which pieces
    // match. Uses AI (see _ai.js). Limited to 12 searches an hour for each visitor, since each one costs money.
    if (what === 'photo-search' && req.method === 'POST') {
      if (!require('./_ai').on()) return res.status(503).json({ error: 'Photo search is not switched on yet.' });
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
      const now = Date.now(), seen = (photoHits.get(ip) || []).filter((t) => now - t < 3600000);
      if (seen.length >= 12) return res.status(429).json({ error: 'That is a lot of photo searches. Try again in a little while, or type what you are looking for.' });
      seen.push(now); photoHits.set(ip, seen); if (photoHits.size > 5000) photoHits.clear();
      const data = String(b.data || '').replace(/^data:image\/jpeg;base64,/, '');
      if (data.length < 1000 || data.length > 2000000) return res.status(400).json({ error: 'That photo could not be used. Try another one.' });
      const items = (await shopItems()).filter((p) => p.left > 0 || p.auction).slice(0, 400);
      const list = items.map((p) => p.id + ': ' + p.name + (p.section ? ' [' + p.section + ']' : '')).join('\n');
      const r = await fetch(require('./_ai').url(), {
        method: 'POST', signal: AbortSignal.timeout(25000),
        headers: require('./_ai').headers(),
        body: JSON.stringify({ model: require('./_ai').model(), max_tokens: 400,
          system: 'You help shoppers on a marketplace for VeeFriends collectibles (cards, graded slabs, comics, pins, stickers, toys and more). Look at the shopper\'s photo and find matching pieces in the list. Reply with JSON only: {"what": "a short plain description of the item in the photo, under 8 words, good as search words", "ids": ["up to 8 ids from the list that are the same item or very close, best match first"]}. Use only ids from the list. If nothing is close, use an empty ids list.',
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: data } }, { type: 'text', text: 'Pieces for sale:\n' + (list || '(none)') }] }] })
      }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
      if (!r.ok) { console.error('PHOTO_SEARCH_FAIL', r.status, (await r.text()).slice(0, 300)); return res.status(503).json({ error: 'Photo search is not working right now. Type what you are looking for instead.' }); }
      const j = await r.json();
      const txt = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      let out = {};
      try { out = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); } catch (e) { out = {}; }
      const have = {}; items.forEach((p) => { have[p.id] = true; });
      return res.json({ what: String(out.what || '').slice(0, 80), ids: (Array.isArray(out.ids) ? out.ids : []).map(String).filter((x) => have[x]).slice(0, 8) });
    }
    // ---------- Signed in ----------
    // The owner can open any seller's portal from the back office (Sellers tab, "Open their portal").
    let me = '';
    const as = String((req.method === 'POST' ? b.as : q.as) || '');
    let actAs = false;
    if (as && gate.isAdmin(req.method === 'POST' ? b.ak : q.ak)) { const who = await M.bySlug(as); if (who) { me = who.email; actAs = true; } }
    if (!me) me = await signedIn(req.method === 'POST' ? b.t : q.t);
    if (!me) return res.status(401).json({ error: 'Sign in first.' });
    // ---------- Shopping cart: place one order per piece in a single step ----------
    // Each piece goes through the normal checkout (api/order.js: stock, shipping, card fee, tax, emails), so every
    // order is the same as one placed on its own. Card orders are then paid one by one with the buyer's saved card
    // (api/me.js quickpay); Zelle, Venmo and Cash App orders are paid in one go and the owner marks them paid.
    if (what === 'cart-place' && req.method === 'POST' && !actAs) {
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 25);
      if (!items.length) return res.status(400).json({ error: 'Your cart is empty.' });
      const method = ['card', 'zelle', 'venmo', 'cashapp', 'crypto'].indexOf(b.method) >= 0 ? b.method : '';
      if (!method) return res.status(400).json({ error: 'Pick a way to pay.' });
      const a = b.ship || {}, place = require('./order'), out = [];
      // Combined shipping: pieces are grouped by shop; in each group the piece with the highest shipping pays it,
      // and the shop's other pieces ship in the same box for free (see patchmarket.js, req.v2vBundle).
      const known = {}; (await shopItems()).forEach((p) => { known[p.id] = p; });
      const shipOf = (it) => Number((known[String(it.id)] || {}).ship) || 0, shopOf = (it) => (known[String(it.id)] || {}).seller || '_house';
      items.sort((x, y) => (shopOf(x) < shopOf(y) ? -1 : shopOf(x) > shopOf(y) ? 1 : shipOf(y) - shipOf(x)));
      const leadOf = {};
      for (const it of items) {
        const body = { t: b.t, product: String(it.id || '').slice(0, 20), qty: Math.max(1, Math.floor(Number(it.qty) || 1)), method: method, name: a.name, street: a.street, line2: a.line2, city: a.city, state: a.state, zip: a.zip, wallet: a.wallet, wallet2: a.wallet2, walletRisk: a.walletRisk };
        const got = await new Promise((done) => {
          const fake = { _c: 200, setHeader() {}, status(c) { this._c = c; return this; }, json(j) { done({ code: this._c, body: j }); return this; }, send(x) { done({ code: this._c, body: { error: String(x) } }); return this; }, end() { done({ code: this._c, body: {} }); return this; } };
          const shop = shopOf(it), mate = !!leadOf[shop];
          Promise.resolve(place({ method: 'POST', body: body, query: {}, headers: req.headers, v2vBundle: mate }, fake)).catch((e) => done({ code: 500, body: { error: String(e && e.message || e) } }));
        });
        const link = got.body && got.body.link || '', tok = (/[?&]inv=([^&]+)/.exec(link) || [])[1] || '';
        const inv = tok ? require('./_lib').verify(decodeURIComponent(tok)) : null, shop = shopOf(it);
        if (inv && inv.n) {
          // Same box: the shop's first order leads; the others are marked to ship with it (and share its tracking).
          if (!leadOf[shop]) leadOf[shop] = inv.n;
          else {
            const lead = leadOf[shop], mm = (await store.read('meta/' + inv.n + '.json')) || {}, lm = (await store.read('meta/' + lead + '.json')) || {};
            await store.write('meta/' + inv.n + '.json', Object.assign(mm, { bundleLead: lead }));
            await store.write('meta/' + lead + '.json', Object.assign(lm, { bundleMates: (lm.bundleMates || []).concat([inv.n]) }));
          }
        }
        out.push({ id: body.product, n: inv ? inv.n : '', bundled: !!(inv && leadOf[shop] && leadOf[shop] !== inv.n), ok: got.code === 200 && !!link, error: got.code === 200 ? '' : (got.body && got.body.error) || 'This piece could not be ordered.', inv: tok ? decodeURIComponent(tok) : '', link: link });
      }
      return res.json({ orders: out });
    }
    // Past orders on jarfriends.com for this account's email, with shipping and tracking (see the ordersx export on
    // JarFriends; both sites share SUBS_EXPORT_KEY). Kept for 10 minutes so the page stays quick.
    if (what === 'jf-orders' && !actAs) {
      const key = (process.env.SUBS_EXPORT_KEY || '').trim(), src = String(process.env.JARFRIENDS_URL || 'https://jar' + 'friends.com').replace(/\/+$/, '');
      if (!key) return res.json({ orders: [], off: true });
      const ck = 'jforders/' + M.hashOf(me) + '.json', was = await store.read(ck);
      if (was && Date.now() - was.at < 10 * 60000 && !q.fresh) return res.json({ orders: was.orders });
      try {
        const r2 = await fetch(src + '/api/admin?ordersx=' + encodeURIComponent(key) + '&email=' + encodeURIComponent(me), { signal: AbortSignal.timeout(20000) });
        const j = await r2.json(); if (!r2.ok) throw new Error(j.error || r2.status);
        await store.write(ck, { at: Date.now(), orders: j.orders || [] });
        return res.json({ orders: j.orders || [] });
      } catch (e) { console.error('JF_ORDERS_FAIL', String(e && e.message || e)); return res.json({ orders: was ? was.orders : [], error: was ? '' : 'Your jarfriends.com orders did not load just now. Try again in a minute.' }); }
    }
    // Messages between buyers and sellers (see _msgs.js).
    // A buyer asks the seller to return (or cancel) an order: placed by accident, changed their mind, a problem.
    if (what === 'return-request' && req.method === 'POST' && !actAs) {
      const n = String(b.n || ''), why = String(b.reason || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (why.length < 3) return res.status(400).json({ error: 'Say why you want to return it.' });
      const s0 = (await store.sales()).filter((x) => x.n === n)[0], d0 = s0 && (await store.read(s0.path));
      if (!d0 || String(d0.email || '').trim().toLowerCase() !== me) return res.status(404).json({ error: 'That order was not found.' });
      const li = (await M.listings()).filter((x) => x.id === s0.pid)[0], sh = li && (await M.bySlug(li.seller));
      if (!sh) return res.status(400).json({ error: 'Returns are for pieces from VeeFam sellers. Use the Help button for this order.' });
      const mk = 'meta/' + n + '.json', m0 = (await store.read(mk)) || {};
      if (m0.returnReq && m0.returnReq.status !== 'declined') return res.status(400).json({ error: 'You already asked to return this order.' });
      m0.returnReq = { at: Date.now(), reason: why, status: 'requested', policy: li.returns || 'no' };
      await store.write(mk, m0);
      const pol = li.returns && li.returns !== 'no' ? 'Your listing accepts returns within ' + li.returns + ' days.' : 'Your listing says no returns, so it is up to you.';
      await mail(sh.email, 'Return request: ' + (d0.product || 'order ' + n), [(d0.buyer || 'A buyer') + ' asked to return order ' + n + ' (' + (d0.product || '') + ').', 'Reason: ' + why, pol, '', 'Accept or decline it in Seller Hub, Orders:', 'https://' + req.headers.host + '/seller.html'], 'return-' + n).catch(() => null);
      await require('./_discord')('↩️ **RETURN REQUEST** order ' + n + ' · ' + (d0.product || '') + ' · seller ' + sh.name + '\nReason: ' + why).catch(() => null);
      return res.json({ ok: true });
    }
    if (what === 'msg-send' && req.method === 'POST' && !actAs) { const r = await require('./_msgs').send(me, b, 'https://' + req.headers.host); return res.status(r.error ? 400 : 200).json(r); }
    if (what === 'msg-open' && !actAs) { const r = await require('./_msgs').open(me, String((req.method === 'POST' ? b.id : q.id) || '')); return res.status(r.error ? 404 : 200).json(r); }
    if (what === 'msg-inbox' && !actAs) return res.json(await require('./_msgs').inbox(me));
    // Delete my account for good: profile, password, saved cards, wishlist, votes, trades they sent and, for a seller,
    // their shop and pieces. Not while paid orders still need shipping. Order records stay (tax and sales records).
    if (what === 'delete-account' && req.method === 'POST' && !actAs) {
      if (String(b.confirm || '').trim().toUpperCase() !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm.' });
      const shop = await M.byEmail(me);
      if (M.isProtected(shop && shop.slug, me)) return res.status(400).json({ error: 'This is the site owner\u2019s account. It is protected and can\u2019t be deleted.' });
      if (shop) {
        const open = (await M.ledger(shop.slug)).filter((r) => r.paid && !r.tracking);
        if (open.length) return res.status(400).json({ error: 'You still have ' + open.length + ' paid order' + (open.length === 1 ? '' : 's') + ' to ship. Ship them (add tracking) before deleting your account.' });
        await M.removeShop(shop.slug, true);
      }
      const { del } = await import('@vercel/blob'), U = require('./_users'), crypto2 = require('crypto');
      const pw = 'bidder/pw-' + crypto2.createHash('sha1').update(me).digest('hex').slice(0, 20) + '.json';
      const { list: ls } = await import('@vercel/blob');
      const find = async (prefix) => ((await ls({ prefix: prefix, limit: 1000 })).blobs || []).map((x) => x);
      let gone = [];
      for (const pth of ['users/' + U.h(me) + '.json', 'users/code/' + U.h(me) + '.json', pw, wishKey(me)]) gone = gone.concat((await find(pth)).filter((x) => x.pathname === pth));
      gone = gone.concat((await find('giveaway/votes/')).filter((x) => x.pathname.endsWith('/' + M.hashOf(me) + '.json')));
      const trades = await Promise.all((await find('trades/')).map(async (x) => ({ x: x, t: await store.read(x.pathname) })));
      gone = gone.concat(trades.filter((y) => y.t && y.t.email === me).map((y) => y.x));
      if (gone.length) await del(gone.map((x) => x.url));
      // A deleted account gets no more news emails from the back office.
      await store.write('unsub/' + crypto2.createHash('sha1').update(me).digest('hex').slice(0, 20) + '.json', { at: Date.now(), deleted: true });
      console.log('ACCOUNT_DELETED', M.hashOf(me), gone.length, 'files', shop ? 'and shop ' + shop.slug : '');
      return res.json({ ok: true });
    }
    // Everyone signs the Terms (public/terms.html) before using their account. The owner viewing a shop is exempt.
    if (!actAs) { const U = require('./_users'); if (!(await U.hasAgreed(me))) return res.status(403).json({ needTerms: true, error: 'Please read and sign the VeeFam.io Terms of Service to continue.' }); }

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

    // Live show: bid on the piece that is up, or say something in the chat.
    if (what === 'clip-add' && req.method === 'POST') {
      const k = 'clip|' + me, now3 = Date.now(), seen3 = (photoHits.get(k) || []).filter((t3) => now3 - t3 < 3600000);
      if (seen3.length >= 10) return res.status(429).json({ error: 'That is a lot of clips this hour. Try again later.' });
      seen3.push(now3); photoHits.set(k, seen3);
      const r = await require('./_live').addClip(String(b.s || '').toLowerCase().slice(0, 30), me, b); return res.status(r.error ? 400 : 200).json(r);
    }
    if ((what === 'live-bid' || what === 'live-chat' || what === 'live-claim') && req.method === 'POST') {
      const L = require('./_live'), sl = String(b.s || '').toLowerCase().slice(0, 30);
      const k = 'lv|' + me, now2 = Date.now(), seen = (photoHits.get(k) || []).filter((t2) => now2 - t2 < 60000);
      if (seen.length >= 40) return res.status(429).json({ error: 'Slow down a little.' });
      seen.push(now2); photoHits.set(k, seen);
      if (what === 'live-bid') { const r = await L.bid(sl, me, b.amt); return res.status(r.error ? 400 : 200).json(r); }
      if (what === 'live-claim') { const r = await L.claim(sl, me); return res.status(r.error ? 400 : 200).json(r); }
      const mineShop = await M.byEmail(me).catch(() => null), own = mineShop && mineShop.slug === sl ? mineShop.name : '';
      const r = await L.say(sl, me, b.text, own); return res.status(r.error ? 400 : 200).json(r);
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
    // A vote in the giveaway: one per account, two for people who have traded on V2V (see _giveaway.js).
    if (what === 'vote' && req.method === 'POST') { const r = await require('./_giveaway').vote(me, String(b.choice || ''), b.text); return res.status(r.error ? 400 : 200).json(r); }
    // ---------- Offers, as a buyer: every offer they made, with its history ----------
    // The 🔔 bell: what this person should do now, as a buyer and (with a shop) as a seller. Counts and links only.
    if (what === 'notify') {
      const items = [], add = (n, text, link) => { if (n > 0) items.push({ n: n, text: text, link: link }); };
      const shop = await M.byEmail(me);
      const { list: ls } = await import('@vercel/blob');
      const [box, offs, rows, outs, trades] = await Promise.all([
        require('./_msgs').inbox(me).catch(() => ({ unread: 0 })),
        ls({ prefix: 'offers/', limit: 1000 }).then((r) => Promise.all((r.blobs || []).filter((x) => Date.now() - new Date(x.uploadedAt).getTime() < 14 * 864e5).map((x) => store.read(x.pathname).catch(() => null)))).catch(() => []),
        shop ? M.ledger(shop.slug).catch(() => []) : [], shop ? M.payouts(shop.slug).catch(() => []) : [],
        shop ? require('./_trades').forSeller(shop.slug).catch(() => []) : []]);
      add(box.unread, 'Unread message' + (box.unread > 1 ? 's' : ''), '/messages.html');
      try { const mineB = (await M.ledger(null)).filter((r) => String(r.email || '').toLowerCase() === me && M.completed(r) && r.seller && Date.now() - (r.shippedAt || r.at || 0) > 3 * 864e5);
        const left = await Promise.all(mineB.map((r) => store.read('reviews/' + r.seller + '/' + r.n + '.json').catch(() => null)));
        add(left.filter((x) => !x).length, 'Review your seller', '/me.html'); } catch (e) { /* extra */ }
      const live = (o) => o && (!o.until || o.until > Date.now());
      add(offs.filter((o) => live(o) && String(o.email || '').toLowerCase() === me && (o.status === 'accepted' || o.status === 'countered')).length, 'Offer accepted or countered: pay for it before it runs out', '/me.html#offers');
      if (shop) {
        const mine = {}; (await M.listings()).forEach((p) => { if (p.seller === shop.slug) mine[p.id] = 1; });
        add(offs.filter((o) => o && mine[o.pid] && o.status === 'pending').length, 'Offer waiting for your answer', '/seller.html#offers');
        const toDo = rows.filter((r) => r.paid && !r.tracking && !r.shippedAt && !r.nftSentAt), nftIds = {}; (await M.listings()).forEach((p) => { if (p.seller === shop.slug && p.nft) nftIds[p.id] = 1; }); const nftDo = toDo.filter((r) => nftIds[r.pid] || /NFT|0x[0-9a-fA-F]{6}/.test(r.ship || ''));
        add(toDo.length - nftDo.length, 'Paid order to ship', '/seller.html#orders');
        nftDo.forEach((r) => items.push({ n: 1, text: 'Send NFT: ' + (r.product || 'order ' + r.n), link: '/seller.html#order-' + r.n }));
        add(rows.filter((r) => r.returnReq && r.returnReq.status === 'requested').length, 'Return request to answer', '/seller.html#orders');
        add(rows.filter((r) => r.directPay && !r.paid && !/crypto/i.test(r.pay || '')).length, 'Buyer paid you directly: confirm it arrived', '/seller.html#payouts');
        add(trades.filter((t) => t.status === 'pending').length, 'Trade offer to answer', '/seller.html#trades');
        try { const { list: lsR } = await import('@vercel/blob'), rated = {}; ((await lsR({ prefix: 'breviews/' + shop.slug + '/', limit: 1000 })).blobs || []).forEach((x) => { rated[(/([^\/]+)\.json$/.exec(x.pathname) || [])[1]] = 1; });
          add(rows.filter((r) => M.completed(r) && r.email && !rated[r.n] && Date.now() - (r.shippedAt || r.at || 0) > 3 * 864e5).length, 'Rate your buyer', '/seller.html#orders'); } catch (e) { /* extra */ }
        const t = M.totals(rows, outs); if (t.feeOwed > 0) items.push({ n: 1, text: 'You owe VeeFam ' + '$' + usd(t.feeOwed) + ' in fees', link: '/seller.html#owe' });
      }
      return res.json({ items: items, total: items.reduce((a, x) => a + x.n, 0) });
    }
    if (what === 'myoffers') {
      const { list: ls } = await import('@vercel/blob');
      const r = await ls({ prefix: 'offers/', limit: 1000 });
      const all = (await Promise.all((r.blobs || []).map((x) => store.read(x.pathname)))).filter((o) => o && String(o.email || '').trim().toLowerCase() === me);
      all.sort((a, b2) => (b2.at || 0) - (a.at || 0));
      // An accepted (or countered) offer still in time gets its checkout link here too, not only in the email.
      const PAYS = { 'Zelle': 'zelle', 'Venmo': 'venmo', 'Cash App': 'cashapp', 'Cash or ACH': 'cash', 'Ethereum': 'crypto', 'USDC': 'crypto', 'USDT': 'crypto', 'Crypto': 'crypto', 'Card': 'card' };
      const host = 'https://' + req.headers.host, nowS = Math.floor(Date.now() / 1000);
      const payLink = (o) => {
        if (!(o.status === 'accepted' || o.status === 'countered') || !o.until || o.until <= Date.now()) return '';
        const c = o.status === 'countered' && o.counter ? o.counter : o.offer;
        const m = PAYS[o.pay] || (/eth|usd|crypto/i.test(String(o.pay || '')) ? 'crypto' : '');
        return host + '/order.html?offer=' + require('./_lib').sign({ oa: 1, n: o.n, pid: o.pid, q: o.q || 1, c: c, x: Math.max(nowS + 60, Math.floor(o.until / 1000)) }) + (m ? '&method=' + m : '') + '&email=' + encodeURIComponent(me);
      };
      return res.json({ offers: all.slice(0, 200).map((o) => ({ n: o.n, pid: o.pid, item: o.item, q: o.q, offer: o.offer, list: o.list, status: o.status, counter: o.counter || 0, until: o.until || 0, at: o.at, pay: o.pay || '', payLink: payLink(o), events: offerEvents(o) })) });
    }
    // ---------- Trades, as a buyer (see _trades.js) ----------
    if (what === 'mytrades') return res.json({ trades: await require('./_trades').forBuyer(me) });
    if (what === 'trade' && req.method === 'POST') {
      const T = require('./_trades');
      const buf = b.data ? Buffer.from(String(b.data).replace(/^data:image\/jpeg;base64,/, ''), 'base64') : null;
      if (buf && (buf.length < 1000 || buf.length > 1500000 || buf[0] !== 0xFF || buf[1] !== 0xD8)) return res.status(400).json({ error: 'That photo could not be used. Try another one.' });
      const r = await T.create(me, b, buf);
      if (r.error) return res.status(400).json(r);
      const t = r.trade, host = 'https://' + req.headers.host;
      await mail(r.seller.email, 'Trade request: ' + t.product, ['Someone wants to trade for your ' + t.product + '.', '', 'Their offer: ' + t.text, 'Money: ' + T.terms(t) + '.', '', 'See their photo and answer in your Seller Hub, Trades tab:', host + '/seller.html'], 'trade-new-' + t.id).catch(() => null);
      return res.json({ ok: true, trade: t });
    }
    if (what === 'trade-withdraw' && req.method === 'POST') { const r = await require('./_trades').withdraw(me, b.slug, b.id); return res.status(r.error ? 400 : 200).json(r); }
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
      // Buyer ratings: which orders this seller already rated, and each buyer's average from every seller.
      try {
        const { list: lsB } = await import('@vercel/blob'), all = await Promise.all(((await lsB({ prefix: 'breviews/', limit: 1000 })).blobs || []).map((x) => store.read(x.pathname).catch(() => null)));
        const by = {}; all.filter(Boolean).forEach((x) => { const k = x.who; by[k] = by[k] || { sum: 0, n: 0 }; by[k].sum += x.stars; by[k].n++; });
        const mine = {}; all.filter((x) => x && x.seller === seller.slug).forEach((x) => { mine[x.n] = x.stars; });
        orders.forEach((o) => { if (mine[o.n]) o.buyerRated = mine[o.n]; const h = rows.filter((r) => r.n === o.n)[0]; const k = h && h.email ? M.hashOf(h.email) : ''; if (k && by[k]) o.buyerScore = { avg: Math.round(by[k].sum / by[k].n * 10) / 10, n: by[k].n }; });
      } catch (e) { /* ratings are extra */ }
      const myStats = M.statsFrom(seller, rows, await M.reviews(seller.slug));
      const myReviews = (await M.reviews(seller.slug)).map((r) => ({ n: r.n, stars: r.stars, text: r.text || '', name: r.name, product: r.product || '', at: r.at, reply: r.reply || '' }));
      const feed = (await M.posts(seller.slug, 50)).map((x) => Object.assign({}, x, { photoUrl: x.photo ? '/api/photo?id=' + x.id + '&v=' + x.photo : '' }));
      const st = stripeBase.ready() ? await connect.status(seller).catch(() => ({ state: 'unknown' })) : { state: 'off' };
      const prof = await M.profit(seller.slug, rows);
      // Views of their pieces over the last 60 days: { days: { 'YYYY-MM-DD': n }, byPid: { id: n (last 30 days) } }.
      const views = { days: {}, byPid: {} };
      const today = Date.now();
      await Promise.all(Array.from({ length: 60 }, (x, i) => new Date(today - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })).map(async (day, i) => {
        const v = await store.read('views/' + seller.slug + '/' + day + '.json').catch(() => null);
        if (!v) return;
        views.days[day] = Object.keys(v).reduce((t, k2) => t + (Number(v[k2]) || 0), 0);
        if (i < 30) Object.keys(v).forEach((k2) => { views.byPid[k2] = (views.byPid[k2] || 0) + (Number(v[k2]) || 0); });
      }));
      return res.json({ email: me, seller: M.safe(seller), fee: M.feePct(), sections: M.SECTIONS, listings: listings, orders: orders, profit: prof, views: views, payouts: outs, totals: M.totals(rows, outs), posts: feed, stripe: st, stats: myStats, reviews: myReviews, presets: require('./_ship').PRESETS, labelsOn: require('./_ship').ready(), zelleTo: (process.env.ZELLE_TO || '').trim(), venmoTo: (process.env.VENMO_TO || '').trim(), cashappTo: (process.env.CASHAPP_TO || '').trim(), paypalTo: (process.env.PAYPAL_TO || '').trim(), cleanOn: !!((process.env.PHOTOROOM_API_KEY || '').trim() || (process.env.REMOVEBG_API_KEY || '').trim()) });
    }
    // Offers on my pieces. A pending one carries its answer key (t) for /api/offer: accept, counter or decline.
    // A shipping label the seller bought, ready to print: on a half sheet (the default) or as a 4 x 6 label,
    // as set in Seller Hub > Settings (or ?format=half|4x6 for just this print).
    if (what === 'label-file') {
      if (!seller) return res.status(403).send('Open a seller shop first.');
      const n = String(q.n || '');
      const row = (await M.ledger(seller.slug)).filter((r) => r.n === n)[0];
      if (!row) return res.status(404).send('That order was not found in your shop.');
      const m = (await store.read('meta/' + n + '.json')) || {};
      if (!/^https:\/\//.test(m.labelPdf || '')) return res.status(404).send('No label has been bought for this order yet.');
      let src;
      try { const r = await fetch(m.labelPdf, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('status ' + r.status); src = Buffer.from(await r.arrayBuffer()); }
      catch (e) { return res.status(502).send('The label file could not be fetched. Try again in a minute.'); }
      const fmt = q.format === '4x6' || q.format === 'half' ? q.format : (seller.labelFormat || 'half');
      const out = fmt === '4x6' ? src : await require('./_labelpdf').halfSheet(src);
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'inline; filename="label-' + n + '.pdf"');
      return res.send(out);
    }
    // Close my shop: the shop and its pieces go, the buyer account stays. Paid orders must be shipped first.
    if (what === 'shop-close' && req.method === 'POST') {
      if (!seller) return res.status(403).json({ error: 'You do not have a shop.' });
      if (String(b.confirm || '').trim().toUpperCase() !== 'CLOSE') return res.status(400).json({ error: 'Type CLOSE to confirm.' });
      if (M.isProtected(seller.slug, seller.email)) return res.status(400).json({ error: 'This is the site owner\u2019s shop. It is protected and can\u2019t be closed.' });
      const open = (await M.ledger(seller.slug)).filter((r) => r.paid && !r.tracking);
      if (open.length) return res.status(400).json({ error: 'You still have ' + open.length + ' paid order' + (open.length === 1 ? '' : 's') + ' to ship. Ship them (add tracking) before closing your shop.' });
      await M.removeShop(seller.slug, true);
      return res.json({ ok: true });
    }
    // ---------- Live shows, as the seller ----------
    if (what === 'live-mine' || what === 'live-set' || what === 'live-lot' || what === 'live-lot-end' || what === 'live-token' || what === 'live-deal' || what === 'live-deal-end' || what === 'live-plan' || what === 'live-run' || what === 'live-pin') {
      if (!seller) return res.status(403).json({ error: 'Open a seller shop first.' });
      if (seller.status !== 'approved') return res.status(403).json({ error: 'Your shop needs to be approved before you can go live.' });
      const L = require('./_live');
      if (what === 'live-deal' || what === 'live-deal-end') { const r3 = what === 'live-deal' ? await L.putDeal(seller, b) : await L.endDeal(seller); if (r3.show) r3.show = L.forSeller(r3.show); return res.status(r3.error ? 400 : 200).json(r3); }
      if (what === 'live-plan' || what === 'live-run' || what === 'live-pin') { const r4 = what === 'live-plan' ? await L.plan(seller, b) : what === 'live-run' ? await L.runPlan(seller, b) : await L.pin(seller, b); if (r4.show) r4.show = L.forSeller(r4.show); return res.status(r4.error ? 400 : 200).json(r4); }
      if (what === 'live-token') { const r2 = await L.sellerToken(seller); return res.status(r2.error ? 400 : 200).json(r2); }
      const r = what === 'live-mine' ? { ok: true, show: await L.mine(seller), cam: L.camOn() } : what === 'live-set' ? await L.setShow(seller, b) : what === 'live-lot' ? await L.putUp(seller, b) : await L.endLot(seller);
      if (r.show) r.show = L.forSeller(r.show);
      return res.status(r.error ? 400 : 200).json(r);
    }
    // ---------- Trades, as the seller ----------
    if (what === 'trades') {
      if (!seller) return res.status(403).json({ error: 'Open a seller shop first.' });
      return res.json({ trades: await require('./_trades').forSeller(seller.slug) });
    }
    // The seller rates the buyer of a shipped order (1 to 5 stars and a note). Other sellers see the buyer's average.
    if (what === 'buyer-review' && req.method === 'POST') {
      if (!seller) return res.status(403).json({ error: 'Open a seller shop first.' });
      const n = String(b.n || ''), stars = Math.round(Number(b.stars));
      if (!(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'Pick 1 to 5 stars.' });
      const row = (await M.ledger(seller.slug)).filter((r) => r.n === n)[0];
      if (!row || !row.email) return res.status(404).json({ error: 'That order was not found.' });
      if (!M.completed(row)) return res.status(400).json({ error: 'You can rate the buyer once the order has shipped.' });
      await store.write('breviews/' + seller.slug + '/' + n + '.json', { n: n, stars: stars, text: String(b.text || '').replace(/\r/g, '').trim().slice(0, 500), who: M.hashOf(row.email), seller: seller.slug, at: Date.now() });
      return res.json({ ok: true });
    }
    // A fresh pay link for one of this shop's accepted offers (48 more hours), to send the buyer.
    if (what === 'offer-link' && req.method === 'POST') {
      if (!seller) return res.status(403).json({ error: 'Open a seller shop first.' });
      const n = String(b.n || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 30), o = n && await store.read('offers/' + n + '.json');
      const p = o && (await M.listings()).filter((x) => x.id === o.pid && x.seller === seller.slug)[0];
      if (!o || !p || !(o.status === 'accepted' || o.status === 'countered')) return res.status(404).json({ error: 'That accepted offer was not found.' });
      const until = Math.max(o.until || 0, Date.now() + 48 * 3600000);
      await store.write('offers/' + n + '.json', Object.assign(o, { until: until }));
      const c = o.status === 'countered' && o.counter ? o.counter : o.offer;
      return res.json({ ok: true, until: until, link: 'https://' + req.headers.host + '/order.html?offer=' + require('./_lib').sign({ oa: 1, n: o.n, pid: o.pid, q: o.q || 1, c: c, x: Math.floor(until / 1000) }) + '&email=' + encodeURIComponent(o.email || '') });
    }
    // The buyer of an accepted offer paid the seller some other way (DMs, in person): the seller records it here.
    // It becomes a paid order, paid straight to the seller, so the piece comes off stock and VeeFam's fee is owed.
    if (what === 'offer-paid' && req.method === 'POST') {
      if (!seller) return res.status(403).json({ error: 'Open a seller shop first.' });
      const n = String(b.n || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 30), o = n && await store.read('offers/' + n + '.json');
      const p = o && (await M.listings()).filter((x) => x.id === o.pid && x.seller === seller.slug)[0];
      if (!o || !p) return res.status(404).json({ error: 'That offer was not found.' });
      if (!(o.status === 'accepted' || o.status === 'countered')) return res.status(400).json({ error: 'Only an accepted offer can be marked paid.' });
      if (o.paidOrder) return res.status(400).json({ error: 'Already marked paid: order ' + o.paidOrder + '.' });
      const tidy = (v, k) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, k);
      const WAYS = { zelle: 'Zelle', venmo: 'Venmo', cashapp: 'Cash App', paypal: 'PayPal', crypto: 'Crypto', cash: 'Cash' }, way = WAYS[b.how] ? b.how : 'cash';
      const q = Math.max(1, Number(o.q) || 1), each = o.status === 'countered' && o.counter ? o.counter : o.offer, L = each * q;
      const a = [tidy(b.name || o.buyer, 80), '', tidy(b.street, 120), tidy(b.line2, 60), tidy(b.city, 60), tidy(b.state, 30), tidy(b.zip, 12)];
      const lib = require('./_lib'), off = require('./_offline'), dt = { way: way, to: tidy(((seller.directPay || {})[way]) || 'seller', 80), seller: seller.slug };
      const r = await lib.createInvoice({ no: 'D' + Date.now().toString(36).toUpperCase(), item: o.item, qty: String(q), buyer: a[0], terms: '', email: String(o.email || '').toLowerCase(), cents: L, hours: 24 * 30, noCoins: true,
        extra: { p: 'shop', pid: o.pid, L: L, T: L, sh: 0, a: a, m: 'cash', w: way } });
      if (r.error) return res.status(503).json({ error: r.error });
      const out = await off.record(r.inv, 'Paid in full to the seller by ' + WAYS[way] + ' (accepted offer ' + n + ')', { paid: true, label: a[2] ? off.labelLink('https://' + req.headers.host, r.token, r.inv) : '' });
      if (!(out === 'ok' || out === 'duplicate' || out === 'short')) return res.status(503).json({ error: 'Could not save the order just now. Try again.' });
      await store.write('meta/' + r.inv.n + '.json', Object.assign((await store.read('meta/' + r.inv.n + '.json').catch(() => null)) || {}, { directPay: dt, paidAt: Date.now(), paidHow: 'seller' }));
      await store.write('offers/' + n + '.json', Object.assign(o, { paidOrder: r.inv.n, paidAt: Date.now() }));
      M.forget();
      return res.json({ ok: true, n: r.inv.n });
    }
    if (what === 'offers') {
      if (!seller) return res.status(403).json({ error: 'Open a seller shop first.' });
      const mine = {};
      (await M.listings()).forEach((p) => { if (p.seller === seller.slug) mine[p.id] = p; });
      const { list: ls } = await import('@vercel/blob');
      const r = await ls({ prefix: 'offers/', limit: 1000 });
      const all = (await Promise.all((r.blobs || []).map((x) => store.read(x.pathname)))).filter((o) => o && mine[o.pid]);
      all.sort((a, b2) => (b2.at || 0) - (a.at || 0));
      // Paid already: marked paid here, or the buyer has a paid order for that piece since it was accepted.
      const led = await M.ledger(seller.slug).catch(() => []);
      const paidRow = (o) => led.filter((x) => x.paid && x.pid === o.pid && String(x.email || '').toLowerCase() === String(o.email || '').toLowerCase() && (x.at || 0) >= (o.statusAt || o.at || 0) - 60000)[0];
      return res.json({ offers: all.slice(0, 100).map((o) => ({ paid: !!(o.paidOrder || paidRow(o)), paidN: o.paidOrder || ((paidRow(o) || {}).n || ''), note: o.note || '', n: o.n, pid: o.pid, item: o.item, q: o.q, offer: o.offer, list: o.list, buyer: o.buyer, pay: o.pay, status: o.status, at: o.at, until: o.until || 0, counter: o.counter || 0, paidOrder: o.paidOrder || '', email: (o.status === 'accepted' || o.status === 'countered') ? (o.email || '') : '', who: M.hashOf(o.email || '').slice(0, 10), events: offerEvents(o), t: o.status === 'pending' ? o.t : '' })) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

    if (what === 'apply') {
      const r = await M.apply(me, b);
      if (r.error) return res.status(400).json(r);
      const owner = (process.env.OWNER_EMAIL || '').trim();
      if (owner) await mail(owner, 'New seller: ' + r.seller.name + (r.seller.status === 'pending' ? ' (needs your OK)' : ''), ['A new seller signed up on JarFriends.', '', 'Shop: ' + r.seller.name, 'Email: ' + r.seller.email, 'Who can vouch for them: ' + (r.seller.vouch || '-'), 'About: ' + (r.seller.about || '-'), 'Based: ' + (r.seller.based === 'intl' ? 'International (' + (r.seller.country || '?') + ')' : 'United States'), 'Payouts: ' + (r.seller.payTo ? r.seller.payTo : 'not added yet (they can add them later in Seller Hub)'), '', r.seller.status === 'pending' ? 'Approve or decline them in the back office, Sellers tab.' : 'They were approved automatically.'], 'seller-new-' + r.seller.slug).catch(() => null);
      const host = 'https://' + req.headers.host, sx = r.seller;
      await require('./_discord')('**NEW SELLER** ' + sx.name + (sx.status === 'pending' ? ' (needs your OK)' : ' (open)') + '\n' + sx.email + (sx.based === 'intl' ? ' · outside the US' + (sx.country ? ' (' + sx.country + ')' : '') : '') + (sx.about ? '\n' + String(sx.about).slice(0, 300) : '') + '\nVouch: ' + String(sx.vouch || '-').slice(0, 300) + '\n' + host + '/s/' + sx.slug, 'sellers').catch(() => null);
      return res.json({ seller: M.safe(r.seller) });
    }
    if (!seller) return res.status(403).json({ error: 'Open a seller shop first.' });
    if (seller.status === 'paused') return res.status(403).json({ error: 'Your seller shop is paused. Contact JarFriends.' });

    // Automatic card payouts: opens Stripe's own page where the seller links their bank (see _connect.js).
    if (what === 'stripe-setup') {
      if (!stripeBase.ready()) return res.status(503).json({ error: 'Automatic payouts are not switched on for V2V yet.' });
      try { return res.json({ url: await connect.onboardingLink(seller, 'https://' + req.headers.host, actAs ? seller.slug : '') }); }
      catch (e) { console.error('STRIPE_SETUP_FAIL', seller.slug, String(e && e.message || e)); return res.status(502).json({ error: /signed up for Connect/i.test(String(e && e.message || '')) ? 'Payouts are not switched on yet: the Stripe account V2V uses has not turned on Stripe Connect. (V2V owner: use the secret key from the Stripe account where Connect is on.)' : 'Stripe could not open the payout setup just now. Try again in a minute.' }); }
    }
    // Start Stripe payouts over with a new account (wrong or test bank details), then open the new setup right away.
    if (what === 'stripe-reset' && req.method === 'POST') {
      if (!stripeBase.ready()) return res.status(503).json({ error: 'Automatic payouts are not switched on for V2V yet.' });
      await connect.reset(seller);
      try { return res.json({ url: await connect.onboardingLink(seller, 'https://' + req.headers.host, actAs ? seller.slug : '') }); }
      catch (e) { console.error('STRIPE_RESET_FAIL', seller.slug, String(e && e.message || e)); return res.status(502).json({ error: 'Your old payout setup was cleared, but Stripe could not open the new one just now. Press Set up payouts with Stripe in a minute.' }); }
    }
    // Get paid now: an instant payout from the seller's own Stripe balance to their debit card or eligible bank, on
    // top of Stripe's automatic schedule. Stripe charges the seller its instant fee (1.5%, at least 50 cents); V2V
    // takes nothing. 'instant-info' shows what can go out now; 'instant-payout' sends it.
    if (what === 'instant-info' || what === 'instant-payout') {
      if (!stripeBase.ready()) return res.status(503).json({ error: 'Automatic payouts are not switched on for V2V yet.' });
      if (!seller.stripe || !seller.stripeOn) return res.status(400).json({ error: 'Set up payouts with Stripe first.' });
      const bal = await connect.call('GET', '/balance', null, null, seller.stripe);
      if (!bal.ok) return res.status(502).json({ error: 'Stripe could not show your balance just now. Try again in a minute.' });
      const pick = (arr) => ((arr || []).filter((x) => x.currency === 'usd')[0] || {}).amount || 0;
      const instant = Math.max(0, pick(bal.body.instant_available)), pending = pick(bal.body.pending), avail = pick(bal.body.available);
      // Leave room for Stripe's fee so the payout always goes through.
      const fee = (c) => Math.max(50, Math.ceil(c * 0.015)), send = Math.max(0, Math.min(instant - 50, Math.floor(instant / 1.015)));
      if (what === 'instant-info') return res.json({ instant: instant, send: send, fee: send ? fee(send) : 0, available: avail, pending: pending });
      if (send < 100) return res.status(400).json({ error: instant ? 'Less than $1 can be sent right now. It goes out with your next automatic payout.' : 'Nothing can be sent instantly right now. Money from new sales becomes available after Stripe\u2019s holding period, then goes out automatically.' });
      const want = Math.round(Number(b.amount) || 0), amt = want > 0 ? Math.min(want, send) : send;
      const p = await connect.call('POST', '/payouts', { amount: amt, currency: 'usd', method: 'instant', description: 'V2V instant payout', 'metadata[v2v]': '1' }, 'v2v-instant-' + seller.slug + '-' + amt + '-' + Math.floor(Date.now() / 60000), seller.stripe);
      if (!p.ok) { const msg = (p.body && p.body.error && p.body.error.message) || ''; console.error('INSTANT_PAYOUT_FAIL', seller.slug, p.status, msg.slice(0, 200)); return res.status(400).json({ error: /instant/i.test(msg) && /(support|eligible|debit)/i.test(msg) ? 'Your bank account cannot take instant payouts. Add a debit card in Stripe (See my balance and payouts, then Payouts) and try again.' : 'Stripe did not send it: ' + (msg || 'try again in a minute.') }); }
      return res.json({ ok: true, amount: amt, fee: fee(amt), arrival: p.body.arrival_date || 0 });
    }
    // The seller's own Stripe page: balance, payouts and bank.
    if (what === 'stripe-dashboard') {
      if (!stripeBase.ready()) return res.status(503).json({ error: 'Automatic payouts are not switched on for V2V yet.' });
      try { return res.json({ url: await connect.dashboardLink(seller) }); }
      catch (e) { console.error('STRIPE_DASH_FAIL', seller.slug, String(e && e.message || e)); return res.status(502).json({ error: 'Stripe could not open your payouts page just now. Try again in a minute.' }); }
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
      if (b.labelFormat === 'half' || b.labelFormat === '4x6') seller.labelFormat = b.labelFormat;
      if (b.shipIntl != null) seller.shipIntl = !!b.shipIntl;
      // A new bank account for payouts (routing and account number), kept encrypted.
      // Paid in crypto (sellers outside the US): USDC or ETH, on Base or Ethereum mainnet, to their own wallet.
      if (b.region === 'crypto') {
        const w = String(b.wallet || '').trim(), w2 = String(b.wallet2 == null ? w : b.wallet2).trim();
        if (seller.based !== 'intl') return res.status(400).json({ error: 'Crypto payouts are for sellers based outside the US.' });
        if (!/^0x[0-9a-fA-F]{40}$/.test(w)) return res.status(400).json({ error: 'Payouts: enter your wallet address. It starts with 0x and has 42 characters.' });
        if (w.toLowerCase() !== w2.toLowerCase()) return res.status(400).json({ error: 'Payouts: the two wallet addresses do not match.' });
        const coin = b.coin === 'ETH' ? 'ETH' : 'USDC', net = b.net === 'eth' ? 'eth' : 'base', netName = net === 'eth' ? 'Ethereum mainnet' : 'Base';
        Object.assign(seller, { payHow: 'crypto', payTo: coin + ' on ' + netName + ' to ' + w, cryptoPay: { coin: coin, net: net, wallet: w, at: Date.now() }, bankHint: { type: 'crypto', last4: w.slice(-4), holder: coin + ' on ' + netName } });
      }
      else if (b.routing != null || b.account != null || b.iban != null || b.swift != null) { const k = M.bankFrom(b); if (k.error) return res.status(400).json(k); Object.assign(seller, k.fields); delete seller.cryptoPay; }
      if (['zelle', 'venmo', 'cashapp', 'paypal'].indexOf(b.payHow) >= 0 && !seller.bank) seller.payHow = b.payHow;
      if (b.payTo != null && tidy(b.payTo, 80).length >= 3 && !seller.bank) seller.payTo = tidy(b.payTo, 80);
      // Their eBay user name: eBay listings they bring over must be theirs (see _ebay.js).
      if (b.ebayUser != null) { const u = tidy(b.ebayUser, 64).replace(/^@/, ''); if (u.toLowerCase() !== String(seller.ebayUser || '').toLowerCase()) seller.ebayOk = false; seller.ebayUser = u; }
      // Where packages ship from: needed for calculated shipping and labels.
      // Promo codes for this seller's pieces: percent off, dollars off, or free shipping.
      if (Array.isArray(b.promos)) {
        const out = [], seen = {};
        for (const x of b.promos.slice(0, 30)) {
          const code = String(x.code || '').trim().toUpperCase(), kind = ['pct', 'off', 'ship'].indexOf(x.kind) >= 0 ? x.kind : '', v = Number(x.value) || 0;
          if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return res.status(400).json({ error: 'Promo code "' + (x.code || '') + '": use 3 to 20 letters or numbers.' });
          if (seen[code]) return res.status(400).json({ error: 'You have the code ' + code + ' twice.' });
          if (!kind || (kind === 'pct' && !(v > 0 && v <= 90)) || (kind === 'off' && !(v > 0 && v <= 5000))) return res.status(400).json({ error: code + ': pick percent off (1 to 90), dollars off, or free shipping.' });
          const was = (seller.promos || []).filter((y) => y.code === code)[0];
          seen[code] = 1; out.push({ code: code, kind: kind, value: kind === 'ship' ? 0 : v, max: Math.max(0, Math.floor(Number(x.max) || 0)), ends: Number(x.ends) || 0, on: x.on !== false, used: was ? was.used || 0 : 0 });
        }
        seller.promos = out;
      }
      // Get paid directly: where buyers send Zelle, Venmo, Cash App or crypto for this seller's pieces.
      if (b.directPay && typeof b.directPay === 'object') {
        const d = b.directPay, dp = { zelle: tidy(d.zelle, 80), venmo: tidy(d.venmo, 40), cashapp: tidy(d.cashapp, 40), paypal: tidy(d.paypal, 80), crypto: tidy(d.crypto, 42), preferred: ['zelle', 'venmo', 'cashapp', 'paypal', 'crypto', 'card'].indexOf(d.preferred) >= 0 ? d.preferred : ((seller.directPay || {}).preferred || '') };
        if (dp.crypto && !/^0x[0-9a-fA-F]{40}$/.test(dp.crypto)) return res.status(400).json({ error: 'Crypto wallet: paste your 0x address (42 characters). It is used on Ethereum and Base.' });
        seller.directPay = dp;
      }
      if (b.shipFrom && typeof b.shipFrom === 'object') {
        const a = b.shipFrom, f = { name: tidy(a.name, 60), street1: tidy(a.street1, 120), street2: tidy(a.street2, 60), city: tidy(a.city, 60), state: tidy(a.state, 30), zip: tidy(a.zip, 10), phone: tidy(a.phone, 20) };
        if (f.street1 || f.city || f.zip) {
          if (!/[0-9]/.test(f.street1) || !/[A-Za-z]/.test(f.street1)) return res.status(400).json({ error: 'Ship from: enter the street address with its number.' });
          if (f.city.length < 2 || (seller.based !== 'intl' && f.state.length < 2)) return res.status(400).json({ error: 'Ship from: enter the city and state.' });
          if (seller.based === 'intl') { f.country = require('./_ship').countryCode(a.country || seller.country); if (!f.country) return res.status(400).json({ error: 'Ship from: enter your country (for example Canada or CA).' }); }
          if (!/^[0-9]{5}(-[0-9]{4})?$/.test(f.zip) && !(seller.based === 'intl' && /^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(f.zip))) return res.status(400).json({ error: seller.based === 'intl' ? 'Ship from: enter your postal code.' : 'Ship from: enter a 5-digit ZIP code.' });
          if (f.phone.replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Ship from: enter your phone number. USPS and Shippo need it to make the label.' });
          seller.shipFrom = f;
        } else seller.shipFrom = null;
      }
      await M.save(seller);
      return res.json({ ok: true, seller: M.safe(seller) });
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
    // Bring an eBay listing over from its link, or check the seller's eBay-linked pieces right now (see _ebay.js).
    // ✨ Clean up photo: the piece cut out and put on a plain white background by a background-removal service
    // (Photoroom with PHOTOROOM_API_KEY, or remove.bg with REMOVEBG_API_KEY). The piece itself is never redrawn.
    // The seller sees before and after and chooses; nothing is saved here. At most PHOTO_CLEAN_DAILY (40) a day each.
    if (what === 'photo-clean' && req.method === 'POST') {
      const pr = (process.env.PHOTOROOM_API_KEY || '').trim(), rb = (process.env.REMOVEBG_API_KEY || '').trim();
      if (!pr && !rb) return res.status(503).json({ error: 'Photo clean-up is not switched on yet.' });
      const raw = String(b.data || '').replace(/^data:image\/jpeg;base64,/, ''), buf = Buffer.from(raw, 'base64');
      if (buf.length < 1000 || buf.length > 3000000 || buf[0] !== 0xFF || buf[1] !== 0xD8) return res.status(400).json({ error: 'That photo could not be used. Try another one.' });
      const day = new Date().toISOString().slice(0, 10), ck = 'clean/' + seller.slug + '/' + day + '.json', used = (await store.read(ck)) || { n: 0 };
      const cap = Math.max(1, Number(process.env.PHOTO_CLEAN_DAILY) || 40);
      if (used.n >= cap) return res.status(429).json({ error: 'That is ' + cap + ' clean-ups today, the daily limit. More tomorrow.' });
      let out = null, why = '';
      try {
        if (pr) {
          const fd = new FormData(); fd.append('image_file', new Blob([buf], { type: 'image/jpeg' }), 'piece.jpg'); fd.append('bg_color', 'FFFFFF'); fd.append('format', 'jpg'); fd.append('size', 'full');
          const r = await fetch('https://sdk.photoroom.com/v1/segment', { method: 'POST', headers: { 'x-api-key': pr }, body: fd, signal: AbortSignal.timeout(40000) });
          if (r.ok) out = Buffer.from(await r.arrayBuffer()); else why = 'Photoroom ' + r.status + ' ' + (await r.text()).slice(0, 200);
        } else {
          const r = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'x-api-key': rb, 'content-type': 'application/json' }, body: JSON.stringify({ image_file_b64: raw, size: 'auto', bg_color: 'ffffff', format: 'jpg' }), signal: AbortSignal.timeout(40000) });
          if (r.ok) out = Buffer.from(await r.arrayBuffer()); else why = 'remove.bg ' + r.status + ' ' + (await r.text()).slice(0, 200);
        }
      } catch (e) { why = String(e && e.message || e); }
      if (!out || out.length < 1000) { console.error('PHOTO_CLEAN_FAIL', seller.slug, why); return res.status(502).json({ error: 'The clean-up did not work on that photo. Try a photo with the piece clearly in view, or keep your original.' }); }
      await store.write(ck, { n: used.n + 1 });
      return res.json({ data: 'data:image/jpeg;base64,' + out.toString('base64'), left: cap - used.n - 1 });
    }
    // AI reads the tracking number off a photo of a shipping receipt or label (any carrier, any country).
    if (what === 'tracking-ai') {
      if (!require('./_ai').on()) return res.status(503).json({ error: 'Photo reading is not switched on yet. Type the tracking number instead.' });
      const now = Date.now(), k = 'T' + seller.slug, seen = (photoHits.get(k) || []).filter((t) => now - t < 3600000);
      if (seen.length >= 60) return res.status(429).json({ error: 'That is a lot of photos this hour. Type the tracking number instead.' });
      seen.push(now); photoHits.set(k, seen);
      const data = String(b.data || '').replace(/^data:image\/jpeg;base64,/, '');
      if (data.length < 1000 || data.length > 2500000) return res.status(400).json({ error: 'That photo could not be used. Try another one.' });
      const A = require('./_ai');
      const r = await fetch(A.url(), { method: 'POST', signal: AbortSignal.timeout(25000), headers: A.headers(),
        body: JSON.stringify({ model: A.model(), max_tokens: 200,
          system: 'You read shipping receipts and shipping labels from any carrier and country (USPS, UPS, FedEx, DHL, Canada Post, Royal Mail, Australia Post, Chit Chats, Stallion Express and others). Find the package tracking number. Ignore order numbers, receipt numbers, account numbers, phone numbers, postal codes and prices. Reply with JSON only: {"tracking":"the tracking number with no spaces, or empty if none is readable","carrier":"carrier name or empty","sure":true or false}.',
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: data } }, { type: 'text', text: 'What is the tracking number?' }] }] })
      }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
      if (!r.ok) { console.error('TRACK_AI_FAIL', r.status, (await r.text()).slice(0, 200)); return res.status(503).json({ error: 'Could not read the photo just now. Type the tracking number instead.' }); }
      const j = await r.json(), txt = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      let out = {}; try { out = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); } catch (e) { out = {}; }
      const t = String(out.tracking || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (!/^[A-Z0-9]{8,40}$/.test(t)) return res.status(422).json({ error: 'No tracking number could be read. Try a closer, sharper photo of the number, or type it in.' });
      return res.json({ tracking: t, carrier: String(out.carrier || '').slice(0, 40), sure: out.sure !== false });
    }
    // AI suggests a title, description and category from a photo of the piece (see _ai.js).
    if (what === 'listing-ai') {
      if (!require('./_ai').on()) return res.status(503).json({ error: 'AI suggestions are not switched on yet. Type the title yourself for now.' });
      const now = Date.now(), k = 'L' + seller.slug, seen = (photoHits.get(k) || []).filter((t) => now - t < 3600000);
      if (seen.length >= 100) return res.status(429).json({ error: 'That is a lot of photos this hour. Try again a little later.' });
      seen.push(now); photoHits.set(k, seen);
      const data = String(b.data || '').replace(/^data:image\/jpeg;base64,/, '');
      if (data.length < 1000 || data.length > 2500000) return res.status(400).json({ error: 'That photo could not be used. Try another one.' });
      // kind 'auto': AI decides whether the picture is a screenshot of a listing (eBay and the like) or a photo of the piece.
      const auto = b.kind === 'auto';
      let shot = b.kind === 'screenshot';
      const r = await fetch(require('./_ai').url(), {
        method: 'POST', signal: AbortSignal.timeout(25000),
        headers: require('./_ai').headers(),
        body: JSON.stringify({ model: require('./_ai').model(), max_tokens: 600,
          system: auto ? 'You help sellers list collectibles (mostly VeeFriends: cards, graded slabs, comics, pins, stickers, toys, NFTs) on V2V, a marketplace. First decide what the picture is: a SCREENSHOT of a marketplace listing (eBay or similar: shows a listing page with a title, price, buttons, seller info) or a PHOTO of the actual item. Reply with JSON only: {"kind": "screenshot" or "photo", "title": "for a screenshot, the listing title as shown, cleaned up, under 110 characters; for a photo, a clear searchable title under 90 characters (character or item name, set or series, edition, grade if a slab label is visible)", "price": for a screenshot the Buy It Now or current price as a number with no $ (else null), "shipping": for a screenshot "free" if free shipping is shown, else the shipping cost as a number, or null, "quantity": for a screenshot the available quantity (1 if not shown), else null, "description": "2 to 6 short plain sentences about the item only: what it is, edition, number, grade, condition, what is included. For a screenshot use the item details shown and leave out seller policies, returns and eBay wording. Never invent facts; say see photos for condition if unclear.", "category": "one of: ' + M.SECTIONS.join(', ') + '"}' : shot ? 'You turn a screenshot of a marketplace listing (usually eBay) into a listing for V2V, a marketplace for VeeFriends collectibles. Read only what is visible. Reply with JSON only: {"title": "the listing title as shown, cleaned up, under 110 characters", "price": the Buy It Now or current price as a number with no $ (null if not shown), "shipping": "free" if free shipping is shown, else the shipping cost as a number, or null if not shown, "quantity": the available quantity as a number (1 if not shown), "description": "the item description and item specifics shown (condition, grade, edition, set, card number, what is included), as 2 to 6 short plain sentences; leave out seller policies, returns, eBay wording and anything not about the item", "category": "one of: ' + M.SECTIONS.join(', ') + '"}. Never invent details that are not in the screenshot.' : 'You help sellers list collectibles (mostly VeeFriends: cards, graded slabs, comics, pins, stickers, toys, NFTs) on a marketplace. From the photo, write a listing. Reply with JSON only: {"title": "a clear, searchable title under 90 characters: character or item name, set or series, edition, grade if a slab label is visible", "description": "2 to 4 short sentences describing exactly what is shown: what it is, any visible edition, number, grade or condition details, and what is included. Do not invent facts you cannot see; say \'see photos\' for condition if unclear.", "category": "one of: ' + M.SECTIONS.join(', ') + '"}',
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: data } }, { type: 'text', text: (auto ? 'Is this a listing screenshot or a photo of the item? Write the listing.' : shot ? 'Turn this listing screenshot into a listing.' : 'Write the listing for this piece.') + (b.estimate ? ' Also add "price": a fair asking price in US dollars for this exact piece on the collector market today (a number only; your best guess).' : '') }] }] })
      }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
      if (!r.ok) { console.error('LISTING_AI_FAIL', r.status, (await r.text()).slice(0, 300)); return res.status(503).json({ error: 'AI could not look at the photo just now. Try again, or type the title yourself.' }); }
      const j = await r.json();
      const txt = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      let out = {};
      try { out = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); } catch (e) { out = {}; }
      if (!out.title) return res.status(503).json({ error: 'AI could not tell what that is. Try a clearer photo, or type the title yourself.' });
      if (auto) shot = String(out.kind || '').toLowerCase() === 'screenshot';
      const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return n > 0 ? Math.round(n * 100) / 100 : 0; };
      return res.json({ kind: shot ? 'screenshot' : 'photo', title: String(out.title).slice(0, 120), description: String(out.description || '').slice(0, 1200), category: M.SECTIONS.indexOf(out.category) >= 0 ? out.category : '',
        price: shot || b.estimate ? num(out.price) : 0, shipping: shot ? (String(out.shipping).toLowerCase() === 'free' ? 'free' : num(out.shipping)) : 0, quantity: shot ? Math.max(1, Math.min(999, Math.floor(num(out.quantity)) || 1)) : 0 });
    }
    // Every Buy It Now listing on the seller's eBay account, marked when it is already on V2V. Their eBay user name
    // must be confirmed by the V2V owner first (the owner's own shop counts as confirmed), so nobody can copy
    // someone else's eBay store.
    if (what === 'ebay-list') {
      const own = String(seller.email).toLowerCase() === String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
      if (!seller.ebayUser) return res.status(400).json({ error: 'Add your eBay user name in Settings first.' });
      if (!seller.ebayOk && !own) return res.status(403).json({ error: 'V2V has not confirmed that ' + seller.ebayUser + ' is your eBay account yet. It usually takes a day; you can still bring listings over one at a time.' });
      const r = await require('./_ebay').listAll(seller.ebayUser);
      if (r.error) return res.status(400).json(r);
      const have = {}; (await M.listings()).forEach((p) => { if (p.seller === seller.slug && p.ebay && p.ebay.id) have[p.ebay.id] = !p.hidden; });
      return res.json({ items: r.items.map((x) => Object.assign(x, { here: have[x.id] === true })) });
    }
    if (what === 'ebay-import') { const r = await require('./_ebay').bring(seller, String(b.url || '').slice(0, 500)); return res.status(r.error ? 400 : 200).json(r); }
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
    if (what === 'trade-answer') {
      const T = require('./_trades');
      const r = await T.answer(seller.slug, b.id, !!b.yes, b.text);
      if (r.error) return res.status(400).json(r);
      const t = r.trade;
      if (t.status === 'accepted') {
        await mail(t.email, 'Trade accepted: ' + t.product, [seller.name + ' accepted your trade for ' + t.product + ' (' + T.terms(t) + ').', t.reply ? 'Their message: ' + t.reply : '', '', 'Write to them to agree how you will swap and send the pieces: ' + seller.email, 'Your email has been given to them too.'], 'trade-yes-' + t.id).catch(() => null);
        await mail(seller.email, 'You accepted a trade: ' + t.product, ['You accepted a trade for ' + t.product + ' (' + T.terms(t) + ').', '', 'Their offer: ' + t.text, '', 'Write to them to agree how you will swap and send the pieces: ' + t.email], 'trade-yes-s-' + t.id).catch(() => null);
      } else await mail(t.email, 'About your trade for ' + t.product, [seller.name + ' passed on your trade for ' + t.product + '.', t.reply ? 'Their message: ' + t.reply : '', '', 'You can still buy it or make an offer on the site.'], 'trade-no-' + t.id).catch(() => null);
      return res.json({ ok: true });
    }
    // Correct the cost on one sale (what was paid for the piece, other costs such as supplies or card fees).
    if (what === 'cost-set') {
      const n = String(b.n || '');
      if (!/^[A-Z0-9]{4,20}$/.test(n) || !(await M.ledger(seller.slug)).some((r) => r.n === n)) return res.status(404).json({ error: 'That sale was not found.' });
      const r = await M.setCost(seller.slug, n, b);
      return res.status(r.error ? 400 : 200).json(r);
    }
    // The seller cancels one of their orders (before it ships). The order moves from sold/ to cancelled/, so the piece
    // goes back on sale and the order leaves the sales totals and the giveaway wallet. A card payment is refunded in
    // full through Stripe; money paid by Zelle, Venmo, Cash App or cash is with V2V, so the owner is emailed to send it back.
    // A buyer paid this seller directly by Zelle, Venmo or Cash App: the seller confirms the money arrived.
    // Cancel a label this shop bought (the owner can do it from any seller's hub) so a new one can be bought.
    if (what === 'label-void' && req.method === 'POST') {
      const n = String(b.n || ''), row = (await M.ledger(seller.slug)).filter((r) => r.n === n)[0];
      if (!row) return res.status(404).json({ error: 'That order was not found.' });
      const r = await require('./_ship').voidLabel(n);
      return res.status(r.error ? 400 : 200).json(r);
    }
    if (what === 'direct-received' && req.method === 'POST') {
      const n = String(b.n || ''), row = (await M.ledger(seller.slug)).filter((r) => r.n === n)[0];
      if (!row) return res.status(404).json({ error: 'That order was not found.' });
      if (row.paid) return res.json({ ok: true });
      const mk = 'meta/' + n + '.json', m = (await store.read(mk)) || {};
      // The seller says the money reached them. Unless it is the owner's own shop, that money is the seller's, so
      // V2V's fee is owed (see What you owe), the same as any sale paid to the seller directly.
      const own = String(seller.email || '').toLowerCase() === String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
      if (!m.directPay && !row.direct && !own) m.directPay = { way: String(row.pay || 'hand').toLowerCase(), to: 'seller', slug: seller.slug, marked: true };
      if (!m.paidAt) { m.paidAt = Date.now(); m.paidBy = 'seller'; await store.write(mk, m); }
      return res.json({ ok: true });
    }
    // Pay VeeFam the fees owed on direct sales, in crypto: a payment link with an exact amount that marks itself paid.
    if (what === 'fee-pay' && req.method === 'POST') {
      const t = M.totals(await M.ledger(seller.slug), await M.payouts(seller.slug));
      if (!(t.feeOwed >= 100)) return res.status(400).json({ error: 'You owe VeeFam less than $1 in fees right now.' });
      const r = await require('./_lib').createInvoice({ no: 'FEE' + Date.now().toString(36).toUpperCase(), item: 'VeeFam fees for ' + seller.name, qty: '1', buyer: seller.name, terms: '', email: seller.email, cents: t.feeOwed, hours: 24, extra: { fee: seller.slug } });
      if (r.error) return res.status(503).json({ error: 'Crypto payments are not available right now. Send it by Zelle instead.' });
      return res.json({ link: 'https://' + req.headers.host + '/pay.html?inv=' + r.token, cents: t.feeOwed });
    }
    // The seller accepts or declines a buyer's return request.
    if (what === 'return-answer' && req.method === 'POST') {
      const n = String(b.n || ''), row = (await M.ledger(seller.slug)).filter((r) => r.n === n)[0];
      const mk = 'meta/' + n + '.json', m0 = (await store.read(mk)) || {};
      if (!row || !m0.returnReq) return res.status(404).json({ error: 'That return request was not found.' });
      m0.returnReq.status = b.accept ? 'accepted' : 'declined'; m0.returnReq.reply = String(b.note || '').trim().slice(0, 300); m0.returnReq.answeredAt = Date.now();
      await store.write(mk, m0);
      const sf = seller.shipFrom, back = sf && sf.street1 ? [sf.name || seller.name, sf.street1 + (sf.street2 ? ' ' + sf.street2 : ''), sf.city + ', ' + sf.state + ' ' + sf.zip].join('\n') : '';
      const lines = b.accept ? (row.tracking ? ['Your return for order ' + n + ' (' + row.product + ') was accepted.', 'Send it back to:', back || '(the seller will send you their address)', 'You are refunded once it arrives.'] : ['Your return for order ' + n + ' (' + row.product + ') was accepted. It had not shipped yet, so the order is being cancelled and you will be refunded.'])
        : ['Your return request for order ' + n + ' (' + row.product + ') was declined by the seller.'];
      if (m0.returnReq.reply) lines.push('', 'Note from the seller: ' + m0.returnReq.reply);
      if (row.email) await mail(row.email, 'Your return request for order ' + n, lines, 'return-ans-' + n + '-' + m0.returnReq.status).catch(() => null);
      return res.json({ ok: true });
    }
    if (what === 'order-cancel' && req.method === 'POST') {
      const n = String(b.n || ''), why = String(b.reason || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      const s = (await store.sales()).filter((x) => x.n === n)[0];
      const row = s && (await M.ledger(seller.slug)).filter((r) => r.n === n)[0];
      if (!s || !row) return res.status(404).json({ error: 'That order was not found, or it is already cancelled.' });
      const d = await store.read(s.path), was = (await store.read('meta/' + n + '.json')) || {};
      if (!d) return res.status(503).json({ error: 'Could not read that order just now. Try again.' });
      const retOk = was.returnReq && was.returnReq.status === 'accepted';
      if (!retOk && ((was.tracking && !was.testLabel) || was.shippedAt)) return res.status(400).json({ error: 'This order has already shipped, so it cannot be cancelled. Use the Help button if there is a problem.' });
      if (!retOk && was.labelPdf && !was.testLabel) return res.status(400).json({ error: 'A shipping label was already bought for this order. Use the Help button and VeeFam will cancel the label and the order.' });
      const paid = row.paid, card = /card/i.test(d.pay || '');
      let refund = 'none';
      if (paid && card) refund = await connect.refundOrder(n, was);
      await store.write('cancelled/' + s.pid + '/' + n + '~' + s.q + '.json', Object.assign({}, d, { at: d.at || s.at }));
      const { del } = await import('@vercel/blob');
      await del(s.path);
      await store.write('meta/' + n + '.json', Object.assign(was, retOk ? { returnReq: Object.assign(was.returnReq, { refunded: Date.now() }) } : {}, { cancelledAt: Date.now(), wasPaid: paid, cancelledBy: seller.slug, cancelReason: why, refund: refund }));
      walletMemo = null; M.forget();
      const total = '$' + (d.total || '');
      const buyerLine = !paid ? 'Nothing is due, and you were not charged.'
        : refund === 'refunded' || refund === 'already' ? 'Your card payment of ' + total + ' has been refunded in full. It shows on your card in about 5 to 10 business days.'
        : 'Your payment of ' + total + ' will be refunded soon, the same way you paid (' + (d.pay || '') + ').';
      if (d.email) await mail(d.email, 'Your order ' + n + ' was cancelled', ['Your order ' + n + ' (' + (d.product || 'your order') + (s.q > 1 ? ' x ' + s.q : '') + ') from ' + seller.name + ' was cancelled by the seller.' + (why ? ' Reason: ' + why : ''), '', buyerLine, '', 'Questions? Reply to this email.'], 'seller-cancel-' + n).catch(() => null);
      const owner = (process.env.OWNER_EMAIL || '').trim();
      const ownerLine = !paid ? 'It was not paid, so there is nothing to refund.'
        : refund === 'refunded' || refund === 'already' ? 'The card payment was refunded through Stripe' + (was.direct ? ' on the seller\'s account (your fee went back too).' : '.')
        : 'REFUND TO SEND: ' + total + ' by ' + (d.pay || 'the way they paid') + ' to ' + (d.buyer || 'the buyer') + (d.email ? ' (' + d.email + ')' : '') + '.' + (card ? ' (The card payment was not found automatically: refund it in Stripe.)' : '');
      if (owner) await mail(owner, (paid && refund === 'manual' ? 'Refund to send: ' : '') + 'order ' + n + ' cancelled by ' + seller.name, [seller.name + ' cancelled order ' + n + ' (' + (d.product || '') + ' x ' + s.q + ').' + (why ? ' Reason: ' + why : ''), '', ownerLine], 'seller-cancel-owner-' + n).catch(() => null);
      return res.json({ ok: true, paid: paid, refund: refund });
    }
    if (what === 'ship') {
      const n = String(b.n || ''), tracking = String(b.tracking || '').replace(/\s+/g, '').slice(0, 70);
      // A tracking number, or for an NFT the transaction hash (0x and 64 characters).
      if (!/^[A-Za-z0-9]{8,40}$/.test(tracking) && !/^0x[0-9a-fA-F]{64}$/.test(tracking)) return res.status(400).json({ error: 'Enter the tracking number (or, for an NFT, the transaction hash).' });
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
