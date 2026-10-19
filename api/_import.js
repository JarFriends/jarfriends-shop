// Brings the JarFriends shop's pieces into the JarFriends seller shop on V2V (owner only, from the back office or once
// by hand). Reads the live JarFriends product list (JARFRIENDS_URL, https://jarfriends.com by default) and copies every
// piece that is in stock, visible and not a running auction: name, description, price, stock, shipping and photo.
// Run it again to refresh: a piece already brought over (same JarFriends id, kept as "jfid") is updated, not doubled.
// Left out on purpose: sold-out pieces, hidden pieces, the buyers-only Customer Loyalty piece, party pricing, and
// auctions still running on JarFriends (their bids live there).
const store = require('./_store');
const M = require('./_sellers');

// Written in two parts so the V2V build step that renames JarFriends web addresses leaves this one alone.
const SRC = () => String(process.env.JARFRIENDS_URL || 'https://jar' + 'friends.com').replace(/\/+$/, '');
const SECTIONS = ['Comics', 'Cards', 'NFTs', 'Graded', 'Pokemon', 'Watches'];

async function getJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + url);
  return r.json();
}
async function getImage(urls) {
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 1000 && buf[0] === 0xFF && buf[1] === 0xD8) return buf; // a JPEG
    } catch (e) { /* try the next place */ }
  }
  return null;
}

// What gets copied: in stock, visible, for everyone, not a running auction, not party pricing.
function wanted(p) {
  if (!p || !p.id || !(Number(p.stock) > 0) || p.hidden || p.draft || p.buyers) return false;
  if (/^MPARTY/.test(p.id)) return false;
  if (p.auction && Date.parse(p.auction.ends) > Date.now()) return false;
  return Number(p.price) > 0;
}

// Copies up to `limit` pieces starting at `from` (photos take time, so it runs in batches). Returns what it did.
async function run(slug, from, limit) {
  await M.all(); // opens the seeded shops (SEED_SELLERS) if this is the first visit
  const seller = await M.bySlug(slug);
  if (!seller) return { error: 'There is no seller shop called ' + slug + '.' };
  // The shop ships from the JarFriends address (SHIP_FROM), if it has none of its own yet.
  if (!seller.shipFrom) {
    try {
      const f = JSON.parse(process.env.SHIP_FROM || '');
      if (f && f.street1 && f.zip) { seller.shipFrom = { name: seller.name, street1: f.street1, street2: f.street2 || '', city: f.city, state: f.state, zip: f.zip, phone: f.phone || '' }; await M.save(seller); }
    } catch (e) { /* set it in Shop settings */ }
  }
  const list = ((await getJSON(SRC() + '/api/testsheet')).products || []).filter(wanted);
  const have = {};
  (await M.listings()).filter((x) => x.seller === slug && x.jfid).forEach((x) => { have[x.jfid] = x; });
  const batch = list.slice(from, from + limit), done = [];
  for (const p of batch) {
    const was = have[p.id];
    const ship = p.shipping === 'free' || !(Number(p.shipping) > 0) ? 'free' : Math.round(Number(p.shipping) * 100) / 100;
    const nft = /^(yes|true|1)$/i.test(String(p.nft || ''));
    const section = SECTIONS.filter((s) => String(p.section || '').toLowerCase().indexOf(s.toLowerCase()) >= 0)[0] || (nft ? 'NFTs' : '');
    const id = was ? was.id : 'S' + Date.now().toString(36).toUpperCase() + require('crypto').randomBytes(1).toString('hex').toUpperCase();
    const listing = Object.assign({}, was || {}, {
      id: id, seller: slug, jfid: p.id, name: String(p.name || '').slice(0, 120), desc: String(p.desc || '').slice(0, 1200),
      price: Math.round(Number(p.price) * 100) / 100, min: 1, stock: Math.min(999, Math.floor(Number(p.stock))),
      shipping: nft ? 'free' : ship, shipMode: nft ? 'free' : ship === 'free' ? 'free' : 'flat', nft: nft ? 'yes' : '',
      pkg: { preset: Number(p.weight_oz) > 8 ? 'smallbox' : 'mailer', oz: Number(p.weight_oz) > 0 ? Number(p.weight_oz) : 0 },
      section: section, hidden: false, updated: Date.now()
    }, was ? {} : { created: Date.now() });
    // The photo: the one uploaded in the JarFriends back office, else the shop's own photo files.
    if (!was || !was.photo) {
      const tries = [];
      if (p.photo) tries.push(SRC() + '/api/photo?id=' + encodeURIComponent(p.id) + '&v=' + p.photo);
      if (p.pic) tries.push(SRC() + '/photos/' + p.pic + '.jpg');
      tries.push(SRC() + '/photos/home-' + p.id + '.jpg', SRC() + '/photos/' + p.id + '.jpg');
      const img = await getImage(tries);
      if (img) {
        const { put } = await import('@vercel/blob');
        await put('photos/' + id + '.jpg', img, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/jpeg' });
        listing.photo = Date.now();
      }
    }
    await store.write('market/' + slug + '/' + id + '.json', listing);
    done.push({ jfid: p.id, id: id, name: listing.name, price: listing.price, stock: listing.stock, photo: !!listing.photo, updated: !!was });
  }
  M.forget();
  return { total: list.length, from: from, done: done, next: from + batch.length < list.length ? from + batch.length : null,
    skipped: 'Sold out, hidden, buyers-only, party pricing and auctions still running on the Jar' + 'Friends site are left out.' };
}

module.exports = { run };
