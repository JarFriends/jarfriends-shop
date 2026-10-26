// Public: read an invoice and, for one coin, check the blockchain for its payment.
const { COINS, GRACE, verify, display, check, sendPaidEmail, isCash, isCard } = require('./_lib');
const offline = require('./_offline');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const inv = verify(req.query.inv);
  if (!inv || !inv.k) return res.status(400).json({ error: 'This invoice link is not valid.' });
  const now = Math.floor(Date.now() / 1000);
  const coins = {};
  for (const c of Object.keys(inv.k)) {
    if (!COINS[c]) continue;
    coins[c] = { amount: display(inv.k[c][0], COINS[c].dec), address: inv.k[c][1], symbol: COINS[c].sym || c, label: COINS[c].label || c, network: COINS[c].network, confsNeeded: COINS[c].confs };
  }
  // way: which by-hand method was chosen (cash, zelle, venmo or cashapp). method stays 'cash' for all of them.
  const byHand = isCash(inv), way = byHand ? offline.wayOf(inv) : '';
  const shop = inv.L != null && inv.T != null;
  const invoice = { no: inv.n, item: inv.i, qty: inv.q, buyer: inv.b, terms: inv.t, email: inv.e || '', usd: (inv.u / 100).toFixed(2), created: inv.c, deadline: inv.d, coins: coins, plan: inv.p === 'shop' ? '' : inv.p || '', list: shop ? (inv.L / 100).toFixed(2) : '', total: shop ? (inv.T / 100).toFixed(2) : '', balance: shop ? ((inv.T - inv.u) / 100).toFixed(2) : '', method: byHand ? 'cash' : isCard(inv) ? 'card' : '', way: way, wayLabel: byHand ? offline.label(way) : '', howToPay: byHand ? offline.howTo(inv) : '',
    ship: shop ? ((inv.sh || 0) / 100).toFixed(2) : '',
    // An NFT order: the wallet it will be sent to. Nothing ships.
    wallet: inv.wa || '',
    // The card fee added for paying by card, and its percent.
    fee: inv.cf ? (inv.cf / 100).toFixed(2) : '', feePct: inv.cp || '',
    promo: inv.pc ? { code: inv.pc, off: ((inv.pd || 0) / 100).toFixed(2) } : null,
    // For the shipping label: where it goes, and the sender shown on it.
    shipTo: offline.shipTo(inv), brand: (process.env.BRAND_NAME || 'Collectors Page').trim(), returnTo: (process.env.RETURN_ADDRESS || '').trim().slice(0, 300) };
  const coin = String(req.query.coin || '');
  if (!coins[coin]) return res.json({ invoice: invoice, now: now });

  let found = null;
  try {
    found = await check(coin, inv.k[coin][1], inv.k[coin][0], inv.c - 120, inv.d + GRACE);
  } catch (e) {
    return res.json({ invoice: invoice, now: now, coin: coin, status: 'unknown', note: 'Could not reach the ' + COINS[coin].network + ' data source just now. It will be tried again.' });
  }
  let status = 'awaiting';
  if (found) status = found.confs >= COINS[coin].confs ? 'confirmed' : 'detected';
  else if (now > inv.d) status = 'expired';
  const email = status === 'confirmed' ? await sendPaidEmail(inv, coin, found) : null;
  // A shop order paid in crypto goes on the sheet now, with its proof and the link that prints the shipping label.
  if (status === 'confirmed' && inv.pid) await offline.record(inv, 'Paid in full', { paid: true, proof: found.explorer, label: offline.labelLink('https://' + req.headers.host, String(req.query.inv), inv) });
  // A seller paying VeeFam its fees on their direct sales (see market.js fee-pay): recorded once, when confirmed.
  if (status === 'confirmed' && inv.fee) {
    const ST = require('./_store'), mk = 'feepaid/' + inv.n + '.json';
    if (!(await ST.read(mk).catch(() => null))) { await ST.write(mk, { at: Date.now(), tx: found.explorer || '' }); await require('./_sellers').addPayout(String(inv.fee), inv.u, 'Crypto', 'Fees paid to VeeFam ' + inv.n, 'fee'); }
  }
  res.json({ invoice: invoice, now: now, coin: coin, status: status, tx: found, email: email });
};
