// The marketplace: other people sell on JarFriends from their own seller portal (seller.html).
// The buyer pays JarFriends as usual. JarFriends keeps PLATFORM_FEE_PERCENT (5.55 unless set) of each paid seller sale
// (pieces plus shipping; sales tax and the card fee are not the seller's money, so no fee is taken on them),
// and owes the seller the rest. The owner pays sellers out and records each payout in the back office.
//
// Storage (the site's private Blob store):
//   sellers/s/<slug>.json          a seller: { slug, name, email, about, payHow, payTo, status, at }
//                                  status: pending (waiting for the owner), approved, or paused
//   sellers/e/<email hash>.json    { slug }: which seller an email belongs to
//   market/<slug>/<product id>.json  one listing, in the same shape as the owner's products, plus seller
//   fees/<invoice>.json            the fee rate in force when a sale was first counted, so a later rate change
//                                  never rewrites old sales
//   payouts/<slug>/<time>.json     { cents, how, note, at }
const store = require('./_store');
const crypto = require('crypto');

const feePct = () => { const v = Number((process.env.PLATFORM_FEE_PERCENT || '').trim() || 5.55); return v >= 0 && v <= 50 ? v : 5.55; };
// The giveaway wallet: this percent of every sale is set aside for giveaways to active buyers and sellers.
// It comes out of the platform fee, so it can never be more than the fee.
const giveawayPct = () => { const v = Number((process.env.GIVEAWAY_PERCENT || '').trim() || 2); return Math.min(v >= 0 && v <= 50 ? v : 2, feePct()); };
const autoApprove = () => /^(1|yes|true)$/i.test((process.env.SELLER_AUTO_APPROVE || '').trim());
const hashOf = (e) => crypto.createHash('sha1').update(String(e).trim().toLowerCase()).digest('hex').slice(0, 24);
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
// Categories a seller can put a piece in, and buyers can filter by. Made for VeeFriends collectors.
const SECTIONS = ['Collectibles', 'Cards', 'Graded', 'NFTs', 'Pins', 'Stickers', 'Plush & Toys', 'Figures', 'Books', 'Comics', 'Apparel', 'Art & Prints', 'Signed', 'Mystery Boxes', 'Event Tickets'];
// A best guess from the name and description, for pieces with no category (or an old one that was removed).
const GUESS = [['Graded', /\b(psa|bgs|cgc|sgc|ngc|graded|slabs?)\b/i], ['NFTs', /\bnft\b|\btoken\b/i], ['Pins', /\bpins?\b/i], ['Stickers', /\bstickers?\b|\bdecals?\b/i],
  ['Comics', /comic/i], ['Mystery Boxes', /mystery|blind box|\bwax\b|booster|\bbox(es)?\b/i], ['Plush & Toys', /plush|toy|stuffed/i], ['Figures', /figure|figurine|vinyl|statue/i], ['Books', /\bbooks?\b/i],
  ['Apparel', /shirt|hoodie|\bhat\b|apparel|jacket|sock/i], ['Art & Prints', /print|poster|canvas|artwork|\bart\b/i], ['Signed', /signed|autograph/i],
  ['Event Tickets', /ticket|veecon|admission/i], ['Collectibles', /binder|coin|medal/i], ['Cards', /\bcards?\b|rainbow|parallel|one of one|toploader/i]];
// Pieces brought over from jarfriends.com (jfid) keep their old label only when nothing better is found,
// until the seller picks a category in their portal (sectionSet).
const sectionOf = (p) => {
  const kept = SECTIONS.indexOf(p.section) >= 0;
  if (kept && (!p.jfid || p.sectionSet)) return p.section;
  if (p.nft && p.nft !== 'no') return 'NFTs';
  const t = (p.name || '') + ' ' + (p.desc || '');
  const g = GUESS.filter((x) => x[1].test(t))[0];
  return g ? g[0] : kept ? p.section : 'Collectibles';
};

async function paths(prefix) {
  if (!store.on()) return [];
  const { list } = await import('@vercel/blob');
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix: prefix, cursor: cursor, limit: 1000 });
    (r.blobs || []).forEach((b) => out.push({ path: b.pathname, url: b.url }));
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  return out;
}

