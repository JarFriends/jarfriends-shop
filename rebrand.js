// Build step, run last: this copy of the shop is V2V, a marketplace of many sellers, not the JarFriends shop.
// The pages, emails and code still carry the JarFriends name and jarfriends.com in places; this swaps both in the
// built copy. JarFriends itself is now one seller on V2V (see SEED_SELLERS in api/_sellers.js).
// SITE_HOST is the address of the site (default v2v-market.vercel.app).
const fs = require('fs'), path = require('path');
const HOST = String(process.env.SITE_HOST || 'v2v-market.vercel.app').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const swaps = [['https://jarfriends.com', 'https://' + HOST], ['jarfriends.com', HOST], ['JarFriends', 'V2V'], ['JARFRIENDS', 'V2V']];
// V2V's own look: charcoal and a warm orange in place of the JarFriends greens and gold, and a modern
// heading face in place of Playfair Display. Every page and email is written in the JarFriends colors; this swaps them.
const COLORS = {
  '#0B1A13': '#0E0F13', '#0B1712': '#0E0F13', '#11261C': '#17191F', '#244536': '#2A2D36', '#4E7A63': '#4A4F5E',
  '#A8BFB1': '#A3A8B8', '#D6E2DA': '#D9DCE5', '#56695E': '#5F6472', '#C9A45C': '#FF6B3D', '#E3C685': '#FF8F6B',
  '#8FD3AE': '#7DD3B0', '#8A6A1F': '#C2410C', '#E6EFE9': '#ECEDF2', '#2E4A3B': '#33363F', '#14271D': '#1C1E25'
};
Object.keys(COLORS).forEach((k) => swaps.push([new RegExp(k, 'gi'), COLORS[k]]));
swaps.push(['family=Playfair+Display:wght@600;700;800', 'family=Space+Grotesk:wght@500;600;700'], ["'Playfair Display',Georgia,serif", "'Space Grotesk',system-ui,sans-serif"], ['"Playfair Display",Georgia,serif', '"Space Grotesk",system-ui,sans-serif']);
let n = 0;
function paint(dir, keep) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (!keep(f) || fs.statSync(p).isDirectory()) continue;
    let s = fs.readFileSync(p, 'utf8');
    const was = s;
    swaps.forEach(([a, b]) => { s = a instanceof RegExp ? s.replace(a, b) : s.split(a).join(b); });
    if (s !== was) { fs.writeFileSync(p, s); n++; }
  }
}
paint(process.argv[2] || 'public', (f) => /\.(html|css|js)$/.test(f));
paint('api', (f) => /\.js$/.test(f));
console.log('rebrand: V2V on ' + n + ' files, host ' + HOST);

// JarFriends-only extras that mean nothing on V2V: the jars (loyalty points) page and its back-office tab, and the
// Customer Loyalty safe page and the "Next safes" tool. Their pages are removed and nothing links to them.
const pub = process.argv[2] || 'public';
['jars.html', 'safe.html', 'admin-jars.js', 'admin-safes.js'].forEach((f) => { const p = path.join(pub, f); if (fs.existsSync(p)) fs.unlinkSync(p); });
const strip = (f, fn) => { const p = path.join(pub, f); if (!fs.existsSync(p)) return; const s = fs.readFileSync(p, 'utf8'), t = fn(s); if (t !== s) fs.writeFileSync(p, t); };
strip('admin.html', (s) => s.replace(/<script src="\/admin-(jars|safes)\.js[^"]*"[^>]*><\/script>\n?/g, ''));
strip('account.html', (s) => s.replace(/\s*<a [^>]*href="\/jars\.html"[^>]*>My jars<\/a>/, '').replace('function jarsCard() {', 'function jarsCard() { return; // V2V has no jars'));
strip('admin-edit.js', (s) => s.replace("if (p.buyers) { var sl = el('a', 'Open the safe (admin view)');", "if (false) { var sl = el('a', 'Open the safe (admin view)');"));
console.log('rebrand: removed the jars and safes pages');
