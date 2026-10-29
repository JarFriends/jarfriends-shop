// Community giveaways: any signed-in buyer or seller starts one, people enter, the host draws a random winner.
// The host picks who pays shipping (the winner pays a set amount straight to the host, or the host covers it).
// Nothing happens by itself: the host presses Draw once it has ended.
// GET  ?t=                     every open giveaway and those ended in the last 30 days (with your part in each)
// POST { do:'create', t, title, desc, hours, shipBy:'winner'|'host', ship (dollars), photo (JPEG data URL) }
// POST { do:'enter'|'leave'|'draw'|'cancel'|'shippaid'|'track', t, id, tracking }
const crypto = require('crypto');
const store = require('./_store');
const gate = require('./_gate');
const U = require('./_users');
const M = require('./_sellers');
const { mail } = require('./_lib');

const key = (id) => 'giveaways/' + id + '.json';
const host = () => 'https://' + (process.env.SITE_HOST || 'veefam.io');
const shortOf = (e) => String(e).split('@')[0].slice(0, 3) + '***';
async function nameOf(e) { const s = await M.byEmail(e).catch(() => null); if (s) return s.name; const u = await U.get(e).catch(() => null); return (u && u.name) || shortOf(e); }
async function all() {
  const { list } = await import('@vercel/blob');
  const r = await list({ prefix: 'giveaways/', limit: 1000 });
  return (await Promise.all((r.blobs || []).filter((b) => /\.json$/.test(b.pathname)).map((b) => store.read(b.pathname).catch(() => null)))).filter(Boolean);
}
function view(g, me) {
  const mine = g.host === me, won = !!me && g.winner === me;
  const o = { id: g.id, title: g.title, desc: g.desc, photo: g.photo ? '/api/photo?id=' + g.id + '&v=' + g.photo : '', hostName: g.hostName, hostShop: g.hostShop || '', endsAt: g.endsAt, at: g.at,
    shipBy: g.shipBy, ship: g.ship, count: (g.entries || []).length, status: g.status, winnerName: g.winnerName || '', entered: !!me && (g.entries || []).indexOf(me) >= 0, mine: mine, won: won,
    shipPaid: !!g.shipPaid, tracking: g.tracking || '' };
  if (won) o.pay = g.hostPay || null;
  if (mine && g.winner) { o.winnerEmail = g.winner; o.winnerAddress = g.winnerAddress || null; }
  return o;
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!store.on()) return res.status(503).json({ error: 'Giveaways are not set up yet.' });
  let b = req.body || {}; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const me = gate.emailOf(req.method === 'POST' ? b.t : (req.query || {}).t);
  if (req.method === 'GET') {
    const cut = Date.now() - 30 * 864e5;
    const list = (await all()).filter((g) => g.status !== 'cancelled' && (g.endsAt > cut || g.host === me || g.winner === me)).sort((a, c) => (a.status === 'open' ? 0 : 1) - (c.status === 'open' ? 0 : 1) || a.endsAt - c.endsAt);
    return res.json({ me: me || '', list: list.map((g) => view(g, me)) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST.' });
  if (!me) return res.status(401).json({ error: 'Sign in first.' });
  if (b.do === 'create') {
    const title = String(b.title || '').trim().slice(0, 100), desc = String(b.desc || '').replace(/\r/g, '').trim().slice(0, 1000);
    const hours = Math.round(Number(b.hours)), ship = Math.round(Number(b.ship || 0) * 100), shipBy = b.shipBy === 'winner' ? 'winner' : 'host';
    if (title.length < 3) return res.status(400).json({ error: 'Give it a name.' });
    if (!(hours >= 1 && hours <= 30 * 24)) return res.status(400).json({ error: 'Pick how long it runs (1 hour to 30 days).' });
    if (shipBy === 'winner' && !(ship > 0 && ship <= 10000)) return res.status(400).json({ error: 'Type what the winner pays for shipping.' });
    const id = 'gw' + crypto.randomBytes(6).toString('hex'), shop = await M.byEmail(me).catch(() => null);
    const g = { id: id, host: me, hostName: await nameOf(me), hostShop: shop ? shop.slug : '', title: title, desc: desc, at: Date.now(), endsAt: Date.now() + hours * 3600e3, shipBy: shipBy, ship: shipBy === 'winner' ? ship : 0, entries: [], status: 'open' };
    if (b.photo) {
      const buf = Buffer.from(String(b.photo).replace(/^data:image\/jpeg;base64,/, ''), 'base64');
      if (buf.length < 1000 || buf.length > 1500000 || buf[0] !== 0xFF || buf[1] !== 0xD8) return res.status(400).json({ error: 'That photo could not be used. Try another one.' });
      const { put } = await import('@vercel/blob');
      await put('photos/' + id + '.jpg', buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/jpeg' });
      g.photo = Date.now();
    }
    await store.write(key(id), g);
    return res.json({ ok: true, id: id });
  }
  const g = await store.read(key(String(b.id || '').replace(/[^a-z0-9]/g, ''))).catch(() => null);
  if (!g || g.status === 'cancelled') return res.status(404).json({ error: 'That giveaway was not found.' });
  const save = async () => { await store.write(key(g.id), g); return res.json({ ok: true, giveaway: view(g, me) }); };
  if (b.do === 'enter' || b.do === 'leave') {
    if (g.host === me) return res.status(400).json({ error: 'You cannot enter your own giveaway.' });
    if (g.status !== 'open' || Date.now() > g.endsAt) return res.status(400).json({ error: 'This giveaway has ended.' });
    g.entries = (g.entries || []).filter((e) => e !== me); if (b.do === 'enter') g.entries.push(me);
    return save();
  }
  if (g.host !== me) return res.status(403).json({ error: 'Only the person who started this giveaway can do that.' });
  if (b.do === 'cancel') { if (g.status !== 'open') return res.status(400).json({ error: 'A winner was already drawn.' }); g.status = 'cancelled'; return save(); }
  if (b.do === 'draw') {
    if (g.status !== 'open') return res.status(400).json({ error: 'A winner was already drawn.' });
    if (Date.now() < g.endsAt) return res.status(400).json({ error: 'You can draw once the giveaway ends.' });
    if (!(g.entries || []).length) return res.status(400).json({ error: 'Nobody entered. You can cancel it.' });
    g.winner = g.entries[crypto.randomInt(g.entries.length)]; g.winnerName = await nameOf(g.winner); g.drawnAt = Date.now(); g.status = 'drawn';
    const wu = await U.get(g.winner).catch(() => null); g.winnerAddress = (wu && wu.address) || null;
    const shop = await M.byEmail(me).catch(() => null), dp = (shop && shop.directPay) || {};
    g.hostPay = g.shipBy === 'winner' ? { zelle: dp.zelle || '', venmo: dp.venmo || '', cashapp: dp.cashapp || '', paypal: dp.paypal || '', preferred: dp.preferred || '', email: me } : null;
    const link = host() + '/giveaway.html#' + g.id;
    await mail(g.winner, 'You won: ' + g.title, ['You won the V2V giveaway "' + g.title + '" from ' + g.hostName + '!', g.shipBy === 'winner' ? 'Shipping is $' + (g.ship / 100).toFixed(2) + ', paid to ' + g.hostName + '. See how to pay here:' : 'Shipping is free: ' + g.hostName + ' covers it.', link, '', g.winnerAddress ? 'It ships to the address on your V2V account.' : 'Add your ship-to address on your V2V account (My account > Ship to) so it can be sent.'], 'gw-win-' + g.id).catch(() => null);
    await mail(me, 'Your giveaway winner: ' + g.title, ['The winner of "' + g.title + '" is ' + g.winnerName + ' (' + g.winner + ').', g.shipBy === 'winner' ? 'They pay you $' + (g.ship / 100).toFixed(2) + ' for shipping. Mark it paid on the giveaway once it arrives.' : 'You cover shipping.', 'Their address and everything else is here:', link], 'gw-host-' + g.id).catch(() => null);
    return save();
  }
  if (b.do === 'shippaid') { if (!g.winner) return res.status(400).json({ error: 'Draw a winner first.' }); g.shipPaid = true; return save(); }
  if (b.do === 'track') {
    if (!g.winner) return res.status(400).json({ error: 'Draw a winner first.' });
    g.tracking = String(b.tracking || '').trim().slice(0, 60); if (g.winnerAddress == null) { const wu = await U.get(g.winner).catch(() => null); g.winnerAddress = (wu && wu.address) || null; }
    if (g.tracking) await mail(g.winner, 'Your giveaway prize shipped: ' + g.title, [g.hostName + ' shipped "' + g.title + '".', 'Tracking: ' + g.tracking], 'gw-ship-' + g.id + '-' + g.tracking).catch(() => null);
    return save();
  }
  if (b.do === 'address') { const wu = await U.get(g.winner).catch(() => null); g.winnerAddress = (wu && wu.address) || null; return save(); }
  return res.status(400).json({ error: 'Unknown action.' });
};
