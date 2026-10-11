// The Jars tab of the back office: every customer's jars, with buttons to give or take one.
// A customer earns one jar per paid order on their own. Ten jars open a locked safe early for them.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var get = function (extra) { return fetch('/api/admin?k=' + encodeURIComponent(key()) + extra, { cache: 'no-store' }).then(function (r) { return r.json(); }); };
  var btn = el('button', 'Jars', 'ghost'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  tabs.insertBefore(btn, $('out'));
  var box = el('div'); box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:16px'; box.dataset.extraTab = '1';
  main.insertBefore(box, $('wOrders'));
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (b && b !== btn && b.id !== 'out') { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); } });

  function load() {
    box.textContent = 'Loading...';
    get('&jars=1').then(function (r) { if (r.error) { box.textContent = r.error; return; } draw(r.jars || [], r.need || 10); }, function () { box.textContent = 'Could not load. Try again.'; });
  }
  function draw(rows, need) {
    box.textContent = '';
    box.appendChild(el('div', 'Every paid order earns the customer one jar automatically. ' + need + ' jars let them open one locked Deal of the day safe early (they still pay for the piece), and those ' + need + ' are then used up. Use the buttons to give or take a jar by hand.', 'small'));
    var add = el('div'); add.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end';
    var lab = el('label', 'Give a jar to an email not listed'); lab.style.cssText = 'flex:1 1 260px';
    var inp = el('input'); inp.type = 'email'; inp.placeholder = 'name@example.com'; lab.appendChild(inp);
    var go = el('button', 'Give 1 jar', 'ghost'); go.type = 'button'; go.style.cssText = 'padding:10px 18px';
    go.addEventListener('click', function () { var v = inp.value.trim(); if (!v) return; change(v, 1, go); });
    add.appendChild(lab); add.appendChild(go); box.appendChild(add);
    if (!rows.length) { box.appendChild(el('div', 'No customers yet.', 'small')); return; }
    var sc = el('div', null, 'scroll'), t = el('table'), h = el('tr');
    [['Customer', ''], ['Paid orders', 'num'], ['Given by you', 'num'], ['Used', 'num'], ['Jars now', 'num'], ['', '']].forEach(function (c) { h.appendChild(el('th', c[0], c[1])); });
    var th = el('thead'); th.appendChild(h); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr'), who = el('td'); who.appendChild(el('div', r.name || '')); who.appendChild(el('div', r.email, 'small')); tr.appendChild(who);
      tr.appendChild(el('td', String(r.earned), 'num')); tr.appendChild(el('td', (r.adj > 0 ? '+' : '') + r.adj, 'num')); tr.appendChild(el('td', String(r.spent), 'num'));
      var now = el('td', null, 'num'), b = el('b', r.jars + ' of ' + need); if (r.jars >= need) b.style.color = '#C9A45C'; now.appendChild(b);
      if (r.opened) now.appendChild(el('div', r.opened + (r.opened === 1 ? ' safe opened' : ' safes opened'), 'small'));
      tr.appendChild(now);
      var act = el('td'); act.style.whiteSpace = 'nowrap';
      [['+1', 1], ['-1', -1]].forEach(function (x) {
        var bt = el('button', x[0], 'ghost'); bt.type = 'button'; bt.style.cssText = 'padding:6px 14px;font-size:14px;margin-right:6px';
        bt.addEventListener('click', function () { change(r.email, x[1], bt); });
        act.appendChild(bt);
      });
      tr.appendChild(act); tb.appendChild(tr);
    });
    t.appendChild(tb); sc.appendChild(t); box.appendChild(sc);
  }
  function change(email, by, bt) {
    bt.disabled = true;
    get('&jar=' + encodeURIComponent(email) + '&by=' + by).then(function (r) { if (r.error) { bt.disabled = false; alert(r.error); return; } load(); }, function () { bt.disabled = false; alert('Could not reach the site. Try again.'); });
  }
  btn.addEventListener('click', function () {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none', 'offerWait'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c !== box && c.dataset && c.dataset.extraTab) c.hidden = true; });
    box.hidden = false; load();
  });
})();
