// Community giveaways on giveaway.html: start one, enter, and (for the host) draw a random winner.
(function () {
  var box = document.getElementById('gwBox'); if (!box) return;
  var el = JF.el, tok = JF.token();
  function btn(t, cls, fn) { var b = el('button', t, cls || 'ghost'); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function post(body) { body.t = tok; return fetch('/api/giveaways', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }
  function left(ms) { var h = Math.floor(ms / 3600e3); return h >= 48 ? Math.ceil(h / 24) + ' days left' : h >= 1 ? h + 'h left' : Math.max(1, Math.ceil(ms / 60000)) + ' min left'; }
  function money(c) { return '$' + (c / 100).toFixed(2); }
  function photo(file) { return new Promise(function (ok) { if (!file) return ok(''); var im = new Image(); im.onload = function () { var s = Math.min(1, 1200 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.82)); }; im.onerror = function () { ok(''); }; im.src = URL.createObjectURL(file); }); }
  function form(host) {
    var f = el('form'); f.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    var t = el('input'); t.maxLength = 100; t.placeholder = 'e.g. VeeFriends Series 2 card'; t.required = true;
    var d = el('textarea', null, 'jf-ta'); d.maxLength = 1000; d.placeholder = 'What it is, condition, any rules';
    var p = el('input'); p.type = 'file'; p.accept = 'image/*';
    var h = el('select', null, 'jf-sel'); [[1, '1 hour'], [6, '6 hours'], [24, '1 day'], [72, '3 days'], [168, '7 days'], [336, '14 days'], [720, '30 days']].forEach(function (x) { var o = el('option', x[1]); o.value = x[0]; h.appendChild(o); }); h.value = 72;
    var sb = el('select', null, 'jf-sel'); [['host', 'Free shipping: I pay it'], ['winner', 'The winner pays shipping']].forEach(function (x) { var o = el('option', x[1]); o.value = x[0]; sb.appendChild(o); });
    var sp = el('input'); sp.type = 'number'; sp.min = '0.5'; sp.step = '0.01'; sp.placeholder = 'Shipping $'; sp.hidden = true;
    sb.addEventListener('change', function () { sp.hidden = sb.value !== 'winner'; });
    [['Prize', t], ['About it', d], ['Photo', p], ['Runs for', h], ['Shipping', sb]].forEach(function (x) { var l = el('label', x[0]); l.appendChild(x[1]); f.appendChild(l); });
    f.appendChild(sp);
    var go = el('button', 'Launch giveaway', 'solid'); go.type = 'submit'; go.style.alignSelf = 'flex-start'; var m = el('div', '', 'small');
    f.appendChild(go); f.appendChild(m);
    f.addEventListener('submit', function (ev) { ev.preventDefault(); go.disabled = true; m.textContent = 'Launching...';
      photo(p.files[0]).then(function (ph) { return post({ do: 'create', title: t.value, desc: d.value, hours: h.value, shipBy: sb.value, ship: sp.value, photo: ph }); }).then(function (r) { go.disabled = false; if (r.error) { m.textContent = r.error; return; } load(); }); });
    host.appendChild(f);
  }
  function card(g) {
    var c = el('div'); c.id = g.id; c.style.cssText = 'display:flex;gap:12px;padding:12px;border:1px solid #2E4A3B;border-radius:12px;align-items:flex-start';
    if (g.photo) { var im = el('img'); im.src = g.photo; im.alt = ''; im.style.cssText = 'width:96px;height:96px;object-fit:cover;border-radius:10px;flex:none'; c.appendChild(im); }
    var b = el('div'); b.style.cssText = 'display:flex;flex-direction:column;gap:6px;flex:1;min-width:0';
    b.appendChild(el('b', g.title));
    var by = el('div', null, 'small dim'); by.appendChild(document.createTextNode('By ')); if (g.hostShop) { var a = el('a', g.hostName); a.href = '/shop.html?s=' + encodeURIComponent(g.hostShop); by.appendChild(a); } else by.appendChild(document.createTextNode(g.hostName)); b.appendChild(by);
    if (g.desc) b.appendChild(el('div', g.desc, 'small'));
    var open = g.status === 'open' && Date.now() < g.endsAt;
    b.appendChild(el('div', g.count + ' entered · ' + (open ? left(g.endsAt - Date.now()) : g.status === 'drawn' ? 'Winner: ' + g.winnerName : 'Ended') + ' · ' + (g.shipBy === 'winner' ? 'Winner pays ' + money(g.ship) + ' shipping' : 'Free shipping'), 'small'));
    var row = el('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center'; b.appendChild(row);
    var m = el('div', '', 'small'); b.appendChild(m);
    if (open) {
      var url = location.origin + '/api/giveaways?og=' + g.id, txt = '🎁 Giveaway: ' + g.title + ' on VeeFam. Enter free:';
      var sh = el('div'); sh.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; b.appendChild(sh);
      sh.appendChild(btn('🔗 Copy link', 'ghost', function () { var done = function () { m.textContent = 'Link copied. Paste it in your post, story or bio.'; }; if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link:', url); }); else prompt('Copy this link:', url); }));
      var x = el('a', '𝕏 Post on X', 'ghost'); x.href = 'https://x.com/intent/post?text=' + encodeURIComponent(txt) + '&url=' + encodeURIComponent(url); x.target = '_blank'; x.rel = 'noopener'; sh.appendChild(x);
      if (navigator.share) sh.appendChild(btn('📤 Share (Instagram, texts…)', 'ghost', function () { navigator.share({ title: g.title, text: txt, url: url }).catch(function () {}); }));
    }
    var act = function (body) { return function () { m.textContent = '...'; body.id = g.id; post(body).then(function (r) { if (r.error) m.textContent = r.error; else load(); }); }; };
    if (!g.mine && open) {
      if (!tok) { var si = el('a', 'Sign in to enter', 'solid'); si.href = '/me.html'; row.appendChild(si); }
      else if (g.entered) { row.appendChild(el('span', '✓ You are in', 'small')); row.appendChild(btn('Leave', 'ghost', act({ do: 'leave' }))); }
      else { var xi = el('input'); xi.placeholder = 'Your X @ (optional, for the shout-out)'; xi.maxLength = 16; xi.style.maxWidth = '240px'; try { xi.value = localStorage.getItem('v2vX') || ''; } catch (e) {}
        row.appendChild(xi); row.appendChild(btn('Enter', 'solid', function () { try { localStorage.setItem('v2vX', xi.value.trim()); } catch (e) {} act({ do: 'enter', x: xi.value })(); })); }
    }
    if (g.mine && g.status === 'open') {
      if (!open) row.appendChild(btn('🎲 Draw a random winner', 'solid', act({ do: 'draw' })));
      row.appendChild(btn('Cancel giveaway', 'ghost', function () { if (confirm('Cancel this giveaway?')) act({ do: 'cancel' })(); }));
    }
    if (g.mine && g.status === 'drawn') {
      var w = el('div', null, 'small'); w.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:8px;background:#11261C';
      w.appendChild(el('b', '🎉 Winner: ' + g.winnerName + ' · ' + g.winnerEmail));
      var ad = g.winnerAddress; w.appendChild(el('div', ad ? 'Ship to: ' + [ad.name, ad.street, ad.line2, ad.city + ', ' + ad.state + ' ' + ad.zip].filter(Boolean).join(', ') : 'No ship-to address on their account yet. We emailed them to add it.'));
      if (!ad) { w.appendChild(btn('Check for their address', 'ghost', act({ do: 'address' }))); w.appendChild(btn('✉️ Email them to add their address', 'ghost', function () { m.textContent = 'Sending…'; post({ do: 'nudge', id: g.id }).then(function (r) { m.textContent = r.error || 'Sent. They were asked to add their address soon.'; }); })); }
      if (g.label) { var lk = el('a', '🖨️ Print the label'); lk.href = g.label; lk.target = '_blank'; lk.rel = 'noopener'; lk.className = 'solid'; w.appendChild(lk); }
      else if (ad && !g.tracking) {
        // Same as any other shipped order: pick the package, type the weight, get the price, buy the label.
        var PRE = [['envelope', 'Card in a toploader (rigid envelope) · 7 x 5 x 0.5 in'], ['mailer', 'Small padded mailer · 10 x 7 x 1 in'], ['slab', 'Graded slab in a small box · 9 x 6 x 3 in'], ['smallbox', 'Small box · 8 x 6 x 4 in'], ['box', 'Medium box · 12 x 10 x 6 in'], ['custom', 'Custom size (type it in)']];
        var lf = el('div'); lf.style.cssText = 'display:flex;flex-direction:column;gap:8px;border:1px solid #2E4A3B;border-radius:10px;padding:10px'; lf.appendChild(el('b', '📦 Shipping label'));
        var pre = el('select', null, 'jf-sel'); PRE.forEach(function (x) { var o = el('option', x[1]); o.value = x[0]; pre.appendChild(o); }); pre.value = 'mailer';
        var num = function (ph) { var i = el('input'); i.type = 'number'; i.min = '0'; i.step = '0.1'; i.inputMode = 'decimal'; i.placeholder = ph; i.style.cssText = 'flex:1 1 0;min-width:0'; return i; };
        var L = num('Length in'), W = num('Width in'), H = num('Height in'), lb = num('lb'), oz = num('oz');
        var dims = el('div'); dims.style.cssText = 'display:none;gap:8px'; dims.appendChild(L); dims.appendChild(W); dims.appendChild(H);
        var wt = el('div'); wt.style.cssText = 'display:flex;gap:8px;align-items:center'; wt.appendChild(el('span', 'Weight', 'small')); wt.appendChild(lb); wt.appendChild(oz);
        pre.addEventListener('change', function () { dims.style.display = pre.value === 'custom' ? 'flex' : 'none'; });
        lf.appendChild(pre); lf.appendChild(dims); lf.appendChild(wt); lf.appendChild(el('div', 'Weigh it if you can. A wrong size or weight can bring a USPS charge later.', 'small dim'));
        var read = function () { var t = (Number(lb.value) || 0) * 16 + (Number(oz.value) || 0), r = { do: 'label', id: g.id, preset: pre.value, oz: t > 0 ? String(Math.round(t * 10) / 10) : '' }; if (pre.value === 'custom') { r.l = L.value; r.w = W.value; r.h = H.value; } return r; };
        var q0 = null, gp = btn('Get the price', 'solid', function () { m.textContent = 'Getting a price…'; gp.disabled = true; post(read()).then(function (q) { gp.disabled = false; if (q.error) { m.textContent = q.error; return; } q0 = q; m.textContent = ''; bl.textContent = 'Buy label for ' + money(q.cents) + ' (' + q.service + (q.days ? ', ' + q.days + ' days' : '') + ')'; bl.style.display = ''; }); });
        var bl = btn('Buy label', 'solid', function () { if (!q0) return; bl.disabled = true; m.textContent = 'Buying…'; var r = read(); r.rate = q0.rate; post(r).then(function (z) { bl.disabled = false; if (z.error) { m.textContent = z.error; return; } if (z.label) window.open(z.label, '_blank'); load(); }); }); bl.style.display = 'none';
        [pre, lb, oz, L, W, H].forEach(function (x) { x.addEventListener('input', function () { q0 = null; bl.style.display = 'none'; }); });
        var br = el('div'); br.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; br.appendChild(gp); br.appendChild(bl); lf.appendChild(br);
        w.appendChild(lf);
      }
      if (g.shipBy === 'winner' && g.shipSent && !g.shipPaid) w.appendChild(el('div', '💬 Winner says they sent it by ' + g.shipSent + '. Check, then mark it paid.'));
      if (g.shipBy === 'winner') w.appendChild(g.shipPaid ? el('div', '✓ Shipping paid') : btn('✓ Mark shipping paid (' + money(g.ship) + ')', 'ghost', act({ do: 'shippaid' })));
      var tr = el('input'); tr.placeholder = 'Tracking number'; tr.value = g.tracking; tr.style.maxWidth = '220px';
      var tw = el('div'); tw.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; tw.appendChild(tr); tw.appendChild(btn('Save tracking', 'ghost', function () { act({ do: 'track', tracking: tr.value })(); })); w.appendChild(tw);
      b.appendChild(w);
    }
    if (g.status === 'drawn' && g.mine) {
      // 📣 Announce the winner on X, with a photo: the phone's share sheet sends the photo to the X app; on a computer X opens with the post written.
      var who = g.winnerX ? '@' + g.winnerX : g.winnerName, msg = '🎉 Congrats ' + who + '! You won ' + g.title + ' in the VeeFam giveaway. Thanks to everyone who entered!';
      // The giveaway's own photo goes with the post: fetched now, so the tap can share it straight away.
      var url2 = location.origin + '/api/giveaways?og=' + g.id, file = null;
      if (g.photo && navigator.canShare) fetch(g.photo).then(function (r) { return r.blob(); }).then(function (bl) { var f = new File([bl], 'giveaway.jpg', { type: 'image/jpeg' }); if (navigator.canShare({ files: [f] })) file = f; }).catch(function () {});
      var xpost = function () { window.open('https://x.com/intent/post?text=' + encodeURIComponent(msg) + '&url=' + encodeURIComponent(url2), '_blank'); };
      var ab = btn('📣 Announce winner on X' + (g.winnerX ? ' (tags ' + who + ')' : ''), 'solid', function () { if (file) navigator.share({ files: [file], text: msg + ' ' + url2 }).catch(xpost); else xpost(); });
      b.appendChild(ab);
      if (!g.winnerX) b.appendChild(el('div', 'The winner did not add an X handle, so the post uses their name.', 'small dim'));
    }
    if (g.won) {
      var y = el('div', null, 'small'); y.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:8px;background:#11261C;border:1px solid #C9A45C';
      y.appendChild(el('b', '🎉 You won!'));
      if (g.shipBy === 'winner') {
        y.appendChild(el('div', g.shipPaid ? '✓ Your shipping payment was received.' : 'Pay ' + money(g.ship) + ' for shipping to ' + g.hostName + ':'));
        if (!g.shipPaid && g.pay) {
          var pm = el('div', '', 'small'), pr = el('div'); pr.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:4px';
          var go = function (what) { return function () { pm.textContent = 'Opening…'; post({ do: what, id: g.id }).then(function (r) { if (r.url) location.href = r.url; else pm.textContent = r.error || 'Try again.'; }); }; };
          if (g.pay.card) pr.appendChild(btn('💳 Pay ' + money(g.ship) + ' by card', 'solid', go('pay-card')));
          if (g.pay.crypto) pr.appendChild(btn('🪙 Pay ' + money(g.ship) + ' with crypto (ETH, USDC, USDT)', 'solid', go('pay-crypto')));
          [['zelle', 'Zelle'], ['venmo', 'Venmo'], ['cashapp', 'Cash App'], ['paypal', 'PayPal']].forEach(function (x) { if (!g.pay[x[0]]) return;
            var r1 = el('div'); r1.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px solid #2E4A3B;border-radius:8px;padding:8px';
            r1.appendChild(el('span', x[1] + ': ' + g.pay[x[0]] + (g.pay.preferred === x[0] ? ' (preferred)' : '')));
            r1.appendChild(btn('I sent it', 'ghost', function () { pm.textContent = 'Telling ' + g.hostName + '…'; post({ do: 'pay-sent', id: g.id, how: x[1] }).then(function (r) { pm.textContent = r.error || 'Thanks! ' + g.hostName + ' will confirm it and ship your prize.'; }); }));
            pr.appendChild(r1); });
          if (!pr.children.length) pr.appendChild(el('div', 'Message ' + g.hostName + ' (' + g.pay.email + ') to pay.'));
          if (g.shipSent) pr.appendChild(el('div', '✓ You said you sent it by ' + g.shipSent + '. Waiting for ' + g.hostName + ' to confirm.', 'small'));
          y.appendChild(pr); y.appendChild(pm);
        }
      } else y.appendChild(el('div', 'Shipping is free.'));
      y.appendChild(el('div', g.tracking ? 'Tracking: ' + g.tracking : 'Make sure your ship-to address is on your account (My account > Ship to).'));
      b.appendChild(y);
    }
    c.appendChild(b); return c;
  }
  function load() {
    fetch('/api/giveaways' + (tok ? '?t=' + encodeURIComponent(tok) : ''), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
      box.textContent = '';
      box.appendChild(el('h2', '🎁 Community giveaways'));
      box.appendChild(el('div', 'Buyers and sellers give pieces away. Enter for free; when it ends, the host draws a random winner.', 'small'));
      var fh = el('div');
      if (tok) { var sb = btn('+ Start a giveaway', 'solid', function () { sb.remove(); form(fh); }); sb.style.alignSelf = 'flex-start'; box.appendChild(sb); }
      else { var a = el('a', 'Sign in to start or enter a giveaway', 'ghost'); a.href = '/me.html'; a.style.alignSelf = 'flex-start'; box.appendChild(a); }
      box.appendChild(fh);
      var L = (r.list || []);
      if (!L.length) box.appendChild(el('div', 'No giveaways right now. Start the first one!', 'small dim'));
      L.forEach(function (g) { box.appendChild(card(g)); });
      if (/^#gw/.test(location.hash)) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView({ block: 'center' }); }
    }).catch(function () { box.textContent = 'Giveaways did not load. Refresh to try again.'; });
  }
  var qp = new URLSearchParams(location.search);
  if (qp.get('gwpaid') && qp.get('cs') && tok) post({ do: 'pay-check', id: qp.get('gwpaid'), cs: qp.get('cs') }).then(function () { history.replaceState(null, '', location.pathname + location.hash); load(); }); else load();
})();
