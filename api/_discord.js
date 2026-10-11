// Posts one message to the owner's Discord channel. Needs DISCORD_WEBHOOK_URL (the channel's webhook address).
// Without it nothing is sent. A failure here never stops an order or an offer.
module.exports = async (text) => {
  const url = (process.env.DISCORD_WEBHOOK_URL || '').trim();
  if (!url) return 'off';
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: String(text).slice(0, 1900) }), signal: AbortSignal.timeout(6000) });
    if (!r.ok) console.error('DISCORD_FAIL', r.status);
    return r.ok ? 'sent' : 'failed';
  } catch (e) { console.error('DISCORD_FAIL', String(e && e.message || e)); return 'failed'; }
};
