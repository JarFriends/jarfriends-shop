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
    var act = function (body) { return function () { m.textContent = '...'; body.id = g.id; post(body).then(function (r) { if (r.error) m.textContent = r.error; else load(); }); }; };
    if (!g.mine && open) {
      if (!tok) { var si = el('a', 'Sign in to enter', 'solid'); si.href = '/me.html'; row.appendChild(si); }
      else if (g.entered) { row.appendChild(el('span', '✓ You are in', 'small')); row.appendChild(btn('Leave', 'ghost', act({ do: 'leave' }))); }
      else row.appendChild(btn('Enter', 'solid', act({ do: 'enter' })));
    }
    if (g.mine && g.status === 'open') {
      if (!open) row.appendChild(btn('🎲 Draw a random winner', 'solid', act({ do: 'draw' })));
      row.appendChild(btn('Cancel giveaway', 'ghost', function () { if (confirm('Cancel this giveaway?')) act({ do: 'cancel' })(); }));
    }
    if (g.mine && g.status === 'drawn') {
      var w = el('div', null, 'small'); w.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:8px;background:#11261C';
      w.appendChild(el('b', '🎉 Winner: ' + g.winnerName + ' · ' + g.winnerEmail));
      var ad = g.winnerAddress; w.appendChild(el('div', ad ? 'Ship to: ' + [ad.name, ad.street, ad.line2, ad.city + ', ' + ad.state + ' ' + ad.zip].filter(Boolean).join(', ') : 'No ship-to address on their account yet. We emailed them to add it.'));
      if (!ad) w.appendChild(btn('Check for their address', 'ghost', act({ do: 'address' })));
      if (g.shipBy === 'winner') w.appendChild(g.shipPaid ? el('div', '✓ Shipping paid') : btn('✓ Mark shipping paid (' + money(g.ship) + ')', 'ghost', act({ do: 'shippaid' })));
      var tr = el('input'); tr.placeholder = 'Tracking number'; tr.value = g.tracking; tr.style.maxWidth = '220px';
      var tw = el('div'); tw.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; tw.appendChild(tr); tw.appendChild(btn('Save tracking', 'ghost', function () { act({ do: 'track', tracking: tr.value })(); })); w.appendChild(tw);
      b.appendChild(w);
    }
    if (g.won) {
      var y = el('div', null, 'small'); y.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:8px;background:#11261C;border:1px solid #C9A45C';
      y.appendChild(el('b', '🎉 You won!'));
      if (g.shipBy === 'winner') {
        y.appendChild(el('div', g.shipPaid ? '✓ Your shipping payment was received.' : 'Pay ' + money(g.ship) + ' for shipping to ' + g.hostName + ':'));
        if (!g.shipPaid && g.pay) [['zelle', 'Zelle'], ['venmo', 'Venmo'], ['cashapp', 'Cash App'], ['paypal', 'PayPal']].forEach(function (x) { if (g.pay[x[0]]) y.appendChild(el('div', x[1] + ': ' + g.pay[x[0]] + (g.pay.preferred === x[0] ? ' (preferred)' : ''))); });
        if (!g.shipPaid && g.pay && !g.pay.zelle && !g.pay.venmo && !g.pay.cashapp && !g.pay.paypal) y.appendChild(el('div', 'Message ' + g.hostName + ' (' + g.pay.email + ') to pay.'));
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
  load();
})();
