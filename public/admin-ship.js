// Two sections of the back office: "To ship" (paid orders still waiting to go out) and "Shipped".
// An order moves from To ship to Shipped once its label is bought, a tracking number is added, or (an NFT) it is marked sent.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var get = function (extra) { return fetch('/api/admin?k=' + encodeURIComponent(key()) + (extra || ''), { cache: 'no-store' }).then(function (r) { return r.json(); }); };
  var usd = function (n) { var v = Number(String(n == null ? '' : n).replace(/[^0-9.]/g, '')) || 0; return '$' + v.toFixed(2); };
  var when = function (t) { return t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };
  var isNft = function (o) { return /^NFT to wallet /.test(o.ship || ''); };
  var shipped = function (o) { return !o.cancelled && !!(o.hasLabel || (o.tracking && !o.testLabel) || o.shippedAt || (isNft(o) && o.nftSentAt)); };
  var toShip = function (o) { return !o.cancelled && !o.due && !shipped(o); };

  var bTo = el('button', 'Needs to be shipped', 'ghost'), bDone = el('button', 'Shipped', 'ghost');
  [bTo, bDone].forEach(function (b) { b.type = 'button'; b.setAttribute('aria-pressed', 'false'); });
  var after = $('tOrders') && $('tOrders').nextSibling;
  tabs.insertBefore(bTo, after); tabs.insertBefore(bDone, after);
  var box = el('div'); box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:14px'; box.dataset.extraTab = '1';
  main.insertBefore(box, $('wOrders'));
  var view = '', sortBy = '', prod = {};
  // Full-size photo viewer: tap a photo on a card to check every piece before it goes in the box.
  function zoom(src, title) {
    var ov = el('div'); ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;cursor:zoom-out';
    var im = el('img'); im.src = src; im.alt = title; im.style.cssText = 'max-width:100%;max-height:calc(100vh - 90px);object-fit:contain;border-radius:10px;background:#fff';
    ov.appendChild(im); ov.appendChild(el('div', title + ' · tap anywhere to close', 'small'));
    var close = function () { ov.remove(); document.removeEventListener('keydown', esc); };
    var esc = function (e) { if (e.key === 'Escape') close(); };
    ov.addEventListener('click', close); document.addEventListener('keydown', esc);
    document.body.appendChild(ov);
  }
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (b && b !== bTo && b !== bDone && b.id !== 'out') { box.hidden = true; view = ''; [bTo, bDone].forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); } });
  function open(which, btn) {
    view = which;
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none', 'offerWait', 'viewBox', 'sortBox'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c !== box && c.dataset && c.dataset.extraTab) c.hidden = true; });
    box.hidden = false; load();
  }
  bTo.addEventListener('click', function () { if (sortBy === 'new' ) sortBy = ''; open('to', bTo); });
  bDone.addEventListener('click', function () { if (sortBy === 'new') sortBy = ''; open('done', bDone); });

  function act(label, fn, solid) { var b = el(solid ? 'button' : 'button', label, solid ? 'solid' : 'ghost'); b.type = 'button'; b.style.cssText = 'padding:8px 14px;font-size:14px'; b.addEventListener('click', function () { fn(b); }); return b; }
  function card(o) {
    var c = el('div', null, 'card'); c.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    var top = el('div'); top.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 14px;align-items:baseline';
    top.appendChild(el('b', (o.product || o.pid) + (Number(o.q) > 1 ? '  ×' + o.q : '')));
    top.appendChild(el('span', 'Order ' + o.n + ' · ' + when(o.at), 'small'));
    c.appendChild(top);
    // What was sold: the product photo and its description, to check the package against.
    var pr = prod[o.pid] || {}, what = el('div'); what.style.cssText = 'display:flex;gap:12px;align-items:flex-start';
    if (pr.photo) {
      var th = el('img'); th.src = pr.photo; th.alt = o.product || o.pid; th.loading = 'lazy'; th.title = 'Tap to see it full size';
      th.style.cssText = 'width:110px;height:110px;object-fit:cover;border-radius:10px;background:#fff;cursor:zoom-in;flex:0 0 auto;border:1px solid rgba(255,255,255,.15)';
      th.addEventListener('click', function () { zoom(pr.photo, o.product || o.pid); });
      th.addEventListener('error', function () { th.replaceWith(el('div', 'No photo saved for this piece', 'small')); });
      what.appendChild(th);
    } else what.appendChild(el('div', 'No photo saved for this piece', 'small'));
    if (pr.desc) { var d = el('div', 'What\'s in it: ' + pr.desc, 'small'); d.style.cssText = 'line-height:1.45;overflow-wrap:anywhere'; what.appendChild(d); }
    c.appendChild(what);
    var who = el('div'); who.style.cssText = 'display:flex;flex-direction:column;gap:2px';
    who.appendChild(el('div', o.buyer || '-')); if (o.email) who.appendChild(el('div', o.email, 'small'));
    c.appendChild(who);
    var addr = el('div', isNft(o) ? (o.ship || '-') : 'Ship to: ' + (o.ship || '-'));
    addr.style.cssText = 'font-size:15px;line-height:1.45;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.05);overflow-wrap:anywhere';
    c.appendChild(addr);
    c.appendChild(el('div', usd(o.total) + ' · paid ' + (o.pay || '') + (o.note ? ' · Note: ' + o.note : ''), 'small'));
    var row = el('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
    if (view === 'to') {
      if (isNft(o)) {
        row.appendChild(act('Mark NFT sent', function (b) {
          if (!confirm('Mark the NFT for order ' + o.n + ' as sent? The buyer is emailed to check their wallet, and it moves to Shipped.')) return;
          b.disabled = true; get('&nftsent=' + encodeURIComponent(o.n)).then(function (r) { if (r.error) { alert(r.error); b.disabled = false; return; } load(); });
        }, true));
      } else {
        if (/^https:\/\//.test(o.label || '')) { var a = el('a', 'Buy shipping label', 'solid'); a.href = o.label; a.target = '_blank'; a.rel = 'noopener'; a.style.cssText = 'padding:8px 14px;font-size:14px;text-decoration:none;display:inline-block'; row.appendChild(a); }
        row.appendChild(act('Shipped another way (add tracking)', function (b) {
          var num = prompt('Tracking number for order ' + o.n + '. The buyer is emailed it and the order moves to Shipped.'); if (!num || !num.trim()) return;
          var car = prompt('Carrier (USPS, UPS, FedEx). Leave blank to skip.', 'USPS') || '';
          b.disabled = true; get('&ship=' + encodeURIComponent(o.n) + '&tracking=' + encodeURIComponent(num.trim()) + '&carrier=' + encodeURIComponent(car.trim())).then(function (r) { if (r.error) { alert(r.error); b.disabled = false; return; } load(); });
        }));
        row.appendChild(el('span', 'Moves to Shipped as soon as the label is bought. Refresh after buying.', 'small'));
      }
    } else {
      var s = isNft(o) ? 'NFT sent ' + when(o.nftSentAt) : 'Shipped' + (o.shippedAt ? ' ' + when(o.shippedAt) : '') + (o.tracking ? ' · Tracking ' + o.tracking : '');
      row.appendChild(el('span', s, 'small'));
      if (o.hasLabel) { var p = el('a', 'Print label (half sheet)'); p.href = '/api/labelpdf?n=' + encodeURIComponent(o.n) + '&k=' + encodeURIComponent(key()); p.target = '_blank'; p.rel = 'noopener'; p.style.fontSize = '14px'; row.appendChild(p); }
    }
    c.appendChild(row);
    return c;
  }
  function load() {
    box.textContent = 'Loading...';
    get('').then(function (r) {
      if (r.error) { box.textContent = r.error; return; }
      prod = {}; (r.products || []).forEach(function (x) { prod[x.id] = x; });
      var list = (r.orders || []), to = list.filter(toShip), done = list.filter(shipped);
      bTo.textContent = 'Needs to be shipped (' + to.length + ')'; bDone.textContent = 'Shipped (' + done.length + ')';
      if (!view) return;
      box.textContent = '';
      // Sort picker: oldest first (to ship) or newest first (shipped) by default, A to Z by customer, or most expensive.
      var amt = function (o) { return Number(String(o.total == null ? '' : o.total).replace(/[^0-9.]/g, '')) || 0; };
      var shipTime = function (o) { return o.shippedAt || o.nftSentAt || o.at; };
      var rows = view === 'to' ? to : done;
      if (sortBy === 'az') rows.sort(function (a, b) { return String(a.buyer || a.email || '').toLowerCase().localeCompare(String(b.buyer || b.email || '').toLowerCase()) || b.at - a.at; });
      else if (sortBy === 'money') rows.sort(function (a, b) { return amt(b) - amt(a) || b.at - a.at; });
      else if (sortBy === 'new') rows.sort(function (a, b) { return (view === 'to' ? b.at - a.at : shipTime(b) - shipTime(a)); });
      else rows.sort(function (a, b) { return view === 'to' ? a.at - b.at : shipTime(b) - shipTime(a); });
      var bar = el('div'); bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 16px;align-items:flex-end;justify-content:space-between';
      bar.appendChild(el('div', view === 'to' ? (rows.length ? 'Paid orders waiting to go out. Buy the label and the order moves to Shipped.' : 'Nothing to ship. Every paid order is out the door.') : (rows.length ? 'Orders that are on their way.' : 'Nothing shipped yet.'), 'small'));
      if (rows.length > 1) {
        var lab = el('label', 'Sort'); lab.style.cssText = 'flex:0 1 240px';
        var sel = el('select');
        (view === 'to' ? [['', 'Oldest first (ship these first)'], ['new', 'Most recent first'], ['az', 'Customer name, A to Z'], ['money', 'Most expensive first']] : [['', 'Most recently shipped'], ['az', 'Customer name, A to Z'], ['money', 'Most expensive first']]).forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; if (o[0] === sortBy) op.selected = true; sel.appendChild(op); });
        sel.addEventListener('change', function () { sortBy = sel.value; load(); });
        lab.appendChild(sel); bar.appendChild(lab);
      }
      box.appendChild(bar);
      rows.forEach(function (o) { box.appendChild(card(o)); });
    }, function () { box.textContent = 'Could not load. Try again.'; });
  }
  // The counts on the two buttons fill in as soon as the back office opens.
  if (key()) { view = ''; load(); }
  window.addEventListener('focus', function () { if (view) load(); });
})();
