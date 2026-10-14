// Deal of the day rounds: putting a group of next-round safes on the site, now or queued.
// A queued group (safes/queue.json) stays hidden and locked, and goes live by itself the moment every safe on the
// site has been bought (checked by the sweep, see _sweep.js). Going live sends the usual "safe 1 is open" email.
const store = require('./_store');
const edits = require('./_edits');
const SIZES = { 1: 5, 2: 6 };

async function goLive(g) {
  if (edits.fresh) edits.fresh();
  const all = await edits.apply(require('./_products'), { all: true });
  const slots = Array.from({ length: SIZES[g] || 0 }, (x, i) => all.filter((p) => Number(p.nextDeal) === i + 1 && (Number(p.nextGroup) || 1) === g)[0]);
  if (!slots.length || slots.some((s) => !s)) return { error: 'Fill in every safe in group ' + g + ' first.' };
  // The old round leaves the safes. Its pieces stay in the order history but come off the site.
  const old = all.filter((p) => Number(p.deal) > 0);
  for (const p of old) await edits.save(p.id, { deal: 0, hidden: true });
  for (let i = 0; i < slots.length; i++) await edits.save(slots[i].id, { deal: i + 1, nextDeal: 0, nextGroup: 0, fromGroup: g, hidden: false, shelf: false });
  const q = await store.read('safes/queue.json');
  if (q && q.g === g) await store.write('safes/queue.json', { g: 0, done: Date.now() });
  console.log('SAFES_LIVE', JSON.stringify({ group: g, out: old.map((p) => p.id), in: slots.map((p) => p.id) }));
  return { ok: true, live: slots.map((p) => p.id) };
}
async function queued() { const q = await store.read('safes/queue.json'); return q && q.g ? q : null; }
async function queue(g) { await store.write('safes/queue.json', { g: g, at: Date.now() }); }
async function unqueue() { await store.write('safes/queue.json', { g: 0, at: Date.now() }); }
// Called by the sweep: a queued group goes live once every safe on the site is bought.
async function checkQueue() {
  const q = await queued();
  if (!q) return;
  const off = require('./_offline'), lib = require('./_lib');
  const dl = await off.deals(await lib.getInventory(true));
  if (dl.slots.length && dl.slots.every((s) => s.state === 'sold')) await goLive(q.g);
}
module.exports = { SIZES, goLive, queued, queue, unqueue, checkQueue };
