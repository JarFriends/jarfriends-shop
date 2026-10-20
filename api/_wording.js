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
    const kind = r && (r.kind === 'hide' || r.kind === 'image') ? r.kind : 'text';
    let page = clean(r && r.page, 80).trim();
    if (page && !/^\/[A-Za-z0-9._\-\/]*$/.test(page)) return { error: 'Page should look like / or /seller.html, or be left empty for every page.' };
    if (page === '/index.html') page = '/';
    const off = !!(r && r.off);
    if (kind !== 'text') {
      // A part of a page, found by its place on the page (a CSS selector the visual editor records).
      const sel = clean(r.sel, 500).trim(), label = clean(r.label, 120).trim();
      if (!sel || /[<{}]/.test(sel)) return { error: 'One of the hidden parts or pictures lost its place. Delete it and add it again.' };
      if (kind === 'hide') { out.push({ kind: kind, sel: sel, label: label, page: page, off: off }); continue; }
      const url = String(r.url || '');
      if (!/^\/api\/photo\?id=[A-Za-z0-9_-]{1,20}$/.test(url)) return { error: 'A picture needs to be uploaded again.' };
      const link = clean(r.link, 300).trim();
      if (link && !/^(https?:\/\/|\/)/.test(link)) return { error: 'A picture link should start with https:// or /.' };
      out.push({ kind: kind, sel: sel, label: label, page: page, off: off, url: url, where: r.where === 'before' ? 'before' : 'after', link: link, alt: clean(r.alt, 150).trim(), size: ['small', 'medium', 'full'].indexOf(r.size) >= 0 ? r.size : 'full' });
      continue;
    }
    const from = clean(r && r.from, 400).trim(), to = clean(r && r.to, 1500).trim();
    if (!from && !to) continue;
    if (from.length < 2) return { error: 'Each word change needs the words it replaces (at least 2 letters).' };
    out.push({ from: from, to: to, page: page, off: off });
  }
  const v = { rules: out, at: Date.now() };
  await store.write('site/wording.json', v);
  memo = { at: Date.now(), v: v };
  return { ok: true, rules: out };
}
module.exports = { get, save };
