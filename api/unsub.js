// The unsubscribe link in the "new safe unlocked" emails. GET ?t=<signed link> takes that address off the list.
const crypto = require('crypto');
const { verify } = require('./_lib');
const store = require('./_store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const page = (t) => '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>JarFriends</title><body style="margin:0;background:#0B1712;color:#E6EFE9;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center"><div style="max-width:420px;font-size:18px;line-height:1.5">' + t + '</div></body>';
  const t = verify(String((req.query && req.query.t) || ''));
  if (!t || t.un !== 1 || !t.e) return res.status(400).send(page('This unsubscribe link is not valid. Reply to the email and we will take you off the list.'));
  // Opening the link only shows a button. Email apps and spam filters open links on their own, so the address
  // comes off the list only when the button is pressed.
  if (req.method !== 'POST') return res.send(page('Stop getting JarFriends emails about new pieces, price drops and safes?<form method="post" style="margin-top:20px"><button type="submit" style="font-size:17px;font-weight:700;background:#C9A45C;color:#0B1712;border:0;border-radius:999px;padding:12px 26px;cursor:pointer">Unsubscribe</button></form><p style="font-size:14px;color:#8FA89A;margin-top:16px">Changed your mind? Just close this page.</p>'));
  try { await store.write('unsub/' + crypto.createHash('sha1').update(String(t.e).toLowerCase()).digest('hex').slice(0, 20) + '.json', { at: Date.now() }); }
  catch (e) { return res.status(503).send(page('That did not go through. Please try again in a minute.')); }
  res.send(page('You are unsubscribed. You will not get these emails again. Order emails still reach you when you buy something.'));
};
