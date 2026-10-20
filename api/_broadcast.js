// Emails the owner writes and sends from the back office to members: everyone with an account, sellers, or people
// who have bought something. Each email carries an unsubscribe link (the same list as the other news emails), and
// people who unsubscribed are skipped. Sending goes in small batches; the back office calls again for the next batch.
const crypto = require('crypto');
const store = require('./_store');
const lib = require('./_lib');
const M = require('./_sellers');

const hashOf = (e) => crypto.createHash('sha1').update(String(e).toLowerCase()).digest('hex').slice(0, 20);
const HOST = () => 'https://' + String(process.env.SITE_HOST || 'veefam.io').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const BATCH = 20;

async function paths(prefix) {
  if (!store.on()) return [];
  const { list } = await import('@vercel/blob');
  const out = []; let cursor;
  do { const r = await list({ prefix: prefix, cursor: cursor, limit: 1000 }); r.blobs.forEach((x) => out.push(x.pathname)); cursor = r.hasMore ? r.cursor : null; } while (cursor);
  return out;
}
async function gone(e) { const r = await store.read('unsub/' + hashOf(e) + '.json'); return !!(r && r.at && !(r.back > r.at)); }
const okEmail = (e) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(e);

// Who gets it: 'all' (every account), 'sellers', 'buyers' (anyone with a paid order). Sorted so batches are stable.
async function people(aud) {
  const set = {};
  const add = (e) => { e = String(e || '').trim().toLowerCase(); if (okEmail(e)) set[e] = 1; };
  if (aud === 'sellers' || aud === 'all') (await M.all()).forEach((s) => { if (!s.removed) add(s.email); });
  if (aud === 'buyers' || aud === 'all') (await M.ledger(null)).forEach((r) => { if (r.paid) add(r.email); });
  if (aud === 'all') (await Promise.all((await paths('users/')).map((p) => store.read(p)))).forEach((u) => { if (u && !u.deleted) add(u.email); });
  const list = Object.keys(set).sort();
  const keep = [];
  for (const e of list) if (!(await gone(e))) keep.push(e);
  return { list: keep, skipped: list.length - keep.length };
}
async function count(aud) { const p = await people(aud); return { count: p.list.length, skipped: p.skipped }; }

function build(subject, text, img, to) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const stop = HOST() + '/api/unsub?t=' + lib.sign({ un: 1, e: to });
  const esc = lib.esc;
  const html = '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.55;color:#14201A;max-width:560px">'
    + (img ? '<p><img src="' + esc(HOST() + img) + '" alt="" style="max-width:100%;height:auto;border-radius:6px"></p>' : '')
    + lines.map((l) => l.trim() ? '<p style="margin:0 0 12px">' + esc(l) + '</p>' : '').join('')
    + '<p style="margin:24px 0 0;font-size:13px;color:#6B7A72">You are getting this because you have an account on ' + esc(HOST().replace('https://', '')) + '. <a href="' + esc(stop) + '">Unsubscribe</a></p></div>';
  return { lines: lines.concat(['', 'Unsubscribe: ' + stop]), html: html };
}
function check(b) {
  const subject = String(b.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 150), text = String(b.text || '').slice(0, 8000).trim();
  if (subject.length < 2) return { error: 'Write a subject line.' };
  if (text.length < 2) return { error: 'Write your message.' };
  const img = /^\/api\/photo\?id=[A-Za-z0-9_-]{1,20}$/.test(String(b.img || '')) ? String(b.img) : '';
  return { subject: subject, text: text, img: img };
}
// One batch. b: { aud, subject, text, img, id (this send's id), from (where this batch starts), test (send only to the owner) }
async function send(b, ownerEmail) {
  const c = check(b); if (c.error) return c;
  if (b.test) {
    const to = String(ownerEmail || process.env.OWNER_EMAIL || '').trim();
    if (!okEmail(to)) return { error: 'Add OWNER_EMAIL in Vercel so test emails know where to go.' };
    const m = build(c.subject, c.text, c.img, to);
    const r = await lib.mail(to, '[Test] ' + c.subject, m.lines, 'bc-test-' + Date.now(), m.html);
    return r === 'sent' ? { ok: true, sent: 1, to: to } : { error: r === 'off' ? 'Emails are not set up yet: add RESEND_API_KEY and EMAIL_FROM in Vercel.' : 'The test email did not send. Try again.' };
  }
  if (['all', 'sellers', 'buyers'].indexOf(b.aud) < 0) return { error: 'Pick who gets it.' };
  const id = /^[a-z0-9]{6,20}$/.test(String(b.id || '')) ? b.id : null; if (!id) return { error: 'Start the send again.' };
  const from = Math.max(0, Math.floor(Number(b.from) || 0));
  const { list } = await people(b.aud);
  const part = list.slice(from, from + BATCH);
  let sent = 0, failed = 0, off = false;
  for (const to of part) {
    const m = build(c.subject, c.text, c.img, to);
    const r = await lib.mail(to, c.subject, m.lines, 'bc-' + id + '-' + hashOf(to), m.html);
    if (r === 'sent') sent++; else if (r === 'off') { off = true; break; } else failed++;
  }
  if (off) return { error: 'Emails are not set up yet: add RESEND_API_KEY and EMAIL_FROM in Vercel.' };
  const next = from + part.length;
  if (from === 0) await store.write('broadcasts/' + id + '.json', { id: id, aud: b.aud, subject: c.subject, text: c.text, img: c.img, total: list.length, at: Date.now() });
  return { ok: true, sent: sent, failed: failed, next: next < list.length ? next : null, total: list.length };
}
async function history() {
  const all = (await Promise.all((await paths('broadcasts/')).map((p) => store.read(p)))).filter(Boolean);
  return all.sort((a, b) => b.at - a.at).slice(0, 30);
}
module.exports = { count, send, history };
