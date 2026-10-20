// The community giveaway: 2% of every sale (out of V2V's fee) goes into the giveaway wallet, which buys VeeFriends
// Series 1 or Series 2 NFTs to give away to active buyers and sellers. Everyone with an account votes on which
// series to buy; people who have really traded on V2V (VOTE_DOUBLE_AFTER paid sales as buyer or seller, 3 unless
// set) get two votes. One vote per account per round; changing your mind replaces your vote.
//
// Storage: giveaway/state.json            { round, open, choices, startedAt, closedAt }
//          giveaway/votes/<round>/<hash>.json { choice, weight, at }
const store = require('./_store');
const M = require('./_sellers');

const CHOICES = ['Series 1', 'Series 2'];
// A third choice: people type what they would rather the wallet buys. Ideas are counted together (same words, any case).
const OTHER = 'Something else';
// Each round of voting lasts this many days (30 unless VOTE_DAYS is set); then a new round starts by itself.
const DAY = 86400000;
const roundDays = () => { const v = Math.floor(Number(process.env.VOTE_DAYS)); return v > 0 ? v : 30; };
const doubleAfter = () => { const v = Math.floor(Number(process.env.VOTE_DOUBLE_AFTER)); return v > 0 ? v : 3; };

async function paths(prefix) {
  if (!store.on()) return [];
  const { list } = await import('@vercel/blob');
  const out = [];
  let cursor;
  do { const r = await list({ prefix: prefix, cursor: cursor, limit: 1000 }); r.blobs.forEach((x) => out.push(x.pathname)); cursor = r.hasMore ? r.cursor : null; } while (cursor);
  return out;
}
async function state() {
  const saved = store.on() ? await store.read('giveaway/state.json') : null;
  const s = Object.assign({ round: 1, open: true, choices: CHOICES, startedAt: 0 }, saved || {});
  const now = Date.now(), len = roundDays() * DAY;
  let changed = false;
  if (!s.startedAt) { s.startedAt = now; changed = true; }
  // Past the end of the round: start the next one (skipping any whole rounds nobody was around for).
  if (now - s.startedAt >= len) {
    const n = Math.floor((now - s.startedAt) / len);
    s.round += n; s.startedAt += n * len; s.open = true; s.closedAt = 0; changed = true;
  }
  s.endsAt = s.startedAt + len;
  if (changed && store.on()) { try { await store.write('giveaway/state.json', s); } catch (e) {} memo = null; }
  return s;
}
async function setRound(action) {
  const s = await state();
  if (action === 'new') Object.assign(s, { round: s.round + 1, open: true, startedAt: Date.now(), closedAt: 0 });
  else if (action === 'close') Object.assign(s, { open: false, closedAt: Date.now() });
  else if (action === 'open') Object.assign(s, { open: true, closedAt: 0 });
  else return { error: 'Unknown action.' };
  await store.write('giveaway/state.json', s);
  memo = null;
  return { ok: true, state: s };
}

// How many paid sales this email took part in, as buyer or as seller, and so how many votes it gets.
async function weightOf(email, rows) {
  email = String(email).toLowerCase();
  rows = rows || await M.ledger(null);
  const shop = await M.byEmail(email).catch(() => null);
  const n = rows.filter((r) => r.paid && (String(r.email || '').toLowerCase() === email || (shop && r.seller === shop.slug))).length;
  return { trades: n, weight: n >= doubleAfter() ? 2 : 1 };
}
async function vote(email, choice, text) {
  const s = await state();
  if (!s.open) return { error: 'Voting for this round is closed.' };
  if (s.choices.indexOf(choice) < 0 && choice !== OTHER) return { error: 'Pick ' + s.choices.join(', ') + ' or ' + OTHER + '.' };
  const idea = String(text || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (choice === OTHER && idea.length < 2) return { error: 'Type what you would like the wallet to buy.' };
  const path = 'giveaway/votes/' + s.round + '/' + M.hashOf(email) + '.json';
  // One vote per account per round (one round a month). A vote cannot be changed once it is in.
  if (await store.read(path)) return { error: 'You already voted this round. The next vote opens ' + new Date(s.endsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Chicago' }) + '.' };
  const w = await weightOf(email);
  // Only people who have bought or sold something on the site (a paid order, ever) may vote.
  if (w.trades < 1) return { error: 'Voting is for buyers and sellers. Buy or sell anything on V2V and you can vote.' };
  await store.write('giveaway/votes/' + s.round + '/' + M.hashOf(email) + '.json', Object.assign({ choice: choice, weight: w.weight, at: Date.now() }, choice === OTHER ? { text: idea } : {}));
  memo = null;
  return { ok: true, weight: w.weight, trades: w.trades };
}
let memo = null;
async function results() {
  const s = await state();
  if (memo && memo.round === s.round && Date.now() - memo.at < 20000) return memo.v;
  const votes = (await Promise.all((await paths('giveaway/votes/' + s.round + '/')).map((p) => store.read(p)))).filter(Boolean);
  const tally = {}, people = {}, ideas = {};
  s.choices.concat([OTHER]).forEach((c) => { tally[c] = 0; people[c] = 0; });
  votes.forEach((v) => {
    if (tally[v.choice] == null) return;
    tally[v.choice] += v.weight || 1; people[v.choice]++;
    if (v.choice === OTHER && v.text) { const k = v.text.toLowerCase(); ideas[k] = ideas[k] || { text: v.text, votes: 0, people: 0 }; ideas[k].votes += v.weight || 1; ideas[k].people++; }
  });
  const v = { round: s.round, open: s.open, endsAt: s.endsAt, days: roundDays(), choices: s.choices, other: OTHER, ideas: Object.keys(ideas).map((k) => ideas[k]).sort((a, b) => b.votes - a.votes).slice(0, 20), tally: tally, people: people, voters: votes.length, doubleAfter: doubleAfter(), startedAt: s.startedAt, closedAt: s.closedAt || 0 };
  memo = { round: s.round, at: Date.now(), v: v };
  return v;
}
async function mine(email) {
  const s = await state();
  const v = await store.read('giveaway/votes/' + s.round + '/' + M.hashOf(email) + '.json');
  const w = await weightOf(email);
  return { choice: v ? v.choice : '', text: v && v.text || '', weight: w.weight, trades: w.trades, can: w.trades >= 1 };
}

module.exports = { OTHER, state, setRound, vote, results, mine, weightOf, doubleAfter, CHOICES };
