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
  function zoom(src, title, desc) {
    var ov = el('div'); ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;cursor:zoom-out';
    var im = el('img'); im.src = src; im.alt = title; im.style.cssText = 'max-width:100%;max-height:calc(100vh - 140px);object-fit:contain;border-radius:10px;background:#fff';
    ov.appendChild(im); var cap = el('div', title + (desc ? ' · ' + desc : '') + '  (tap anywhere to close)', 'small'); cap.style.cssText = 'max-width:900px;text-align:center;color:#fff;line-height:1.45'; ov.appendChild(cap);
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
    var pr = prod[o.pid] || {}, what = el('div'); what.style.cssText = 'display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap';
    // Try the saved product photo first, then the home page picture for that piece.
    var tries = [pr.photo, '/photos/home-' + o.pid + '.jpg', '/photos/' + o.pid + '.jpg'].filter(function (u, i, a) { return u && a.indexOf(u) === i; });
    var title = o.product || pr.name || o.pid;
    var th = el('img'); th.alt = title; th.title = 'Tap to see it full size';
    th.style.cssText = 'width:150px;height:150px;object-fit:contain;border-radius:10px;background:#fff;cursor:zoom-in;flex:0 0 auto;border:1px solid rgba(255,255,255,.2)';
    var at = 0, go = function () { if (at < tries.length) th.src = tries[at++]; else th.replaceWith(el('div', 'No photo saved for this piece', 'small')); };
    th.addEventListener('error', go);
    th.addEventListener('click', function () { zoom(th.currentSrc || th.src, title, pr.desc && pr.desc !== title ? pr.desc : ''); });
    go(); what.appendChild(th);
    var d = el('div'); d.style.cssText = 'flex:1 1 220px;display:flex;flex-direction:column;gap:4px;line-height:1.45;overflow-wrap:anywhere';
    d.appendChild(el('b', "What's in it")); var full = (pr.name || title) + (pr.desc && pr.desc !== (pr.name || title) ? '. ' + pr.desc : '');
    d.appendChild(el('div', full, 'small'));
    var tap = el('button', 'See photo full size', 'ghost'); tap.type = 'button'; tap.style.cssText = 'align-self:flex-start;padding:6px 12px;font-size:13px;margin-top:4px';
    tap.addEventListener('click', function () { zoom(th.currentSrc || th.src, title, pr.desc && pr.desc !== title ? pr.desc : ''); }); d.appendChild(tap);
    what.appendChild(d);
    c.appendChild(what);
    var who = el('div'); who.style.cssText = 'display:flex;flex-direction:column;gap:2px';
    who.appendChild(el('div', o.buyer || '-')); if (o.email) who.appendChild(el('div', o.email, 'small'));
    c.appendChild(who);
    var addr = el('div', isNft(o) ? (o.ship || '-') : 'Ship to: ' + (o.ship || '-'));
    addr.style.cssText = 'font-size:15px;line-height:1.45;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.05);overflow-wrap:anywhere';
    c.appendChild(addr);
    c.appendChild(el('div', usd(o.total) + ' · paid ' + (o.pay || '') + (o.note ? ' · Note: ' + o.note : ''), 'small'));
    // Crypto: the payment on the blockchain. Card: the card receipt.
    if (/^https:\/\//.test(o.proof || '')) { var pf = el('a', /scan\.|mempool\.space|blockscout|explorer/i.test(o.proof) ? 'View payment on blockchain' : 'View card receipt'); pf.href = o.proof; pf.target = '_blank'; pf.rel = 'noopener'; pf.style.cssText = 'align-self:flex-start;font-weight:700'; c.appendChild(pf); }
    var row = el('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
    if (view === 'to') {
      if (isNft(o)) {
        row.appendChild(act('Mark NFT sent', function (b) {
          if (!confirm('Mark the NFT for order ' + o.n + ' as sent? The buyer is emailed to check their wallet, and it moves to Shipped.')) return;
          b.disabled = true; get('&nftsent=' + encodeURIComponent(o.n)).then(function (r) { if (r.error) { alert(r.error); b.disabled = false; return; } load(); });
        }, true));
      } else {
        if (/^https:\/\//.test(o.label || '')) {
          // Weight and box size for this package, filled in from the product. Change them, then buy the label with them.
          var pk = el('div'); pk.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid rgba(201,164,92,.55);border-radius:10px';
          pk.appendChild(el('b', 'Package weight and size'));
          var line = el('div'); line.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end';
          var box = function (label, val) { var lb = el('label', label); lb.style.cssText = 'flex:0 1 84px;font-size:13px;display:flex;flex-direction:column;gap:4px'; var i = el('input'); i.type = 'number'; i.inputMode = 'decimal'; i.min = '0'; i.step = 'any'; i.value = val || ''; i.style.cssText = 'width:100%;padding:8px'; lb.appendChild(i); line.appendChild(lb); return i; };
          var keyP = 'pkg-' + o.n, saved = {}; try { saved = JSON.parse(localStorage.getItem(keyP) || '{}') || {}; } catch (e) {}
          var dOz = Number(saved.oz || pr.weight) || 0, dims = String(saved.box || pr.box || '').match(/([\d.]+)\s*[x×]\s*([\d.]+)\s*[x×]\s*([\d.]+)/i) || [];
          var iLb = box('Pounds', dOz ? Math.floor(dOz / 16) : ''), iOz = box('Ounces', dOz ? Math.round((dOz % 16) * 10) / 10 : '');
          var iL = box('Length (in)', dims[1]), iW = box('Width (in)', dims[2]), iH = box('Height (in)', dims[3]);
          // Standard box: one check fills in 12 x 9 x 6 so only the weight needs typing.
          var REG = ['12', '9', '6'], reg = el('label'); reg.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;align-self:flex-start';
          var cb = el('input'); cb.type = 'checkbox'; cb.style.cssText = 'width:20px;height:20px;margin:0;accent-color:#C9A45C';
          reg.appendChild(cb); reg.appendChild(el('span', 'Regular box (12 x 9 x 6 in)'));
          reg.style.setProperty('display', 'flex', 'important'); reg.style.setProperty('flex-direction', 'row', 'important');
          ['width', 'height', 'min-width', 'flex'].forEach(function (k, i) { cb.style.setProperty(k, ['20px', '20px', '20px', '0 0 20px'][i], 'important'); });
          cb.style.setProperty('padding', '0', 'important');
          var isReg = function () { return Number(iL.value) === 12 && Number(iW.value) === 9 && Number(iH.value) === 6; };
          cb.checked = isReg();
          cb.addEventListener('change', function () {
            if (cb.checked) { iL.value = REG[0]; iW.value = REG[1]; iH.value = REG[2]; iLb.focus(); }
            else { iL.value = ''; iW.value = ''; iH.value = ''; }
            sync();
          });
          [iL, iW, iH].forEach(function (i) { i.addEventListener('input', function () { cb.checked = isReg(); }); });
          pk.insertBefore(reg, pk.children[1]);
          pk.appendChild(line);
          var flat = !dims.length && /flat/i.test(String(pr.box || ''));
          pk.appendChild(el('div', flat ? 'Set to a USPS flat rate box. Leave the size blank to keep it, or type your own box size.' : 'Weigh and measure the packed box. The label is priced and bought with these numbers.', 'small'));
          var a = el('a', 'Buy shipping label', 'solid'); a.target = '_blank'; a.rel = 'noopener'; a.style.cssText = 'padding:8px 14px;font-size:14px;text-decoration:none;display:inline-block;align-self:flex-start';
          var sync = function () {
            var oz = (Number(iLb.value) || 0) * 16 + (Number(iOz.value) || 0), q = '';
            if (oz > 0) q += '&oz=' + Math.round(oz * 10) / 10;
            if (Number(iL.value) && Number(iW.value) && Number(iH.value)) q += '&l=' + Number(iL.value) + '&w=' + Number(iW.value) + '&h=' + Number(iH.value);
            a.href = o.label + q;
            try { localStorage.setItem(keyP, JSON.stringify({ oz: oz || '', box: q.indexOf('&l=') >= 0 ? iL.value + ' x ' + iW.value + ' x ' + iH.value : '' })); } catch (e) {}
          };
          [iLb, iOz, iL, iW, iH].forEach(function (i) { i.addEventListener('input', sync); });
          a.addEventListener('click', function (ev) {
            var some = iL.value || iW.value || iH.value, all = Number(iL.value) && Number(iW.value) && Number(iH.value);
            if (some && !all) { ev.preventDefault(); alert('Enter all three sizes (length, width and height), or leave them all blank.'); return; }
            if (!((Number(iLb.value) || 0) * 16 + (Number(iOz.value) || 0))) { ev.preventDefault(); alert('Enter the package weight first.'); return; }
            sync();
          });
          sync(); pk.appendChild(a); c.appendChild(pk);
        }
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
      // Track package: the carrier's tracking page, picked from the shape of the number (labels bought here are USPS).
      if (o.tracking) {
        var t = String(o.tracking).replace(/\s+/g, ''), tu = /^1Z/i.test(t) ? 'https://www.ups.com/track?tracknum=' : /^\d{12}$|^\d{15}$/.test(t) ? 'https://www.fedex.com/fedextrack/?trknbr=' : /^\d{10}$/.test(t) ? 'https://www.dhl.com/us-en/home/tracking.html?tracking-id=' : 'https://tools.usps.com/go/TrackConfirmAction?tLabels=';
        var tr = el('a', 'Track package', 'solid'); tr.href = tu + encodeURIComponent(t); tr.target = '_blank'; tr.rel = 'noopener'; tr.style.cssText = 'padding:8px 14px;font-size:14px;text-decoration:none;display:inline-block';
        row.appendChild(tr);
      }
      if (o.hasLabel) { var p = el('a', 'Print label (half sheet)'); p.href = '/api/labelpdf?n=' + encodeURIComponent(o.n) + '&k=' + encodeURIComponent(key()); p.target = '_blank'; p.rel = 'noopener'; p.style.fontSize = '14px'; row.appendChild(p); }
    }
    c.appendChild(row);
    return c;
  }
  function load() {
    box.textContent = 'Loading...';
    get('').then(function (r) {
      if (r.error) { box.textContent = r.error; return; }
      last = r; draw();
    }, function () { box.textContent = 'Could not load. Try again.'; });
  }
  // The Search box at the top of the back office filters these two tabs too: name, email, order number, item or address.
  var last = null, findBox = $('find');
  if (findBox) findBox.addEventListener('input', function () { if (view && last) draw(); });
  function draw() {
      var r = last;
      prod = {}; (r.products || []).forEach(function (x) { prod[x.id] = x; });
      var list = (r.orders || []), to = list.filter(toShip), done = list.filter(shipped);
      bTo.textContent = 'Needs to be shipped (' + to.length + ')'; bDone.textContent = 'Shipped (' + done.length + ')';
      if (!view) return;
      box.textContent = '';
      var words = String(findBox ? findBox.value : '').toLowerCase().split(/\s+/).filter(Boolean);
      var hay = function (o) { return [o.buyer, o.email, o.n, o.product, o.pid, o.ship, o.tracking, o.pay, o.total].join(' ').toLowerCase(); };
      if (words.length) { to = to.filter(function (o) { var h = hay(o); return words.every(function (w) { return h.indexOf(w) >= 0; }); }); done = done.filter(function (o) { var h = hay(o); return words.every(function (w) { return h.indexOf(w) >= 0; }); }); }
      // Sort picker: oldest first (to ship) or newest first (shipped) by default, A to Z by customer, or most expensive.
      var amt = function (o) { return Number(String(o.total == null ? '' : o.total).replace(/[^0-9.]/g, '')) || 0; };
      var shipTime = function (o) { return o.shippedAt || o.nftSentAt || o.at; };
      var rows = view === 'to' ? to : done;
      if (sortBy === 'az') rows.sort(function (a, b) { return String(a.buyer || a.email || '').toLowerCase().localeCompare(String(b.buyer || b.email || '').toLowerCase()) || b.at - a.at; });
      else if (sortBy === 'money') rows.sort(function (a, b) { return amt(b) - amt(a) || b.at - a.at; });
      else if (sortBy === 'new') rows.sort(function (a, b) { return (view === 'to' ? b.at - a.at : shipTime(b) - shipTime(a)); });
      else rows.sort(function (a, b) { return view === 'to' ? a.at - b.at : shipTime(b) - shipTime(a); });
      var bar = el('div'); bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 16px;align-items:flex-end;justify-content:space-between';
      if (words.length) bar.appendChild(el('div', rows.length ? rows.length + (rows.length === 1 ? ' order matches "' : ' orders match "') + findBox.value.trim() + '".' : 'No orders here match "' + findBox.value.trim() + '". Clear the Search box to see them all.', 'small'));
      else bar.appendChild(el('div', view === 'to' ? (rows.length ? 'Paid orders waiting to go out. Buy the label and the order moves to Shipped.' : 'Nothing to ship. Every paid order is out the door.') : (rows.length ? 'Orders that are on their way.' : 'Nothing shipped yet.'), 'small'));
      if (rows.length > 1) {
        var lab = el('label', 'Sort'); lab.style.cssText = 'flex:0 1 240px';
        var sel = el('select');
        (view === 'to' ? [['', 'Oldest first (ship these first)'], ['new', 'Most recent first'], ['az', 'Customer name, A to Z'], ['money', 'Most expensive first']] : [['', 'Most recently shipped'], ['az', 'Customer name, A to Z'], ['money', 'Most expensive first']]).forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; if (o[0] === sortBy) op.selected = true; sel.appendChild(op); });
        sel.addEventListener('change', function () { sortBy = sel.value; draw(); });
        lab.appendChild(sel); bar.appendChild(lab);
      }
      box.appendChild(bar);
      rows.forEach(function (o) { box.appendChild(card(o)); });
  }
  // The counts on the two buttons fill in as soon as the back office opens.
  if (key()) { view = ''; load(); }
  window.addEventListener('focus', function () { if (view) load(); });
})();
