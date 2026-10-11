// Build step, run last: emails carry the JarFriends name and, when they are about a piece, that piece's photo.
// 1. The product photos live inside the home page design. They are copied out to /photos/<product id>.jpg so an
//    email can show them.
// 2. The site's mail sender (api/_lib.js) is wrapped: a plain email gets a JarFriends header, the photo and a footer;
//    an email that already has a layout (an invoice) just gets the photo added at the top.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const dir = process.argv[2] || 'public';

const page = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const open = '<script type="__bundler/manifest">';
const at = page.indexOf(open);
const found = {};
if (at >= 0) {
  const files = JSON.parse(page.slice(at + open.length, page.indexOf('</script>', at)));
  Object.keys(files).forEach((k) => {
    const f = files[k];
    if (!f || typeof f.data !== 'string' || !/html|javascript/.test(f.mime || '')) return;
    const text = f.compressed ? zlib.gunzipSync(Buffer.from(f.data, 'base64')).toString('utf8') : Buffer.from(f.data, 'base64').toString('utf8');
    const re = /\\?"([A-Z][A-Z0-9]{1,19})\\?":\s*\\?"data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)/g;
    let m;
    while ((m = re.exec(text))) if (!found[m[1]]) found[m[1]] = m[2];
  });
}
fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
Object.keys(found).forEach((id) => fs.writeFileSync(path.join(dir, 'photos', id + '.jpg'), Buffer.from(found[id], 'base64')));
console.log('emailstyle: photos for', Object.keys(found).join(', ') || 'none');

const wrap = `
// ---- Added at build by emailstyle.js: the JarFriends look for every email, with the piece's photo.
(function () {
  const send = module.exports.mail;
  if (typeof send !== 'function') return;
  const HAS = ${JSON.stringify(Object.keys(found))};
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // The party listing shows the same comic as the regular one.
  const photoOf = (id) => (HAS.indexOf(id) >= 0 ? id : id === 'MPARTY' && HAS.indexOf('MONSTER') >= 0 ? 'MONSTER' : '');
  let names = null;
  const pieces = () => names || (names = require('./_products').map((p) => ({ id: photoOf(p.id), name: String(p.name).replace(/: Party Pricing$/, '') })).filter((x) => x.id).sort((a, b) => b.name.length - a.name.length));
  module.exports.mail = function (to, subject, lines, key, html) {
    try {
      const list = Array.isArray(lines) ? lines : [String(lines == null ? '' : lines)];
      const text = String(subject) + '\\n' + list.join('\\n');
      const hit = pieces().filter((x) => text.indexOf(x.name) >= 0)[0];
      const img = hit ? '<div style="text-align:center;margin:0 0 18px"><img src="https://jarfriends.com/photos/' + hit.id + '.jpg" alt="' + esc(hit.name) + '" width="260" style="max-width:100%;height:auto;border-radius:8px"></div>' : '';
      if (html) {
        if (img) html = /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => m + img) : img + html;
      } else {
        const body = list.map((l) => (l ? '<p style="margin:0 0 10px;word-break:break-word">' + esc(l).replace(/(https?:\\/\\/[^\\s<]+)/g, '<a href="$1" style="color:#8A6A1F">$1</a>') + '</p>' : '<div style="height:8px"></div>')).join('');
        html = '<div style="max-width:560px;margin:0 auto;border:1px solid #dddddd;font:15px/1.5 Arial,Helvetica,sans-serif;color:#222222;background:#ffffff">'
          + '<div style="background:#0B1A13;color:#F7F2E6;padding:16px 22px;font:800 20px Arial,Helvetica,sans-serif;letter-spacing:.04em">JarFriends</div>'
          + '<div style="padding:22px">' + img + body + '</div>'
          + '<div style="padding:14px 22px;border-top:1px solid #dddddd;font-size:12px;color:#666666">JarFriends &middot; jarfriends.com &middot; Chicago, IL</div></div>';
      }
    } catch (e) { console.error('MAIL_STYLE_FAIL', String(e && e.message || e)); }
    return send(to, subject, lines, key, html);
  };
})();
`;
const lib = path.join('api', '_lib.js');
const src = fs.readFileSync(lib, 'utf8');
if (src.indexOf('Added at build by emailstyle.js') < 0) fs.writeFileSync(lib, src + wrap);