// ---- Sellers ----
let sMemo = null;
// SEED_SELLERS starts the marketplace with sellers already open, so the owner's own shops need no sign-up:
// "Name|email" pairs separated by commas, e.g. "JarFriends|me@example.com". Each is made once, approved.
let seeded = false;
async function seed() {
  if (seeded) return;
  seeded = true;
  await retire();
  const gone = String(process.env.REMOVE_SELLERS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const want = String(process.env.SEED_SELLERS || '').split(',').map((x) => x.split('|').map((y) => y.trim())).filter((x) => x[0] && /@/.test(x[1] || ''));
  for (const [name, email] of want) {
    try {
      if (await store.read('sellers/e/' + hashOf(email) + '.json')) continue;
      const slug = slugify(name);
      if (!slug || gone.indexOf(slug) >= 0 || await bySlug(slug)) continue;
      await store.write('sellers/s/' + slug + '.json', { slug: slug, name: name.slice(0, 40), email: email.toLowerCase(), about: '', payHow: 'zelle', payTo: email.toLowerCase(), status: 'approved', at: Date.now(), agreedFee: feePct(), seeded: true });
      await store.write('sellers/e/' + hashOf(email) + '.json', { slug: slug });
    } catch (e) { console.error('SEED_FAIL', name, String(e && e.message || e)); }
  }
}
// REMOVE_SELLERS: shops to delete for good, by their shop name in the link (e.g. "jarfriends"), comma-separated.
// Everything of theirs goes: the shop, its pieces and photos, posts, reviews, trades, costs and payout records.
// Sales already made stay in the order records. Runs once per shop (sellers/removed/<slug>.json marks it done).
// Delete one shop for good: its pieces and photos, posts, reviews, trades and the shop itself. keepMoney keeps the
// payout and cost records (the owner's books); sales already made always stay in the order records.
async function removeShop(slug, keepMoney) {
  const { del } = await import('@vercel/blob');
  const s = await store.read('sellers/s/' + slug + '.json');
  const pieces = await paths('market/' + slug + '/');
  const ids = pieces.map((p) => (/\/([^\/]+)\.json$/.exec(p.path) || [])[1]).filter(Boolean);
  const photos = (await paths('photos/')).filter((p) => ids.some((id) => p.path === 'photos/' + id + '.jpg'));
  let urls = pieces.concat(photos).map((p) => p.url);
  for (const pre of ['posts/', 'reviews/', 'trades/'].concat(keepMoney ? [] : ['cogs/', 'payouts/'])) urls = urls.concat((await paths(pre + slug + '/')).map((p) => p.url));
  const one = (await paths('sellers/s/' + slug + '.json')).concat(s && s.email ? await paths('sellers/e/' + hashOf(s.email) + '.json') : []);
  urls = urls.concat(one.map((p) => p.url));
  for (let i = 0; i < urls.length; i += 100) await del(urls.slice(i, i + 100));
  sMemo = null; lMemo = null;
  return { name: s ? s.name : '', pieces: ids.length, files: urls.length };
}
async function retire() {
  const list = String(process.env.REMOVE_SELLERS || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9-]{1,30}$/.test(x));
  if (!list.length || !store.on()) return;
  for (const slug of list) {
    try {
      if (await store.read('sellers/removed/' + slug + '.json')) continue;
      const r = await removeShop(slug, false);
      await store.write('sellers/removed/' + slug + '.json', Object.assign({ at: Date.now() }, r));
      console.log('SELLER_REMOVED', slug, r.pieces, 'pieces', r.files, 'files');
    } catch (e) { console.error('RETIRE_FAIL', slug, String(e && e.message || e)); }
  }
}
async function all() {
  if (sMemo && Date.now() - sMemo.at < 5000) return sMemo.v;
  await seed();
  const v = (await Promise.all((await paths('sellers/s/')).map((p) => store.read(p.path)))).filter((s) => s && s.slug).map(modeFix);
  v.sort((a, b) => (a.at || 0) - (b.at || 0));
  sMemo = { at: Date.now(), v: v };
  return v;
}
const forget = () => { sMemo = null; lMemo = null; };
const modeFix = (s) => require('./_stripe').forMode(s, ['stripe', 'stripeOn']);
async function bySlug(slug) { return /^[a-z0-9-]{2,30}$/.test(String(slug || '')) ? modeFix(await store.read('sellers/s/' + slug + '.json')) : null; }
async function byEmail(email) {
  if (!email) return null;
  await seed();
  const m = await store.read('sellers/e/' + hashOf(email) + '.json');
  return m && m.slug ? bySlug(m.slug) : null;
}
async function save(s) { await store.write('sellers/s/' + s.slug + '.json', s); forget(); return s; }

