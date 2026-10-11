// The Promo codes tab of the back office: see every code, add one, change one, switch one off.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var get = function (extra) { return fetch('/api/admin?k=' + encodeURIComponent(key()) + extra, { cache: 'no-store' }).then(function (r) { return r.json(); }); };
  var btn = el('button', 'Promo codes', 'ghost'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  tabs.insertBefore(btn, $('out'));
  var box = el('div'); box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:16px';
  main.insertBefore(box, $('wOrders'));
  // Any other tab puts this one away.
  Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b !== btn && b.id !== 'out') b.addEventListener('click', function () { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); }); });

  var say = function (p) { return p.pct ? p.pct + '% off' : '$' + (p.off / 100).toFixed(2) + ' off'; };
  var items = [{ id: 'shop', name: 'Store page products' }, { id: 'deal', name: 'Deal of the day' }, { id: 'party', name: 'JarFriends party pricing' }];
  // One tick box per group. Returns the block and a function that reads the ticked ids.
  function ticks(chosen) {
    var wrap = el('div'); wrap.style.cssText = 'flex:1 1 100%;display:flex;flex-direction:row;flex-wrap:wrap;gap:10px 22px';
    var boxes = items.map(function (p) {
      var l = el('label'); l.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:8px;flex:0 0 auto;width:auto;font-size:15px;cursor:pointer;margin:0';
      var c = el('input'); c.type = 'checkbox'; c.value = p.id; c.checked = !!chosen && chosen.indexOf(p.id) >= 0; c.style.cssText = 'width:20px;height:20px;min-height:0;flex:none;margin:0;padding:0';
      l.appendChild(c); l.appendChild(document.createTextNode(p.name));
      wrap.appendChild(l); return c;
    });
    return { el: wrap, ids: function () { return boxes.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); } };
  }
  function draw(list, note) {
    box.textContent = '';
    var form = el('section', null, 'card'); form.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end';
    var mk = function (label, width, type) { var l = el('label', label); l.style.cssText = 'flex:1 1 ' + width + ';min-width:0'; var i = el('input'); if (type) { i.type = 'number'; i.step = 'any'; i.min = '0'; i.inputMode = 'decimal'; } l.appendChild(i); form.appendChild(l); return i; };
    var code = mk('New code', '160px'); code.maxLength = 20; code.autocapitalize = 'characters'; code.placeholder = 'WELCOME10';
    var amount = mk('Amount', '100px', true);
    var kl = el('label', 'Kind'); kl.style.cssText = 'flex:1 1 140px;min-width:0';
    var kind = el('select'); kind.style.cssText = 'font-family:inherit;font-size:16px;height:44px;padding:0 10px;background:#0B1A13;border:1px solid #4E7A63;color:#F7F2E6;border-radius:2px;width:100%';
    [['pct', 'Percent off'], ['off', 'Dollars off']].forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; kind.appendChild(op); });
    kl.appendChild(kind); form.appendChild(kl);
    var pickHead = el('div', 'Works on (tick each place this code can be used):', 'small'); pickHead.style.flex = '1 1 100%'; form.appendChild(pickHead);
    var pick = ticks([]); form.appendChild(pick.el);
    var add = el('button', 'Add code', 'solid'); add.type = 'button'; form.appendChild(add);
    var msg = el('div', note || 'A code takes a percent or a dollar amount off the pieces in an order, only where you tick. It does not stack on an accepted offer.', 'small'); msg.style.flex = '1 1 100%'; msg.setAttribute('role', 'status');
    form.appendChild(msg);
    add.addEventListener('click', function () { send(code.value, kind.value, amount.value, true, msg, add, pick.ids()); });
    box.appendChild(form);
    if (!list.length) { box.appendChild(el('div', 'No promo codes yet.', 'small')); return; }
    var sc = el('div', null, 'scroll'), t = el('table'), h = el('tr');
    ['Code', 'Takes off', 'Works on', 'Status', ''].forEach(function (x) { h.appendChild(el('th', x)); });
    var th = el('thead'); th.appendChild(h); t.appendChild(th);
    var tb = el('tbody');
    list.forEach(function (p) {
      var tr = el('tr');
      tr.appendChild(el('td', p.code, 'mono')); tr.appendChild(el('td', say(p)));
      var wtd = el('td'), w = ticks(p.for || []);
      if (!p.for) wtd.appendChild(el('div', 'Everything for now (set before this list existed). Tick boxes and save to limit it.', 'small'));
      else if (!p.for.length) wtd.appendChild(el('div', 'Nothing ticked, so it works on nothing.', 'small'));
      wtd.appendChild(w.el);
      var sv = el('button', 'Save', 'ghost'); sv.type = 'button'; sv.style.cssText = 'margin-top:8px;padding:6px 12px;font-size:13px';
      sv.addEventListener('click', function () { send(p.code, p.pct ? 'pct' : 'off', p.pct ? p.pct : p.off / 100, p.on, msg, sv, w.ids()); });
      wtd.appendChild(sv); tr.appendChild(wtd);
      tr.appendChild(el('td', p.on ? 'Working' : 'Switched off'));
      var td = el('td'), b = el('button', p.on ? 'Switch off' : 'Switch on', 'ghost'); b.type = 'button'; b.style.cssText = 'padding:6px 12px;font-size:13px';
      b.addEventListener('click', function () { send(p.code, p.pct ? 'pct' : 'off', p.pct ? p.pct : p.off / 100, !p.on, msg, b, w.ids()); });
      td.appendChild(b); tr.appendChild(td); if (!p.on) tr.style.opacity = '.6';
      tb.appendChild(tr);
    });
    t.appendChild(tb); sc.appendChild(t); box.appendChild(sc);
  }
  function send(code, kind, amount, on, msg, b, ids) {
    b.disabled = true; msg.textContent = 'Saving...';
    get('&promo=' + encodeURIComponent(String(code).trim()) + '&kind=' + kind + '&amount=' + encodeURIComponent(amount) + '&on=' + (on ? '1' : '0') + '&for=' + encodeURIComponent((ids || []).join(','))).then(function (r) {
      b.disabled = false;
      if (r.error) { msg.textContent = r.error; return; }
      draw(r.promos || [], 'Saved. Checkout uses it within about 15 seconds.');
    }, function () { b.disabled = false; msg.textContent = 'Could not reach the site. Try again.'; });
  }
  btn.addEventListener('click', function () {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c !== box && c.dataset && c.dataset.extraTab) c.hidden = true; });
    box.hidden = false; box.textContent = 'Loading...';
    get('&promos=1').then(function (r) { if (r.error) { box.textContent = r.error; return; } draw(r.promos || []); }, function () { box.textContent = 'Could not load. Try again.'; });
  });
  box.dataset.extraTab = '1';
})();
