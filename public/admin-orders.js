// Orders tab: View (Photo boxes / Thin list / Full list, like Products) and a New order button for sales made by hand.
// The page's own table stays the source: its Search, Show and Sort decide which orders appear and in what order.
// Picking an order opens it with a copy of its table row, whose buttons (tracking, mark paid, cancel) still work.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var wrap = $('wOrders'), body = $('bOrders');
  if (!wrap || !body) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var usd = function (n) { var v = Number(String(n == null ? '' : n).replace(/[^0-9.]/g, '')) || 0; return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var when = function (t) { return t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };

  // The View picker and the New order button go into the filter bar, next to Show.
  var bar = $('viewBox') ? $('viewBox').parentNode : wrap.parentNode;
  var vl = el('label', 'View'); vl.style.cssText = 'flex:0 1 200px'; vl.id = 'oViewBox';
  var vs = el('select'); [['boxes', 'Photo boxes'], ['thin', 'Thin list'], ['full', 'Full list']].forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; vs.appendChild(op); });
  try { vs.value = localStorage.getItem('orderView') || 'boxes'; } catch (e) { vs.value = 'boxes'; }
  if (!vs.value) vs.value = 'boxes';
  vl.appendChild(vs);
  var nb = el('button', 'New order', 'solid'); nb.type = 'button'; nb.id = 'newOrderBtn';
  bar.insertBefore(nb, bar.firstChild && $('find') ? $('find').parentNode : null);
  if ($('viewBox')) bar.insertBefore(vl, $('viewBox')); else bar.appendChild(vl);

  var box = el('div'); box.id = 'oCards'; wrap.parentNode.insertBefore(box, wrap.nextSibling);
  var formBox = el('div'); formBox.hidden = true; wrap.parentNode.insertBefore(formBox, $('none') || wrap);
  var openN = '';

  function photoOf(o) {
    var p = (window.jfItems || []).filter(function (x) { return x.id === o.pid; })[0];
    return (p && p.photo) || ('/photos/' + o.pid + '.jpg');
  }
  function tagOf(o) {
    if (o.cancelled) return 'CANCELLED';
    var nf = /^NFT to wallet /.test(o.ship || '');
    if (o.hasLabel || (o.tracking && !o.testLabel) || o.shippedAt || (nf && o.nftSentAt)) return 'SHIPPED';
    if (o.due) return 'PAYMENT DUE';
    return 'TO SHIP';
  }
  var COLORS = { 'SHIPPED': '#8FD3AE', 'TO SHIP': '#C9A45C', 'PAYMENT DUE': '#E86A5C', 'CANCELLED': '#6F8A7B' };

  function render() {
    var tabOn = !wrap.hidden, view = vs.value;
    vl.hidden = !tabOn; nb.hidden = !tabOn;
    if (!tabOn || view === 'full') { box.hidden = true; wrap.style.display = ''; return; }
    wrap.style.display = 'none'; box.hidden = false; box.textContent = '';
    var by = {}; (window.jfOrders || []).forEach(function (o) { by[o.n] = o; });
    var rows = Array.prototype.slice.call(body.children).filter(function (tr) { return tr.dataset && tr.dataset.n && by[tr.dataset.n]; });
    var holder = el('div');
    holder.style.cssText = view === 'boxes' ? 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px' : 'display:flex;flex-direction:column;gap:4px';
    rows.forEach(function (tr) {
      var o = by[tr.dataset.n], tag = tagOf(o);
      if (openN === o.n) { holder.appendChild(opened(o, tr, view)); return; }
      var b = el('button'); b.type = 'button'; b.title = (o.buyer || '') + ' · ' + (o.product || '');
      var im = el('img'); im.alt = ''; im.src = photoOf(o); im.loading = 'lazy'; im.onerror = function () { im.style.visibility = 'hidden'; };
      if (view === 'boxes') {
        b.style.cssText = 'display:flex;flex-direction:column;gap:5px;padding:8px;text-align:left;background:#14271D;border:1px solid #2E4A3B;border-radius:8px;color:#F7F2E6;cursor:pointer;font:inherit;height:auto;min-height:0;position:relative' + (o.cancelled ? ';opacity:.55' : '');
        im.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;background:#0B1A13'; b.appendChild(im);
        var tg = el('span', tag); tg.style.cssText = 'position:absolute;top:12px;left:12px;background:' + COLORS[tag] + ';color:#0B1A13;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px'; b.appendChild(tg);
        var nm = el('b', o.buyer || o.email || '-'); nm.style.cssText = 'font-size:14px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; b.appendChild(nm);
        var it = el('span', (o.product || o.pid) + (o.q > 1 ? ' x ' + o.q : '')); it.style.cssText = 'font-size:13px;opacity:.85;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden'; b.appendChild(it);
        var mt = el('span', usd(o.total) + ' · ' + when(o.at)); mt.style.cssText = 'font-size:13px;color:#C9A45C;font-weight:700'; b.appendChild(mt);
      } else {
        b.style.cssText = 'display:flex;align-items:center;gap:12px;padding:6px 10px;text-align:left;background:#14271D;border:1px solid #2E4A3B;border-radius:6px;color:#F7F2E6;cursor:pointer;font:inherit;height:auto;min-height:0;width:100%' + (o.cancelled ? ';opacity:.55' : '');
        im.style.cssText = 'width:36px;height:36px;object-fit:cover;border-radius:4px;flex-shrink:0'; b.appendChild(im);
        var nm2 = el('span', (o.buyer || o.email || '-') + ' · ' + (o.product || o.pid) + (o.q > 1 ? ' x ' + o.q : '')); nm2.style.cssText = 'flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700;font-size:15px'; b.appendChild(nm2);
        var tg2 = el('span', tag); tg2.style.cssText = 'font-size:11px;font-weight:700;color:' + COLORS[tag] + ';flex-shrink:0'; b.appendChild(tg2);
        var pr = el('span', usd(o.total)); pr.style.cssText = 'flex-shrink:0;width:90px;text-align:right;color:#C9A45C;font-weight:700'; b.appendChild(pr);
        var dt = el('span', when(o.at)); dt.style.cssText = 'flex-shrink:0;width:120px;text-align:right;font-size:13px;opacity:.8'; b.appendChild(dt);
      }
      b.addEventListener('click', function () { openN = o.n; render(); });
      holder.appendChild(b);
    });
    if (!rows.length) holder.appendChild(el('div', 'No orders match.', 'small'));
    box.appendChild(holder);
  }
  // One order opened: its photo and details, with the table row (and its buttons) inside.
  function opened(o, tr, view) {
    var c = el('section', null, 'card'); c.style.cssText = 'display:flex;flex-direction:column;gap:10px;border-color:#C9A45C' + (view === 'boxes' ? ';grid-column:1 / -1' : '');
    var top = el('div'); top.style.cssText = 'display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap';
    var im = el('img'); im.alt = ''; im.src = photoOf(o); im.style.cssText = 'width:110px;height:110px;object-fit:cover;border-radius:8px'; im.onerror = function () { im.style.display = 'none'; }; top.appendChild(im);
    var info = el('div'); info.style.cssText = 'flex:1 1 260px;min-width:0;display:flex;flex-direction:column;gap:4px';
    info.appendChild(el('b', (o.product || o.pid) + (o.q > 1 ? ' x ' + o.q : '')));
    info.appendChild(el('div', (o.buyer || '-') + (o.email ? ' · ' + o.email : ''), 'small'));
    info.appendChild(el('div', 'Order ' + o.n + ' · ' + when(o.at) + ' · ' + usd(o.total) + (o.pay ? ' · paid with ' + o.pay : ''), 'small'));
    if (o.ship) info.appendChild(el('div', 'Ship to: ' + o.ship, 'small'));
    top.appendChild(info);
    var x = el('button', 'Close', 'ghost'); x.type = 'button'; x.style.cssText = 'padding:6px 16px;align-self:flex-start';
    x.addEventListener('click', function () { openN = ''; render(); }); top.appendChild(x);
    c.appendChild(top);
    var sc = el('div', null, 'scroll'), t = el('table'), th = wrap.querySelector('thead');
    if (th) t.appendChild(th.cloneNode(true));
    // A copy of the table row; its buttons press the real row's buttons, so tracking, mark paid and cancel work.
    var tb = el('tbody'), cl = tr.cloneNode(true), ob = tr.querySelectorAll('button'), cb = cl.querySelectorAll('button');
    Array.prototype.forEach.call(cb, function (b, i) { b.addEventListener('click', function (ev) { ev.preventDefault(); if (ob[i]) ob[i].click(); }); });
    tb.appendChild(cl); t.appendChild(tb); sc.appendChild(t); c.appendChild(sc);
    return c;
  }
  var timer = null;
  // A redraw of the table redraws the cards.
  var watch = new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(render, 0); });
  watch.observe(body, { childList: true });
  new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(render, 0); }).observe(wrap, { attributes: true, attributeFilter: ['hidden'] });
  vs.addEventListener('change', function () { try { localStorage.setItem('orderView', vs.value); } catch (e) { /* this visit only */ } openN = ''; render(); });

  // ---- New order: a sale made by hand (in person, Whatnot, a message...). It becomes a real order.
  nb.addEventListener('click', function () { formBox.hidden ? showForm() : (formBox.hidden = true); });
  function field(label, val, basis, type) {
    var l = el('label', label); l.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1 1 ' + basis + ';min-width:0';
    var i = el('input'); i.value = val == null ? '' : val; if (type) { i.type = type; if (type === 'number') { i.step = 'any'; i.min = '0'; } }
    l.appendChild(i); return { box: l, input: i };
  }
  function showForm() {
    formBox.hidden = false; formBox.textContent = '';
    var c = el('section', null, 'card'); c.style.cssText = 'display:flex;flex-direction:column;gap:12px;border-color:#C9A45C';
    c.appendChild(el('b', 'New order (made by hand)'));
    c.appendChild(el('div', 'For a sale made outside the checkout. It goes in your orders like any other: stock comes off, the buyer earns a jar, and you can buy the label from Needs to be shipped.', 'small'));
    var row = el('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end';
    var pl = el('label', 'Product'); pl.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1 1 100%';
    var ps = el('select'); var items = (window.jfItems || []).filter(function (p) { return !p.test; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var ph = el('option', 'Pick the product'); ph.value = ''; ps.appendChild(ph);
    items.forEach(function (p) { var op = el('option', p.name + ' · ' + usd(p.price) + ' · ' + p.left + ' left'); op.value = p.id; ps.appendChild(op); });
    pl.appendChild(ps); row.appendChild(pl);
    var qty = field('How many', 1, '90px', 'number'), each = field('Price each, $', '', '120px', 'number'), ship = field('Shipping charged, $', '0', '140px', 'number');
    ps.addEventListener('change', function () { var p = items.filter(function (x) { return x.id === ps.value; })[0]; if (p) { each.input.value = Number(p.price).toFixed(2); ship.input.value = Number(p.shipping || 0).toFixed(2); } });
    var nm = field('Buyer name', '', '200px'), em = field('Buyer email (for their jar and My orders)', '', '260px', 'email');
    var st = field('Street address (leave blank if no shipping)', '', '100%'), l2 = field('Apt, suite', '', '140px'), ci = field('City', '', '160px'), sa = field('State', '', '90px'), zp = field('ZIP', '', '100px');
    var pyl = el('label', 'Paid with'); pyl.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:0 1 180px';
    var py = el('select'); [['cash', 'Cash'], ['zelle', 'Zelle'], ['venmo', 'Venmo'], ['cashapp', 'Cash App'], ['card', 'Card'], ['crypto', 'Crypto']].forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; py.appendChild(op); }); pyl.appendChild(py);
    var pdl = el('label'); pdl.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:8px;flex:0 1 auto;font-weight:700';
    var pd = el('input'); pd.type = 'checkbox'; pd.checked = true; pd.style.cssText = 'width:20px;height:20px;min-height:0;margin:0;padding:0;accent-color:#C9A45C'; pdl.appendChild(pd); pdl.appendChild(el('span', 'Already paid'));
    var nt = field('Note (where it sold, e.g. Whatnot)', '', '240px');
    [qty, each, ship, nm, em, st, l2, ci, sa, zp].forEach(function (f) { row.appendChild(f.box); }); row.appendChild(pyl); row.appendChild(pdl); row.appendChild(nt.box);
    c.appendChild(row);
    var bt = el('div'); bt.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';
    var save = el('button', 'Save order', 'solid'); save.type = 'button'; var cancel = el('button', 'Cancel', 'ghost'); cancel.type = 'button';
    bt.appendChild(save); bt.appendChild(cancel); c.appendChild(bt);
    var say = el('div', '', 'small'); say.setAttribute('role', 'status'); c.appendChild(say);
    cancel.addEventListener('click', function () { formBox.hidden = true; });
    save.addEventListener('click', function () {
      if (!ps.value) { say.textContent = 'Pick the product that was sold.'; return; }
      save.disabled = true; say.textContent = 'Saving...';
      var q = '&neworder=1&pid=' + encodeURIComponent(ps.value) + '&qty=' + encodeURIComponent(qty.input.value) + '&each=' + encodeURIComponent(each.input.value) + '&ship=' + encodeURIComponent(ship.input.value || '0') +
        '&name=' + encodeURIComponent(nm.input.value) + '&email=' + encodeURIComponent(em.input.value) + '&street=' + encodeURIComponent(st.input.value) + '&line2=' + encodeURIComponent(l2.input.value) + '&city=' + encodeURIComponent(ci.input.value) +
        '&state=' + encodeURIComponent(sa.input.value) + '&zip=' + encodeURIComponent(zp.input.value) + '&pay=' + encodeURIComponent(py.value) + '&paid=' + (pd.checked ? '1' : '0') + '&note=' + encodeURIComponent(nt.input.value);
      fetch('/api/admin?k=' + encodeURIComponent(key()) + q, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
        save.disabled = false;
        if (r.error) { say.textContent = r.error; return; }
        formBox.hidden = true;
        alert('Order ' + r.n + ' saved.' + (r.short ? ' Note: there was not enough stock left, so check the count on that product.' : ''));
        if (window.jfReload) window.jfReload();
      }, function () { save.disabled = false; say.textContent = 'Could not reach the site. Try again.'; });
    });
    formBox.appendChild(c);
  }
  render();
})();
