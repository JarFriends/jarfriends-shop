// A signed-in customer's jars (jars.html).
// GET  ?t=<sign-in>         how many jars they have, and the locked safes ten jars can open.
// POST { t, n }             uses ten jars to open locked safe number n for this customer.
// POST { t, burn, wallet }  burns that many jars, while the owner has a burn open.
const gate = require('./_gate');
const jars = require('./_jars');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const b = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
  const email = gate.emailOf(req.method === 'POST' ? b.t : req.query && req.query.t);
  if (!email) return res.status(401).json({ error: 'Sign in to see your jars.' });
  try {
    const safes = (await jars.lockedSafes());
    const cfg = await jars.burnCfg();
    if (req.method === 'POST' && b.burn != null) {
      // Burning jars, only while the owner has a burn open, in whole burns of cfg.each jars.
      if (!cfg.open) return res.status(400).json({ error: 'There is no burn open right now.' });
      const n = Math.floor(Number(b.burn)), each = Math.max(1, Number(cfg.each) || 1), wallet = String(b.wallet || '').trim().slice(0, 80);
      if (!(n >= each) || n % each) return res.status(400).json({ error: 'Burn jars in groups of ' + each + '.' });
      if (wallet && !/^0x[0-9a-fA-F]{40}$/.test(wallet) && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/i.test(wallet)) return res.status(400).json({ error: 'That wallet address does not look right. It starts with 0x, or is a .eth name. Or leave it blank.' });
      const r = await jars.burn(email, n, { why: cfg.title || 'Burn', wallet: wallet, by: 'customer' });
      if (r.error) return res.status(400).json(r);
      console.log('JARS_BURN', JSON.stringify({ n: n }));
      try { await require('./_discord')('**JARS BURNED** ' + n + ' jar' + (n === 1 ? '' : 's') + ' · ' + email + (wallet ? ' · wallet ' + wallet : '') + ' · ' + (cfg.title || 'burn')); } catch (e) { /* the ping is extra */ }
    } else if (req.method === 'POST') {
      const s = safes.filter((x) => x.n === Number(b.n) && x.state === 'locked')[0];
      if (!s) return res.status(400).json({ error: 'That safe is not locked any more. Reload the page.' });
      const r = await jars.redeem(email, s.pid);
      if (r.error) return res.status(400).json(r);
    } else if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET or POST.' });
    const me = await jars.summary(email);
    res.json({ email: email, jars: me.jars, earned: me.earned, need: me.need, burned: me.burned, burns: me.burns, burn: cfg.open ? { open: true, title: cfg.title, note: cfg.note, each: Math.max(1, Number(cfg.each) || 1) } : { open: false },
      safes: safes.filter((x) => x.state === 'locked').map((x) => (me.passes[x.pid] ? { n: x.n, open: true, pid: x.pid, name: x.name } : { n: x.n, open: false })) });
  } catch (e) {
    console.error('JARS_FAIL', String(e && e.message || e));
    res.status(503).json({ error: 'Could not load your jars right now. Try again shortly.' });
  }
};
