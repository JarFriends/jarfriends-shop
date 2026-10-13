// "Next 5 safes" in the back office: fill in the next round of Deal of the day safes while they stay hidden,
// check how they will look, then press Go live. See patchsafes.js for the server side.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var api = function (q) { return fetch('/api/admin?k=' + encodeURIComponent(key()) + q, { cache: 'no-store' }).then(function (r) { return r.json(); }); };
  var usd = function (n) { return '$' + (Number(n) || 0).toFixed(2); };
  var GOLD = '#C9A45C';

  var btn = el('button', 'Next 5 safes', 'ghost'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  tabs.insertBefore(btn, $('tPeople') || null);
  var box = el('div'); box.hidden = true; box.dataset.extraTab = '1'; box.style.cssText = 'display:flex;flex-direction:column;gap:16px';
  main.insertBefore(box, $('wOrders'));
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (b && b !== btn && b.id !== 'out') { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); } });
  btn.addEventListener('click', function () {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none', 'offerWait', 'viewBox', 'sortBox'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c !== box && c.dataset && c.dataset.extraTab) c.hidden = true; });
    box.hidden = false; load();
  });

  var data = null, dirty = {};
  function load() {
    box.textContent = 'Loading...';
    api('&safes=list').then(function (r) { if (r.error) { box.textContent = r.error; return; } data = r; dirty = {}; draw(); }, function () { box.textContent = 'Could not load. Try again.'; });
  }
  function field(label, value, type, w) {
    var l = el('label', label); l.style.cssText = 'flex:1 1 ' + (w || '160px') + ';min-width:0;display:flex;flex-direction:column;gap:4px;font-size:13px';
    var i = el(type === 'area' ? 'textarea' : 'input'); if (type !== 'area') { i.type = type || 'text'; if (type === 'number') { i.step = 'any'; i.min = '0'; i.inputMode = 'decimal'; } } else { i.rows = 3; i.style.cssText = 'resize:vertical;min-height:70px'; }
    i.value = value == null ? '' : value; l.appendChild(i); return { box: l, input: i };
  }
  function check(label, on) {
    var l = el('label'); l.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer';
    l.style.setProperty('display', 'flex', 'important'); l.style.setProperty('flex-direction', 'row', 'important');
    var c = el('input'); c.type = 'checkbox'; c.checked = !!on;
    ['width', 'height', 'min-width', 'flex', 'padding'].forEach(function (k, i) { c.style.setProperty(k, ['20px', '20px', '20px', '0 0 20px', '0'][i], 'important'); });
    c.style.accentColor = GOLD; c.style.margin = '0';
    l.appendChild(c); l.appendChild(el('span', label)); return { box: l, input: c };
  }
  // A chosen picture is made smaller in the browser and sent as a JPEG (same as the Products tab).
  function shrink(file, done) {
    var rd = new FileReader(); rd.onerror = function () { done(''); };
    rd.onload = function () { var im = new Image(); im.onerror = function () { done(''); }; im.onload = function () {
      var k = Math.min(1, 1000 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(im.width * k)); cv.height = Math.max(1, Math.round(im.height * k));
      var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
      done(cv.toDataURL('image/jpeg', 0.85).split(',')[1] || ''); }; im.src = rd.result; };
    rd.readAsDataURL(file);
  }
  function sendPhoto(id, file, then) {
    shrink(file, function (d) {
      if (!d) { then('That photo could not be read. Try a JPG or PNG.'); return; }
      fetch('/api/admin?k=' + encodeURIComponent(key()) + '&photo=' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: d }) })
        .then(function (r) { return r.json(); }).then(function (r) { then(r.error || ''); }, function () { then('Could not reach the site. Try again.'); });
    });
  }

  function slotCard(n, s) {
    var c = el('section', null, 'card'); c.style.cssText = 'display:flex;flex-direction:column;gap:12px;border-color:' + (s ? 'rgba(143,211,174,.55)' : 'rgba(255,255,255,.18)');
    var top = el('div'); top.style.cssText = 'display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap';
    top.appendChild(el('b', 'Safe ' + n + (n === 5 ? ' (The Vault)' : '')));
    var st = el('span', s ? 'Saved' : 'Not filled in yet', 'small'); st.style.color = s ? '#8FD3AE' : '';
    top.appendChild(st); c.appendChild(top);

    var row = el('div'); row.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start';
    var pic = el('div'); pic.style.cssText = 'width:140px;height:140px;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 auto;border:1px solid rgba(255,255,255,.2);color:#555;font-size:13px;text-align:center';
    var im = null;
    var showPic = function (src) { pic.textContent = ''; if (!src) { pic.textContent = 'No photo yet'; return; } im = el('img'); im.src = src; im.alt = 'Safe ' + n; im.style.cssText = 'width:100%;height:100%;object-fit:contain'; pic.appendChild(im); };
    showPic(s && s.photo);
    var pf = el('label', 'Photo'); pf.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:13px;flex:1 1 220px;min-width:0';
    var file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.style.cssText = 'padding:8px;height:auto'; pf.appendChild(file);
    file.addEventListener('change', function () { var f = file.files && file.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { showPic(rd.result); }; rd.readAsDataURL(f); mark(); });
    row.appendChild(pic);
    var right = el('div'); right.style.cssText = 'flex:1 1 300px;display:flex;flex-direction:column;gap:10px;min-width:0';
    right.appendChild(pf);
    var name = field('Name', s && s.name, 'text', '100%');
    pf.style.flex = '0 0 auto'; name.box.style.flex = '0 0 auto';
    right.appendChild(name.box);
    row.appendChild(right); c.appendChild(row);
    var desc = field("What's in it (shown to customers when the safe opens)", s && s.desc, 'area', '100%'); c.appendChild(desc.box);
    var line = el('div'); line.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px';
    var price = field('Price ($)', s && s.price, 'number', '110px'), stock = field('How many', s ? s.stock : 1, 'number', '90px'), ship = field('Shipping ($, 0 = free)', s ? s.shipping : 0, 'number', '150px'), wt = field('Weight (oz)', s && s.weight, 'number', '110px'), bx = field('Box (e.g. 12 x 9 x 6)', s && s.box, 'text', '170px');
    [price, stock, ship, wt, bx].forEach(function (f) { line.appendChild(f.box); });
    c.appendChild(line);
    var opts = el('div'); opts.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 22px';
    var reg = check('Regular box (12 x 9 x 6 in)', /^\s*12\s*x\s*9\s*x\s*6\s*$/i.test((s && s.box) || ''));
    reg.input.addEventListener('change', function () { bx.input.value = reg.input.checked ? '12 x 9 x 6' : ''; mark(); });
    bx.input.addEventListener('input', function () { reg.input.checked = /^\s*12\s*x\s*9\s*x\s*6\s*$/i.test(bx.input.value); });
    var nft = check('This is an NFT (nothing ships)', s && s.nft);
    opts.appendChild(reg.box); opts.appendChild(nft.box); c.appendChild(opts);
    var acts = el('div'); acts.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center';
    var save = el('button', s ? 'Save changes' : 'Save safe ' + n, 'solid'); save.type = 'button';
    var msg = el('span', '', 'small');
    acts.appendChild(save);
    if (s) { var clr = el('button', 'Empty this safe', 'ghost'); clr.type = 'button'; acts.appendChild(clr);
      clr.addEventListener('click', function () { if (!confirm('Empty safe ' + n + '? What you filled in for it is removed from the next round.')) return; clr.disabled = true; api('&safes=clear&n=' + n).then(function (r) { if (r.error) { alert(r.error); clr.disabled = false; return; } load(); }); }); }
    acts.appendChild(msg); c.appendChild(acts);
    function mark() { dirty[n] = true; st.textContent = 'Not saved yet'; st.style.color = GOLD; }
    [name, desc, price, stock, ship, wt, bx].forEach(function (f) { f.input.addEventListener('input', mark); });
    nft.input.addEventListener('change', mark);
    save.addEventListener('click', function () {
      save.disabled = true; msg.textContent = 'Saving...';
      var q = '&safes=save&n=' + n + '&name=' + encodeURIComponent(name.input.value) + '&desc=' + encodeURIComponent(desc.input.value) + '&price=' + encodeURIComponent(price.input.value) + '&stock=' + encodeURIComponent(stock.input.value) + '&shipping=' + encodeURIComponent(ship.input.value) + '&weight=' + encodeURIComponent(wt.input.value) + '&box=' + encodeURIComponent(bx.input.value) + '&nft=' + (nft.input.checked ? '1' : '0');
      api(q).then(function (r) {
        if (r.error) { msg.textContent = r.error; save.disabled = false; return; }
        var f = file.files && file.files[0];
        if (!f) { delete dirty[n]; load(); return; }
        msg.textContent = 'Saving the photo...';
        sendPhoto(r.id, f, function (err) { if (err) { msg.textContent = err; save.disabled = false; return; } delete dirty[n]; load(); });
      }, function () { msg.textContent = 'Could not reach the site. Try again.'; save.disabled = false; });
    });
    return c;
  }

  // What customers will see: safe 1 open with its piece, the rest locked until the one before is claimed.
  function preview(slots) {
    var c = el('section', null, 'card'); c.style.cssText = 'display:flex;flex-direction:column;gap:12px';
    c.appendChild(el('b', 'Check it out: the next round'));
    c.appendChild(el('div', 'This is everything that will be in the safes. On the site, safe 1 opens first and each next safe unlocks when the one before it is claimed. Locked safes stay a secret until then.', 'small'));
    var grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px';
    slots.forEach(function (s, i) {
      var t = el('div'); t.style.cssText = 'border:1px solid ' + (s ? GOLD : 'rgba(255,255,255,.2)') + ';border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,.03)';
      t.appendChild(el('div', (i === 4 ? 'THE VAULT · SAFE 5' : 'SAFE ' + (i + 1)) + (i === 0 ? ' · OPENS FIRST' : ''), 'small'));
      var p = el('div'); p.style.cssText = 'aspect-ratio:1/1;border-radius:8px;background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#666;font-size:13px';
      if (s && s.photo) { var im = el('img'); im.src = s.photo; im.alt = s.name; im.style.cssText = 'width:100%;height:100%;object-fit:contain'; p.appendChild(im); } else p.textContent = s ? 'No photo' : 'Empty';
      t.appendChild(p);
      t.appendChild(el('b', s ? s.name : 'Not filled in'));
      if (s) { t.appendChild(el('div', usd(s.price) + (s.shipping ? ' + ' + usd(s.shipping) + ' shipping' : ' · free shipping') + (s.stock > 1 ? ' · ' + s.stock + ' available' : ''), 'small'));
        if (s.desc) { var d = el('div', s.desc, 'small'); d.style.cssText = 'line-height:1.4;opacity:.85'; t.appendChild(d); }
        if (!s.photo) { var w = el('div', 'Add a photo before going live.', 'small'); w.style.color = GOLD; t.appendChild(w); } }
      grid.appendChild(t);
    });
    c.appendChild(grid);
    return c;
  }

  function draw() {
    box.textContent = '';
    var slots = data.slots || [], ready = slots.filter(Boolean).length, rd = data.round || {};
    var head = el('section', null, 'card'); head.style.cssText = 'display:flex;flex-direction:column;gap:8px;border-color:' + GOLD;
    head.appendChild(el('b', 'Next 5 safes'));
    head.appendChild(el('div', 'Fill in each safe and press Save. Nothing here shows on the site until you press Go live.', 'small'));
    head.appendChild(el('div', rd.total ? (rd.left ? 'Current round: ' + rd.left + ' of ' + rd.total + ' safes still not claimed.' : 'Current round: all ' + rd.total + ' safes are claimed. Customers see "Coming soon" right now.') : 'No safes are live right now.', 'small'));
    head.appendChild(el('div', ready + ' of 5 safes filled in.', 'small'));
    box.appendChild(head);
    slots.forEach(function (s, i) { box.appendChild(slotCard(i + 1, s)); });
    box.appendChild(preview(slots));

    var live = el('section', null, 'card'); live.style.cssText = 'display:flex;flex-direction:column;gap:10px;border-color:' + GOLD;
    live.appendChild(el('b', 'Go live'));
    live.appendChild(el('div', 'Puts these 5 pieces in the safes and opens safe 1 right away. The last round comes off the site, and everyone on your list gets the "new round, safe 1 is open" email (it shows only what is in safe 1).', 'small'));
    var go = el('button', 'Go live with the next 5 safes', 'solid'); go.type = 'button'; go.style.cssText = 'align-self:flex-start;padding:12px 22px;font-size:16px';
    var gm = el('div', '', 'small');
    if (ready < 5) { go.disabled = true; go.style.opacity = '.5'; gm.textContent = 'Fill in and save all 5 safes to go live.'; }
    go.addEventListener('click', function () {
      if (Object.keys(dirty).length) { alert('Save your changes first: safe ' + Object.keys(dirty).join(', safe ') + '.'); return; }
      var noPic = slots.map(function (s, i) { return s && !s.photo ? i + 1 : 0; }).filter(Boolean);
      if (noPic.length && !confirm('Safe ' + noPic.join(', safe ') + (noPic.length === 1 ? ' has' : ' have') + ' no photo. Go live anyway?')) return;
      if (!confirm('Go live now? Safe 1 opens on the site right away and the email goes out to your list.')) return;
      var send = function (force) {
        go.disabled = true; gm.textContent = 'Going live...';
        api('&safes=live' + (force ? '&force=1' : '')).then(function (r) {
          if (r.left && !force) { go.disabled = false; gm.textContent = ''; if (confirm(r.error + ' Go live anyway?')) send(true); return; }
          if (r.error) { go.disabled = false; gm.textContent = r.error; return; }
          // Loading the shop runs the check that sends the safe 1 email, so it goes out now.
          fetch('/api/order', { cache: 'no-store' }).catch(function () {});
          box.textContent = '';
          var ok = el('section', null, 'card'); ok.style.cssText = 'display:flex;flex-direction:column;gap:10px;border-color:#8FD3AE';
          ok.appendChild(el('b', 'You are live'));
          ok.appendChild(el('div', 'Safe 1 is open on the site now. The email to your list goes out within a few minutes.', 'small'));
          var a = el('a', 'See the safes on the site', 'solid'); a.href = '/#deal'; a.target = '_blank'; a.rel = 'noopener'; a.style.cssText = 'align-self:flex-start;padding:10px 18px;text-decoration:none';
          ok.appendChild(a); box.appendChild(ok);
        }, function () { go.disabled = false; gm.textContent = 'Could not reach the site. Refresh to check before trying again.'; });
      };
      send(false);
    });
    live.appendChild(go); live.appendChild(gm); box.appendChild(live);
  }
})();
