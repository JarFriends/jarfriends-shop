// The owner's control over every automatic email, from the back office (Emails tab).
// Each email the site sends is matched to a kind by its subject. For each kind the owner can:
//   - turn it off, so it is never sent (a few are needed for the site to work and cannot be turned off)
//   - write their own subject (use {subject} to keep the usual one inside theirs)
//   - write their own message for the top of the email, and a sign-off for the bottom
// The order details, tracking numbers and pay links always stay in the email, so it still does its job.
// There is also a sign-off added to every email.
// The owner's words can be polished by AI (see _ai.js) before saving; nothing is sent without them saving it.
//
// Storage: emails/settings.json  { kinds: { <id>: { off, subject, top, bottom, at } }, every: { bottom, at } }
const store = require('./_store');

const KINDS = [
  // Buyers
  { id: 'terms', who: 'Buyers and sellers', name: 'Signed Terms of Service copy', re: /^Your signed .+ Terms of Service/i, must: true, about: 'The copy of the Terms someone signed, with their name, date and time, sent once when they sign.' },
  { id: 'code', who: 'Buyers and sellers', name: 'Sign-in code', re: /is your .+ code$/i, must: true, about: 'The 6-digit code people type to confirm their email when they make an account.' },
  { id: 'order', who: 'Buyers', name: 'Order received', re: /^Invoice .+: order received/i, about: 'Sent when a buyer places an order and will pay by Zelle, Venmo, Cash App or later. Lists the order and how to pay.' },
  { id: 'paylink', who: 'Buyers', name: 'Payment link', re: /^Invoice .+: (payment|deposit) link/i, must: true, about: 'The link a buyer uses to pay by card or crypto. Without it they cannot pay.' },
  { id: 'receipt', who: 'Buyers', name: 'Payment receipt', re: /^Invoice .+ (paid|deposit received)$/i, about: 'The receipt after a buyer pays by card or crypto.' },
  { id: 'paid-by-hand', who: 'Buyers', name: 'Payment received (Zelle, Venmo, Cash App)', re: /^Payment received for order/i, about: 'Sent when you mark a Zelle, Venmo or Cash App order as paid.' },
  { id: 'remind', who: 'Buyers', name: 'Payment reminder', re: /^Reminder: payment due/i, about: 'A reminder to a buyer who placed an order but has not paid yet.' },
  { id: 'cart', who: 'Buyers', name: 'Unfinished checkout', re: /^Still thinking about/i, about: 'Sent to someone who started checking out and did not finish.' },
  { id: 'shipped', who: 'Buyers', name: 'Order shipped', re: /(has shipped|is on its way)$/i, about: 'Tells the buyer their order is on its way, with the tracking number.' },
  { id: 'outbid', who: 'Buyers', name: 'Outbid', re: /^You have been outbid/i, about: 'Tells a bidder someone bid more than them.' },
  { id: 'ending', who: 'Buyers', name: 'Auction ending soon', re: /^Ending soon:/i, about: 'Sent to bidders and watchers when an auction has under an hour left.' },
  { id: 'won', who: 'Buyers', name: 'Auction won', re: /^(You won|It is yours):/i, must: true, about: 'Tells the winner they won, with the link to pay.' },
  { id: 'offer-yes', who: 'Buyers', name: 'Offer accepted', re: /^Your offer on .+ was accepted/i, must: true, tail: true, about: 'Tells a buyer their offer was accepted, with the link to pay.' },
  { id: 'offer-reply', who: 'Buyers', name: 'Offer declined or countered', re: /^(About your offer on|Counter offer on)/i, tail: true, about: 'Tells a buyer the seller declined their offer or made a counter offer.' },
  { id: 'offer-late', who: 'Buyers', name: 'Accepted offer running out', re: /^Your offer on .+ runs out soon/i, tail: true, about: 'Reminds a buyer to pay for an accepted offer before it runs out.' },
  { id: 'news', who: 'Buyers', name: 'New pieces and price drops', re: /^(New at |Price drop:|\d+ (new pieces|price drops) at )|plus what is new at/i, about: 'Announcements to people who signed up for news: new pieces and lower prices.' },
  { id: 'trade-answer', who: 'Buyers', name: 'Trade answered', re: /^(Trade accepted:|About your trade for)/i, about: 'Tells a buyer the seller accepted (with how to reach them) or passed on their trade.' },
  // Sellers
  { id: 'trade-new', who: 'Sellers', name: 'New trade request', re: /^Trade request:/i, about: 'Tells a seller someone wants to trade for one of their pieces.' },
  { id: 'trade-accepted', who: 'Sellers', name: 'Trade accepted (to the seller)', re: /^You accepted a trade:/i, about: 'Gives the seller the buyer\'s email after they accept a trade.' },
  { id: 'seller-sale', who: 'Sellers', name: 'New sale (to the seller)', re: /^(Paid, ship it|New order \(not paid yet\)):/i, about: 'Tells a seller they made a sale, and when it is paid and ready to ship.' },
  { id: 'seller-open', who: 'Sellers', name: 'Seller shop approved', re: /seller shop is open$/i, about: 'Tells a new seller their shop is approved and open.' },
  { id: 'seller-paid', who: 'Sellers', name: 'Payout sent', re: /sent you \$/i, about: 'Tells a seller you sent them money for their sales.' },
  { id: 'seller-charge', who: 'Sellers', name: 'Seller charged', re: /charge: \$/i, about: 'Tells a seller they were charged (for example a shipping label), and how.' },
  // The owner
  { id: 'you-order', who: 'You', name: 'New order (to you)', re: /^New order /i, about: 'Tells you about every new order.' },
  { id: 'you-card', who: 'You', name: 'Paid by card (to you)', re: /^Paid by (saved )?card:/i, about: 'Tells you an order was paid by card.' },
  { id: 'you-offer', who: 'You', name: 'New offer (to you)', re: /^Offer: /i, about: 'Tells you about an offer on one of your pieces.' },
  { id: 'you-seller', who: 'You', name: 'New seller (to you)', re: /^New seller:/i, about: 'Tells you someone opened a seller shop.' },
  { id: 'you-help', who: 'You', name: 'Help request (to you)', re: /^Help request from/i, about: 'A buyer wrote in through the help form.' },
  { id: 'you-auction', who: 'You', name: 'Auction results (to you)', re: /^Auction (ended with no bids|winner did not pay|won|passed to next bidder):/i, about: 'Tells you how each auction ended.' },
  { id: 'you-link', who: 'You', name: 'Back office sign-in link', re: /private link to the orders page/i, must: true, about: 'The emailed link that signs you in to the back office.' }
];

