// The Checkouts tab of the back office: people who opened a checkout and typed their email address.
// Anyone who has not ordered that piece can be sent one reminder email.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var get = function (extra) { return fetch('/api/admin?k=' + encodeURIComponent(key()) + extra, { cache: 'no-store' }).then(function (r) { return r.json(); }); };
  var when = function (t) { return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  var btn = el('button', 'Checkouts', 'ghost'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  tabs.insertBefore(btn, $('out'));
  var box = el('div'); box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:16px'; box.dataset.extraTab = '1';
  main.insertBefore(box, $('wOrders'));
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (b && b !== btn && b.id !== 'out') { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); } });

  function draw(carts, orders, products) {
    box.textContent = '';
    var left = {}, opened = 0;
    products.forEach(function (p) { left[p.id] = p.left; opened += Number(p.checkouts) || 0; });
    var bought = function (c) {
      return orders.some(function (o) { return !o.cancelled && String(o.email || '').trim().toLowerCase() === c.email && (o.pid === c.pid || o.product === c.product); });
    };
    box.appendChild(el('div', 'Checkout pages were opened ' + opened + (opened === 1 ? ' time' : ' times') + ' in all. ' + carts.length + (carts.length === 1 ? ' person' : ' people') + ' typed an email address there. A visitor who leaves before typing an email cannot be named.', 'small'));
    if (!carts.length) { box.appendChild(el('div', 'Nobody to show yet. People appear here once they type their email on a checkout page.', 'small')); return; }
    var sc = el('div', null, 'scroll'), t = el('table'), h = el('tr');
    ['Last seen', 'Who', 'Piece', 'Status', ''].forEach(function (x) { h.appendChild(el('th', x)); });
    var th = el('thead'); th.appendChild(h); t.appendChild(th);
    var tb = el('tbody');
    carts.forEach(function (c) {
      var tr = el('tr'), done = bought(c), n = left[c.pid];
      tr.appendChild(el('td', when(c.at)));
      var who = el('td'); who.appendChild(el('div', c.name || '(no name typed)'));
      var a = el('a', c.email); a.href = 'mailto:' + c.email; who.appendChild(a); tr.appendChild(who);
      var pc = el('td'); pc.style.cssText = 'max-width:320px;white-space:normal'; pc.appendChild(el('div', c.product || c.pid));
      if (n != null) pc.appendChild(el('div', n > 0 ? n + ' left' : 'Sold out', 'small')); tr.appendChild(pc);
      var st = el('td'), tag = el('b', done ? 'Ordered' : 'Did not finish'); tag.style.color = done ? '#8FD3AE' : '#C9A45C'; st.appendChild(tag);
      if (c.sent) st.appendChild(el('div', 'Reminder sent ' + when(c.sent), 'small'));
      tr.appendChild(st);
      var act = el('td');
      if (!done && !c.sent && n > 0) {
        var go = el('button', 'Send reminder', 'solid'); go.type = 'button'; go.style.cssText = 'padding:6px 14px;font-size:14px';
        go.addEventListener('click', function () {
          if (!confirm('Email ' + c.email + ' a reminder about ' + (c.product || 'this piece') + '?')) return;
          go.disabled = true; go.textContent = 'Sending...';
          get('&remind=' + encodeURIComponent(c.key) + '&left=' + n).then(function (r) {
            if (r && r.ok) { c.sent = Date.now(); draw(carts, orders, products); } else { go.disabled = false; go.textContent = 'Send reminder'; alert((r && r.error) || 'The email could not be sent. Try again.'); }
          }, function () { go.disabled = false; go.textContent = 'Send reminder'; alert('The email could not be sent. Try again.'); });
        });
        act.appendChild(go);
      }
      tr.appendChild(act); tb.appendChild(tr);
    });
    t.appendChild(tb); sc.appendChild(t); box.appendChild(sc);
    box.appendChild(el('div', 'Each person can be sent one reminder per piece. People who started a checkout before this tab was added are not listed.', 'small'));
  }
  btn.addEventListener('click', function () {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none', 'offerWait'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c !== box && c.dataset && c.dataset.extraTab) c.hidden = true; });
    box.hidden = false; box.textContent = 'Loading...';
    Promise.all([get('&carts=1'), get('')]).then(function (a) { if (a[0].error) { box.textContent = a[0].error; return; } draw(a[0].carts || [], a[1].orders || [], a[1].products || []); }, function () { box.textContent = 'Could not load. Try again.'; });
  });
})();
