// One-time restore (Oct 26 2026) of the owner's JarFriends shop after the old removal job deleted it by mistake.
// Rebuilds the shop record, its listings (from the shop data seen earlier today), its photos where a copy can still
// be fetched, and finds its Stripe account again. Safe to run twice: it never overwrites anything that exists.
const store = require('./_store');
const M = require('./_sellers');
const OWNER = () => (process.env.OWNER_EMAIL || '').trim().toLowerCase();
const L = [
  ['SMVMKK1IM89', 'Motivated Monster Comic Pack (Issue 05)', 18.80, 0, 5.30, 'Comics', 'Ships sealed.', 1792856645973],
  ['SMVMKK1QM2D', 'VeeFriends Comic Pack Issue 04: Thoughtful Three Horned Harpik', 35.00, 1, 5.30, 'Comics', 'Ships sealed.', 1792856646285],
  ['SMVMKK1YH5F', 'VeeFriends Comic Pack Issue 11: Adventurous Astronaut', 26.00, 3, 5.30, 'Comics', 'Ships sealed.', 1792856646663],
  ['SMVMKK2A653', 'VeeFriends Comic Issue 23: Jolly Jack-O (Burn Island Exclusive)', 152.00, 2, 5.57, 'Comics', 'VeeFriends Comic Issue 23: Jolly Jack-O (Burn Island Exclusive), Lava version. Ships sealed.', 1792856647141],
  ['SMVMKK2MDA5', 'VeeFriends Coins 2026 Calm Clam NGC Gem Proof Set: 2 Silvered Medals + 1 Gilt Medal', 26.00, 0, 6.20, 'Graded', 'Three NGC Gem Proof medals in their slabs: two Silvered Medals in the Classic Art Style and one Gilt Medal in the Comic Art Style. All three are included.', 1792856647423],
  ['SMVMKK34REB', 'Zealous Zombie Diamond One of One (VeeFriends, Score 69, Total 207)', 908.00, 1, 0, 'Cards', 'VeeFriends Zealous Zombie, Diamond parallel, One of One. The only one there is. Score 69 (Aura 22, Skill 23, Stamina 24), Total 207. In a toploader. Free US shipping.', 1792856648212],
  ['SMVMKK3GZ5B', 'Veefriends Binder', 4.40, 6, 5.30, 'Comics', 'Ships sealed.', 1792856648504],
  ['SMVMKK3OE97', 'Zombie Rainbow', 1800.00, 1, 0, 'Comics', 'Ships sealed.', 1792856648762],
  ['SMVMKK3VACD', 'Graded Ninja + Graded Fairy', 440.00, 1, 8.81, 'Comics', 'Ships sealed.', 1792856649055],
  ['SMVOAHDLDB7', 'Alpha Alligator #53809 NFT', 350.00, 1, 0, 'NFTs', '', 1792960658078],
  ['SMVOF69IL0D', 'Rare Lemur + 5555', 44.00, 1, 7.10, '', '', 1792968540919, { start: 44, ends: 1793573337261 }],
  ['SMVOGETW785', 'Patient Pig S1 NFT', 5555.00, 1, 0, 'NFTs', '', 1792970617118],
  ['SMVOH7RZKD2', 'S1 monster card + s2 monster card', 395.00, 1, 'calc', 'Cards', 'Everything in photo', 1792971967923, { start: 395, ends: 1793576813650 }],
  ['SMVOHQWGT5A', 'Resilient Red Devil VeeFriends Series 2 (2022) zerocool CGC 10 Gem Mint', 88.10, 1, 'calc', 'Graded', 'A VeeFriends Series 2 (2022) trading card of Resilient Red Devil by zerocool, sealed in a CGC slab graded Gem Mint 10. The card shows a Score of 72 and stats of 24 for Aura, Skill, and Stamina. Grading label reads CGC 6021504045.', 1792972860032]
];
async function run(host) {
  const out = { shop: '', listings: 0, photos: 0, photosMissing: [], stripe: '' };
  const slug = 'jarfriends', email = OWNER();
  let s = await store.read('sellers/s/' + slug + '.json');
  if (!s) {
    s = { slug: slug, name: 'JarFriends', email: email, about: '', status: 'approved', at: Date.now(), agreedFee: M.feePct(), based: 'us', country: 'United States', vouch: 'Owner',
      shipFrom: { name: 'JarFriends', street1: '833 Central Ave', street2: 'Unit 102', city: 'Highland Park', state: 'IL', zip: '60035', phone: '2245313722' }, restoredAt: Date.now() };
    // Its Stripe account: the one Stripe made for this shop before (tagged with the shop name).
    try {
      const C = require('./_connect'); let after = '';
      for (let i = 0; i < 5 && !s.stripe; i++) {
        const r = await C.call('GET', '/accounts?limit=100' + (after ? '&starting_after=' + after : ''));
        const list = (r.ok && r.body && r.body.data) || [];
        const a = list.filter((x) => (x.metadata && x.metadata.v2v_seller === slug) || String(x.email || '').toLowerCase() === email).sort((x, y) => (y.charges_enabled ? 1 : 0) - (x.charges_enabled ? 1 : 0))[0];
        if (a) { s.stripe = a.id; s.stripeOn = !!(a.charges_enabled && a.payouts_enabled); s.stripeMode = require('./_stripe').test() ? 'test' : 'live'; }
        if (!r.ok || !r.body.has_more || !list.length) break; after = list[list.length - 1].id;
      }
    } catch (e) { out.stripeErr = String(e && e.message || e).slice(0, 150); }
    await store.write('sellers/s/' + slug + '.json', s);
    await store.write('sellers/e/' + M.hashOf(email) + '.json', { slug: slug });
    out.shop = 'restored';
  } else out.shop = 'already there';
  out.stripe = s.stripe ? (s.stripeOn ? 'found, on' : 'found, setup unfinished') : 'not found';
  const sold = await store.soldBy().catch(() => ({}));
  for (const x of L) {
    const [id, name, price, left, ship, section, desc, photo, auc] = x;
    const path = 'market/' + slug + '/' + id + '.json';
    if (await store.read(path)) continue;
    const shipMode = ship === 'calc' ? 'calc' : ship > 0 ? 'flat' : 'free';
    const p = { id: id, seller: slug, name: name, desc: desc, price: price, min: 1, stock: auc ? 1 : left + (sold[id] || 0), shipping: shipMode === 'flat' ? ship : 'free', section: section, sectionSet: !!section, cost: null, hidden: false, minOffer: 0,
      auction: auc ? { start: auc.start, ends: new Date(auc.ends).toISOString() } : null, party: null, shipMode: shipMode, returns: 'no', photo: photo, created: photo, updated: Date.now(), restored: true };
    await store.write(path, p); out.listings++;
    // The photo: a copy may still be in the web cache.
    if (!(await store.read('photos/' + id + '.jpg').catch(() => null))) {
      try {
        const r = await fetch(host + '/api/photo?id=' + id + '&v=' + photo, { signal: AbortSignal.timeout(8000) });
        const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
        if (buf && buf.length > 1000 && buf[0] === 0xFF && buf[1] === 0xD8) { const { put } = await import('@vercel/blob'); await put('photos/' + id + '.jpg', buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/jpeg' }); out.photos++; }
        else out.photosMissing.push(id);
      } catch (e) { out.photosMissing.push(id); }
    }
  }
  M.forget();
  return out;
}
module.exports = { run };
