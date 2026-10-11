// The shop's own small ledger, kept in Vercel Blob storage (private). One file per sold order:
// sold/<product>/<invoice>~<units>.json. The file name alone carries the count, so stock is worked out from a listing.
// Needs BLOB_READ_WRITE_TOKEN, which Vercel adds when the store is connected to the project.
let sdk = null;
const lib = async () => sdk || (sdk = await import('@vercel/blob'));
const on = () => !!(process.env.BLOB_READ_WRITE_TOKEN || '').trim();

// Every sale on record: [{ pid, n (invoice), q (units), at (ms), path }]. Remembered for 8 seconds.
let memo = null;
async function sales() {
  if (!on()) return [];
  if (memo && Date.now() - memo.at < 8000) return memo.v;
  const { list } = await lib();
  const v = [];
  let cursor;
  do {
    const r = await list({ prefix: 'sold/', cursor: cursor, limit: 1000 });
    (r.blobs || []).forEach((b) => {
      const m = /^sold\/([A-Za-z0-9_-]+)\/([A-Z0-9]+)~(\d+)\.json$/.exec(b.pathname);
      if (m) v.push({ pid: m[1], n: m[2], q: Number(m[3]), at: new Date(b.uploadedAt).getTime(), path: b.pathname });
    });
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  memo = { at: Date.now(), v: v };
  return v;
}
// Units sold so far, by product id.
async function soldBy() {
  const out = {};
  (await sales()).forEach((s) => { out[s.pid] = (out[s.pid] || 0) + s.q; });
  return out;
}
async function write(path, data) {
  const { put } = await lib();
  await put(path, JSON.stringify(data), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  memo = null;
}
async function read(path) {
  const { get } = await lib();
  let r = null;
  try { r = await get(path, { access: 'private' }); } catch (e) { return null; }
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  try { return JSON.parse(await new Response(r.stream).text()); } catch (e) { return null; }
}
// Record one sold order. The same invoice written twice is one sale.
const addSale = (pid, n, q, data) => write('sold/' + pid + '/' + n + '~' + q + '.json', data);

module.exports = { on, sales, soldBy, write, read, addSale };
