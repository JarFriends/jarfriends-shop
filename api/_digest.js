// The daily update: one email to the whole list, sent when the owner presses the button in the back office
// (at most once a day). It gathers what changed since the last update: new pieces, price drops, a newly opened
// Deal of the day safe, live auctions. Nothing in this file sends on its own.
const store = require('./_store');
const HOST = 'https://jarfriends.com';
const DAY = 20 * 3600000; // "once a day", with a little room so the same time each day works.
const usd = (n) => '$' + Number(n).toFixed(2);

async function shopNow() {
  const r = await fetch(HOST + '/api/order', { signal: AbortSignal.timeout(9000), headers: { 'cache-control': 'no-store' } });
  return r.json();
}
// What the last update covered. The first time, it starts from what the old automatic emails already announced.
async function baseline() {
  let st = await store.read('digest/state.json');
  if (st) return st;
  const known = (await store.read('sweep/known.json')) || {}, prices = (await store.read('sweep/prices.json')) || {}, safe = (await store.read('sweep/safe.json')) || {};
  return { at: 0, ids: Object.keys(known.seen || {}), prices: prices.last || {}, safe: safe.open ? safe.open + ':' + (safe.id || '') : '', auctions: [] };
}
async function gather() {
  const j = await shopNow(), st = await baseline();
  const list = (j.products || []).filter((p) => p && p.id && !p.locked && !/^MPARTY/.test(p.id));
  const forSale = list.filter((p) => Number(p.stock) > 0 && !p.onHold);
  const seen = {}; (st.ids || []).forEach((id) => { seen[id] = 1; });
  const added = forSale.filter((p) => !seen[p.id] && !p.auction && p.shelf !== false);
  const drops = forSale.filter((p) => !p.auction && seen[p.id] && st.prices[p.id] !== undefined && Number(p.price) < Number(st.prices[p.id]) - 0.004).map((p) => Object.assign({}, p, { was: Number(st.prices[p.id]) }));
  const auctions = list.filter((p) => p.auction && !p.auction.ended);
  const open = (j.deals || []).filter((d) => d.state === 'open')[0];
  const safeKey = open ? open.n + ':' + open.id : '';
  // Safes email everyone on their own, so the daily update leaves them out.
  const safe = null;
  const allClaimed = (j.deals || []).length > 0 && !open;
  return { added, drops, auctions, safe, allClaimed, list, deals: j.deals || [], st };
}
function build(g, name, stop, addr) {
  const S = require('./_sweep'), esc = S.esc;
  const ship = (p) => (p.nft ? '' : Number(p.ship) > 0 ? ' + $' + p.ship + ' shipping' : ', free shipping');
  const card = (p, priceHtml, link, btn) => '<div style="border:1px solid #2C4A3B;border-radius:10px;padding:14px;margin:0 0 14px">' +
    (p.photo ? '<a href="' + link + '"><img src="' + esc(p.photo) + '" alt="' + esc(p.name) + '" width="480" style="max-width:100%;height:auto;border:0;border-radius:8px;display:block;margin:0 0 10px"></a>' : '') +
    '<div style="font-size:17px;font-weight:bold;line-height:1.35">' + esc(p.name) + '</div>' + priceHtml +
    '<p style="margin:12px 0 0"><a href="' + link + '" style="background:#C9A45C;color:#0B1712;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:24px;display:inline-block">' + btn + '</a></p></div>';
  const head = (t) => '<div style="font-size:13px;letter-spacing:2px;color:#C9A45C;margin:22px 0 10px">' + t + '</div>';
  const lines = [S.first(name), ''];
  let html = '';
  // The owner's own message, written in the back office, goes first.
  if (g.note) { lines.push(g.note, ''); html += '<div style="border:2px solid #C9A45C;border-radius:10px;padding:14px 16px;margin:16px 0;font-size:17px;line-height:1.5;white-space:pre-line">' + esc(g.note) + '</div>'; }
  const any = g.added.length || g.drops.length || g.auctions.length || g.safe;
  if (any) lines.push('Here is what is new at JarFriends:', '');
  if (g.safe) {
    const t = g.safe.n >= g.safe.total ? 'The Vault (safe ' + g.safe.n + ') is open' : 'Deal of the day: safe ' + g.safe.n + ' is open';
    lines.push(t.toUpperCase(), 'Open it to see what is inside: ' + HOST + '/#deal', '');
    html += head('DEAL OF THE DAY') + '<div style="border:1px solid #C9A45C;border-radius:10px;padding:14px;margin:0 0 14px"><div style="font-size:18px;font-weight:bold">' + esc(t) + '</div><div style="font-size:14px;color:#B9CCC0;margin-top:4px">Only one safe opens at a time. When it is claimed, the next one unlocks.</div><p style="margin:12px 0 0"><a href="' + HOST + '/#deal" style="background:#C9A45C;color:#0B1712;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:24px;display:inline-block">Open the safe</a></p></div>';
  }
  if (g.added.length) {
    lines.push('NEW IN THE SHOP'); html += head('NEW IN THE SHOP');
    g.added.forEach((p) => { const link = HOST + '/order.html?product=' + encodeURIComponent(p.id); lines.push(p.name, '$' + p.price + ship(p), link, ''); html += card(p, '<div style="font-size:20px;font-weight:bold;color:#C9A45C;margin:6px 0 0">$' + esc(p.price) + '<span style="font-size:13px;font-weight:normal;color:#B9CCC0">' + esc(ship(p)) + '</span></div>', link, 'Get it'); });
  }
  if (g.drops.length) {
    lines.push('PRICE DROPS'); html += head('PRICE DROPS');
    g.drops.forEach((p) => { const link = HOST + '/order.html?product=' + encodeURIComponent(p.id); lines.push(p.name, 'Was ' + usd(p.was) + ', now $' + p.price + ship(p), link, ''); html += card(p, '<div style="margin:6px 0 0"><span style="font-size:15px;color:#8FA89A;text-decoration:line-through">' + usd(p.was) + '</span> <span style="font-size:20px;font-weight:bold;color:#C9A45C">$' + esc(p.price) + '</span> <span style="font-size:13px;color:#8FD3AE">' + Math.round((1 - Number(p.price) / p.was) * 100) + '% off</span></div>', link, 'Get it'); });
  }
  if (g.auctions.length) {
    lines.push('LIVE AUCTIONS'); html += head('LIVE AUCTIONS');
    g.auctions.forEach((p) => { const a = p.auction, link = HOST + '/auction.html?id=' + encodeURIComponent(p.id), ends = new Date(a.ends).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Central';
      const now = (a.bids ? 'Current bid $' : 'Starting bid $') + a.current + ' · ends ' + ends;
      lines.push(p.name.replace(/^Auction:\s*/, ''), now, link, ''); html += card(Object.assign({}, p, { name: p.name.replace(/^Auction:\s*/, '') }), '<div style="font-size:15px;color:#C9A45C;font-weight:bold;margin:6px 0 0">' + esc(now) + '</div>', link, 'Bid now'); });
  }
  if (!g.safe && g.allClaimed) {
    lines.push('Every Deal of the day safe has been opened. New ones are coming soon.', '');
    html += head('DEAL OF THE DAY') + '<div style="font-size:15px;line-height:1.5;margin:0 0 14px">Every safe has been cracked open. New ones are coming soon. Who will open them first?</div>';
  }
  const tip = 'Pay with crypto and take 1% off. There is no wallet to connect and nothing to sign: you just send the payment to the address shown.';
  lines.push(tip, '', 'You are getting this because you ordered from JarFriends or subscribed.' + (addr ? ' JarFriends, ' + addr + '.' : ''), 'Unsubscribe: ' + stop);
  const full = '<div style="background:#0B1712;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#E6EFE9"><div style="max-width:520px;margin:0 auto">' +
    '<div style="font-size:13px;letter-spacing:2px;color:#C9A45C">JARFRIENDS UPDATE</div><h1 style="font-size:26px;margin:8px 0 12px;color:#8FD3AE">What is new at JarFriends</h1>' +
    '<p style="font-size:16px;line-height:1.5;margin:0">' + esc(S.first(name)) + '</p>' + html +
    '<p style="font-size:15px;line-height:1.5;margin:16px 0 10px;background:#12261D;border-radius:8px;padding:12px 14px">' + esc(tip) + '</p>' +
    '<p style="font-size:12px;line-height:1.5;color:#8FA89A;margin:22px 0 0">You are getting this because you ordered from JarFriends or subscribed.' + (addr ? ' JarFriends, ' + esc(addr) + '.' : '') + ' <a href="' + stop + '" style="color:#8FA89A">Unsubscribe</a></p></div></div>';
  return { lines, html: full };
}
// For the back office: what would go out, to how many people, and whether today's update was already sent.
async function preview() {
  const g = await gather(), S = require('./_sweep');
  const who = await S.everyone();
  const run = await store.read('digest/run.json');
  const sentAt = (g.st && g.st.at) || 0;
  return {
    added: g.added.map((p) => ({ name: p.name, price: p.price })), drops: g.drops.map((p) => ({ name: p.name, was: p.was.toFixed(2), price: p.price })),
    auctions: g.auctions.map((p) => ({ name: p.name.replace(/^Auction:\s*/, ''), current: p.auction.current, bids: p.auction.bids })),
    safe: g.safe, allClaimed: g.allClaimed, people: Object.keys(who).length, lastSent: sentAt,
    canSend: Date.now() - sentAt >= DAY || !!(run && !run.finished), sending: !!(run && !run.finished), done: run && !run.finished ? Object.keys(run.done || {}).length : 0,
    empty: !g.added.length && !g.drops.length && !g.auctions.length && !g.safe
  };
}
// Sends a batch; the back office calls again until it says finished. The content is fixed when the send starts.
async function send(startNew, note) {
  note = String(note || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1500);
  const S = require('./_sweep'), lib = require('./_lib');
  let run = await store.read('digest/run.json');
  if (!run || run.finished) {
    if (!startNew) return { error: 'Nothing is being sent.' };
    const st = await baseline();
    if (Date.now() - (st.at || 0) < DAY) return { error: 'Today\'s update was already sent. You can send the next one tomorrow.' };
    const g = await gather();
    if (!g.added.length && !g.drops.length && !g.auctions.length && !g.safe && !note) return { error: 'Nothing new to tell people yet. Write a message to send one anyway.' };
    run = { key: 'digest-' + Date.now().toString(36), at: Date.now(), g: { added: g.added, drops: g.drops, auctions: g.auctions, safe: g.safe, allClaimed: g.allClaimed, note: note }, done: {}, finished: false };
    // What this update covers, so tomorrow's only has what is new after it.
    await store.write('digest/state.json', { at: Date.now(), ids: g.list.map((p) => p.id), prices: Object.assign({}, st.prices, ...g.list.filter((p) => !p.auction).map((p) => ({ [p.id]: Number(p.price) }))), safe: (g.deals.filter((d) => d.state === 'open')[0] || {}).n ? g.deals.filter((d) => d.state === 'open')[0].n + ':' + g.deals.filter((d) => d.state === 'open')[0].id : '', auctions: g.auctions.map((p) => p.id) });
    await store.write('digest/run.json', run);
  }
  const who = await S.everyone(), addr = (process.env.RETURN_ADDRESS || '').replace(/\s*\n\s*/g, ', ').trim();
  const todo = Object.keys(who).filter((e) => !run.done[S.hashOf(e)]);
  const n = run.g.added.length + run.g.drops.length + run.g.auctions.length + (run.g.safe ? 1 : 0);
  const subject = run.g.safe ? (run.g.safe.n >= run.g.safe.total ? 'The Vault is open, plus what is new at JarFriends' : 'Safe ' + run.g.safe.n + ' is open, plus what is new at JarFriends') : n === 1 && run.g.added.length ? 'New at JarFriends: ' + run.g.added[0].name : 'What is new at JarFriends today';
  const noteOnly = run.g.note && !n;
  const subj = noteOnly ? 'JarFriends: ' + run.g.note.split('\n')[0].replace(/[.!?]+$/, '').slice(0, 70) : subject;
  let sent = 0;
  for (const e of todo.slice(0, 35)) {
    if (await S.gone(e)) { run.done[S.hashOf(e)] = 1; continue; }
    const stop = HOST + '/api/unsub?t=' + lib.sign({ un: 1, e: e });
    const m = build(run.g, who[e], stop, addr);
    const out = await lib.mail(e, subj, m.lines, run.key + '-' + S.hashOf(e), m.html).catch(() => 'failed');
    // A failed send is not tried again, so one bad address never holds up the rest.
    run.done[S.hashOf(e)] = out === 'sent' || out === 'duplicate' ? 1 : 'failed'; if (out === 'sent') sent++;
    await new Promise((r) => setTimeout(r, 550));
  }
  const left = Object.keys(who).filter((e) => !run.done[S.hashOf(e)]).length;
  if (!left) run.finished = Date.now();
  await store.write('digest/run.json', run);
  return { ok: true, sent: Object.keys(run.done).length, left: left, finished: !left };
}
module.exports = { preview, send };