// A new seller from the portal's sign-up form. Returns { seller } or { error }.
async function apply(email, f) {
  const tidy = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  if (await byEmail(email)) return { error: 'This email already has a seller shop.' };
  const name = tidy(f.name, 40);
  if (name.length < 2) return { error: 'Give your shop a name.' };
  let slug = slugify(name);
  if (slug.length < 2) return { error: 'Use letters or numbers in your shop name.' };
  if (['v2v', 'admin', 'owner', 'shop', 'house', 'market'].indexOf(slug) >= 0 || await bySlug(slug)) slug = (slug + '-' + crypto.randomBytes(2).toString('hex')).slice(0, 30);
  // Where they are based (the US, or international), asked when the shop opens. Payout details are optional here:
  // a seller can open a shop and list straight away, and add where to send their earnings later (Seller Hub >
  // Payments). Earnings wait until they do.
  const based = f.region === 'intl' ? 'intl' : 'us';
  const hasBank = ['routing', 'account', 'iban', 'swift'].some((k) => String(f[k] || '').trim());
  const bank = hasBank ? bankFrom(Object.assign({}, f, { region: based })) : { fields: { payHow: '', payTo: '' } };
  if (bank.error) return bank;
  // Who can vouch for them: required; the owner reads every answer in the back office (Sellers > Vouches).
  const vouch = String(f.vouch == null ? '' : f.vouch).replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, 600);
  if (vouch.length < 3) return { error: 'Tell us who can vouch for you.' };
  if (!f.agree) return { error: 'Tick the box to agree to the seller terms.' };
  const s = Object.assign({ slug: slug, name: name, email: String(email).trim().toLowerCase(), about: tidy(f.about, 400), vouch: vouch, status: autoApprove() ? 'approved' : 'pending', at: Date.now(), agreedFee: feePct(), based: based, country: based === 'intl' ? tidy(f.country, 60) : 'United States' }, bank.fields);
  await save(s);
  await store.write('sellers/e/' + hashOf(email) + '.json', { slug: slug });
  return { seller: s };
}
// ---- Bank account for payouts ----
// Kept encrypted (AES-256-GCM, key made from INVOICE_SECRET). Only the account type and last 4 digits are kept in
// the clear (bankHint), for showing. The owner can see the full details in the back office to send a payout.
const bankKey = () => crypto.createHash('sha256').update('v2v-bank|' + (process.env.INVOICE_SECRET || '')).digest();
function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', bankKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}
function unseal(b) {
  if (!b || !b.data) return null;
  try { const d = crypto.createDecipheriv('aes-256-gcm', bankKey(), Buffer.from(b.iv, 'base64')); d.setAuthTag(Buffer.from(b.tag, 'base64')); return JSON.parse(Buffer.concat([d.update(Buffer.from(b.data, 'base64')), d.final()]).toString('utf8')); } catch (e) { return null; }
}
// US routing numbers have a check digit: 3·(d1+d4+d7) + 7·(d2+d5+d8) + (d3+d6+d9) must end in 0.
const routingOk = (r) => /^[0-9]{9}$/.test(r) && (3 * (+r[0] + +r[3] + +r[6]) + 7 * (+r[1] + +r[4] + +r[7]) + (+r[2] + +r[5] + +r[8])) % 10 === 0;
// International payouts go by SWIFT wire: the bank's SWIFT/BIC code plus an IBAN (most of Europe, the Middle East and
// more) or the plain account number where IBANs are not used.
const swiftOk = (c) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(c);
function ibanOk(i) {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(i)) return false;
  const r = (i.slice(4) + i.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let m = 0; for (const d of r) m = (m * 10 + +d) % 97;
  return m === 1;
}
function intlFrom(f) {
  const tidy = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const holder = tidy(f.bankName, 80), inst = tidy(f.bankInst, 80), country = tidy(f.country, 60), addr = tidy(f.holderAddr, 200);
  const swift = String(f.swift || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const acct = String(f.iban || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), again = String(f.iban2 == null ? acct : f.iban2).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (holder.length < 2) return { error: 'Payouts: enter the name on the bank account.' };
  if (country.length < 2) return { error: 'Payouts: enter the country your bank is in.' };
  if (inst.length < 2) return { error: 'Payouts: enter the name of your bank.' };
  if (!swiftOk(swift)) return { error: 'Payouts: that SWIFT/BIC code does not look right. It is 8 or 11 letters and numbers, like DEUTDEFF.' };
  const isIban = /^[A-Z]{2}[0-9]{2}/.test(acct) && acct.length >= 15;
  if (isIban && !ibanOk(acct)) return { error: 'Payouts: that IBAN is not right. Check it against your bank statement.' };
  if (!isIban && !/^[A-Z0-9]{4,34}$/.test(acct)) return { error: 'Payouts: enter your IBAN or account number.' };
  if (acct !== again) return { error: 'Payouts: the two account numbers do not match.' };
  if (addr.length < 5) return { error: 'Payouts: enter the account holder\'s address (international wires need it).' };
  const hint = { type: 'intl', last4: acct.slice(-4), holder: holder, country: country };
  return { fields: { bank: seal({ region: 'intl', holder: holder, bank: inst, country: country, swift: swift, iban: isIban ? acct : '', account: isIban ? '' : acct, address: addr, at: Date.now() }), bankHint: hint, payHow: 'wire', payTo: 'SWIFT wire to ' + inst + ' ••' + hint.last4 + ' (' + country + ')', based: 'intl', country: country } };
}
function bankFrom(f) {
  if (f.region === 'intl') return intlFrom(f);
  const holder = String(f.bankName || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const routing = String(f.routing || '').replace(/[^0-9]/g, ''), account = String(f.account || '').replace(/[^0-9]/g, ''), again = String(f.account2 == null ? account : f.account2).replace(/[^0-9]/g, '');
  const type = f.accType === 'savings' ? 'savings' : 'checking';
  if (holder.length < 2) return { error: 'Payouts: enter the name on the bank account.' };
  if (!routingOk(routing)) return { error: 'Payouts: that routing number is not right. It is the 9 digits at the bottom left of a check.' };
  if (!/^[0-9]{4,17}$/.test(account)) return { error: 'Payouts: enter the account number (4 to 17 digits).' };
  if (account !== again) return { error: 'Payouts: the two account numbers do not match.' };
  const hint = { type: type, last4: account.slice(-4), holder: holder };
  return { fields: { bank: seal({ region: 'us', holder: holder, routing: routing, account: account, type: type, at: Date.now() }), bankHint: hint, payHow: 'bank', payTo: (type === 'savings' ? 'Savings' : 'Checking') + ' ••' + hint.last4, based: 'us', country: 'United States' } };
}
const bankOf = (s) => unseal(s && s.bank);
// A seller record without the sealed bank details, for pages.
const safe = (s) => { if (!s) return s; const o = Object.assign({}, s); delete o.bank; return o; };
// What anyone may see of a seller.
const pub = (s) => ({ slug: s.slug, name: s.name, about: s.about || '', since: s.at });

// ---- Listings ----
let lMemo = null;
async function listings() {
  if (lMemo && Date.now() - lMemo.at < 4000) return lMemo.v;
  const v = (await Promise.all((await paths('market/')).map((p) => store.read(p.path)))).filter((x) => x && x.id && x.seller);
  lMemo = { at: Date.now(), v: v };
  return v;
}
// Listings from approved sellers, in the same shape as the owner's products, ready to sit beside them in the shop.
// A paused seller's pieces leave the shop at once. Hidden listings stay out too.
async function products() {
  if (!store.on()) return [];
  const sellers = {};
  (await all()).forEach((s) => { sellers[s.slug] = s; });
  return (await listings()).filter((p) => sellers[p.seller] && sellers[p.seller].status === 'approved' && !p.hidden)
    .map((p) => { const o = Object.assign({}, p, { section: sectionOf(p), sellerName: sellers[p.seller].name, shelf: false }); delete o.cost; return o; }); // cost is private to the seller
}
const isSellerPid = (id) => /^S[0-9A-Z]{5,19}$/.test(String(id || ''));
// One listing saved by its seller. New listings get an id starting with S.
async function saveListing(seller, f) {
  const tidy = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const name = tidy(f.name, 120);
  if (name.length < 3) return { error: 'Give the piece a name.' };
  const price = Math.round(Number(String(f.price || '').replace(/[^0-9.]/g, '')) * 100) / 100;
  if (!(price >= 1 && price <= 100000)) return { error: 'Price: $1 to $100,000.' };
  const stock = Math.floor(Number(f.stock));
  if (!(stock >= 0 && stock <= 999)) return { error: 'How many you have: 0 to 999.' };
  // Shipping: free, a flat price, or calculated at checkout from the package (see _ship.js).
  const shipRaw = String(f.shipping == null ? '' : f.shipping).trim().toLowerCase();
  const shipMode = ['free', 'flat', 'calc'].indexOf(f.shipMode) >= 0 ? f.shipMode : (shipRaw === '' || shipRaw === 'free' || Number(shipRaw) === 0 ? 'free' : 'flat');
  const ship = shipMode !== 'flat' ? 'free' : Math.round(Number(shipRaw.replace(/[^0-9.]/g, '')) * 100) / 100;
  if (shipMode === 'flat' && !(ship > 0 && ship <= 200)) return { error: 'Flat shipping: enter a price up to $200, or pick free or calculated shipping.' };
  const PRE = require('./_ship').PRESETS;
  const pkgOz = Number(f.pkgOz);
  const pkg = { preset: PRE[f.pkgPreset] || f.pkgPreset === 'custom' ? f.pkgPreset : 'mailer', oz: pkgOz > 0 && pkgOz <= 1120 ? Math.round(pkgOz * 10) / 10 : 0 };
  // A custom size: length, width and height in inches (USPS takes up to 108 in), and a weight is needed.
  if (pkg.preset === 'custom') {
    const d = [f.pkgL, f.pkgW, f.pkgH].map((v) => Math.round(Number(v) * 10) / 10);
    if (!d.every((v) => v > 0 && v <= 108)) return { error: 'Custom package: type the length, width and height in inches.' };
    if (!pkg.oz) return { error: 'Custom package: type the packed weight (pounds and ounces).' };
    pkg.length = d[0]; pkg.width = d[1]; pkg.height = d[2];
  }
  const section = SECTIONS.indexOf(f.section) >= 0 ? f.section : '';
  // What the seller paid for one piece. Private: only the seller sees it, for their profit numbers.
  const costRaw = String(f.cost == null ? '' : f.cost).replace(/[^0-9.]/g, '');
  const cost = costRaw === '' ? null : Math.round(Number(costRaw) * 100) / 100;
  if (cost != null && !(cost >= 0 && cost <= 1000000)) return { error: 'What you paid: enter a dollar amount, or leave it empty.' };
  // Lowest offer the seller will look at: anything under it is declined on the spot. Optional.
  const minOffer = f.minOffer === '' || f.minOffer == null ? 0 : Math.round(Number(String(f.minOffer).replace(/[^0-9.]/g, '')) * 100) / 100;
  if (minOffer && !(minOffer > 0 && minOffer < price)) return { error: 'The lowest offer must be under the price.' };
  let id = String(f.id || '');
  let was = null;
  if (id) {
    was = await store.read('market/' + seller.slug + '/' + id + '.json');
    if (!was || was.seller !== seller.slug) return { error: 'That listing was not found.' };
  } else {
    if ((await listings()).filter((p) => p.seller === seller.slug).length >= 200) return { error: 'You have 200 listings already. Remove one first.' };
    id = 'S' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(1).toString('hex').toUpperCase();
  }
  // An auction: one piece, the price is the starting bid, bidding ends after the hours chosen (1 hour to 14 days).
  // A running auction keeps its end time when the listing is edited, unless the seller picks a new length.
  let auction = null;
  if (f.mode === 'auction') {
    const hrs = Number(f.hours);
    const live = was && was.auction && Date.parse(was.auction.ends) > Date.now();
    if (f.hours === '' || f.hours == null) { if (!live) return { error: 'Pick how long the auction runs.' }; auction = { start: price, ends: was.auction.ends }; }
    else if (!(hrs >= 1 && hrs <= 336)) return { error: 'An auction runs from 1 hour to 14 days.' };
    else auction = { start: price, ends: new Date(Date.now() + hrs * 3600000).toISOString() };
  }
  // Party pricing (Buy now only): the more that sell before the countdown ends, the lower the price for everyone.
  // tiers: [units sold, % off], up to 4 levels. When it ends, anyone who paid more than the final level is owed the
  // difference (see _partyS.js). A running party keeps its start; changing it only changes the end and levels.
  let party = null;
  if (!auction && f.party && f.party.on) {
    const ends = Date.parse(f.party.ends);
    if (!(ends > Date.now() + 10 * 60000 && ends < Date.now() + 31 * 86400000)) return { error: 'Party pricing: pick an end time from 10 minutes to 30 days from now.' };
    const tiers = (Array.isArray(f.party.tiers) ? f.party.tiers : []).map((t) => [Math.floor(Number(t && t.n)), Math.round(Number(t && t.off))]).filter((t) => t[0] > 0 || t[1] > 0);
    if (!tiers.length) return { error: 'Party pricing: add at least one level (how many sold, and % off).' };
    for (let i = 0; i < tiers.length; i++) {
      if (!(tiers[i][0] >= 1 && tiers[i][0] <= stock)) return { error: 'Party pricing: each level needs a number sold from 1 to how many you have (' + stock + ').' };
      if (!(tiers[i][1] >= 1 && tiers[i][1] <= 90)) return { error: 'Party pricing: each level needs 1% to 90% off.' };
      if (i && !(tiers[i][0] > tiers[i - 1][0] && tiers[i][1] > tiers[i - 1][1])) return { error: 'Party pricing: each level needs more sold and more off than the one before.' };
    }
    if (tiers.length > 4) return { error: 'Party pricing: up to 4 levels.' };
    const wasP = was && was.party && was.party.ends > Date.now() ? was.party : null;
    party = { start: wasP ? wasP.start : Date.now(), ends: ends, tiers: tiers };
  }
  const p = Object.assign({}, was || {}, { id: id, seller: seller.slug, name: name, desc: tidy(f.desc, 1200), price: price, min: 1, stock: auction ? 1 : stock, shipping: ship, section: section, sectionSet: !!section, cost: cost, hidden: !!f.hidden, minOffer: auction ? 0 : minOffer, auction: auction, party: party, shipMode: shipMode, pkg: pkg, updated: Date.now() }, was ? {} : { created: Date.now() });
  await store.write('market/' + seller.slug + '/' + id + '.json', p);
  forget();
  return { listing: p };
}
async function setListing(seller, id, fields) {
  const was = await store.read('market/' + seller.slug + '/' + id + '.json');
  if (!was || was.seller !== seller.slug) return null;
  const p = Object.assign(was, fields, { updated: Date.now() });
  await store.write('market/' + seller.slug + '/' + id + '.json', p);
  forget();
  return p;
}
async function removeListing(seller, id) {
  const was = await store.read('market/' + seller.slug + '/' + id + '.json');
  if (!was || was.seller !== seller.slug) return false;
  const { del } = await import('@vercel/blob');
  const hit = (await paths('market/' + seller.slug + '/' + id + '.json'))[0];
  if (hit) await del(hit.url);
  forget();
  return true;
}

// ---- Money ----
const dollars = (v) => Math.round(Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')) * 100) || 0;
// Is this sale paid? Same rule as the back office: not "payment due", or marked paid since.
function paidOf(d, m) { return !/payment due/i.test(d.status || '') || !!(m.paidAt || m.shippedAt || m.labelPdf); }
// Every sale of a seller's pieces with the fee and what the seller gets. slug null = every seller.
async function ledger(slug) {
  const mine = {};
  (await listings()).forEach((p) => { if (!slug || p.seller === slug) mine[p.id] = p; });
  const sales = (await store.sales()).filter((s) => mine[s.pid]);
  const rows = await Promise.all(sales.map(async (s) => {
    const got = await Promise.all([store.read(s.path), store.read('meta/' + s.n + '.json'), store.read('fees/' + s.n + '.json')]);
    const d = got[0] || {}, m = got[1] || {};
    // Shipped in the same box as another order from the same cart: it shares that order's tracking.
    if (m.bundleLead && !m.tracking) { const lm = await store.read('meta/' + m.bundleLead + '.json'); if (lm && lm.tracking) { m.tracking = lm.tracking; m.shippedAt = lm.shippedAt || 0; } }
    let rate = got[2] && got[2].pct;
    if (rate == null) { rate = feePct(); await store.write('fees/' + s.n + '.json', { pct: rate, at: Date.now() }).catch(() => null); }
    const gross = dollars(d.items) + dollars(d.shipping);
    const fee = Math.round(gross * rate / 100);
    return { n: s.n, pid: s.pid, seller: mine[s.pid].seller, product: d.product || mine[s.pid].name, q: s.q, at: d.at || s.at, buyer: d.buyer || '', email: d.email || '', ship: d.ship || '', pay: d.pay || '',
      gross: gross, items: dollars(d.items), rate: rate, fee: fee, net: gross - fee, paid: paidOf(d, m), tracking: m.tracking || '', shippedAt: m.shippedAt || 0,
      // Paid by card straight to the seller's own Stripe (see _connect.js): Stripe pays the seller, nothing is owed.
      direct: !!m.direct, issue: m.issue || null, bundleLead: m.bundleLead || '', bundleMates: m.bundleMates || [],
      // A shipping label the seller bought through V2V: its cost, and the part taken from money V2V holds for them.
      customsPdf: m.customsPdf || '', labelCost: m.labelCost || 0, labelEarn: m.labelFromEarnings || 0, labelCard: m.labelFromCard || 0, labelPdf: m.labelPdf || '' };
  }));
  return rows.sort((a, b) => b.at - a.at);
}
// Profit on each paid sale: what the seller kept from V2V (sales minus the V2V fee), minus their label cost, what
// they paid for the piece and any other costs they add. cogs/<slug>/<order>.json { cost, other, note } in cents.
// The piece's cost is copied onto the sale the first time it is seen paid, so changing it later never rewrites old
// sales; the seller can still correct one sale by hand.
async function profit(slug, rows) {
  const mine = {};
  (await listings()).forEach((p) => { if (p.seller === slug) mine[p.id] = p; });
  return Promise.all(rows.filter((r) => r.paid).map(async (r) => {
    let c = await store.read('cogs/' + slug + '/' + r.n + '.json');
    const l = mine[r.pid];
    if (!c && l && l.cost != null) { c = { cost: Math.round(l.cost * 100) * r.q, other: 0, note: '', auto: true, at: Date.now() }; await store.write('cogs/' + slug + '/' + r.n + '.json', c).catch(() => null); }
    c = c || {};
    const known = c.cost != null;
    return { n: r.n, at: r.at, product: r.product, q: r.q, pay: r.pay, gross: r.gross, fee: r.fee, net: r.net, label: r.labelCost || 0,
      cost: known ? c.cost : null, other: c.other || 0, note: c.note || '', profit: known ? r.net - (r.labelCost || 0) - c.cost - (c.other || 0) : null };
  }));
}
async function setCost(slug, n, f) {
  const cents = (v) => { const s = String(v == null ? '' : v).replace(/[^0-9.]/g, ''); return s === '' ? null : Math.round(Number(s) * 100); };
  const cost = cents(f.cost), other = cents(f.other) || 0;
  if ((cost != null && !(cost >= 0 && cost <= 1e8)) || !(other >= 0 && other <= 1e8)) return { error: 'Enter dollar amounts.' };
  await store.write('cogs/' + slug + '/' + n + '.json', { cost: cost, other: other, note: String(f.note || '').slice(0, 200), at: Date.now() });
  return { ok: true };
}
async function payouts(slug) {
  const v = (await Promise.all((await paths('payouts/' + (slug ? slug + '/' : ''))).map(async (p) => {
    const x = await store.read(p.path), m = /^payouts\/([a-z0-9-]+)\//.exec(p.path);
    return x && m ? Object.assign({ seller: m[1] }, x) : null;
  }))).filter(Boolean);
  return v.sort((a, b) => b.at - a.at);
}
// kind 'deduct': money taken from what V2V holds for the seller (a USPS charge after the fact, say), not money sent.
async function addPayout(slug, cents, how, note, kind) {
  const p = { cents: cents, how: String(how || '').slice(0, 30), note: String(note || '').slice(0, 200), at: Date.now(), kind: kind === 'deduct' ? 'deduct' : 'sent' };
  await store.write('payouts/' + slug + '/' + p.at + '.json', p);
  return p;
}
// Totals for one seller's rows and payouts. Only paid sales count toward what is owed.
function totals(rows, outs) {
  // byStripe: the seller's share of card sales Stripe paid to them directly. Only the rest is owed by hand.
  // labels: label costs taken from held money. deducted: other charges taken from held money (see addPayout).
  const t = { sales: 0, gross: 0, fee: 0, net: 0, unpaidGross: 0, paidOut: 0, byStripe: 0, labels: 0, labelsCard: 0, deducted: 0 };
  rows.forEach((r) => { if (r.paid) { t.sales++; t.gross += r.gross; t.fee += r.fee; t.net += r.net; if (r.direct) t.byStripe += r.net; } else t.unpaidGross += r.gross; t.labels += r.labelEarn || 0; t.labelsCard += r.labelCard || 0; });
  outs.forEach((p) => { if (p.kind === 'deduct') t.deducted += p.cents; else t.paidOut += p.cents; });
  t.owed = t.net - t.byStripe - t.paidOut - t.labels - t.deducted;
  return t;
}

// ---- Community posts ----
// posts/<slug>/<id>.json  { id, slug, text, photo (time saved, or 0), pid (a listing it points at), at }
async function posts(slug, limit) {
  const ps = await paths('posts/' + (slug ? slug + '/' : ''));
  const byTime = ps.map((p) => ({ p: p, t: parseInt((/\/P([0-9A-Z]+)[0-9A-F]{2}\.json$/.exec(p.path) || [])[1] || '0', 36) })).sort((a, b) => b.t - a.t).slice(0, limit || 50);
  return (await Promise.all(byTime.map((x) => store.read(x.p.path)))).filter(Boolean);
}
async function addPost(seller, f) {
  const text = String(f.text == null ? '' : f.text).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1500);
  if (!text && !f.photo) return { error: 'Write something or add a photo.' };
  const id = 'P' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(1).toString('hex').toUpperCase();
  const post = { id: id, slug: seller.slug, text: text, photo: f.photo || 0, pid: /^[A-Za-z0-9_-]{1,20}$/.test(String(f.pid || '')) ? String(f.pid) : '', at: Date.now() };
  await store.write('posts/' + seller.slug + '/' + id + '.json', post);
  return { post: post };
}
async function removePost(seller, id) {
  if (!/^P[0-9A-Z]{6,19}$/.test(String(id || ''))) return false;
  const hit = (await paths('posts/' + seller.slug + '/' + id + '.json'))[0];
  if (!hit) return false;
  const { del } = await import('@vercel/blob');
  await del(hit.url);
  return true;
}

// ---- Reviews and the verified checkmark ----
// reviews/<slug>/<invoice>.json  { n, stars (1-5), text, name ("Bea B."), product, at, reply, replyAt }
// Only the buyer of a completed order (paid and shipped with tracking) can review it, once per order (they may edit).
// A seller is verified at VERIFY_AFTER (10) completed sales with no issues. An issue is a review of 1 or 2 stars, or
// an order the owner flagged in the back office. The owner can also switch the checkmark on or off by hand
// (seller.verify: 'on' | 'off'; anything else follows the rule).
const VERIFY_AFTER = () => { const v = Math.floor(Number((process.env.VERIFY_AFTER || '').trim() || 10)); return v >= 1 && v <= 1000 ? v : 10; };
const completed = (r) => r.paid && !!r.tracking;
async function reviews(slug) {
  const v = (await Promise.all((await paths('reviews/' + slug + '/')).map((p) => store.read(p.path)))).filter((x) => x && x.stars);
  return v.sort((a, b) => b.at - a.at);
}
async function saveReview(slug, r) { await store.write('reviews/' + slug + '/' + r.n + '.json', r); }
async function removeReview(slug, n) {
  const hit = (await paths('reviews/' + slug + '/' + n + '.json'))[0];
  if (!hit) return false;
  const { del } = await import('@vercel/blob');
  await del(hit.url);
  return true;
}
// Rating and checkmark for one seller, from their ledger rows and reviews.
function statsFrom(seller, rows, revs) {
  const done = rows.filter(completed);
  const low = {};
  revs.forEach((r) => { if (r.stars <= 2) low[r.n] = true; });
  const issues = done.filter((r) => low[r.n] || r.issue).length + rows.filter((r) => !completed(r) && r.issue).length;
  const clean = done.filter((r) => !low[r.n] && !r.issue).length;
  const sum = revs.reduce((t, r) => t + r.stars, 0);
  let verified = done.length >= VERIFY_AFTER() && issues === 0;
  if (seller.verify === 'on') verified = true;
  if (seller.verify === 'off') verified = false;
  return { rating: revs.length ? Math.round(sum / revs.length * 10) / 10 : 0, reviews: revs.length, completed: done.length, clean: clean, issues: issues,
    verified: verified, need: VERIFY_AFTER(), override: seller.verify === 'on' || seller.verify === 'off' ? seller.verify : '' };
}
async function stats(seller, rows) {
  return statsFrom(seller, rows || (await ledger(seller.slug)), await reviews(seller.slug));
}
// Stats for many sellers at once (one ledger read).
async function statsAll(sellers) {
  const rows = await ledger(null), out = {};
  await Promise.all(sellers.map(async (s) => { out[s.slug] = statsFrom(s, rows.filter((r) => r.seller === s.slug), await reviews(s.slug)); }));
  return out;
}
// "Bea Buyer" -> "Bea B." : how a reviewer is shown.
const shortName = (n) => { const w = String(n || '').replace(/\(.*?\)/g, ' ').trim().split(/\s+/).filter(Boolean); return w.length ? w[0].slice(0, 20) + (w[1] ? ' ' + w[1][0].toUpperCase() + '.' : '') : 'A buyer'; };

// ---- Telling sellers about their sales and offers ----
// The seller of a piece, or null for V2V's own pieces.
async function sellerOf(pid) {
  if (!isSellerPid(pid)) return null;
  const p = (await listings()).filter((x) => x.id === pid)[0];
  return p ? bySlug(p.seller) : null;
}
// Where an offer on a piece goes: to the seller for a seller's piece, otherwise to the owner.
async function offerTo(pid, ownerEmail) {
  try { const s = await sellerOf(pid); if (s && s.status === 'approved') return s.email; } catch (e) { /* fall back to the owner */ }
  return ownerEmail;
}
// Email the seller about an order of one of their pieces. kind: 'placed' (waiting for a by-hand payment: do not
// ship yet) or 'paid' (ship it). Each order and kind is emailed once.
async function notifySale(n, kind) {
  const { mail } = require('./_lib');
  const sale = (await store.sales()).filter((x) => x.n === n)[0];
  if (!sale) return 'none';
  const seller = await sellerOf(sale.pid);
  if (!seller) return 'none';
  const d = (await store.read(sale.path)) || {};
  const host = 'https://' + String(process.env.SITE_HOST || 'v2v-market.vercel.app').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const portal = host + '/seller.html';
  const paid = kind === 'paid';
  const lines = paid
    ? ['You made a sale on V2V: ' + (d.product || 'your piece') + ' x ' + sale.q + ' (order ' + n + ').', '', 'It is paid, so please ship it within 3 days.', 'Ship to: ' + (d.buyer ? d.buyer + ', ' : '') + (d.ship || 'see your seller portal'), '', 'When it ships, add the tracking number in your seller portal and the buyer is emailed:', portal]
    : ['New order on V2V: ' + (d.product || 'your piece') + ' x ' + sale.q + ' (order ' + n + ').', '', 'The buyer is paying by ' + (d.pay || 'hand') + ', which is not confirmed yet. Do not ship until you get the "it is paid" email.', '', 'Your seller portal:', portal];
  // A piece that is also on eBay: remind the seller to end that listing so it cannot sell twice.
  const l = (await listings()).filter((x) => x.id === sale.pid)[0];
  if (l && l.ebay && l.ebay.url) lines.push('', 'This piece is also listed on eBay. End that listing now so it does not sell twice: ' + l.ebay.url);
  // No payout details yet: their earnings wait until they add them.
  if (paid && !seller.bank) lines.push('', 'Add your payout details so we can send your earnings (Seller Hub > Payments): ' + portal + '. Your money is safe and waits for you until then.');
  return mail(seller.email, (paid ? 'Paid, ship it: ' : 'New order (not paid yet): ') + (d.product || 'your piece'), lines, 'seller-sale-' + n + '-' + (paid ? 'paid' : 'placed')).catch((e) => { console.error('SELLER_NOTIFY_FAIL', n, String(e && e.message || e)); return 'failed'; });
}

module.exports = { removeShop, bankFrom, bankOf, safe, routingOk, profit, setCost, giveawayPct, sellerOf, offerTo, notifySale, reviews, saveReview, removeReview, stats, statsAll, statsFrom, shortName, completed, VERIFY_AFTER, posts, addPost, removePost, feePct, autoApprove, all, bySlug, byEmail, save, apply, pub, listings, products, isSellerPid, saveListing, setListing, removeListing, ledger, payouts, addPayout, totals, hashOf, SECTIONS, sectionOf, forget };
