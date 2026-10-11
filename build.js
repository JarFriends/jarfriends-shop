// Builds the Collectors Page home page from the design the owner edits in Claude.
// Each time the design is sent to Vercel it lands at SRC; this copies it to public/index.html.
const fs = require('fs'), path = require('path');
const SRC = process.env.SRC_URL || 'https://collectors-page-1a44a92f-30d4-44eb.vercel.app/';
const SELF = process.env.SITE_URL || 'https://collectors-page.vercel.app';
const outDir = process.argv[2] || 'public';
const ok = (h) => /<script type="__bundler\/manifest">/.test(h) && h.length > 100000;

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + url);
  return r.text();
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  let page;
  try {
    page = await get(SRC);
    if (!ok(page)) throw new Error('the design page is not a design bundle');
    console.log('Home page taken from the design: ' + page.length + ' bytes.');
  } catch (e) {
    // The design copy is unreachable: keep publishing the home page that is already live.
    console.log('Design not readable (' + e.message + '). Re-using the live home page.');
    page = await get(SELF + '/');
    if (!ok(page)) throw new Error('No usable home page to publish.');
  }
  fs.writeFileSync(path.join(outDir, 'index.html'), page);
})().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
