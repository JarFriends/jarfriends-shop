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
  const s = store.on() ? await store.read('giveaway/state.json') : null;
  return Object.assign({ round: 1, open: true, choices: CHOICES, startedAt: 0 }, s || {});
}
async function setRound(action) {
  const s = await state();
  if (action === 'new') Object.assign(s, { round: s.round + 1, open: true, startedAt: Date.now(), closedAt: 0 });
  else if (action === 'close') Object.assign(s, { open: false, closedAt: Date.now() });
  else if (action === 'open') Object.assign(s, { open: true, closedAt: 0 });
  else return { error: 'Unknown action.' };
  await store.write('giveaway/state.json', s);
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
async function vote(email, choice) {
  const s = await state();
  if (!s.open) return { error: 'Voting for this round is closed.' };
  if (s.choices.indexOf(choice) < 0) return { error: 'Pick ' + s.choices.join(' or ') + '.' };
  const w = await weightOf(email);
  await store.write('giveaway/votes/' + s.round + '/' + M.hashOf(email) + '.json', { choice: choice, weight: w.weight, at: Date.now() });
  memo = null;
  return { ok: true, weight: w.weight, trades: w.trades };
}
let memo = null;
async function results() {
  const s = await state();
  if (memo && memo.round === s.round && Date.now() - memo.at < 20000) return memo.v;
  const votes = (await Promise.all((await paths('giveaway/votes/' + s.round + '/')).map((p) => store.read(p)))).filter(Boolean);
  const tally = {}, people = {};
  s.choices.forEach((c) => { tally[c] = 0; people[c] = 0; });
  votes.forEach((v) => { if (tally[v.choice] != null) { tally[v.choice] += v.weight || 1; people[v.choice]++; } });
  const v = { round: s.round, open: s.open, choices: s.choices, tally: tally, people: people, voters: votes.length, doubleAfter: doubleAfter(), startedAt: s.startedAt, closedAt: s.closedAt || 0 };
  memo = { round: s.round, at: Date.now(), v: v };
  return v;
}
async function mine(email) {
  const s = await state();
  const v = await store.read('giveaway/votes/' + s.round + '/' + M.hashOf(email) + '.json');
  const w = await weightOf(email);
  return { choice: v ? v.choice : '', weight: w.weight, trades: w.trades };
}

module.exports = { state, setRound, vote, results, mine, weightOf, doubleAfter, CHOICES };
