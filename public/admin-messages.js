// The Messages tab of the back office: everyone who wrote in from the site (Say hello and the Help form),
// each marked as a paid customer, someone with an order not paid yet, or someone who has never bought.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var get = function (extra) { return fetch('/api/admin?k=' + encodeURIComponent(key()) + extra, { cache: 'no-store' }).then(function (r) { return r.json(); }); };
  var num = function (v) { return Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')) || 0; };
  var usd = function (n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var btn = el('button', 'Messages', 'ghost'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  tabs.insertBefore(btn, $('out'));
  var box = el('div'); box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:16px'; box.dataset.extraTab = '1';
  main.insertBefore(box, $('wOrders'));
  Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b !== btn && b.id !== 'out') b.addEventListener('click', function () { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); }); });
  // A tab added after this one must put this one away too.
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (b && b !== btn && b.id !== 'out') { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); } });

  var CATS = { paid: 'Paid customer', due: 'Ordered, not paid yet', none: 'Never bought' };
  var show = 'all';
  function draw(msgs, orders) {
    box.textContent = '';
    // What each email address has ordered. Cancelled orders do not count.
    var by = {};
    orders.forEach(function (o) {
      var e = String(o.email || '').trim().toLowerCase(); if (!e || o.cancelled) return;
      var p = by[e] || (by[e] = { paid: 0, paidN: 0, dueN: 0 });
      if (o.due) p.dueN++; else { p.paidN++; p.paid += num(o.total); }
    });
    var rows = msgs.map(function (m) {
      var p = by[String(m.email || '').trim().toLowerCase()];
      var cat = p && p.paidN ? 'paid' : p && p.dueN ? 'due' : 'none';
      return { m: m, cat: cat, detail: cat === 'paid' ? usd(p.paid) + ' over ' + p.paidN + (p.paidN === 1 ? ' order' : ' orders') : cat === 'due' ? p.dueN + (p.dueN === 1 ? ' order' : ' orders') + ' waiting on payment' : '' };
    });
    var count = function (c) { return rows.filter(function (r) { return r.cat === c; }).length; };
    var bar = el('div'); bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
    [['all', 'Everyone (' + rows.length + ')'], ['paid', CATS.paid + ' (' + count('paid') + ')'], ['due', CATS.due + ' (' + count('due') + ')'], ['none', CATS.none + ' (' + count('none') + ')']].forEach(function (f) {
      var b = el('button', f[1], show === f[0] ? 'solid' : 'ghost'); b.type = 'button'; b.style.cssText = 'padding:6px 14px;font-size:14px';
      b.addEventListener('click', function () { show = f[0]; draw(msgs, orders); });
      bar.appendChild(b);
    });
    box.appendChild(bar);
    var list = rows.filter(function (r) { return show === 'all' || r.cat === show; });
    if (!list.length) { box.appendChild(el('div', rows.length ? 'No messages in this group.' : 'No messages yet. They appear here when someone uses Say hello or the Help form on the site.', 'small')); return; }
    var sc = el('div', null, 'scroll'), t = el('table'), h = el('tr');
    ['When', 'From', 'Group', 'Message'].forEach(function (x) { h.appendChild(el('th', x)); });
    var th = el('thead'); th.appendChild(h); t.appendChild(th);
    var tb = el('tbody');
    list.forEach(function (r) {
      var m = r.m, tr = el('tr');
      tr.appendChild(el('td', new Date(m.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })));
      var who = el('td'); who.appendChild(el('div', m.name || ''));
      var a = el('a', m.email || ''); a.href = 'mailto:' + (m.email || ''); who.appendChild(a); tr.appendChild(who);
      var g = el('td'), tag = el('b', CATS[r.cat]); tag.style.color = r.cat === 'paid' ? '#C9A45C' : r.cat === 'due' ? '#8FD3AE' : '#A8BFB1';
      g.appendChild(tag); if (r.detail) g.appendChild(el('div', r.detail, 'small')); tr.appendChild(g);
      var msg = el('td'); msg.style.cssText = 'max-width:420px;overflow-wrap:anywhere;white-space:normal';
      msg.appendChild(el('b', m.kind === 'hello' ? 'Said hello' : m.kind === 'join' ? 'Joined the mailing list' : 'Help: ' + (m.topic || '')));
      msg.appendChild(el('div', m.issue || ''));
      if (m.fix) msg.appendChild(el('div', 'Wants: ' + m.fix, 'small'));
      if (m.order) msg.appendChild(el('div', 'Order number given: ' + m.order, 'small'));
      tr.appendChild(msg); tb.appendChild(tr);
    });
    t.appendChild(tb); sc.appendChild(t); box.appendChild(sc);
    box.appendChild(el('div', 'Only messages sent through the site are listed. Emails people send straight to your inbox are not seen by the site.', 'small'));
  }
  btn.addEventListener('click', function () {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c !== box && c.dataset && c.dataset.extraTab) c.hidden = true; });
    box.hidden = false; box.textContent = 'Loading...';
    Promise.all([get('&msgs=1'), get('')]).then(function (a) { if (a[0].error) { box.textContent = a[0].error; return; } draw(a[0].msgs || [], a[1].orders || []); }, function () { box.textContent = 'Could not load. Try again.'; });
  });
})();
