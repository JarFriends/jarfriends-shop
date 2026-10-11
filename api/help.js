// The Help form (help.html). POST { name, email, topic, issue, fix } emails the shop owner the visitor's answers.
const crypto = require('crypto');
const { mail } = require('./_lib');
const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  // A hidden field people never see. Anything in it means a bot filled the form.
  if (clip(b.website, 10)) return res.json({ ok: true });
  const name = clip(b.name, 80), email = clip(b.email, 160), order = clip(b.order, 40);
  const topic = clip(b.topic, 200), issue = clip(b.issue, 2000), fix = clip(b.fix, 1000);
  if (!name) return res.status(400).json({ error: 'Enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter your email so we can answer you.' });
  if (!topic || !issue) return res.status(400).json({ error: 'Tell us what you need help with and what the issue is.' });
  const owner = (process.env.OWNER_EMAIL || '').trim();
  if (!owner) return res.status(503).json({ error: 'Help is not set up yet. Email us instead.' });
  // The same message sent twice is one email.
  const key = 'help-' + crypto.createHash('sha1').update(email + '|' + topic + '|' + issue).digest('hex').slice(0, 20);
  const out = await mail(owner, 'Help request from ' + name + ': ' + topic.slice(0, 60), ['From: ' + name + ' <' + email + '>', order ? 'Order number: ' + order : 'Order number: not given', '', 'What do you need help with?', topic, '', 'What is the issue?', issue, '', 'How would you like us to resolve it?', fix || '(left blank)', '', 'Reply to ' + email + ' to answer.'], key).catch(() => 'failed');
  if (out !== 'sent' && out !== 'duplicate') return res.status(502).json({ error: 'Could not send your message just now. Email us at jarvisfriends@gmail.com.' });
  res.json({ ok: true });
};
