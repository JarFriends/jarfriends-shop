// Build step (after patchcarts.js): NFT orders. The back office gets a "Sent" button on an NFT order in place of
// "Add tracking"; pressing it marks the NFT as sent and emails the buyer to check their wallet.
const fs = require('fs');
const R = String.raw;
const changes = [
  // GET ?k=<key>&nftsent=<invoice>  owner only: marks an NFT order as sent and tells the buyer.
  ['api/admin.js', R`  if (req.query && req.query.msgs) {`, R`  if (req.query && req.query.nftsent) {
    const s = sales.filter((x) => x.n === String(req.query.nftsent))[0];
    if (!s) return res.status(404).json({ error: 'That order was not found.' });
    const d = (await store.read(s.path)) || {}, was = (await store.read('meta/' + s.n + '.json')) || {};
    const wallet = (/^NFT to wallet (\S+)/.exec(d.ship || '') || [])[1] || '';
    if (!wallet) return res.status(400).json({ error: 'That order is not an NFT order.' });
    let sent = 'duplicate';
    if (!was.nftSentAt) {
      await store.write('meta/' + s.n + '.json', Object.assign(was, { nftSentAt: Date.now() }, was.paidAt ? {} : { paidAt: Date.now(), paidHow: 'nft' }));
      sent = 'none';
      if (d.email) sent = await mail(d.email, 'Congrats! Your NFT has been sent: check your wallet', ['Congrats!', '', 'Your ' + (d.product || 'NFT') + ' has been sent to your wallet:', wallet, '', 'Open your wallet, or your profile on OpenSea, to see it. It can take a few minutes to show up.', '', 'Thank you for your order ' + s.n + '.'], 'nft-sent-' + s.n).catch(() => 'failed');
    }
    return res.json({ ok: true, emailed: sent === 'sent' || sent === 'duplicate' });
  }
  if (req.query && req.query.msgs) {`],
  ['api/admin.js', R`shippedAt: m.shippedAt || 0,`, R`shippedAt: m.shippedAt || 0, nftSentAt: m.nftSentAt || 0,`],
  // An NFT order has nothing to ship, so no "Add tracking".
  ['public/admin.html', R`      if (!o.cancelled && (!o.tracking || o.testLabel)) {
        var tk = el('button', 'Add tracking', 'ghost');`, R`      var isNft = /^NFT to wallet /.test(o.ship || '');
      if (isNft && !o.cancelled) {
        if (o.nftSentAt) st.appendChild(el('div', 'NFT sent ' + new Date(o.nftSentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), 'small'));
        else {
          var ns = el('button', 'Sent', 'solid'); ns.type = 'button'; ns.style.cssText = 'margin-top:6px;padding:6px 12px;font-size:13px;display:block';
          ns.addEventListener('click', function () {
            if (!confirm('Mark the NFT for order ' + o.n + ' as sent? The buyer gets an email telling them to check their wallet.')) return;
            ns.disabled = true; ns.textContent = 'Saving...';
            fetch('/api/admin?k=' + encodeURIComponent(key) + '&nftsent=' + encodeURIComponent(o.n), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
              if (r.error) { ns.disabled = false; ns.textContent = 'Sent'; alert(r.error); return; }
              if (!r.emailed) alert('Saved, but the email to the buyer did not go out. Let them know yourself.');
              load();
            }, function () { ns.disabled = false; ns.textContent = 'Sent'; alert('Could not reach the site. Try again.'); });
          });
          st.appendChild(ns);
        }
      }
      if (!isNft && !o.cancelled && (!o.tracking || o.testLabel)) {
        var tk = el('button', 'Add tracking', 'ghost');`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchnft: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
