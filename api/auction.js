// Auctions (see _auction.js).
// GET ?id=<product>[&t=<sign-in>][&ak=<back-office key>]  the auction as anyone may see it; with a sign-in, your own
//   standing; with the owner's back-office key, every bid with its email.
// POST { id, amount, t }  a signed-in customer places a bid.
const A = require('./_auction');
const store = require('./_store');
const gate = require('./_gate');
const { mail } = require('./_lib');
const METHODS = ['card', 'crypto', 'zelle', 'venmo', 'cashapp', 'cash'];
// How each bidder said they will pay if they win, asked once: bidder/<email hash>.json
const prefKey = (e) => 'bidder/' + require('crypto').createHash('sha1').update(String(e).toLowerCase()).digest('hex').slice(0, 20) + '.json';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const id = String((req.query && req.query.id) || b.id || '').slice(0, 20);
  let p = null;
  try { p = (await A.list()).filter((x) => x.id === id)[0]; } catch (e) { p = null; }
  if (!p) return res.status(404).json({ error: 'This auction was not found.' });
  const host = 'https://' + req.headers.host;
  if (req.method === 'GET') {
    const s = await A.state(p);
    const out = Object.assign({ id: p.id, name: p.name }, A.pub(s));
    const me = gate.emailOf(req.query && req.query.t);
    if (me) {
      const mine = s.list.filter((x) => x.e === me);
      const pref = (await store.read(prefKey(me))) || {};
      out.me = { leading: !!(s.top && s.top.e === me), best: mine.length ? A.usd(mine[0].amt) : '', won: s.ended && !!(s.top && s.top.e === me), method: pref.method || '' };
    }
    if (gate.isAdmin(req.query && req.query.ak)) out.all = s.list.map((x) => ({ email: x.e, amount: A.usd(x.amt), at: x.at }));
    return res.json(out);
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST.' });
  const me = gate.emailOf(b.t);
  if (!me) return res.status(401).json({ error: 'Sign in with your email to bid.' });
  const s = await A.state(p);
  if (s.ended) return res.status(400).json({ error: 'This auction has ended.' });
  const amt = Math.round(Number(String(b.amount || '').replace(/[^0-9.]/g, '')) * 100);
  if (!(amt >= s.next)) return res.status(400).json({ error: 'Bid at least $' + A.usd(s.next) + '.' });
  if (amt > 10000000) return res.status(400).json({ error: 'That bid is too high for this site. Contact us.' });
  if (s.top && s.top.e === me) return res.status(400).json({ error: 'You already have the highest bid.' });
  const now = Date.now();
  if (METHODS.indexOf(b.method) >= 0) await store.write(prefKey(me), { method: b.method, at: now });
  await store.write('auction/' + p.id + '/bids/' + now + '-' + Math.random().toString(36).slice(2, 8) + '.json', { e: me, amt: amt, at: now });
  // A bid in the last 2 minutes keeps the auction open 2 more minutes, so nobody wins by bidding at the last second.
  if (s.ends - now < A.EXTEND) await store.write('auction/' + p.id + '/state.json', Object.assign({}, s.st, { ends: now + A.EXTEND }));
  // The bidder who was on top hears they have been outbid.
  if (s.top && s.top.e !== me) {
    const link = host + '/auction.html?id=' + encodeURIComponent(p.id);
    await mail(s.top.e, 'You have been outbid on ' + p.name, ['Someone just bid $' + A.usd(amt) + ' on ' + p.name + ', so you are no longer the highest bidder.', '', 'Bid again here before it ends:', link],
      'outbid-' + p.id + '-' + now, '<div style="background:#0B1712;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#E6EFE9"><div style="max-width:520px;margin:0 auto"><div style="font-size:13px;letter-spacing:2px;color:#C9A45C">AUCTION</div><h1 style="font-size:24px;margin:8px 0 14px;color:#8FD3AE">You have been outbid</h1><p style="font-size:16px;line-height:1.5">Someone just bid <b>$' + A.usd(amt) + '</b> on ' + String(p.name).replace(/</g, '&lt;') + ', so you are no longer the highest bidder.</p><p style="margin:18px 0"><a href="' + link + '" style="background:#C9A45C;color:#0B1712;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:24px;display:inline-block">Bid again</a></p></div></div>').catch(() => null);
  }
  const after = await A.state(p);
  return res.json(Object.assign({ ok: true }, A.pub(after), { me: { leading: true, best: A.usd(amt), method: METHODS.indexOf(b.method) >= 0 ? b.method : '' } }));
};
