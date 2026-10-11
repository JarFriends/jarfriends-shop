// A signed-in customer's jars (jars.html).
// GET  ?t=<sign-in>         how many jars they have, and the locked safes ten jars can open.
// POST { t, n }             uses ten jars to open locked safe number n for this customer.
const gate = require('./_gate');
const jars = require('./_jars');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const b = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
  const email = gate.emailOf(req.method === 'POST' ? b.t : req.query && req.query.t);
  if (!email) return res.status(401).json({ error: 'Sign in to see your jars.' });
  try {
    const safes = (await jars.lockedSafes());
    if (req.method === 'POST') {
      const s = safes.filter((x) => x.n === Number(b.n) && x.state === 'locked')[0];
      if (!s) return res.status(400).json({ error: 'That safe is not locked any more. Reload the page.' });
      const r = await jars.redeem(email, s.pid);
      if (r.error) return res.status(400).json(r);
    } else if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET or POST.' });
    const me = await jars.summary(email);
    res.json({ email: email, jars: me.jars, earned: me.earned, need: me.need,
      safes: safes.filter((x) => x.state === 'locked').map((x) => (me.passes[x.pid] ? { n: x.n, open: true, pid: x.pid, name: x.name } : { n: x.n, open: false })) });
  } catch (e) {
    console.error('JARS_FAIL', String(e && e.message || e));
    res.status(503).json({ error: 'Could not load your jars right now. Try again shortly.' });
  }
};
