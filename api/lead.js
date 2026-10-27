// Public: receive a finished Curator chat, add it to the owner's sheet and email the owner.
const crypto = require('crypto');

const FIELDS = [['mode', 'Next step'], ['name', 'Name'], ['phone', 'Phone'], ['collects', 'Collects'], ['product', 'Piece'], ['units', 'Quantity'], ['budget', 'Budget'], ['location', 'Delivery location'], ['date', 'Deliver by or call day'], ['help', 'Request']];
const recent = new Map();

async function toSheet(when, d, ref) {
  const url = (process.env.SHEET_WEBHOOK_URL || '').trim();
  if (!url) return 'off';
  try {
    const body = JSON.stringify({ tab: 'Leads', key: ref, headers: ['Received'].concat(FIELDS.map((f) => f[1]), ['Status', 'Ref']), row: [when].concat(FIELDS.map((f) => d[f[0]]), ['New', ref]) });
    const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json', 'x-v2v-sig': require('./_lib').sheetSig(body) }, body: body });
    const t = (await r.text()).trim();
    if (r.ok && (t === 'ok' || t === 'duplicate')) return 'saved';
    console.error('SHEET_FAIL', r.status, t.slice(0, 200));
    return 'failed';
  } catch (e) { console.error('SHEET_FAIL', String(e)); return 'failed'; }
}

async function toEmail(when, d, ref) {
  const key = (process.env.RESEND_API_KEY || '').trim(), from = (process.env.EMAIL_FROM || '').trim(), to = (process.env.OWNER_EMAIL || '').trim();
  if (!key || !from || !to) return 'off';
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rows = [['Received', when]].concat(FIELDS.map((f) => [f[1], d[f[0]] || '-']));
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#101726;"><h2 style="margin:0 0 12px;">New lead from the Curator chat</h2><table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'
    + rows.map((r) => '<tr><td style="padding:8px 16px 8px 0;border-bottom:1px solid #E3DDCD;color:#5B6478;font-size:13px;vertical-align:top;white-space:nowrap;">' + esc(r[0]) + '</td><td style="padding:8px 0;border-bottom:1px solid #E3DDCD;font-size:15px;">' + esc(r[1]) + '</td></tr>').join('')
    + '</table><p style="font-size:12px;color:#5B6478;">Ref ' + ref + '</p></div>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(9000),
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'idempotency-key': 'lead-' + ref },
      body: JSON.stringify({ from: from, to: [to], subject: 'New lead: ' + d.name + (d.product ? ' / ' + d.product : ''), text: rows.map((r) => r[0] + ': ' + r[1]).join('\n'), html: html })
    });
    if (r.ok) return 'sent';
    console.error('LEAD_EMAIL_FAIL', r.status, (await r.text()).slice(0, 200));
    return 'failed';
  } catch (e) { console.error('LEAD_EMAIL_FAIL', String(e)); return 'failed'; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const src = (req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : req.query) || {};
  const clip = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 300);
  const d = {};
  for (const f of FIELDS) d[f[0]] = clip(src[f[0]]);
  res.setHeader('Access-Control-Allow-Origin', '*');
  const json = String(src.format || '') === 'json';
  const back = (state) => {
    if (json) return res.status(200).json({ ok: state === 'ok', state: state });
    res.statusCode = 302; res.setHeader('Location', '/thanks.html?s=' + state); res.end();
  };
  const email = String(src.email == null ? '' : src.email).trim().slice(0, 160);
  const okEmail = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email);
  if (!d.name || !d.phone) return back('missing');
  if (okEmail) d.phone = d.phone + ' / ' + email;
  const ref = crypto.createHash('sha256').update(FIELDS.map((f) => d[f[0]]).join('|')).digest('hex').slice(0, 10).toUpperCase();
  if (recent.has(ref) && Date.now() - recent.get(ref) < 600000) return back('ok');
  const when = new Date().toLocaleString('en-US', { timeZone: process.env.LEADS_TZ || 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });
  const out = await Promise.all([toSheet(when, d, ref), toEmail(when, d, ref)]);
  console.log('LEAD', JSON.stringify({ ref: ref, sheet: out[0], email: out[1] }));
  if (out[0] !== 'saved' && out[1] !== 'sent') return back('fail');
  if (recent.size > 500) recent.clear();
  recent.set(ref, Date.now());
  back('ok');
};
