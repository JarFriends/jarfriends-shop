// eBay: a seller pastes the link to one of their eBay listings and it is listed on V2V for them, with its title,
// price, shipping, description and photo. The site keeps checking eBay; when it sells or ends there, it comes down
// on V2V and the seller gets an email. (A V2V sale cannot end the eBay listing for them, so the sale email reminds
// them to end it.)
//
// Two ways to read a listing:
//   - eBay's Browse API, when EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are set (free eBay developer keys). Reliable,
//     and it shows who the eBay seller is, so a listing only comes over when its eBay seller is the user name saved
//     in the seller's shop settings.
//   - Otherwise, the public listing page. Best effort: eBay sometimes blocks automated visits.
// A listing that came from eBay carries ebay: { id, url, seller, checkedAt, status } on its V2V listing.
const store = require('./_store');
const M = require('./_sellers');

const idOf = (url) => { const m = /(?:\/itm\/(?:[^\/?#]+\/)?|[?&]item=)(\d{9,15})/.exec(String(url || '')) || /^(\d{9,15})$/.exec(String(url || '').trim()); return m ? m[1] : ''; };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const keys = () => ({ id: (process.env.EBAY_CLIENT_ID || '').trim(), secret: (process.env.EBAY_CLIENT_SECRET || '').trim() });
const apiOn = () => !!(keys().id && keys().secret);

let tok = null;
async function appToken() {
  if (tok && tok.x > Date.now() + 60000) return tok.v;
  const k = keys();
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { authorization: 'Basic ' + Buffer.from(k.id + ':' + k.secret).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope')
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('eBay sign-in failed (' + r.status + ')');
  tok = { v: j.access_token, x: Date.now() + (Number(j.expires_in) || 7200) * 1000 };
  return tok.v;
}
const strip = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

// One listing, read from eBay: { id, title, price, ship (null = unknown), image, desc, seller, auction, live }
// or { id, live: false } when it has sold or ended, or { error }.
async function read(id) {
  if (apiOn()) {
    const r = await fetch('https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=' + id, {
      signal: AbortSignal.timeout(12000), headers: { authorization: 'Bearer ' + (await appToken()), 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 404 || (j.errors || []).some((e) => e.errorId === 11001 || /not available|ended|no longer/i.test(e.message || ''))) return { id: id, live: false };
    if (!r.ok) return { error: 'eBay did not answer (' + r.status + '). Try again in a minute.' };
    const av = (j.estimatedAvailabilities || [])[0] || {};
    const ended = (j.itemEndDate && Date.parse(j.itemEndDate) < Date.now()) || av.estimatedAvailabilityStatus === 'OUT_OF_STOCK';
    const sc = (j.shippingOptions || [])[0];
    return { id: id, live: !ended, title: j.title || '', price: Number(j.price && j.price.value) || 0, ship: sc && sc.shippingCost ? Number(sc.shippingCost.value) || 0 : null,
      image: (j.image && j.image.imageUrl) || '', desc: strip(j.description || j.shortDescription || '').slice(0, 1200), seller: String((j.seller && j.seller.username) || '').toLowerCase(),
      auction: (j.buyingOptions || []).indexOf('FIXED_PRICE') < 0, stock: Number(av.estimatedAvailableQuantity) || 1 };
  }
  // The public page.
  const r = await fetch('https://www.ebay.com/itm/' + id, { signal: AbortSignal.timeout(12000), redirect: 'follow', headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', accept: 'text/html' } }).catch(() => null);
  if (!r) return { error: 'Could not reach eBay just now. Try again in a minute.' };
  if (r.status === 404 || r.status === 410) return { id: id, live: false };
  const h = await r.text();
  if (!r.ok || /captcha|Pardon Our Interruption|splashui/i.test(h.slice(0, 20000)) && !/og:title/.test(h)) return { error: 'eBay blocked the automatic look-up. Ask the V2V owner to add eBay keys, or list the piece by hand.' };
  const meta = (p) => { const m = new RegExp('<meta[^>]+(?:property|name)=["\']' + p + '["\'][^>]+content=["\']([^"\']*)', 'i').exec(h) || new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + p + '["\']', 'i').exec(h); return m ? strip(m[1]) : ''; };
  let ld = {};
  (h.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || []).forEach((s) => { try { const j = JSON.parse(s.replace(/^<script[^>]*>|<\/script>$/gi, '')); [].concat(j).forEach((x) => { if (x && /Product/.test(x['@type'] || '')) ld = x; }); } catch (e) { /* not JSON */ } });
  const off = [].concat(ld.offers || [])[0] || {};
  const ended = /This listing (was ended|sold|has ended)|This item is (out of stock|no longer available)|Bidding has ended|The item you selected is unavailable/i.test(h) || /OutOfStock|SoldOut|Discontinued/i.test(off.availability || '');
  const price = Number(off.price || (/"price"\s*:\s*"?([\d.]+)/.exec(h) || [])[1]) || 0;
  const shipM = /(?:Shipping|Postage)[^$]{0,80}?\$\s?([\d,]+\.\d{2})/i.exec(strip(h).slice(0, 60000));
  const free = /Free (shipping|delivery|standard shipping)/i.test(h);
  return { id: id, live: !ended, title: ld.name || meta('og:title').replace(/\s*\|\s*eBay\s*$/i, ''), price: price, ship: free ? 0 : shipM ? Number(shipM[1].replace(/,/g, '')) : null,
    image: [].concat(ld.image || [])[0] || meta('og:image'), desc: strip(ld.description || meta('og:description')).slice(0, 1200), seller: '', auction: /Place bid|bids?\s*·|\d+\s+bids?\b/i.test(h) && !/Buy It Now/i.test(h), stock: 1 };
}

// Copy the eBay photo onto the V2V listing.
async function photo(seller, pid, url) {
  if (!/^https:\/\/i\.ebayimg\.com\//.test(url || '')) return false;
  const big = url.replace(/s-l\d+\.(jpg|jpeg|png|webp)/i, 's-l1600.jpg');
  const r = await fetch(big, { signal: AbortSignal.timeout(12000) }).catch(() => null);
  if (!r || !r.ok) return false;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000 || buf.length > 4000000) return false;
  const { put } = await import('@vercel/blob');
  await put('photos/' + pid + '.jpg', buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: r.headers.get('content-type') || 'image/jpeg' });
  await M.setListing(seller, pid, { photo: Date.now() });
  return true;
}

// The seller pastes an eBay link: list it on V2V (or refresh the V2V copy if it is already there).
async function bring(seller, url) {
  const id = idOf(url);
  if (!id) return { error: 'That does not look like an eBay listing link. Copy the link from the listing page (it has /itm/ and a number).' };
  const e = await read(id);
  if (e.error) return e;
  if (!e.live) return { error: 'That eBay listing has sold or ended, so there is nothing to bring over.' };
  if (e.auction) return { error: 'That is an eBay auction. Only Buy It Now listings can come over (you can start a V2V auction by hand).' };
  if (!e.title || !(e.price > 0)) return { error: 'Could not read the title and price from that listing. List it by hand, or try again.' };
  const mine = String(seller.ebayUser || '').trim().toLowerCase();
  if (apiOn()) {
    if (!mine) return { error: 'First add your eBay user name in Shop settings, so we know the listing is yours.' };
    if (e.seller && e.seller !== mine) return { error: 'That listing belongs to a different eBay seller (' + e.seller + '). You can only bring over your own listings.' };
  }
  const have = (await M.listings()).filter((p) => p.seller === seller.slug && p.ebay && p.ebay.id === id)[0];
  const f = { id: have ? have.id : '', name: e.title.slice(0, 120), desc: (e.desc || '') + (e.desc ? '\n\n' : '') + 'Also listed on eBay.', price: String(e.price),
    stock: String(Math.max(1, Math.min(e.stock || 1, 999))), shipMode: e.ship === 0 ? 'free' : e.ship > 0 && e.ship <= 200 ? 'flat' : 'calc', shipping: e.ship > 0 && e.ship <= 200 ? String(e.ship) : '', mode: 'buy',
    pkgPreset: (have && have.pkg && have.pkg.preset) || 'mailer', section: have ? have.section : '', cost: have && have.cost != null ? String(have.cost) : '' };
  const r = await M.saveListing(seller, f);
  if (r.error) return r;
  await M.setListing(seller, r.listing.id, { ebay: { id: id, url: 'https://www.ebay.com/itm/' + id, seller: e.seller || '', checkedAt: Date.now(), status: 'live' } });
  const pic = await photo(seller, r.listing.id, e.image).catch(() => false);
  return { ok: true, listing: r.listing, updated: !!have, photo: pic, shipUnknown: e.ship == null };
}

// Check eBay for listings that came from there; take down any that sold or ended. Oldest-checked first, a few per run.
async function sync(limit) {
  const all = (await M.listings()).filter((p) => p.ebay && p.ebay.id && !p.hidden && p.ebay.status !== 'gone').sort((a, b) => (a.ebay.checkedAt || 0) - (b.ebay.checkedAt || 0)).slice(0, limit || 15);
  const out = [];
  for (const p of all) {
    const seller = await M.bySlug(p.seller);
    if (!seller) continue;
    let e;
    try { e = await read(p.ebay.id); } catch (x) { e = { error: String(x && x.message || x) }; }
    if (e.error) { await M.setListing(seller, p.id, { ebay: Object.assign({}, p.ebay, { checkedAt: Date.now(), lastError: e.error.slice(0, 200) }) }); out.push([p.id, 'error']); continue; }
    if (!e.live) {
      await M.setListing(seller, p.id, { hidden: true, ebay: Object.assign({}, p.ebay, { checkedAt: Date.now(), status: 'gone', goneAt: Date.now() }) });
      const host = 'https://' + String(process.env.SITE_HOST || 'v2v-market.vercel.app').replace(/^https?:\/\//, '');
      await require('./_lib').mail(seller.email, 'Sold or ended on eBay: ' + p.name, ['Your eBay listing for ' + p.name + ' has sold or ended, so we took it down on V2V for you. Nobody can buy it here now.', '', 'If it is still for sale, put it back in your store office: ' + host + '/seller.html'], 'ebay-gone-' + p.id).catch(() => null);
      out.push([p.id, 'gone']);
    } else { await M.setListing(seller, p.id, { ebay: Object.assign({}, p.ebay, { checkedAt: Date.now(), status: 'live', lastError: '' }) }); out.push([p.id, 'live']); }
  }
  return out;
}

module.exports = { idOf, read, bring, sync, apiOn };
