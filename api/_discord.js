// Posts one message to a Discord channel through its webhook address. Two channels:
//   orders (default): DISCORD_ORDERS_WEBHOOK_URL (or the older DISCORD_WEBHOOK_URL): new orders, payments, offers
//   sellers: DISCORD_SELLERS_WEBHOOK_URL: every new seller shop
//   shipped: DISCORD_SHIPPED_WEBHOOK_URL: every shipped order or giveaway prize, with tracking and the item's photo (see .shipped)
// Without the address nothing is sent. A failure here never stops an order, an offer or a sign-up.
const send = module.exports = async (text, channel, embed) => {
  const url = (channel === 'sellers' ? process.env.DISCORD_SELLERS_WEBHOOK_URL || '' : channel === 'shipped' ? process.env.DISCORD_SHIPPED_WEBHOOK_URL || '' : process.env.DISCORD_ORDERS_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '').trim();
  if (!url) return 'off';
  try {
    const body = { content: String(text || '').slice(0, 1900), allowed_mentions: { parse: [] } };
    if (embed) body.embeds = [embed];
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) });
    if (!r.ok) console.error('DISCORD_FAIL', channel || 'orders', r.status);
    return r.ok ? 'sent' : 'failed';
  } catch (e) { console.error('DISCORD_FAIL', channel || 'orders', String(e && e.message || e)); return 'failed'; }
};

// One card in the shipped channel: what shipped, the tracking number (linked when the carrier is known) and the photo.
// x: { what, n, tracking, track, from, to, photo (a /api/photo path or full address), test, giveaway }
module.exports.shipped = (x) => {
  const t = String(x.tracking || '');
  const link = x.track || (/^9\d{19,21}$/.test(t) ? 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + t : /^1Z/i.test(t) ? 'https://www.ups.com/track?tracknum=' + t : '');
  const img = x.photo ? (/^https?:/.test(x.photo) ? x.photo : 'https://veefam.io' + x.photo) : '';
  const f = [{ name: 'Tracking', value: link ? '[' + t + '](' + link + ')' : t || '-', inline: false }];
  if (x.n) f.push({ name: x.giveaway ? 'Giveaway' : 'Order', value: String(x.n), inline: true });
  if (x.from) f.push({ name: 'From', value: String(x.from).slice(0, 100), inline: true });
  if (x.to) f.push({ name: 'To', value: String(x.to).slice(0, 100), inline: true });
  const e = { title: ('📦 Shipped' + (x.test ? ' (test label)' : '') + ': ' + (x.what || 'an order')).slice(0, 250), color: 0xd4af37, fields: f, timestamp: new Date().toISOString() };
  if (img) e.image = { url: img };
  return send('', 'shipped', e).catch(() => 'failed');
};
