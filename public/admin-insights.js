// The Insights tab of the back office: sales by month and day, where customers are, what sells and how people pay.
// It reads the same orders as the rest of the page. Cancelled orders are left out.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var usd = function (n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var num = function (v) { return Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')) || 0; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return;
  var btn = el('button', 'Insights', 'ghost'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  tabs.insertBefore(btn, $('out'));
  var box = el('div'); box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:22px';
  main.insertBefore(box, $('wOrders')); box.dataset.extraTab = '1';
  var others = ['tOrders', 'tPeople', 'tItems'];
  others.forEach(function (id) { $(id).addEventListener('click', function () { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); }); });

  // "..., City, ST 60035" at the end of the ship-to line gives the city and state.
  function place(ship) {
    var m = /([^,]+),\s*([A-Za-z .]+?)\s+\d{5}(-\d{4})?\s*$/.exec(String(ship || ''));
    return m ? { city: m[1].trim(), state: m[2].trim().toUpperCase() } : null;
  }
  // rows: [[label, orders, units, sales]]. The bar shows each row's share of the biggest sales figure.
  function table(title, first, rows, note) {
    var wrap = el('section'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    wrap.appendChild(el('h2', title));
    if (note) wrap.appendChild(el('div', note, 'small'));
    if (!rows.length) { wrap.appendChild(el('div', 'Nothing to show yet.', 'small')); return wrap; }
    var top = Math.max.apply(null, rows.map(function (r) { return r[3]; })) || 1;
    var sc = el('div', null, 'scroll'), t = el('table'), h = el('tr');
    [[first, ''], ['Orders', 'num'], ['Units', 'num'], ['Sales', 'num'], ['', '']].forEach(function (c) { h.appendChild(el('th', c[0], c[1])); });
    var th = el('thead'); th.appendChild(h); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', r[0])); tr.appendChild(el('td', String(r[1]), 'num')); tr.appendChild(el('td', String(r[2]), 'num')); tr.appendChild(el('td', usd(r[3]), 'num'));
      var b = el('td'); b.style.width = '35%';
      var bar = el('div'); bar.style.cssText = 'height:12px;background:#C9A45C;border-radius:2px;width:' + Math.max(1, Math.round(r[3] / top * 100)) + '%';
      b.appendChild(bar); tr.appendChild(b); tb.appendChild(tr);
    });
    t.appendChild(tb); sc.appendChild(t); wrap.appendChild(sc);
    return wrap;
  }
  function group(list, keyOf) {
    var by = {}, keys = [];
    list.forEach(function (o) {
      var k = keyOf(o); if (!k) return;
      if (!by[k]) { by[k] = [k, 0, 0, 0]; keys.push(k); }
      by[k][1]++; by[k][2] += Number(o.q) || 0; by[k][3] += num(o.total);
    });
    return keys.map(function (k) { return by[k]; });
  }
  var bySales = function (a, b) { return b[3] - a[3]; };

  function draw(orders) {
    box.textContent = '';
    var live = orders.filter(function (o) { return !o.cancelled; });
    var v = el('section', null, 'card small');
    v.appendChild(el('b', 'Website visitors. '));
    v.appendChild(document.createTextNode('Visits per day, pages viewed, where visitors come from and their countries are counted by Vercel Analytics. '));
    var a = el('a', 'Open visitor analytics'); a.href = 'https://vercel.com/root-boy/collectors-page/analytics'; a.target = '_blank'; a.rel = 'noopener';
    v.appendChild(a); box.appendChild(v);

    var seen = {}, repeat = 0, people = 0;
    live.forEach(function (o) { var id = (o.email || o.buyer || '').toLowerCase(); if (!id) return; seen[id] = (seen[id] || 0) + 1; });
    Object.keys(seen).forEach(function (k) { people++; if (seen[k] > 1) repeat++; });
    var total = live.reduce(function (s, o) { return s + num(o.total); }, 0);
    var tiles = el('div', null, 'tiles');
    [['Sales, all time', usd(total)], ['Average order', usd(live.length ? total / live.length : 0)], ['Customers', String(people)], ['Came back for more', String(repeat)]].forEach(function (x) {
      var d = el('div', null, 'tile'); d.appendChild(el('span', x[0], 'small')); d.appendChild(el('b', x[1])); tiles.appendChild(d);
    });
    box.appendChild(tiles);

    var month = function (o) { return new Date(o.at).toLocaleString('en-US', { month: 'long', year: 'numeric' }); };
    var day = function (o) { return new Date(o.at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); };
    var newest = live.slice().sort(function (x, y) { return y.at - x.at; });
    var since = Date.now() - 30 * 86400000;
    box.appendChild(table('Sales by month', 'Month', group(newest, month)));
    box.appendChild(table('Sales by day', 'Day', group(newest.filter(function (o) { return o.at >= since; }), day), 'The last 30 days. Days with no orders are not listed.'));
    box.appendChild(table('Customers by state', 'State', group(live, function (o) { var p = place(o.ship); return p ? p.state : (/^NFT/.test(o.ship || '') ? 'NFT (no shipping)' : ''); }).sort(bySales), 'From the ship-to address on each order.'));
    box.appendChild(table('Customers by city', 'City', group(live, function (o) { var p = place(o.ship); return p ? p.city + ', ' + p.state : ''; }).sort(bySales).slice(0, 15), 'The top 15.'));
    box.appendChild(table('Sales by product', 'Product', group(live, function (o) { return o.product || o.pid; }).sort(bySales)));
    box.appendChild(table('How people pay', 'Paid with', group(live, function (o) { return o.pay || 'Not recorded'; }).sort(bySales)));
    box.appendChild(el('div', 'Sales figures are order totals: pieces, shipping, tax and any card fee. Orders waiting on a by-hand payment are counted.', 'small'));
  }

  btn.addEventListener('click', function () {
    others.forEach(function (id) { $(id).setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    ['wOrders', 'wPeople', 'wItems', 'none'].forEach(function (id) { $(id).hidden = true; });
    box.hidden = false; box.textContent = 'Loading...';
    var key = ''; try { key = localStorage.getItem('adminKey') || ''; } catch (e) { /* no storage */ }
    fetch('/api/admin?k=' + encodeURIComponent(key), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
      if (r.error) { box.textContent = r.error; return; }
      draw(r.orders || []);
    }, function () { box.textContent = 'Could not load. Check your connection and try again.'; });
  });
})();
