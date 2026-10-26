// Public: list products with stock (GET) and place an order (POST). Prices and stock always come from the owner's sheet.
// The buyer pays the listed price now, less a promo code if they have one, or at an accepted offer price.
const { ORDER_HOURS, getInventory, verify, createInvoice, sendLinkEmail } = require('./_lib');
const square = require('./_square');
const stripe = require('./_stripe');
const offline = require('./_offline');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET') {
    // ?promo=CODE checks one promo code for the order page.
    if (req.query && req.query.promo != null) {
      const found = offline.promo(req.query.promo);
      return found ? res.json({ promo: found }) : res.status(404).json({ error: 'That promo code is not valid.' });
    }
    try {
      const ship = await offline.shipping(), secs = await offline.sections();
      const inv = await getInventory(), dl = await offline.deals(inv), nftBy = await offline.nfts();
      // Deal of the day pieces: only the open one is listed. Locked and claimed ones are left out.
      const products = inv.filter((p) => !dl.state[p.id] || dl.state[p.id] === 'open').map((p) => ({ id: p.id, name: p.name, price: (p.cents / 100).toFixed(2), min: p.min, stock: p.stock, ship: ((ship[p.id] || 0) / 100).toFixed(2), sections: secs[p.id] || [], deal: dl.state[p.id] === 'open', nft: !!nftBy[p.id] }));
      return res.json({ products: products, deals: dl.slots, sections: offline.SECTIONS, hours: ORDER_HOURS, card: stripe.ready() || square.ready(), cardFee: offline.cardFeePct(), cardFeeFixed: offline.cardFeeFixed(), ways: offline.ready(), offers: offline.offersOpen(), promos: offline.hasPromos() });
    } catch (e) {
      console.error('INVENTORY_FAIL', String(e && e.message || e));
      return res.status(503).json({ error: 'Products are not available right now. Please try again shortly.' });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if (b.website) return res.status(400).json({ error: 'Could not place this order.' });
  // Only members can buy: a signed-in account with the Terms signed. The receipt goes to the account's email.
  const acct = require('./_gate').emailOf(String(b.t || ''));
  if (!acct) return res.status(401).json({ needSignIn: true, error: 'Sign in or create a free account to buy.' });
  if (!(await require('./_users').hasAgreed(acct))) return res.status(403).json({ needTerms: true, error: 'Please read and sign the VeeFam.io Terms of Service to buy.' });
  b.email = acct;
  const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  // Zelle, Venmo or Cash App. Like cash, the owner confirms these by hand.
  const way = b.method === 'zelle' || b.method === 'venmo' || b.method === 'cashapp' ? b.method : '';
  if (way && !offline.ready()[way]) return res.status(503).json({ error: offline.label(way) + ' is not set up yet. Choose another way to pay.' });
  // Paid by hand, not online.
  const cash = b.method === 'cash' || !!way;
  // Credit card, through Stripe when it is connected, otherwise Square.
  const card = b.method === 'card';
  if (card && !stripe.ready() && !square.ready()) return res.status(503).json({ error: 'Card payments are not set up yet. Choose another way to pay.' });
  const name = clip(b.name, 80), company = clip(b.company, 120), email = clip(b.email, 160);
  if (!name) return res.status(400).json({ error: 'Enter your name.' });
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  // Where the order ships. It goes on the shipping label.
  const street = clip(b.street, 120), line2 = clip(b.line2, 60), city = clip(b.city, 60), state = clip(b.state, 30), zip = clip(b.zip, 10);
  let products, shipBy, nftBy;
  try { products = await getInventory(true); shipBy = await offline.shipping(); nftBy = await offline.nfts(); } catch (e) { return res.status(503).json({ error: 'Ordering is not available right now. Please try again shortly.' }); }
  // An NFT is sent to a wallet, so it needs a wallet address (0x... or a .eth name) in place of a mailing address.
  const isNft = !!nftBy[clip(b.product, 20)], wallet = clip(b.wallet, 64);
  if (isNft) {
    // Typed twice and the risk accepted: a wrong address is the buyer's responsibility (the NFT cannot be got back).
    if (clip(b.wallet2, 64) !== wallet) return res.status(400).json({ error: 'The two wallet addresses do not match. Paste the same address in both boxes.' });
    if (!b.walletRisk) return res.status(400).json({ error: 'Tick the box to accept that a wrong wallet address is your responsibility.' });
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet) && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/i.test(wallet)) return res.status(400).json({ error: 'Enter the wallet address to send the NFT to. It starts with 0x, or is a .eth name.' });
  } else {
    if (!/[0-9]/.test(street) || !/[A-Za-z]/.test(street)) return res.status(400).json({ error: 'Enter the street address with its number, for example 120 Main St.' });
    if (city.length < 2) return res.status(400).json({ error: 'Enter the city.' });
    if (state.length < 2) return res.status(400).json({ error: 'Enter the state.' });
    if (!/^[0-9]{5}(-[0-9]{4})?$/.test(zip)) return res.status(400).json({ error: 'Enter a 5-digit ZIP code.' });
  }
  const id = clip(b.product, 20);
  const p = products.filter((x) => x.id === id)[0];
  if (!p) return res.status(400).json({ error: 'Choose a product.' });
  if ((await offline.deals(products)).state[p.id] === 'locked') return res.status(400).json({ error: 'This deal is still locked. It opens when the one before it is claimed.' });
  const qty = Number(b.qty);
  if (!Number.isInteger(qty) || qty < p.min) return res.status(400).json({ error: 'Quantity must be a whole number of at least ' + p.min + '.' });
  if (qty > p.stock) return res.status(409).json({ error: p.stock > 0 ? 'Only ' + p.stock + (p.stock === 1 ? ' unit is' : ' units are') + ' in stock right now.' : 'This product is sold out right now.' });

  // A piece in a running party: card only (see _partyS.js), whatever way the order came in.
  { const pty = await require('./_partyS').piece(p.id).catch(() => null); if (pty && Date.now() <= pty.party.ends + 120000 && !card) return res.status(400).json({ error: 'This piece is in a party. Party pricing is paid by card only, so any price drop is refunded to your card automatically.' }); }
  // An offer the owner accepted (see offer.js) sets the price per unit, for that product and quantity only.
  let deal = null;
  if (b.offer) {
    deal = verify(b.offer);
    if (!deal || deal.oa !== 1) return res.status(400).json({ error: 'This offer link is not valid.' });
    if (Math.floor(Date.now() / 1000) > deal.x) return res.status(400).json({ error: 'This accepted offer has run out. Send a new offer, or order at the listed price.' });
    if (deal.pid !== p.id || deal.q !== qty) return res.status(400).json({ error: 'Your offer was accepted for ' + deal.q + ' x ' + p.name + ' only.' });
    // Party pricing is card only, so money owed back when the price drops is refunded to the card automatically.
    if (/^PTY/.test(String(deal.n || '')) && !card) return res.status(400).json({ error: 'Party pricing is paid by card only, so any price drop is refunded to your card automatically.' });
  }
  // A promo code takes money off the listed price. It does not stack on an accepted offer.
  const code = clip(b.promo, 20);
  const promo = code ? offline.promo(code) : null;
  if (code && !promo) return res.status(400).json({ error: 'That promo code is not valid. Remove it or try another.' });
  if (promo && deal) return res.status(400).json({ error: 'A promo code cannot be added to an accepted offer. Remove the code to continue.' });
  const tail = deal ? ' (accepted offer ' + deal.n + ')' : '';
  const list = (deal ? deal.c : p.cents) * qty;
  const cut = offline.promoCut(promo, list);
  // Shipping is set per product and charged once per order, whatever the quantity. Promo codes do not reduce it.
  const ship = isNft ? 0 : shipBy[p.id] || 0;
  // Paying by card adds the card fee on top of the order and shipping: what Stripe takes. The buyer sees it before placing the order.
  const fee = card ? offline.cardFee(list - cut + ship) : 0;
  const total = list - cut + ship + fee;
  const r = await createInvoice({
    no: 'W' + Date.now().toString(36).toUpperCase(), item: p.name, qty: String(qty), buyer: company ? company + ' (' + name + ')' : name, terms: '', email: email,
    cents: total, hours: ORDER_HOURS, noCoins: cash || card,
    extra: Object.assign({ p: 'shop', pid: p.id, L: list, T: total, sh: ship, a: isNft ? [name, company, '', '', '', '', ''] : [name, company, street, line2, city, state, zip] }, isNft ? { wa: wallet } : {}, promo ? { pc: promo.code, pd: cut } : {}, fee ? { cf: fee, cp: offline.cardFeeLabel() } : {}, cash ? (way ? { m: 'cash', w: way } : { m: 'cash' }) : card ? { m: 'card' } : {})
  });
  if (r.error) return res.status(503).json({ error: 'Online payment is not available right now. Please contact us.' });
  const host = 'https://' + req.headers.host;
  // The owner opens this link to print the shipping label.
  const label = offline.labelLink(host, r.token, r.inv);
  if (cash) {
    const by = offline.payWith(r.inv);
    const out = await Promise.all([offline.record(r.inv, 'Placed, payment due by ' + by + tail, { label: label }), offline.sendEmail(r.inv), offline.notifyOwner(r.inv, label, by + ' payment due')]);
    return res.json({ link: host + '/placed.html?inv=' + r.token, emailed: out[1] });
  }
  // Crypto and card orders go on the sheet once the payment is confirmed.
  const link = host + (card ? (stripe.ready() ? '/api/stripe?inv=' : '/card.html?inv=') : '/pay.html?inv=') + r.token;
  const out = await Promise.all([(card ? sendLinkEmail(r.inv, link) : offline.sendPayLinkEmail(r.inv, link)), offline.notifyOwner(r.inv, label, card ? 'card, waiting for payment' : 'crypto, waiting for payment')]);
  res.json({ link: link, emailed: out[0] });
};
