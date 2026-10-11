// Build step: the owner can answer an offer with a counter offer. Runs after patchhold.js (it builds on its text).
// A counter emails the buyer a checkout link at the owner's price, good for 48 hours, and holds the pieces meanwhile.
// Each change is [file, text to find, text to put in its place]; the text to find must be there exactly once.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/offer.js', R`    return res.status(400).json({ error: 'Choose accept or decline.' });`, R`    if (b.do === 'counter') {
      const cents = Math.round(Number(String(b.price == null ? '' : b.price).replace(/[$,\s]/g, '')) * 100);
      if (!(cents > 0)) return res.status(400).json({ error: 'Enter your counter offer as a dollar amount.' });
      if (cents <= o.c) return res.status(400).json({ error: 'Your counter is not above their offer of ' + money(o.c) + '. Accept the offer instead.' });
      if (cents >= o.l) return res.status(400).json({ error: 'Your counter is the listed price of ' + money(o.l) + ' or more. Decline instead, and they can buy at the listed price.' });
      const until = now + HOLD_HOURS * 3600;
      let left = null, mine = 0;
      try { left = (await getInventory(true)).filter((x) => x.id === o.pid)[0]; mine = await holds.mine(o.n); } catch (e) { console.error('HOLD_CHECK_FAIL', o.n, String(e && e.message || e)); }
      if (left && left.stock + mine < o.q) return res.status(409).json({ error: 'There are not enough left in stock to counter this offer.' });
      try { await holds.add(o.pid, o.n, o.q, until); } catch (e) { console.error('HOLD_FAIL', o.n, String(e && e.message || e)); }
      const deal = sign({ oa: 1, n: o.n, pid: o.pid, q: o.q, c: cents, x: until });
      const link = host + '/order.html?offer=' + deal + (PAYS[o.w] ? '&method=' + PAYS[o.w] : '');
      const out = await Promise.all([mail(o.e, 'Counter offer on ' + o.i + ': ' + money(cents) + ' each', [
        'Thanks for your offer of ' + money(o.c) + ' each for ' + o.q + ' x ' + o.i + '.', '',
        'We cannot do that price, but we can do ' + money(cents) + ' each.', '',
        'Amount due at that price: ' + money(cents * o.q) + ', plus any shipping and tax shown at checkout.', '',
        'If that works for you, complete your order and pay here. The link is good for ' + HOLD_HOURS + ' hours:', link, '',
        'It is held for you until the link runs out. If the price does not work, you are welcome to send another offer.'
      ], hash('offer-counter|' + o.n + '|' + cents)), log(Object.assign({}, o, { c: cents }), 'Countered at ' + money(cents) + ' (they offered ' + money(o.c) + ')', o.n + '-countered')]);
      return res.json({ ok: true, done: 'countered', emailed: out[0] });
    }
    return res.status(400).json({ error: 'Choose accept, counter or decline.' });`],
  ['public/offer.html', R`    <div class="small" id="msg" role="status"></div>`, R`    <div id="cBox" style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;border-top:1px solid #244536;padding-top:14px">
      <label style="flex:1 1 160px;min-width:0"><span>Or counter with your price, each</span><input id="cPrice" inputmode="decimal" autocomplete="off" placeholder="0.00"></label>
      <button type="button" class="ghost" id="counter">Send counter offer</button>
    </div>
    <div class="small" id="msg" role="status"></div>`],
  ['public/offer.html', R`Decline and they get a polite no.'`, R`Counter and they get a checkout link at your price instead. Decline and they get a polite no.'`],
  ['public/offer.html', R`JSON.stringify({ t: token, do: what })`, R`JSON.stringify({ t: token, do: what, price: $('cPrice').value })`],
  ['public/offer.html', R`          $('acts').style.display = 'none';
          $('head').textContent = x.done === 'accepted' ? 'Offer accepted' : 'Offer declined';`, R`          $('acts').style.display = 'none'; $('cBox').style.display = 'none';
          $('head').textContent = x.done === 'accepted' ? 'Offer accepted' : x.done === 'countered' ? 'Counter offer sent' : 'Offer declined';`],
  ['public/offer.html', R`    $('nope').addEventListener('click', function () { act('decline'); });`, R`    $('nope').addEventListener('click', function () { act('decline'); });
    $('counter').addEventListener('click', function () { act('counter'); });`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchcounter: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
