// Remembers who started a checkout. POST { id, name, email } is sent by the checkout page once the visitor has
// typed an email address. One small file per piece and email address: carts/<product id>~<email hash>.json =
// { at, pid, product, name, email, sent }. The back office lists them (admin.js ?carts=1) and can send one reminder.
const crypto = require('crypto');
const store = require('./_store');
const edits = require('./_edits');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  let b = req.body || {};
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const id = String(b.id || ''), email = String(b.email || '').trim().toLowerCase().slice(0, 160);
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!store.on() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.json({ ok: true });
  try {
    const p = (await edits.apply(require('./_products'), { all: true })).filter((x) => x.id === id)[0];
    if (!p) return res.json({ ok: true });
    const path = 'carts/' + id + '~' + crypto.createHash('sha1').update(email).digest('hex').slice(0, 16) + '.json';
    const was = (await store.read(path)) || {};
    await store.write(path, { at: Date.now(), first: was.first || Date.now(), pid: id, product: p.name, name: name || was.name || '', email: email, sent: was.sent || 0 });
  } catch (e) { console.error('CART_FAIL', id, String(e && e.message || e)); }
  res.json({ ok: true });
};
