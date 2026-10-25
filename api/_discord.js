// Posts one message to a Discord channel through its webhook address. Two channels:
//   orders (default): DISCORD_ORDERS_WEBHOOK_URL (or the older DISCORD_WEBHOOK_URL): new orders, payments, offers
//   sellers: DISCORD_SELLERS_WEBHOOK_URL: every new seller shop
// Without the address nothing is sent. A failure here never stops an order, an offer or a sign-up.
module.exports = async (text, channel) => {
  const url = (channel === 'sellers' ? process.env.DISCORD_SELLERS_WEBHOOK_URL || '' : process.env.DISCORD_ORDERS_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '').trim();
  if (!url) return 'off';
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: String(text).slice(0, 1900), allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(6000) });
    if (!r.ok) console.error('DISCORD_FAIL', channel || 'orders', r.status);
    return r.ok ? 'sent' : 'failed';
  } catch (e) { console.error('DISCORD_FAIL', channel || 'orders', String(e && e.message || e)); return 'failed'; }
};
