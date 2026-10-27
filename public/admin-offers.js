// The Offers tab of the back office: every offer, where it stands, and buttons to accept, counter or decline.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var get = function (extra) { return fetch('/api/admin?k=' + encodeURIComponent(key()) + extra, { cache: 'no-store' }).then(function (r) { return r.json(); }); };
  var usd = function (cents) { return '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var when = function (ms) { return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  var btn = el('button', 'Offers', 'ghost'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  tabs.insertBefore(btn, $('out'));
  var box = el('div'); box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:16px'; box.dataset.extraTab = '1';
  main.insertBefore(box, $('wOrders'));
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (b && b !== btn && b.id !== 'out') { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); } });

  var NAMES = { pending: 'Pending', accepted: '💳 Accepted, not paid yet', countered: 'Countered', ordered: 'Ordered', lapsed: 'Ran out unpaid', declined: 'Declined', auto: 'Declined automatically' };
  var COLORS = { pending: '#C9A45C', accepted: '#8FD3AE', countered: '#8FD3AE', ordered: '#F7F2E6', lapsed: '#A8BFB1', declined: '#A8BFB1', auto: '#A8BFB1' };
  var show = 'all', note = '';
  function load(msg) {
    note = msg || '';
    Promise.all([get('&offers=1'), get('')]).then(function (a) { if (a[0].error) { box.textContent = a[0].error; return; } draw(a[0].offers || [], a[1].orders || []); waiting(a[0].offers || [], a[1].orders || []); }, function () { box.textContent = 'Could not load. Try again.'; });
  }
  // Where an offer stands. An accepted or countered one becomes "ordered" once that buyer has an order for the piece,
  // or "lapsed" once its link is dead.
  function stand(o, orders) {
    var st = o.status;
    if (st === 'accepted' || st === 'countered') {
      var got = orders.filter(function (x) { return !x.cancelled && x.pid === o.pid && String(x.email || '').toLowerCase() === String(o.email || '').toLowerCase() && x.at >= o.statusAt - 60000; })[0];
      if (got) st = 'ordered'; else if (o.until && Date.now() > o.until) st = 'lapsed';
    }
    return st;
  }
  // The Orders tab: offers you accepted or countered that the buyer has not checked out yet sit above the orders.
  var wait = el('div'); wait.id = 'offerWait'; wait.hidden = true; wait.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:14px';
  if ($('wOrders') && $('wOrders').parentNode) $('wOrders').parentNode.insertBefore(wait, $('wOrders'));
  function waiting(offers, orders) {
    var list = offers.filter(function (o) { var st = stand(o, orders); return st === 'accepted' || st === 'countered'; });
    wait.textContent = '';
    if (!list.length) { wait.hidden = true; return; }
    wait.appendChild(el('b', '💳 Payment due · offers you accepted (' + list.length + ')', 'due-h'));
    if (!$('dueHcss')) { var dcs = el('style', '.due-h{font-weight:800;font-size:17px;color:#E8A87C}'); dcs.id = 'dueHcss'; document.head.appendChild(dcs); }
    var grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px'; wait.appendChild(grid);
    list.forEach(function (o) {
      var each = o.counter || o.offer, c = el('div'); c.style.cssText = 'border:1px solid #E8A87C;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:5px;background:#14271D';
      var tg = el('span', 'PAYMENT DUE · OFFER ACCEPTED'); tg.style.cssText = 'align-self:flex-start;background:#E8A87C;color:#0B1A13;font-size:11px;font-weight:800;letter-spacing:.05em;border-radius:6px;padding:3px 8px'; c.appendChild(tg);
      c.appendChild(el('b', o.buyer || o.email || '-'));
      var it = el('span', (o.q > 1 ? o.q + ' x ' : '') + o.item); it.style.cssText = 'font-size:13px;opacity:.85'; c.appendChild(it);
      var pr = el('span', usd(each * (o.q || 1)) + (o.counter ? ' (your counter)' : '') + ' · ' + (o.pay || 'card')); pr.style.cssText = 'font-size:14px;color:#C9A45C;font-weight:700'; c.appendChild(pr);
      var lft = o.until ? Math.max(0, Math.round((o.until - Date.now()) / 3600000)) : 0;
      c.appendChild(el('div', (o.email || '') + (o.until ? ' · link good until ' + when(o.until) + ' (about ' + lft + 'h left)' : ''), 'small'));
      c.appendChild(el('div', 'Becomes a paid order below once they check out. Paid you another way? Mark it paid.', 'small dim'));
      var mp = el('button', '✓ Mark as paid', 'solid'); mp.type = 'button'; mp.style.cssText = 'align-self:flex-start;padding:6px 14px;min-height:0;border-radius:999px';
      mp.addEventListener('click', function () { var PW = { 'Zelle': 'zelle', 'Venmo': 'venmo', 'Cash App': 'cashapp', 'Card': 'card' }; if (window.jfNewOrder) { var ob = document.querySelector('.tabs button'); if (ob && $('wOrders') && $('wOrders').hidden) ob.click(); setTimeout(function () { window.jfNewOrder({ pid: o.pid, item: o.item, qty: o.q || 1, each: (each / 100).toFixed(2), name: o.buyer || '', email: o.email || '', pay: PW[o.pay] || (/eth|usd|crypto/i.test(o.pay || '') ? 'crypto' : 'zelle'), note: 'accepted offer ' + o.n }); }, 200); } });
      c.appendChild(mp);
      var lk = el('button', '🔗 Copy pay link (card or any way)', 'ghost'); lk.type = 'button'; lk.style.cssText = 'align-self:flex-start;padding:6px 14px;min-height:0;border-radius:999px'; var lm = el('div', '', 'small');
      lk.addEventListener('click', function () { lk.disabled = true; get('&offerlink=' + encodeURIComponent(o.n)).then(function (x) { lk.disabled = false; if (x.error) { lm.textContent = x.error; return; } try { navigator.clipboard.writeText(x.link); lm.textContent = '✓ Copied. Send it to the buyer: it pays at the offer price, good until ' + when(x.until) + '.'; } catch (e) { lm.textContent = x.link; } }); });
      c.appendChild(lk); c.appendChild(lm);
      grid.appendChild(c);
    });
    wait.hidden = !!$('wOrders').hidden;
  }
  function refreshWaiting() { if (!key()) return; Promise.all([get('&offers=1'), get('')]).then(function (a) { if (!a[0].error) waiting(a[0].offers || [], a[1].orders || []); }, function () {}); }
  // Shown with the Orders tab and put away with it.
  if ($('wOrders')) new MutationObserver(function () { if ($('wOrders').hidden) wait.hidden = true; else refreshWaiting(); }).observe($('wOrders'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(function () { if (!main.hidden) refreshWaiting(); }).observe(main, { attributes: true, attributeFilter: ['hidden'] });
  if (!main.hidden) refreshWaiting();
  function draw(offers, orders) {
    box.textContent = '';
    // An accepted or countered offer becomes "Ordered" once that buyer has an order for the piece, or "Ran out unpaid" once its link is dead.
    var rows = offers.map(function (o) { return { o: o, st: stand(o, orders) }; }).sort(function (a, b) { var ua = a.st === 'accepted' || a.st === 'countered', ub = b.st === 'accepted' || b.st === 'countered'; return ua !== ub ? (ua ? -1 : 1) : (b.o.at || 0) - (a.o.at || 0); });
    var bar = el('div'); bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
    [['all', 'All']].concat(Object.keys(NAMES).map(function (k) { return [k, NAMES[k]]; })).forEach(function (f) {
      var n = f[0] === 'all' ? rows.length : rows.filter(function (r) { return r.st === f[0]; }).length;
      if (f[0] !== 'all' && f[0] !== 'pending' && f[0] !== 'accepted' && !n) return;
      var b = el('button', f[1] + ' (' + n + ')', show === f[0] ? 'solid' : 'ghost'); b.type = 'button'; b.style.cssText = 'padding:6px 14px;font-size:14px';
      b.addEventListener('click', function () { show = f[0]; draw(offers, orders); });
      bar.appendChild(b);
    });
    box.appendChild(bar);
    var msg = el('div', note, 'small'); msg.setAttribute('role', 'status'); box.appendChild(msg);
    var list = rows.filter(function (r) { return show === 'all' || r.st === show; });
    if (!list.length) { box.appendChild(el('div', rows.length ? 'No offers in this group.' : 'No offers yet. Offers made from now on are listed here; earlier ones are only in your email.', 'small')); return; }
    list.forEach(function (r) {
      var o = r.o, card = el('section', null, 'card'); card.style.cssText = 'display:flex;flex-direction:column;gap:10px';
      var head = el('div'); head.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 16px;align-items:baseline';
      head.appendChild(el('b', o.q + ' x ' + o.item));
      var tag = el('b', NAMES[r.st] || r.st); tag.style.color = COLORS[r.st] || '#F7F2E6'; head.appendChild(tag);
      card.appendChild(head);
      var price = usd(o.offer) + ' each offered (listed ' + usd(o.list) + ')' + (o.q > 1 ? ', ' + usd(o.offer * o.q) + ' in all' : '');
      if (o.counter) price += '. You countered at ' + usd(o.counter) + ' each';
      card.appendChild(el('div', price));
      var who = el('div', null, 'small'); who.appendChild(document.createTextNode(o.buyer + ' · '));
      var a = el('a', o.email); a.href = 'mailto:' + o.email; who.appendChild(a);
      who.appendChild(document.createTextNode(' · wants to pay with ' + (o.pay || 'not said') + ' · offer ' + o.n + ' · ' + when(o.at)));
      card.appendChild(who);
      if ((r.st === 'accepted' || r.st === 'countered') && o.until) card.appendChild(el('div', 'Their checkout link is good until ' + when(o.until) + '.', 'small'));
      if (r.st !== 'ordered' && r.st !== 'auto') {
        var acts = el('div'); acts.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
        var send = function (what, price, b) {
          Array.prototype.forEach.call(acts.querySelectorAll('button'), function (x) { x.disabled = true; });
          msg.textContent = 'Working...';
          fetch('/api/offer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: o.t, do: what, price: price }) }).then(function (x) { return x.json(); }).then(function (x) {
            if (x.error) { Array.prototype.forEach.call(acts.querySelectorAll('button'), function (y) { y.disabled = false; }); msg.textContent = x.error; msg.scrollIntoView({ block: 'nearest' }); return; }
            load('Offer ' + o.n + ' ' + x.done + '. ' + (x.emailed === 'sent' ? 'The buyer has been emailed.' : 'The email to the buyer did not go out; write to ' + o.email + '.'));
          }, function () { Array.prototype.forEach.call(acts.querySelectorAll('button'), function (y) { y.disabled = false; }); msg.textContent = 'Could not reach the site. Try again.'; });
        };
        var mk = function (label, cls, fn) { var b = el('button', label, cls); b.type = 'button'; b.style.cssText = 'padding:8px 16px;font-size:14px'; b.addEventListener('click', fn); acts.appendChild(b); return b; };
        mk(r.st === 'pending' ? 'Accept' : 'Accept at their price', 'solid', function () { send('accept'); });
        var inp = el('input'); inp.inputMode = 'decimal'; inp.placeholder = 'Your price, each'; inp.setAttribute('aria-label', 'Counter price, each'); inp.style.cssText = 'width:150px;height:40px';
        acts.appendChild(inp);
        mk('Counter', 'ghost', function () { send('counter', inp.value); });
        if (r.st !== 'declined') mk('Decline', 'ghost', function () { send('decline'); });
        card.appendChild(acts);
      }
      box.appendChild(card);
    });
  }
  // Orders: the unpaid ones (those still showing "Mark as paid") are gathered at the top under their own heading.
  var bo = $('bOrders'), sorting = false, obs = null;
  function split() {
    if (!bo || sorting) return;
    sorting = true;
    Array.prototype.forEach.call(bo.querySelectorAll('tr[data-sec]'), function (r) { r.remove(); });
    var rows = Array.prototype.slice.call(bo.children);
    var isDue = function (r) { return Array.prototype.some.call(r.querySelectorAll('button'), function (b) { return b.textContent === 'Mark as paid'; }); };
    var due = rows.filter(isDue), rest = rows.filter(function (r) { return !isDue(r); });
    if (due.length) {
      var head = function (text, color) { var tr = el('tr'); tr.dataset.sec = '1'; var td = el('td', text); td.colSpan = 10; td.style.cssText = 'font-weight:800;letter-spacing:.05em;color:' + color + ';background:#0B1A13;padding:10px 12px'; tr.appendChild(td); return tr; };
      bo.appendChild(head('UNPAID: WAITING FOR PAYMENT (' + due.length + '). Press "Mark as paid" when the money arrives.', '#C9A45C'));
      due.forEach(function (r) { bo.appendChild(r); });
      bo.appendChild(head('PAID, SHIPPED OR CANCELLED (' + rest.length + ')', '#8FD3AE'));
      rest.forEach(function (r) { bo.appendChild(r); });
    }
    if (obs) obs.takeRecords();
    sorting = false;
  }
  if (bo) { obs = new MutationObserver(split); obs.observe(bo, { childList: true }); split(); }
  btn.addEventListener('click', function () {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c !== box && c.dataset && c.dataset.extraTab) c.hidden = true; });
    box.hidden = false; box.textContent = 'Loading...';
    load('');
  });
  // ⏳ Awaiting payment: offers you accepted (or countered) that the buyer has not paid yet, and orders still marked payment due.
  var apBtn = el('button', '⏳ Awaiting payment', 'ghost'); apBtn.type = 'button'; tabs.insertBefore(apBtn, $('out'));
  var apBox = el('section', null, 'card'); apBox.hidden = true; apBox.dataset.extraTab = 'await'; apBox.style.cssText = 'display:flex;flex-direction:column;gap:12px'; main.insertBefore(apBox, $('wOrders'));
  var left = function (ms) { var m = Math.round((ms - Date.now()) / 60000); if (m <= 0) return 'ran out'; var h = Math.floor(m / 60); return h >= 1 ? h + 'h ' + (m % 60) + 'm left' : m + 'm left'; };
  var apCard = function (title, price, lines, tag, color) { var c = el('div'); c.style.cssText = 'border:1px solid #2E4A3B;border-left:4px solid ' + color + ';border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;background:#0E2219';
    var t = el('div'); t.style.cssText = 'display:flex;justify-content:space-between;gap:10px;align-items:flex-start'; t.appendChild(el('b', title)); var pr = el('b', price); pr.style.cssText = 'color:#C9A45C;font-size:18px;white-space:nowrap'; t.appendChild(pr); c.appendChild(t);
    var tg = el('span', tag); tg.style.cssText = 'align-self:flex-start;font-size:11px;font-weight:800;letter-spacing:.06em;color:' + color; c.appendChild(tg);
    lines.forEach(function (l) { if (l) c.appendChild(el('div', l, 'small')); }); return c; };
  var apDraw = function (offers, orders) {
    apBox.textContent = ''; apBox.appendChild(el('h2', '⏳ Awaiting payment'));
    var offs = offers.filter(function (o) { var st = stand(o, orders); return st === 'accepted' || st === 'countered'; }).sort(function (a, b) { return (a.until || 0) - (b.until || 0); });
    var dues = orders.filter(function (o) { return o.due && !o.cancelled; });
    apBtn.textContent = '⏳ Awaiting payment' + (offs.length + dues.length ? ' (' + (offs.length + dues.length) + ')' : '');
    apBox.appendChild(el('b', 'Offers you accepted, not paid yet (' + offs.length + ')'));
    if (!offs.length) apBox.appendChild(el('div', 'None right now.', 'small dim'));
    offs.forEach(function (o) { var each = o.counter || o.offer;
      apBox.appendChild(apCard((o.q > 1 ? o.q + ' x ' : '') + o.item, usd(each * (o.q || 1)), [(o.buyer || '-') + ' · ' + (o.email || ''), 'Offer ' + o.n + ' · ' + (o.counter ? 'your counter' : 'accepted') + (o.statusAt ? ' ' + when(o.statusAt) : '') + ' · would pay with ' + (o.pay || 'not said'), o.until ? 'Their checkout link works until ' + when(o.until) + ' (' + left(o.until) + '). They were emailed the link and get a reminder before it runs out.' : ''], 'WAITING FOR THE BUYER TO PAY', '#C9A45C')); });
    apBox.appendChild(el('b', 'Orders placed, payment not received (' + dues.length + ')'));
    if (!dues.length) apBox.appendChild(el('div', 'None right now.', 'small dim'));
    dues.forEach(function (o) { apBox.appendChild(apCard((o.q > 1 ? o.q + ' x ' : '') + (o.product || o.pid), '$' + Number(o.total || 0).toFixed(2), [(o.buyer || '-') + ' · ' + (o.email || ''), 'Order ' + o.n + ' · ' + when(o.at) + ' · paying with ' + (o.pay || '-') + (o.sellerName ? ' · shop: ' + o.sellerName : ''), 'Mark it paid in the Orders tab once the money arrives.'], 'PAYMENT DUE', '#E8A87C')); });
  };
  var apLoad = function () { if (!key()) return; Promise.all([get('&offers=1'), get('')]).then(function (a) { if (!a[0].error && !a[1].error) apDraw(a[0].offers || [], a[1].orders || []); }, function () {}); };
  apBtn.addEventListener('click', function () { setTimeout(function () {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === apBtn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none', 'offerWait'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c.dataset && c.dataset.extraTab) c.hidden = c !== apBox; });
    apBox.textContent = 'Loading…'; apLoad();
  }, 0); });
  setTimeout(apLoad, 1500);
})();
