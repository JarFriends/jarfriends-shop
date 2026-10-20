// The owner's own wording for the site: "where it says this, say that instead", set in the back office's Wording tab.
// nav.js (on every page) loads the list and swaps the words as the page shows them.
// Storage: site/wording.json { rules: [{ from, to, page }], at }   page: '' for every page, or a path like /seller.html
const store = require('./_store');

let memo = null;
async function get() {
  if (memo && Date.now() - memo.at < 15000) return memo.v;
  let v = null;
  try { v = store.on() ? await store.read('site/wording.json') : null; } catch (e) { v = null; }
  v = v && Array.isArray(v.rules) ? v : { rules: [] };
  memo = { at: Date.now(), v: v };
  return v;
}
const clean = (x, n) => String(x == null ? '' : x).replace(/\r/g, '').slice(0, n);
async function save(rules) {
  if (!Array.isArray(rules)) return { error: 'Nothing to save.' };
  if (rules.length > 300) return { error: 'Keep it to 300 changes or fewer.' };
  const out = [];
  for (const r of rules) {
    const from = clean(r && r.from, 400).trim(), to = clean(r && r.to, 1500).trim();
    let page = clean(r && r.page, 80).trim();
    if (!from && !to) continue;
    if (from.length < 2) return { error: 'Each change needs the words it replaces (at least 2 letters).' };
    if (page && !/^\/[A-Za-z0-9._\-\/]*$/.test(page)) return { error: 'Page should look like / or /seller.html, or be left empty for every page.' };
    if (page === '/index.html') page = '/';
    out.push({ from: from, to: to, page: page, off: !!(r && r.off) });
  }
  const v = { rules: out, at: Date.now() };
  await store.write('site/wording.json', v);
  memo = { at: Date.now(), v: v };
  return { ok: true, rules: out };
}
module.exports = { get, save };