const kindOf = (subject) => KINDS.filter((k) => k.re.test(String(subject || '')))[0] || null;
const clip = (v, n) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, n);
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let memo = null;
async function settings() {
  if (memo && Date.now() - memo.at < 30000) return memo.v;
  let v = null;
  try { v = store.on() ? await store.read('emails/settings.json') : null; } catch (e) { v = null; }
  v = v && typeof v === 'object' ? v : {};
  v.kinds = v.kinds || {}; v.every = v.every || {};
  memo = { at: Date.now(), v: v };
  return v;
}
async function save(id, f) {
  const v = JSON.parse(JSON.stringify(await settings()));
  if (id === 'every') v.every = { bottom: clip(f.bottom, 1500), at: Date.now() };
  else {
    const k = KINDS.filter((x) => x.id === id)[0];
    if (!k) return { error: 'That email was not found.' };
    if (f.reset) delete v.kinds[id];
    else v.kinds[id] = { off: !k.must && !!f.off, subject: clip(f.subject, 150).replace(/\n/g, ' '), top: clip(f.top, 3000), bottom: clip(f.bottom, 1500), at: Date.now() };
  }
  await store.write('emails/settings.json', v);
  memo = { at: Date.now(), v: v };
  return { ok: true };
}

// A block of the owner's words for an HTML email.
const block = (text, top) => '<div style="font:15px/1.55 Arial,Helvetica,sans-serif;color:#222222;background:#ffffff;padding:' + (top ? '18px 22px 6px' : '6px 22px 18px') + ';white-space:pre-wrap;word-break:break-word">' + esc(text) + '</div>';
function addTop(html, text) {
  const b = block(text, true);
  const marks = ['<div style="padding:22px">', '<tr><td style="padding:20px 32px 0;"><div'];
  for (const m of marks) { const i = html.indexOf(m); if (i >= 0) return m.indexOf('<tr>') === 0 ? html.slice(0, i) + '<tr><td>' + b + '</td></tr>' + html.slice(i) : html.slice(0, i + m.length) + b + html.slice(i + m.length); }
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => m + b) : b + html;
}
function addBottom(html, text) {
  const b = block(text, false);
  const plain = html.lastIndexOf('<div style="padding:14px 22px;border-top');
  if (plain >= 0) return html.slice(0, plain) + b + html.slice(plain);
  const tr = html.lastIndexOf('<tr><td style="border-top:1px solid #E3DDCD;');
  if (tr >= 0) return html.slice(0, tr) + '<tr><td>' + b + '</td></tr>' + html.slice(tr);
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, b + '</body>') : html + b;
}

