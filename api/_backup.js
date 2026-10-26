// Backups of everything the site keeps in storage, so it can be rebuilt if anything is lost.
//   backups/<YYYY-MM-DD>.json   every data file (shops, listings, orders, payouts, offers, accounts, settings…) in one
//                               file: { at, files: { path: data } }. One a day, kept for 60 days.
//   backups/photos/<name>       a copy of every photo, made once (photos never change after upload).
// Made each day by the daily job (party.js), or any time from the back office (Backup tab), which also downloads it.
const store = require('./_store');
const SKIP = /^(backups\/|cartbuzz\/|ship\/remind-)/;

async function listAll(prefix) {
  const { list } = await import('@vercel/blob');
  const out = []; let cursor;
  do { const r = await list({ prefix: prefix || '', cursor: cursor, limit: 1000 }); (r.blobs || []).forEach((b) => out.push(b)); cursor = r.hasMore ? r.cursor : null; } while (cursor);
  return out;
}
async function snapshot() {
  if (!store.on()) return { error: 'Storage is not connected.' };
  const all = await listAll(''), files = {}, photos = [];
  const json = all.filter((b) => !SKIP.test(b.pathname) && /\.json$/.test(b.pathname));
  for (let i = 0; i < json.length; i += 25) {
    const part = json.slice(i, i + 25);
    const got = await Promise.all(part.map((b) => store.read(b.pathname).catch(() => null)));
    part.forEach((b, j) => { if (got[j] != null) files[b.pathname] = got[j]; });
  }
  // Photos: copy any not backed up yet.
  const have = {}; all.filter((b) => b.pathname.indexOf('backups/photos/') === 0).forEach((b) => { have[b.pathname.slice(15)] = 1; });
  const { get, put, del } = await import('@vercel/blob');
  let copied = 0;
  for (const b of all.filter((x) => x.pathname.indexOf('photos/') === 0)) {
    const name = b.pathname.slice(7); photos.push(name);
    if (have[name] || copied >= 300) continue;
    try { const g = await get(b.pathname, { access: 'private', useCache: false }); if (g && g.statusCode === 200 && g.stream) { const buf = Buffer.from(await new Response(g.stream).arrayBuffer()); await put('backups/photos/' + name, buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: b.contentType || 'image/jpeg' }); copied++; } } catch (e) { /* next time */ }
  }
  const day = new Date().toISOString().slice(0, 10), body = { at: Date.now(), count: Object.keys(files).length, photos: photos, files: files };
  await put('backups/' + day + '.json', JSON.stringify(body), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  // Keep 60 days.
  const old = all.filter((b) => /^backups\/\d{4}-\d{2}-\d{2}\.json$/.test(b.pathname) && Date.now() - Date.parse(b.pathname.slice(8, 18)) > 60 * 864e5).map((b) => b.url);
  if (old.length) await del(old).catch(() => null);
  return { ok: true, day: day, files: body.count, photos: photos.length, photosCopied: copied };
}
async function latest() {
  const days = (await listAll('backups/')).filter((b) => /^backups\/\d{4}-\d{2}-\d{2}\.json$/.test(b.pathname)).sort((a, b) => (a.pathname < b.pathname ? 1 : -1));
  return days.map((b) => ({ day: b.pathname.slice(8, 18), size: b.size, path: b.pathname }));
}
module.exports = { snapshot, latest };
