// Back office add-ons.
// Products tab: one list of every product with how often it was looked at, sorting and filtering, a spreadsheet
// download, adding a product, and editing one: name, description, photo, price, starting count, shipping, section,
// whether it is on the shop shelf, whether it is hidden, and which Deal of the day safe it sits in.
// Customers tab: a "Sort by" choice (name A to Z and so on).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var usd = function (n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var wrap = $('wItems');
  if (!wrap) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var get = function (extra) { return fetch('/api/admin?k=' + encodeURIComponent(key()) + (extra || ''), { cache: 'no-store' }).then(function (r) { return r.json(); }); };
  var pick = function (label, options) {
    var l = el('label', label); l.style.cssText = 'flex:0 1 220px;min-width:0';
    var s = el('select'); s.style.cssText = 'font-family:inherit;font-size:16px;height:44px;padding:0 10px;background:#0B1A13;border:1px solid #4E7A63;color:#F7F2E6;border-radius:2px;width:100%';
    options.forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; s.appendChild(op); });
    l.appendChild(s); return { box: l, sel: s };
  };

  // ---- Products
  // The page's own plain table steps aside for this fuller one.
  var old = wrap.querySelector('.scroll'); if (old) old.style.display = 'none';
  var items = [], editing = '';
  var bar = el('div'); bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end';
  var sort = pick('Sort by', [['shelf', 'Shop order'], ['views', 'Most looked at'], ['checkouts', 'Most checkout clicks'], ['sold', 'Most sold'], ['left', 'Fewest left'], ['priceHigh', 'Price, high to low'], ['priceLow', 'Price, low to high'], ['name', 'Name, A to Z']]);
  var show = pick('Show', [['real', 'Real products'], ['all', 'Everything, with placeholders'], ['Shop', 'Shop only'], ['Deal of the day', 'Deal of the day only'], ['sale', 'For sale now'], ['out', 'Sold out'], ['hidden', 'Hidden']]);
  var down = el('button', 'Download as a spreadsheet', 'ghost'); down.type = 'button';
  var addBtn = el('button', 'Add a product', 'solid'); addBtn.type = 'button';
  bar.appendChild(addBtn); bar.appendChild(sort.box); bar.appendChild(show.box); bar.appendChild(down);
  var note = el('div', 'Looked at = times a piece was opened on the home page (or its safe was opened). Checkout clicks = times its checkout page was opened. Counting started October 10, 2026.', 'small');
  var list = el('div'); list.style.cssText = 'display:flex;flex-direction:column;gap:12px';
  wrap.insertBefore(list, wrap.firstChild); wrap.insertBefore(note, list); wrap.insertBefore(bar, note);

  var rank = { 'Shop': 0, 'Party pricing': 1, 'Deal of the day': 2 };
  function rows() {
    var q = ($('find') ? $('find').value : '').trim().toLowerCase(), f = show.sel.value;
    var v = items.filter(function (p) {
      if (q && [p.id, p.name, p.where, p.section, p.desc].join(' ').toLowerCase().indexOf(q) < 0) return false;
      if (f === 'hidden') return p.hidden;
      if (f === 'real') return !p.test;
      if (f === 'Shop' || f === 'Deal of the day') return p.where === f && !p.test;
      if (f === 'sale') return p.left > 0 && !p.test && !p.hidden && p.state !== 'Locked';
      if (f === 'out') return p.left <= 0;
      return true;
    });
    var by = { views: function (a, b) { return b.views - a.views; }, checkouts: function (a, b) { return b.checkouts - a.checkouts; }, sold: function (a, b) { return b.sold - a.sold; }, left: function (a, b) { return a.left - b.left; }, priceHigh: function (a, b) { return b.price - a.price; }, priceLow: function (a, b) { return a.price - b.price; }, name: function (a, b) { return a.name.localeCompare(b.name); }, shelf: function (a, b) { return (a.test - b.test) || (rank[a.where] - rank[b.where]) || (a.deal - b.deal); } };
    // Drafts waiting to go live stay at the top.
    var dr = function (x) { return x.draft && x.hidden ? 1 : 0; }, cmp = by[sort.sel.value] || by.shelf;
    return v.sort(function (a, b) { return dr(b) - dr(a) || cmp(a, b); });
  }
  function field(label, value, type, width) {
    var l = el('label', label); l.style.cssText = 'flex:1 1 ' + width + ';min-width:0';
    var i = type === 'area' ? el('textarea') : el('input'); i.value = value;
    if (type === 'number') { i.type = 'number'; i.step = 'any'; i.min = '0'; i.inputMode = 'decimal'; }
    if (type === 'area') { i.maxLength = 600; i.rows = 3; i.style.cssText = 'font-family:inherit;font-size:16px;line-height:1.5;padding:10px 12px;background:#0B1A13;border:1px solid #4E7A63;color:#F7F2E6;border-radius:2px;width:100%;box-sizing:border-box;resize:vertical'; }
    l.appendChild(i); return { box: l, input: i };
  }
  function tick(label, on) {
    var l = el('label'); l.style.cssText = 'flex:1 1 100%;display:flex;flex-direction:row;align-items:center;gap:10px;font-weight:400';
    var i = el('input'); i.type = 'checkbox'; i.checked = !!on; i.style.cssText = 'width:20px;height:20px;min-height:0;margin:0;padding:0;flex-shrink:0;accent-color:#C9A45C';
    l.appendChild(i); l.appendChild(el('span', label)); return { box: l, input: i };
  }
  // A chosen picture is made smaller in the browser (1000 px on its long side) and sent as a JPEG.
  function shrink(file, done) {
    var rd = new FileReader();
    rd.onerror = function () { done(''); };
    rd.onload = function () {
      var im = new Image();
      im.onerror = function () { done(''); };
      im.onload = function () {
        var k = Math.min(1, 1000 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.width * k)); cv.height = Math.max(1, Math.round(im.height * k));
        var cx = cv.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
        done(cv.toDataURL('image/jpeg', 0.85).split(',')[1] || '');
      };
      im.src = rd.result;
    };
    rd.readAsDataURL(file);
  }
  // Sends a product's photo. then(ok, message)
  function sendPhoto(id, file, then) {
    shrink(file, function (data) {
      if (!data) { then(false, 'That photo could not be read. Try a JPG or PNG.'); return; }
      fetch('/api/admin?k=' + encodeURIComponent(key()) + '&photo=' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: data }) }).then(function (r) { return r.json(); }).then(function (r) { then(!r.error, r.error || ''); }, function () { then(false, 'Could not reach the site. Try again.'); });
    });
  }
  function photoField(label) {
    var l = el('label', label); l.style.cssText = 'flex:1 1 100%;min-width:0';
    var i = el('input'); i.type = 'file'; i.accept = 'image/*'; i.style.cssText = 'padding:10px;height:auto';
    l.appendChild(i); return { box: l, input: i };
  }
  function stat(label, value) { var d = el('div'); d.style.cssText = 'display:flex;flex-direction:column;min-width:74px'; d.appendChild(el('span', label, 'small')); var b = el('b', value); b.style.color = '#C9A45C'; d.appendChild(b); return d; }
  function card(p) {
    var c = el('section', null, 'card'); c.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    var head = el('div'); head.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;justify-content:space-between';
    var pic = el('img'); pic.alt = ''; pic.src = p.photo || ('/photos/' + (p.id === 'MPARTY' ? 'MONSTER' : p.id) + '.jpg'); pic.style.cssText = 'width:56px;height:56px;object-fit:cover;border-radius:6px;flex-shrink:0;align-self:center';
    pic.onerror = function () { pic.style.display = 'none'; };
    head.appendChild(pic);
    var t = el('b', p.name); t.style.cssText = 'flex:1 1 260px;min-width:0;overflow-wrap:anywhere';
    head.appendChild(t);
    head.appendChild(el('span', (p.nextSafe ? 'WAITING IN NEXT SAFES · ' : p.draft && p.hidden ? 'DRAFT · NOT ON THE SITE YET · ' : p.hidden ? 'HIDDEN · ' : '') + (p.buyers ? 'CUSTOMER LOYALTY · ' : '') + p.where + (!p.deal && p.where === 'Shop' ? (p.onShelf ? ' · on the shelf' : ' · not on the shelf') : '') + (p.deal ? ', safe ' + p.deal : '') + (p.section ? ' · ' + p.section : '') + ' · ' + (p.hidden ? 'Off the site' : p.state || (p.left > 0 ? 'For sale' : 'Sold out')), 'small'));
    c.appendChild(head);
    if (p.auction) {
      // An auction: current bid, time left and every bid with its email (only the owner sees emails).
      var ab = el('div', 'Auction: loading bids...', 'small'); ab.style.cssText = 'display:flex;flex-direction:column;gap:4px';
      c.appendChild(ab);
      fetch('/api/auction?id=' + encodeURIComponent(p.id) + '&ak=' + encodeURIComponent(key()), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (a) {
        ab.textContent = '';
        var head = el('b', 'AUCTION · ' + (a.bids ? 'Current bid $' + a.current + ' · ' + a.bids + (a.bids === 1 ? ' bid' : ' bids') + ' from ' + a.bidders + (a.bidders === 1 ? ' person' : ' people') : 'No bids yet · starts at $' + a.start) + ' · ' + (a.ended ? 'Ended' : 'Ends ' + new Date(a.ends).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })));
        ab.appendChild(head);
        (a.all || []).slice(0, 10).forEach(function (x, i) { ab.appendChild(el('span', (i === 0 ? 'Top: ' : '') + '$' + x.amount + ' · ' + x.email + ' · ' + new Date(x.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))); });
        var al = el('a', 'Open the auction page'); al.href = '/auction.html?id=' + encodeURIComponent(p.id); al.target = '_blank'; ab.appendChild(al);
      }, function () { ab.textContent = 'Auction: could not load the bids.'; });
    }
    if (p.buyers) { var sl = el('a', 'Open the safe (admin view)'); sl.href = '/safe.html?product=' + encodeURIComponent(p.id); sl.target = '_blank'; sl.style.cssText = 'align-self:flex-start;font-weight:700'; c.appendChild(sl); }
    var stats = el('div'); stats.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 22px';
    [['Price', usd(p.price)], ['Shipping', p.shipping ? usd(p.shipping) : 'Free'], ['Left', p.left + ' of ' + p.start], ['Sold', String(p.sold)], ['On hold', String(p.held || 0)], ['Looked at', p.views + (p.viewsToday ? ' (' + p.viewsToday + ' today)' : '')], ['Checkout clicks', String(p.checkouts)]].forEach(function (x) { stats.appendChild(stat(x[0], x[1])); });
    c.appendChild(stats);
    if (p.desc && editing !== p.id) c.appendChild(el('div', p.desc, 'small'));
    if (p.where === 'Party pricing') { c.appendChild(el('div', 'The party piece is locked while the party runs. Ask Claude to change it.', 'small')); return c; }
    if (editing !== p.id) {
      var ed = el('button', 'Edit', 'ghost'); ed.type = 'button'; ed.style.cssText = 'align-self:flex-start;padding:8px 18px';
      ed.addEventListener('click', function () { editing = p.id; draw(); });
      // One press to take a piece off the site, or put it back. Everything else about it stays as it is.
      var hb = el('button', p.hidden ? 'Show on site' : 'Hide from site', p.hidden ? 'solid' : 'ghost'); hb.type = 'button'; hb.style.cssText = 'padding:8px 18px';
      hb.addEventListener('click', function () {
        if (!p.hidden && !confirm('Hide "' + p.name + '" from the site? Nobody will be able to see or order it until you press Show on site.')) return;
        hb.disabled = true; hb.textContent = 'Saving...';
        get('&edit=' + encodeURIComponent(p.id) + '&name=' + encodeURIComponent(p.name) + '&desc=' + encodeURIComponent(p.desc || '') + '&price=' + encodeURIComponent(p.price) + '&stock=' + encodeURIComponent(p.start) + '&shipping=' + encodeURIComponent(p.shipping || 0) + '&section=' + encodeURIComponent(p.section || '') + '&deal=' + encodeURIComponent(p.deal || '0') + '&shelf=' + (p.onShelf ? '1' : '0') + '&hidden=' + (p.hidden ? '0' : '1')).then(function (r) {
          if (r.error) { hb.disabled = false; hb.textContent = p.hidden ? 'Show on site' : 'Hide from site'; alert(r.error); return; }
          load(p.hidden ? 'Back on the site. The shop shows the change within about a minute.' : 'Hidden. The shop shows the change within about a minute.');
        }, function () { hb.disabled = false; hb.textContent = p.hidden ? 'Show on site' : 'Hide from site'; alert('Could not reach the site. Try again.'); });
      });
      var acts = el('div'); acts.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px';
      ed.style.alignSelf = ''; acts.appendChild(ed);
      if (p.draft && p.hidden) {
        // A draft: check it, edit it, then one press puts it on the site and the shop shelf.
        var gl = el('button', 'Go live', 'solid'); gl.type = 'button'; gl.style.cssText = 'padding:8px 22px';
        gl.addEventListener('click', function () {
          if (!p.photo && !confirm('"' + p.name + '" has no photo. Go live anyway?')) return;
          if (!confirm('Put "' + p.name + '" on the site now at ' + usd(p.price) + '?')) return;
          gl.disabled = true; gl.textContent = 'Going live...';
          get('&golive=' + encodeURIComponent(p.id)).then(function (r) {
            if (r.error) { gl.disabled = false; gl.textContent = 'Go live'; alert(r.error); return; }
            load('"' + p.name + '" is live. It shows in the shop within about a minute, and it will be in your next daily update email.');
          }, function () { gl.disabled = false; gl.textContent = 'Go live'; alert('Could not reach the site. Try again.'); });
        });
        acts.appendChild(gl);
        acts.appendChild(el('span', 'Draft: only you can see it. Press Edit to change anything or add the photo, then Go live.', 'small'));
      } else if (!p.nextSafe) acts.appendChild(hb);
      else acts.appendChild(el('span', 'This piece is set up in Next safes. It goes live with its group.', 'small'));
      c.appendChild(acts); return c;
    }
    var row = el('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end';
    var name = field('Name', p.name, 'text', '100%'), desc = field('Description (shown on the home page when the piece is opened)', p.desc || '', 'area', '100%');
    var price = field('Price, $', Number(p.price).toFixed(2), 'number', '120px'), stock = field('Started with', p.start, 'number', '120px'), ship = field('Shipping, $ (0 = free)', Number(p.shipping).toFixed(2), 'number', '160px');
    var sec = p.deal ? null : field('Section', p.section, 'text', '180px');
    // What the shipping label uses: the weight per piece, and the package (L x W x H in inches, or a flat rate box name).
    var wt = field('Shipping weight, oz (per piece)', p.weight || '', 'number', '200px'), bx = field('Package size, L x W x H in (or small/medium/large flat rate box)', p.box || '', 'text', '360px');
    var safe = field('Deal of the day safe (0 = none)', p.deal || 0, 'number', '200px');
    var onShelf = tick('Show on the shop shelf and in the chat', p.onShelf), hide = tick('Hide from the site (it cannot be seen or ordered)', p.hidden), buyers = tick('Customer Loyalty product (shows as a locked safe; only a signed-in returning customer can open and order it)', p.buyers);
    var photo = photoField('New photo (optional)');
    [name, desc, price, stock, ship, sec, wt, bx, safe, photo, onShelf, hide, buyers].forEach(function (f) { if (f) row.appendChild(f.box); });
    var save = el('button', 'Save', 'solid'); save.type = 'button'; row.appendChild(save);
    var cancel = el('button', 'Cancel', 'ghost'); cancel.type = 'button'; row.appendChild(cancel);
    var msg = el('div', '"Started with" is the total you began with; the site takes sold units off it, so to add 3 more, raise it by 3. Sections: Comics, Cards, NFTs, Graded, Pokemon, Watches.', 'small'); msg.setAttribute('role', 'status');
    cancel.addEventListener('click', function () { editing = ''; draw(); });
    save.addEventListener('click', function () {
      save.disabled = true; msg.textContent = 'Saving...';
      get('&edit=' + encodeURIComponent(p.id) + '&name=' + encodeURIComponent(name.input.value) + '&desc=' + encodeURIComponent(desc.input.value) + '&price=' + encodeURIComponent(price.input.value) + '&stock=' + encodeURIComponent(stock.input.value) + '&shipping=' + encodeURIComponent(ship.input.value) + '&section=' + encodeURIComponent(sec ? sec.input.value : '') + '&deal=' + encodeURIComponent(safe.input.value || '0') + '&shelf=' + (onShelf.input.checked ? '1' : '0') + '&hidden=' + (hide.input.checked ? '1' : '0') + '&buyers=' + (buyers.input.checked ? '1' : '0') + '&weight=' + encodeURIComponent(wt.input.value) + '&box=' + encodeURIComponent(bx.input.value)).then(function (r) {
        if (r.error) { save.disabled = false; msg.textContent = r.error; return; }
        var fin = function (ok, why) { save.disabled = false; if (!ok) { msg.textContent = 'Saved, but the photo did not go up: ' + why; return; } editing = ''; load('Saved. The shop shows the change within about a minute.'); };
        if (photo.input.files && photo.input.files[0]) { msg.textContent = 'Sending the photo...'; sendPhoto(p.id, photo.input.files[0], fin); } else fin(true);
      }, function () { save.disabled = false; msg.textContent = 'Could not reach the site. Try again.'; });
    });
    c.appendChild(row); c.appendChild(msg);
    return c;
  }
  // The form for a new product.
  var adding = false;
  function addCard() {
    var c = el('section', null, 'card'); c.style.cssText = 'display:flex;flex-direction:column;gap:10px;border-color:#C9A45C';
    c.appendChild(el('b', 'Add a product'));
    c.appendChild(el('div', 'It is saved as a draft that only you can see. Check it over, then press Go live on it when you are done.', 'small'));
    var row = el('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end';
    var name = field('Name', '', 'text', '100%'), desc = field('Description (optional)', '', 'area', '100%');
    var price = field('Price, $', '', 'number', '120px'), stock = field('How many you have', '1', 'number', '140px'), ship = field('Shipping, $ (0 = free)', '5.30', 'number', '160px'), sec = field('Section', 'Comics', 'text', '180px');
    var wt = field('Weight, oz (for the label)', '', 'number', '170px'), bx = field('Box (e.g. 12 x 9 x 6)', '', 'text', '170px');
    var regL = el('label'); regL.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;flex:0 0 auto';
    regL.style.setProperty('display', 'flex', 'important'); regL.style.setProperty('flex-direction', 'row', 'important');
    var reg = el('input'); reg.type = 'checkbox'; ['width', 'height', 'min-width', 'flex', 'padding'].forEach(function (k, i) { reg.style.setProperty(k, ['20px', '20px', '20px', '0 0 20px', '0'][i], 'important'); }); reg.style.margin = '0'; reg.style.accentColor = '#C9A45C';
    regL.appendChild(reg); regL.appendChild(el('span', 'Regular box (12 x 9 x 6 in)'));
    reg.addEventListener('change', function () { bx.input.value = reg.checked ? '12 x 9 x 6' : ''; });
    var photo = photoField('Photo');
    [name, desc, price, stock, ship, sec, wt, bx, { box: regL }, photo].forEach(function (f) { row.appendChild(f.box); });
    var save = el('button', 'Save as draft', 'solid'); save.type = 'button'; row.appendChild(save);
    var cancel = el('button', 'Cancel', 'ghost'); cancel.type = 'button'; row.appendChild(cancel);
    var msg = el('div', 'Nothing shows on the site until you press Go live. Sections: Comics, Cards, NFTs, Graded, Pokemon, Watches.', 'small'); msg.setAttribute('role', 'status');
    cancel.addEventListener('click', function () { adding = false; draw(); });
    save.addEventListener('click', function () {
      save.disabled = true; msg.textContent = 'Adding...';
      get('&add=1&name=' + encodeURIComponent(name.input.value) + '&desc=' + encodeURIComponent(desc.input.value) + '&price=' + encodeURIComponent(price.input.value) + '&stock=' + encodeURIComponent(stock.input.value) + '&shipping=' + encodeURIComponent(ship.input.value || '0') + '&draft=1&weight=' + encodeURIComponent(wt.input.value) + '&box=' + encodeURIComponent(bx.input.value) + '&section=' + encodeURIComponent(sec.input.value)).then(function (r) {
        if (r.error) { save.disabled = false; msg.textContent = r.error; return; }
        var fin = function (ok, why) { adding = false; load(ok ? 'Saved as a draft. It is at the top of the list: check it, then press Go live.' : 'Saved as a draft, but the photo did not go up: ' + why + ' Press Edit on it and try the photo again.'); };
        if (photo.input.files && photo.input.files[0]) { msg.textContent = 'Sending the photo...'; sendPhoto(r.id, photo.input.files[0], fin); } else fin(true);
      }, function () { save.disabled = false; msg.textContent = 'Could not reach the site. Try again.'; });
    });
    c.appendChild(row); c.appendChild(msg);
    return c;
  }
  addBtn.addEventListener('click', function () { adding = true; editing = ''; draw(); });
  var flash = '', soldOpen = false;
  function draw() {
    list.textContent = '';
    if (flash) { list.appendChild(el('div', flash, 'small')); flash = ''; }
    if (adding) list.appendChild(addCard());
    // Sold pieces (every unit sold) move out of the list into their own Sold section at the bottom.
    var sold = function (p) { return p.start > 0 && p.sold >= p.start && !p.nextSafe && show.sel.value !== 'out'; };
    var all = rows(), v = all.filter(function (p) { return !sold(p); }), gone = all.filter(sold);
    if (!v.length) list.appendChild(el('div', 'No products match.', 'small'));
    v.forEach(function (p) { list.appendChild(card(p)); });
    if (gone.length) {
      var sh = el('button', (soldOpen ? 'Hide' : 'Show') + ' sold (' + gone.length + ')', 'ghost'); sh.type = 'button'; sh.style.cssText = 'align-self:flex-start;margin-top:10px';
      sh.addEventListener('click', function () { soldOpen = !soldOpen; draw(); });
      list.appendChild(el('b', 'Sold')); list.appendChild(sh);
      if (soldOpen) gone.forEach(function (p) { list.appendChild(card(p)); });
    }
  }
  function load(say) {
    get().then(function (r) { if (r.error) return; items = r.products || []; flash = say || ''; draw(); }, function () { /* the page shows its own error */ });
  }
  sort.sel.addEventListener('change', draw); show.sel.addEventListener('change', draw);
  if ($('find')) $('find').addEventListener('input', draw);
  if ($('tItems')) $('tItems').addEventListener('click', function () { load(); });
  down.addEventListener('click', function () {
    var cell = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    var out = [['ID', 'Product', 'Description', 'Hidden', 'On the shelf', 'Where it shows', 'Deal safe', 'Section', 'Price', 'Shipping', 'Started with', 'Sold', 'On hold', 'Left', 'Status', 'Looked at', 'Checkout clicks']].concat(rows().map(function (p) {
      return [p.id, p.name, p.desc, p.hidden ? 'yes' : '', p.onShelf ? 'yes' : '', p.where, p.deal || '', p.section, Number(p.price).toFixed(2), Number(p.shipping).toFixed(2), p.start, p.sold, p.held || 0, p.left, p.state || (p.left > 0 ? 'For sale' : 'Sold out'), p.views, p.checkouts];
    }));
    var a = el('a'); a.href = URL.createObjectURL(new Blob([out.map(function (x) { return x.map(cell).join(','); }).join('\r\n')], { type: 'text/csv' })); a.download = 'products.csv';
    document.body.appendChild(a); a.click(); a.remove();
  });
  load();

  // ---- Customers: sort the list. The page redraws its rows as you search, so the order is put back each time.
  var people = $('wPeople'), body = $('bPeople');
  if (people && body) {
    var ps = pick('Sort customers by', [['', 'Most spent'], ['az', 'Name, A to Z'], ['za', 'Name, Z to A'], ['recent', 'Most recent order'], ['orders', 'Most orders'], ['place', 'Ships to, A to Z']]);
    ps.box.style.cssText = 'max-width:260px;margin-bottom:10px';
    people.parentNode.insertBefore(ps.box, people);
    var busy = false;
    var txt = function (tr, i) { return (tr.children[i] ? tr.children[i].textContent : '').trim(); };
    var apply = function () {
      ps.box.hidden = people.hidden;
      var how = ps.sel.value; if (!how || busy) return;
      var trs = Array.prototype.slice.call(body.children);
      var cmp = { az: function (a, b) { return txt(a, 0).localeCompare(txt(b, 0)); }, za: function (a, b) { return txt(b, 0).localeCompare(txt(a, 0)); }, recent: function (a, b) { return (Date.parse(txt(b, 5)) || 0) - (Date.parse(txt(a, 5)) || 0); }, orders: function (a, b) { return Number(txt(b, 2)) - Number(txt(a, 2)); }, place: function (a, b) { return txt(a, 6).localeCompare(txt(b, 6)); } }[how];
      var want = trs.slice().sort(cmp);
      // Already in order: nothing to move. (Moving rows would wake the watcher below again.)
      if (want.every(function (tr, i) { return tr === trs[i]; })) return;
      busy = true; want.forEach(function (tr) { body.appendChild(tr); }); watch.takeRecords(); busy = false;
    };
    var watch = new MutationObserver(function () { if (!busy) apply(); });
    watch.observe(body, { childList: true });
    new MutationObserver(apply).observe(people, { attributes: true, attributeFilter: ['hidden'] });
    ps.sel.addEventListener('change', function () { if (ps.sel.value) apply(); else if ($('find')) $('find').dispatchEvent(new Event('input')); });
    apply();
  }
})();