// What to actually send: { off } or { subject, lines, html }.
async function apply(subject, lines, html, test, forceId) {
  const v = await settings(), k = forceId ? KINDS.filter((x) => x.id === forceId)[0] || null : kindOf(subject), s = k ? v.kinds[k.id] || {} : {};
  if (k && s.off && !k.must && !test) return { off: true, kind: k.id };
  let subj = subject, out = (Array.isArray(lines) ? lines : [String(lines == null ? '' : lines)]).slice(), h = html;
  if (s.subject) subj = s.subject.indexOf('{subject}') >= 0 ? s.subject.split('{subject}').join(subject) : s.subject;
  if (s.top) { out = s.top.split('\n').concat([''], out); if (h) h = addTop(h, s.top); }
  // Offer emails link to the buyer's offer history on their account page.
  const host = (process.env.SITE_HOST || '').trim();
  if (k && k.tail && host && !test) { const l = 'See every offer you made and how each one went: https://' + host + '/me.html#offers'; out = out.concat(['', l]); if (h) h = addBottom(h, l); }
  const bottom = [s.bottom, v.every.bottom].filter(Boolean).join('\n\n');
  if (bottom) { out = out.concat([''], bottom.split('\n')); if (h) h = addBottom(h, bottom); }
  return { subject: subj, lines: out, html: h, kind: k ? k.id : '' };
}

// The back office list.
async function list() {
  const v = await settings();
  return { ai: require('./_ai').on(), sending: !!((process.env.RESEND_API_KEY || '').trim() && (process.env.EMAIL_FROM || '').trim()),
    every: v.every, kinds: KINDS.map((k) => Object.assign({ id: k.id, who: k.who, name: k.name, about: k.about, must: !!k.must }, v.kinds[k.id] || {})) };
}

// AI polish: the owner writes, AI tidies. Returns the edited text only; it is not saved until the owner saves it.
async function polish(text, how, about) {
  if (!require('./_ai').on()) return { error: 'AI editing is not set up yet.' };
  text = clip(text, 3000);
  if (text.length < 2) return { error: 'Write something first, then AI can tidy it.' };
  const brand = (process.env.BRAND_NAME || 'V2V').trim();
  const r = await fetch(require('./_ai').url(), {
    method: 'POST', signal: AbortSignal.timeout(25000),
    headers: require('./_ai').headers(),
    body: JSON.stringify({
      model: require('./_ai').model(), max_tokens: 800,
      system: 'You edit short emails that the owner of ' + brand + ', a marketplace for VeeFriends collectibles, sends to buyers and sellers. Keep the owner\'s meaning and voice. Fix spelling and grammar and make it clear and friendly. Do not add facts, prices, dates, discounts or promises the owner did not write. Keep it about the same length unless asked otherwise. Reply with the edited text only, no quotes and no notes.',
      messages: [{ role: 'user', content: 'This text goes in the "' + clip(about, 120) + '" email.' + (clip(how, 200) ? ' How to change it: ' + clip(how, 200) + '.' : '') + '\n\nText:\n' + text }]
    })
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  if (!r.ok) { console.error('AI_FAIL', r.status, (await r.text()).slice(0, 300)); return { error: 'AI could not edit it just now. Try again in a minute.' }; }
  const j = await r.json();
  const out = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  return out ? { text: out } : { error: 'AI sent nothing back. Try again.' };
}

// A sample of one email with the owner's words, sent to the owner only.
async function test(id) {
  const k = KINDS.filter((x) => x.id === id)[0];
  if (!k) return { error: 'That email was not found.' };
  const owner = (process.env.OWNER_EMAIL || '').trim();
  if (!owner) return { error: 'Set OWNER_EMAIL in the Vercel environment variables first.' };
  const p = await apply(k.name, ['[The usual details of this email go here: ' + k.about + ']'], null, true, id);
  const out = await require('./_lib').mail(owner, '[Sample] ' + p.subject, p.lines, 'emailtest-' + id + '-' + Date.now());
  return out === 'sent' ? { ok: true, to: owner } : { error: out === 'off' ? 'Email sending is not set up yet (RESEND_API_KEY and EMAIL_FROM).' : 'The sample did not send. Try again.' };
}

module.exports = { test, KINDS, kindOf, settings, save, apply, list, polish };
