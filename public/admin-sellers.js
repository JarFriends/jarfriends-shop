// The Sellers tab of the back office: approve or pause sellers, see their sales and your fee on each, and record
// the money you send them.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var money = function (c) { return '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var post = function (body) { body.ak = key(); return fetch('/api/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); };
  var btn = el('button', 'Sellers', 'ghost'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  tabs.insertBefore(btn, $('out'));
  // Fees to collect: its own tab button. It opens Sellers at the fee section (who owes you, and who is paid up).
  // 🗄️ Backup: every data file in one download, made daily by itself; photos are copied inside the site too.
  var bkBtn = el('button', '🗄️ Backup', 'ghost'); bkBtn.type = 'button'; tabs.insertBefore(bkBtn, $('out'));
  var bkBox = el('section', null, 'card'); bkBox.dataset.extraTab = 'backup'; bkBox.hidden = true; bkBox.style.gap = '10px'; main.insertBefore(bkBox, $('wOrders'));
  bkBtn.addEventListener('click', function () { setTimeout(function () {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === bkBtn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none', 'offerWait'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c.dataset && c.dataset.extraTab) c.hidden = c !== bkBox; });
    bkBox.textContent = ''; bkBox.appendChild(el('h2', '🗄️ Backups'));
    bkBox.appendChild(el('div', 'The site backs itself up every day: every shop, listing, order, payout, offer, account and setting, in one file, kept 60 days. Photos are copied too. Download one now and then and keep it on your computer or Google Drive: if anything is ever lost, it can be put back from it.', 'small dim'));
    var now = el('button', 'Back up now', 'solid'); now.type = 'button'; now.style.alignSelf = 'flex-start'; var m = el('div', '', 'small'); var lst = el('div'); lst.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    bkBox.appendChild(now); bkBox.appendChild(m); bkBox.appendChild(lst);
    var load = function () { fetch('/api/market?do=backup&ak=' + encodeURIComponent(key()), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { lst.textContent = ''; if (!j.backups || !j.backups.length) { lst.appendChild(el('div', 'No backups yet. Press Back up now.', 'small')); return; }
      j.backups.slice(0, 14).forEach(function (b) { var r0 = el('div'); r0.style.cssText = 'display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid #2E4A3B;border-radius:10px;padding:8px 12px'; r0.appendChild(el('span', b.day + ' · ' + Math.max(1, Math.round(b.size / 1024)) + ' KB'));
        var dl = el('button', '⬇ Download', 'ghost'); dl.type = 'button'; dl.style.cssText = 'padding:4px 10px;min-height:0';
        dl.addEventListener('click', function () { dl.disabled = true; fetch('/api/market?do=backup&day=' + b.day + '&ak=' + encodeURIComponent(key()), { cache: 'no-store' }).then(function (r) { return r.blob(); }).then(function (bl) { var a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = 'veefam-backup-' + b.day + '.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); dl.disabled = false; }); });
        r0.appendChild(dl); lst.appendChild(r0); }); }); };
    now.addEventListener('click', function () { now.disabled = true; m.textContent = 'Backing up… (up to a minute)'; post({ do: 'backup' }).then(function (x) { now.disabled = false; m.textContent = x.error || ('✓ Backed up ' + x.files + ' files and ' + x.photos + ' photos.'); load(); }); });
    load();
  }, 0); });
  // Sellers to pay: its own tab button too. It opens Sellers at "Needs to be paid" (who you pay by hand, and Stripe's).
  var payBtn = el('button', '💵 Sellers to pay', 'ghost'); payBtn.type = 'button'; tabs.insertBefore(payBtn, $('out'));
  payBtn.addEventListener('click', function () { setTimeout(function () { btn.click(); box.classList.add('focus-pay'); payBtn.setAttribute('aria-pressed', 'true'); btn.setAttribute('aria-pressed', 'false'); }, 0); box.classList.add('focus-pay'); var tries = 0; (function go() { var f = document.getElementById('payBox'); if (f) { box.classList.add('focus-pay'); f.open = true; setTimeout(function () { f.open = true; f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250); } else if (tries++ < 40) setTimeout(go, 150); })(); });
  var feeBtn = el('button', '💸 Fees to collect', 'ghost'); feeBtn.type = 'button'; tabs.insertBefore(feeBtn, $('out'));
  feeBtn.addEventListener('click', function () { setTimeout(function () { btn.click(); feeBtn.setAttribute('aria-pressed', 'true'); btn.setAttribute('aria-pressed', 'false'); }, 0); var tries = 0; (function go() { var f = document.getElementById('feeBox'); if (f) { f.open = true; setTimeout(function () { f.open = true; f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250); } else if (tries++ < 40) setTimeout(go, 150); })(); });
  var box = el('div'); box.dataset.extraTab = 'sellers'; box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:18px';
  main.insertBefore(box, $('wOrders'));
  var css = el('style'); css.textContent = '.sx-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.sx-tile{background:#11261C;border:1px solid #244536;padding:14px 16px;display:flex;flex-direction:column;gap:4px}.sx-tile b{font-family:"IBM Plex Mono",monospace;font-size:22px;font-weight:500}.sx-tile.gold{border-color:#C9A45C}.sx-tile.gold b{color:#C9A45C}.sx-b{display:inline-block;font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.1em;padding:3px 8px;border:1px solid #4E7A63}.sx-b.ok{border-color:#8FD3AE;color:#8FD3AE}.sx-b.wait{border-color:#C9A45C;color:#C9A45C}.sx-b.off{border-color:#E86A6A;color:#E86A6A}.sx-pay{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-top:8px}.sx-pay input,.sx-pay select{min-height:40px;font-size:15px;padding:6px 10px;background:#0B1A13;border:1px solid #4E7A63;color:#F7F2E6;border-radius:2px;font-family:inherit}';
  document.head.appendChild(css);
  var pvCss = el('style'); pvCss.textContent = '.pv-card{display:flex;flex-direction:column;gap:12px;border:1px solid #2E4A3B;border-radius:14px;padding:16px;background:#0E2219}.pv-done{opacity:.55}.pv-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.pv-hd b{font-size:18px}.pv-hd>div:first-child{display:flex;flex-direction:column;gap:6px;align-items:flex-start;min-width:0}.pv-amt{color:#C9A45C;font-size:24px;font-weight:800;white-space:nowrap}.pv-pill{font-size:12px;border:1px solid #2E4A3B;border-radius:99px;padding:2px 8px;opacity:.85}.pv-ways{display:flex;flex-direction:column;border:1px solid #2E4A3B;border-radius:10px;overflow:hidden}.pv-way{display:grid;grid-template-columns:96px 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-top:1px solid #1F3A2D}.pv-way:first-child{border-top:0}.pv-lab{display:flex;flex-direction:column;gap:2px}.pv-pref{font-size:11px;color:#C9A45C;font-weight:700}.pv-val{min-width:0;overflow-wrap:anywhere;font-size:15px}.pv-act{display:flex;gap:6px;align-items:center}.pv-act button{padding:4px 10px!important;min-height:0!important;font-size:13px}.pv-act a{font-size:13px;white-space:nowrap}.pv-bank{display:flex;flex-direction:column;gap:6px;padding:10px 12px;background:#0B1A13;border-top:1px solid #1F3A2D}.pv-bank>div{display:grid;grid-template-columns:70px 1fr auto;gap:8px;align-items:center;font-size:14px}.pv-bank b{word-break:break-all}.pv-bank button{padding:3px 8px!important;min-height:0!important;font-size:12px}.pv-mark{display:flex;gap:8px;flex-wrap:wrap;align-items:stretch;padding-top:4px;border-top:1px dashed #2E4A3B}.pv-money{display:flex!important;flex-direction:row!important;align-items:center;gap:4px;border:1px solid #2E4A3B;border-radius:8px;padding:0 10px;background:#0B1A13;flex:0 0 120px}.pv-money input{border:0!important;background:transparent!important;width:100%;padding:8px 0!important;min-height:0!important;color:inherit;font-size:16px}.pv-mark select{flex:1 1 110px;background:#0B1A13;color:inherit;border:1px solid #2E4A3B;border-radius:8px;padding:8px 10px;font-size:15px}.pv-mark .solid{flex:1 1 150px;padding:10px 14px!important;min-height:0!important}@media(max-width:520px){.pv-way{grid-template-columns:1fr auto}.pv-val{grid-column:1/-1;grid-row:2;white-space:normal;overflow-wrap:anywhere}}.pv-list{display:flex;flex-direction:column;gap:12px}.pv-why{border:1px solid #2E4A3B;border-radius:10px;padding:8px 12px;background:#0B1A13}.pv-paid>summary{cursor:pointer;font-size:13px;font-weight:700;color:#8FD3AE;padding:8px 0 2px;border-top:1px solid #1F3A2D}.pv-done-ln{opacity:.65}.pv-why>summary{cursor:pointer;font-weight:700;font-size:14px;color:#C9A45C;padding:2px 0}.pv-ln{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid #1F3A2D;font-size:14px}.pv-ln b{white-space:nowrap}.pv-tot{border-top:2px solid #2E4A3B;font-size:15px}.pv-tot b:last-child{color:#C9A45C}.pv-grid .pv-list{grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))!important;align-items:start}.pv-wrap:not(.pv-grid) .pv-card{max-width:760px}.pv-grid .pv-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}.focus-pay>:not(#payBox){display:none!important}.pv-all{display:none}.focus-pay .pv-all{display:inline-flex}.pv-wrap button[aria-pressed="true"]{background:#C9A45C;color:#0B1A13;border-color:#C9A45C}'; document.head.appendChild(pvCss);
  // Your own shops (SEED_SELLERS) get their own back office: a button at the top of this page opens it.
  var mine = $('myShops'), shown = false;
  function myShops() {
    if (shown || !mine || !key()) return;
    shown = true;
    fetch('/api/market?do=admin&ak=' + encodeURIComponent(key()), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
      var own = (r.sellers || []).filter(function (s) { return s.seeded; });
      if (!own.length) { shown = false; return; }
      mine.textContent = ''; mine.appendChild(el('span', 'This is the back office: it runs the whole site. Your own store has its own Seller Hub:', 'dim'));
      own.forEach(function (s) { var a = el('a', 'Open my ' + s.name + ' Seller Hub', 'solid'); a.href = '/seller.html?as=' + encodeURIComponent(s.slug); a.style.cssText = 'padding:8px 14px;text-decoration:none'; mine.appendChild(a); });
      mine.hidden = false;
    }).catch(function () { shown = false; });
  }
  myShops(); var tries = setInterval(function () { if (shown) { clearInterval(tries); return; } myShops(); }, 3000);
  // Any other tab puts this one away.
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (b && b !== btn && b.id !== 'out') { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); } });
  btn.addEventListener('click', function () {
    box.classList.remove('focus-pay');
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none', 'offerWait'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c !== box && c.dataset && c.dataset.extraTab) c.hidden = true; });
    box.hidden = false; load();
  });

  function load() {
    box.textContent = 'Loading sellers…';
    fetch('/api/market?do=admin&ak=' + encodeURIComponent(key()), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(draw).catch(function () { box.textContent = 'Could not load the sellers. Try again.'; });
  }
  function draw(r) {
    box.textContent = '';
    if (r.error) { box.textContent = r.error; return; }
    var t = r.totals;
    var tiles = el('div', null, 'sx-tiles');
    var feeSum = r.sellers.reduce(function (a, s) { return a + ((s.totals && s.totals.feeOwed) || 0); }, 0);
    if (feeSum > 0) { var al = el('button', '🔔 Sellers owe you ' + money(feeSum) + ' in fees (' + r.sellers.filter(function (s) { return s.totals && s.totals.feeOwed > 0; }).length + ' seller' + (r.sellers.filter(function (s) { return s.totals && s.totals.feeOwed > 0; }).length > 1 ? 's' : '') + '). See who and why ›', 'solid'); al.type = 'button'; al.style.cssText = 'align-self:stretch;text-align:left;background:#E5484D;border-color:#E5484D;color:#fff'; al.addEventListener('click', function () { var fbx = document.getElementById('feeBox'); if (fbx) { fbx.open = true; fbx.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }); box.appendChild(al); }
    [['FEES SELLERS OWE YOU', money(feeSum), feeSum > 0 ? 'gold' : ''], ['YOUR FEES EARNED (' + r.fee + '%)', money(t.fee), 'gold'], ['GIVEAWAY WALLET (' + (r.giveaway || 2) + '% OF SALES, FROM YOUR FEE)', money(t.wallet || 0), ''], ['YOU KEEP AFTER WALLET', money((t.fee || 0) - (t.wallet || 0)), 'gold'], ['SELLER SALES (PAID)', money(t.gross), ''], ['PAID TO SELLERS BY STRIPE', money(t.byStripe || 0), ''], ['SENT BY YOU', money(t.paidOut), ''], ['YOU STILL OWE SELLERS', money(Math.max(0, t.payNow != null ? t.payNow : t.owed)) + (t.shipHeld ? ' (+' + money(t.shipHeld) + ' shipping held)' : ''), ''], ['SELLERS', String(r.sellers.length), '']].forEach(function (x) {
      var owe = x[0] === 'YOU STILL OWE SELLERS', feeT = x[0] === 'FEES SELLERS OWE YOU';
      if (feeT) { var fd = el('button', null, 'sx-tile ' + x[2]); fd.type = 'button'; fd.style.cssText = 'cursor:pointer;text-align:left;font:inherit;color:inherit;border-color:#E5484D'; fd.appendChild(el('span', x[0], 'label')); fd.appendChild(el('b', x[1])); fd.appendChild(el('span', 'See who and why ›', 'label')); fd.addEventListener('click', function () { var fbx = document.getElementById('feeBox'); if (fbx) { fbx.open = true; fbx.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }); tiles.appendChild(fd); return; }
      var d = el(owe ? 'button' : 'div', null, 'sx-tile ' + x[2]); d.appendChild(el('span', x[0], 'label')); d.appendChild(el('b', x[1])); tiles.appendChild(d);
      if (owe) { d.type = 'button'; d.style.cssText = 'cursor:pointer;text-align:left;font:inherit;color:inherit;border-color:#C9A45C'; d.appendChild(el('span', 'See who and why ›', 'label')).style.color = '#E8C77A'; d.addEventListener('click', function () { oweBox.hidden = !oweBox.hidden; if (!oweBox.hidden) oweBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); }
    });
    box.appendChild(tiles);
    // Sales tax: the states where VeeFam collects sales tax as the marketplace, with each state's rate.
    (function () {
      var tb = el('details', null, 'card'); tb.style.gap = '10px'; box.appendChild(tb);
      var sm = el('summary'); sm.style.cssText = 'cursor:pointer;font-weight:800;font-size:17px'; sm.textContent = '🧾 Sales tax'; tb.appendChild(sm);
      var wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:12px'; tb.appendChild(wrap);
      wrap.appendChild(el('div', 'As the marketplace, VeeFam collects sales tax for every seller on orders shipping to a state where you are registered to collect (where VeeFam has passed that state\u2019s marketplace threshold, or has a presence). It is charged on the pieces, by the buyer\u2019s ship-to state, whoever the seller is, and comes to you to file and pay. Add a state once you register there.', 'small dim'));
      var rows = el('div'); rows.style.cssText = 'display:flex;flex-direction:column;gap:6px'; wrap.appendChild(rows);
      // Where VeeFam stands in each state: sales shipped there this year and last against the state's marketplace threshold.
      var track = el('div'); track.style.cssText = 'display:flex;flex-direction:column;gap:6px'; wrap.insertBefore(track, rows);
      var AVG = {}, ST = {}, add = el('div'); add.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center'; wrap.appendChild(add);
      var m = el('div', '', 'small'); var save = el('button', 'Save sales tax', 'solid'); save.type = 'button';
      var line = function (c, r) {
        var d = el('div'); d.style.cssText = 'display:flex;gap:8px;align-items:center';
        var nm = el('b', c + ' · ' + (ST[c] || '').replace(/\b\w/g, function (x) { return x.toUpperCase(); })); nm.style.minWidth = '160px';
        var inp = el('input'); inp.type = 'number'; inp.step = '0.001'; inp.min = '0.01'; inp.max = '15'; inp.value = r; inp.style.width = '100px'; inp.dataset.c = c;
        var x = el('button', 'Remove', 'ghost'); x.type = 'button'; x.style.cssText = 'padding:6px 10px;min-height:0'; x.addEventListener('click', function () { d.remove(); });
        d.appendChild(nm); d.appendChild(inp); d.appendChild(el('span', '%', 'small')); d.appendChild(x); rows.appendChild(d);
      };
      fetch('/api/market?do=tax-get&ak=' + encodeURIComponent(key()), { cache: 'no-store' }).then(function (x) { return x.json(); }).then(function (t) {
        ST = t.states || {}; AVG = t.avg || {}; Object.keys(t.rates || {}).sort().forEach(function (c) { line(c, t.rates[c]); });
        var tr = t.track || [], over = tr.filter(function (x) { return x.status === 'over'; });
        var usd0 = function (c) { return '$' + Math.round(c / 100).toLocaleString(); };
        var badge = { over: ['Over the line: register and collect', '#E5484D'], near: ['Getting close (80%+)', '#F5A524'], collecting: ['Collecting', '#3FB950'], under: ['Under the line', '#8FA79A'], none: ['No sales tax in this state', '#8FA79A'] };
        track.appendChild(el('b', 'Where you stand, by state' + (over.length ? '  ·  ⚠️ ' + over.length + ' to register' : '')));
        var quiet = tr.filter(function (x) { return !(x.cur || x.prev || x.m12 || x.measured) && x.status !== 'collecting' && x.status !== 'over' && !x.own; }), busy = tr.filter(function (x) { return quiet.indexOf(x) < 0; });
        if (!busy.length) track.appendChild(el('div', 'No orders shipped to any state yet this year or last.', 'small dim'));
        var allBox = el('details'); var allSm = el('summary', 'See every state’s limit (' + quiet.length + ' more, no sales yet)', 'small'); allSm.style.cssText = 'cursor:pointer;font-weight:700'; allBox.appendChild(allSm);
        var allList = el('div'); allList.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px'; allBox.appendChild(allList);
        busy.concat(quiet).forEach(function (x) {
          var target = quiet.indexOf(x) >= 0 ? allList : track;
          var d = el('div'); d.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;border:1px solid #2E4A3B;border-radius:10px;padding:8px 10px';
          var b = badge[x.status] || badge.under, tag = el('span', b[0], 'small'); tag.style.cssText = 'border:1px solid ' + b[1] + ';color:' + b[1] + ';border-radius:999px;padding:2px 9px;font-weight:700';
          var nm = el('b', x.code + ' · ' + String(x.name).replace(/\b\w/g, function (y) { return y.toUpperCase(); })); nm.style.minWidth = '150px';
          var line2 = 'This year ' + usd0(x.cur) + ' (' + x.curN + ' orders) · last year ' + usd0(x.prev) + ' (' + x.prevN + ')';
          if (x.threshold != null && x.status !== 'none') line2 += ' · line: ' + (x.threshold ? usd0(x.threshold * 100) : 'any sale') + (x.orders ? (x.rule === 'and' ? ' and over ' + (x.orders - 1) : ' or ' + x.orders) + ' orders' : '') + ', counted over ' + x.period + (x.status !== 'collecting' ? ' (now ' + usd0(x.measured) + ', ' + x.measuredN + ' orders: ' + x.pct + '%)' : '') + (x.shipTaxed ? ' · taxes shipping' : '');
          d.appendChild(nm); d.appendChild(tag); d.appendChild(el('span', line2, 'small dim'));
          if (x.own) { var ow = el('span', 'Home state: tax on your own shop\u2019s pieces now; on every seller\u2019s once you pass the line', 'small'); ow.style.cssText = 'border:1px solid #3FB950;color:#3FB950;border-radius:999px;padding:2px 9px;font-weight:700'; d.appendChild(ow); }
          if (x.status === 'over' || x.status === 'near') { var go = el('button', 'Collect here (' + x.avg + '%)', 'ghost'); go.type = 'button'; go.style.cssText = 'padding:6px 10px;min-height:0';
            go.addEventListener('click', function () { if (!rows.querySelector('input[data-c="' + x.code + '"]')) line(x.code, x.avg); go.remove(); m.textContent = 'Added ' + x.code + ' at its usual rate. Register with the state first, check the rate, then Save.'; }); d.appendChild(go); }
          target.appendChild(d);
        });
        if (quiet.length) track.appendChild(allBox);
        track.appendChild(el('div', 'Each state requires a marketplace to collect once its sales into that state pass a line, counted that state\u2019s way (most: $100,000; CA and TX: $500,000; NY: $500,000 and over 100 orders; AL, MS: $250,000; CT: $250,000 of ALL VeeFam sales; DC: from the first sale; some also count 200 orders). Where a state taxes shipping, checkout taxes it too. Illinois is your home state: your own shop\u2019s pieces shipping there are taxed now, and every seller\u2019s once VeeFam passes Illinois\u2019 $100,000 line (then register as a marketplace and add Illinois below). Rates added here start at the state’s usual combined rate (state plus average local, 2026); check them with your accountant.', 'small dim'));
        track.appendChild(el('b', 'Collecting now'));
        var sel = el('select'); sel.className = 'jf-sel'; var o0 = el('option', 'Add a state…'); o0.value = ''; sel.appendChild(o0);
        Object.keys(ST).sort().forEach(function (c) { var o = el('option', c + ' · ' + ST[c]); o.value = c; sel.appendChild(o); });
        sel.addEventListener('change', function () { var c = sel.value; sel.value = ''; if (!c || rows.querySelector('input[data-c="' + c + '"]')) return; line(c, AVG[c] || ''); var i = rows.querySelector('input[data-c="' + c + '"]'); if (i) i.focus(); });
        add.appendChild(sel); add.appendChild(save); add.appendChild(m);
        sm.textContent = '🧾 Sales tax (' + (Object.keys(t.rates || {}).join(', ') || 'none') + ')';
      });
      save.addEventListener('click', function () {
        var rates = {}; Array.prototype.forEach.call(rows.querySelectorAll('input[data-c]'), function (i) { rates[i.dataset.c] = i.value; });
        save.disabled = true; m.textContent = 'Saving…';
        post({ do: 'tax-save', rates: rates }).then(function (r) { save.disabled = false; m.textContent = r.error || 'Saved. Checkout now adds sales tax for ' + (Object.keys(r.rates).join(', ') || 'no states') + '.'; if (!r.error) sm.textContent = '🧾 Sales tax (' + (Object.keys(r.rates).join(', ') || 'none') + ')'; });
      });
    })();
    // Vouches: every seller's answer to "Who can vouch for you?", newest first.
    (function () {
      var vs = r.sellers.slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      var vb = el('details', null, 'card'); vb.style.gap = '10px'; box.appendChild(vb);
      var sum = el('summary'); sum.style.cssText = 'cursor:pointer;font-weight:800;font-size:17px'; sum.textContent = '🤝 Vouches (' + vs.filter(function (s) { return s.vouch; }).length + ')'; vb.appendChild(sum);
      var wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:12px'; vb.appendChild(wrap);
      wrap.appendChild(el('div', 'Who each seller said can vouch for them, asked when they opened their shop. Shops opened before this question have no answer.', 'small dim'));
      if (!vs.length) wrap.appendChild(el('div', 'No sellers yet.', 'small dim'));
      vs.forEach(function (s) {
        var c = el('div'); c.style.cssText = 'display:flex;flex-direction:column;gap:4px;border:1px solid #2E4A3B;border-radius:10px;padding:10px 12px';
        var hd = el('div'); hd.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between';
        hd.appendChild(el('b', s.name)); hd.appendChild(el('span', (s.status === 'approved' ? 'Open' : s.status === 'pending' ? 'Needs your OK' : 'Paused') + ' · joined ' + (s.at ? new Date(s.at).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '-'), 'small dim'));
        c.appendChild(hd); c.appendChild(el('span', s.email, 'small dim'));
        var a = el('div', s.vouch || 'No answer (opened before this question).'); a.style.cssText = 'white-space:pre-wrap;' + (s.vouch ? '' : 'opacity:.6;font-style:italic');
        c.appendChild(a);
        var j = el('button', 'Open their card ›', 'ghost'); j.type = 'button'; j.style.cssText = 'align-self:flex-start;padding:6px 10px;min-height:0;font-size:13px';
        j.addEventListener('click', function () { var t2 = box.querySelector('[data-seller="' + s.slug + '"]'); if (t2) { var hid = t2.closest('[hidden]'); if (hid) { var gb = Array.prototype.filter.call(box.querySelectorAll('button'), function (x) { return x.textContent === '▦ Gallery'; }); gb.forEach(function (x) { x.click(); }); } t2.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
        c.appendChild(j); wrap.appendChild(c);
      });
    })();
    // Needs to be paid: who you pay by hand now, and the card sales Stripe pays sellers by itself, with a rough date.
    (function () {
      var nb = el('details', null, 'card'); nb.id = 'payBox'; nb.style.gap = '10px'; box.appendChild(nb); if (box.classList.contains('focus-pay')) nb.open = true;
      var manual = r.sellers.filter(function (s) { return s.totals && s.totals.payNow > 0; }).sort(function (a, b) { return b.totals.payNow - a.totals.payNow; });
      var addBiz = function (t, n) { var d = new Date(t); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; } return d; };
      var auto = (r.sales || []).filter(function (x) { return x.paid && x.direct && Date.now() - x.at < 14 * 864e5; }).sort(function (a, b) { return b.at - a.at; });
      var total = manual.reduce(function (t, s) { return t + s.totals.payNow; }, 0);
      var sm = el('summary'); sm.style.cssText = 'cursor:pointer;font-weight:800;font-size:17px'; sm.textContent = '💸 Needs to be paid' + (manual.length ? ' · ' + manual.length + ' to pay by hand, ' + money(total) : ' · nothing to pay by hand'); nb.appendChild(sm);
      var wrap = el('div'); wrap.dataset.noview = '1'; wrap.className = 'pv-wrap pv-grid'; wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:12px'; nb.appendChild(wrap);
      // Its own Gallery / List switch (remembered), and a way back to the whole Sellers tab when opened on its own.
      var vt = el('div'); vt.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
      var vg = el('button', '▦ Gallery', 'ghost'), vl = el('button', '☰ List', 'ghost'); vg.type = vl.type = 'button';
      var setV = function (g) { wrap.classList.toggle('pv-grid', g); vg.setAttribute('aria-pressed', g ? 'true' : 'false'); vl.setAttribute('aria-pressed', g ? 'false' : 'true'); try { localStorage.setItem('pvView', g ? 'g' : 'l'); } catch (e) {} };
      vg.addEventListener('click', function () { setV(true); }); vl.addEventListener('click', function () { setV(false); });
      var all = el('button', '‹ Show the whole Sellers tab', 'ghost'); all.type = 'button'; all.className = 'ghost pv-all'; all.addEventListener('click', function () { box.classList.remove('focus-pay'); });
      vt.appendChild(vg); vt.appendChild(vl); vt.appendChild(all); wrap.appendChild(vt);
      var pv0 = 'g'; try { pv0 = localStorage.getItem('pvView') || 'g'; } catch (e) {} setV(pv0 === 'g');
      var mList = el('div', null, 'pv-list'), aList = el('div', null, 'pv-list');
      wrap.appendChild(el('b', 'You pay these by hand'));
      if (!manual.length) wrap.appendChild(el('div', 'Nobody is waiting on a payout from you.', 'small dim'));
      manual.forEach(function (s) {
        var c = el('div', null, 'pv-card');
        var hd = el('div', null, 'pv-hd'); var nm = el('div'); nm.appendChild(el('b', s.name));
        if (s.based === 'intl') nm.appendChild(el('span', '🌎 ' + (s.country || 'Outside US'), 'pv-pill'));
        hd.appendChild(nm); hd.appendChild(el('div', money(s.totals.payNow), 'pv-amt')); c.appendChild(hd);
        // Why this amount: payouts already sent are matched to the oldest orders first. Orders fully covered show as paid
        // (folded away); only what is still owed is listed, less shipping held for orders not shipped yet.
        (function () {
          var rows = (r.sales || []).filter(function (x) { return x.seller === s.slug && x.paid && !x.direct && !x.directPay; }).sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
          var outs = (s.payouts || []).filter(function (p) { return p.kind !== 'fee'; }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
          var credit = outs.reduce(function (t, p) { return t + (p.cents || 0); }, 0), paidRows = [], openRows = [];
          rows.forEach(function (x) { var due = (x.net || 0) - (x.labelEarn || 0), use = Math.min(credit, Math.max(0, due)); credit -= use; var left = due - use; if (left <= 0) paidRows.push(x); else openRows.push({ x: x, left: left, part: use }); });
          var dt = function (t) { return t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; };
          var dd = el('div', null, 'pv-why');
          var hd2 = el('div', 'Why ' + money(s.totals.payNow) + ' · ' + openRows.length + ' unpaid order' + (openRows.length === 1 ? '' : 's') + (paidRows.length ? ' · ' + paidRows.length + ' already paid' : '')); hd2.style.cssText = 'font-weight:700;font-size:14px;color:#C9A45C;padding:2px 0 4px'; dd.appendChild(hd2);
          var line = function (box, left, sub, amt, neg, cls) { var d = el('div', null, 'pv-ln' + (cls ? ' ' + cls : '')); var l = el('div'); l.appendChild(el('div', left)); if (sub) l.appendChild(el('div', sub, 'small dim')); d.appendChild(l); var a = el('b', amt == null ? '' : (neg ? '− ' : '') + money(Math.abs(amt))); if (neg) a.style.color = '#E8A87C'; d.appendChild(a); box.appendChild(d); };
          openRows.slice().reverse().forEach(function (o) { var x = o.x, shipC = Math.max(0, (x.gross || 0) - (x.items || 0));
            line(dd, 'Order ' + x.n + ' · ' + x.product + (x.q > 1 ? ' x ' + x.q : ''), dt(x.at) + ' · buyer paid ' + money(x.gross) + (x.pay ? ' by ' + x.pay : '') + (shipC ? ' (incl. ' + money(shipC) + ' shipping)' : '') + ' − your ' + money(x.fee) + ' fee' + (x.labelEarn ? ' − ' + money(x.labelEarn) + ' label' : '') + (o.part ? ' − ' + money(o.part) + ' you already sent' : '') + (x.tracking || x.shippedAt ? ' · shipped' : ' · not shipped yet'), o.left); });
          if (s.totals.shipHeld) line(dd, 'Shipping held until it ships', 'it pays for the label; added once the order ships', s.totals.shipHeld, true);
          var tot = el('div', null, 'pv-ln pv-tot'); tot.appendChild(el('b', 'You owe them now')); tot.appendChild(el('b', money(s.totals.payNow))); dd.appendChild(tot);
          if (paidRows.length || outs.length) {
            var pd = el('details', null, 'pv-paid'); pd.appendChild(el('summary', '✓ Already paid · ' + paidRows.length + ' order' + (paidRows.length === 1 ? '' : 's') + ' · ' + outs.length + ' payment' + (outs.length === 1 ? '' : 's') + ' sent'));
            paidRows.slice().reverse().forEach(function (x) { line(pd, '✓ Order ' + x.n + ' · ' + x.product + (x.q > 1 ? ' x ' + x.q : ''), dt(x.at) + ' · paid in full', (x.net || 0) - (x.labelEarn || 0), false, 'pv-done-ln'); });
            outs.forEach(function (p) { line(pd, p.kind === 'deduct' ? 'Charge taken' : 'Payment you sent', dt(p.at) + (p.how ? ' · ' + p.how : '') + (p.note ? ' · ' + p.note : ''), p.cents, true); });
            dd.appendChild(pd);
          }
          c.appendChild(dd);
        })();
        // Every way they can be paid: their payout choice first, then the handles they gave for direct pay.
        var amt0 = (s.totals.payNow / 100).toFixed(2), ways = [], seen = {}, dp = s.directPay || {};
        var NAMES = { zelle: 'Zelle', venmo: 'Venmo', cashapp: 'Cash App', paypal: 'PayPal', crypto: 'Crypto', bank: 'Bank', wire: 'Wire' };
        var linkFor = function (k, v) { var h = String(v).trim().replace(/^[@$]/, ''); if (k === 'paypal') return /@.+\./.test(v) ? 'https://www.paypal.com/myaccount/transfer/homepage/pay' : 'https://paypal.me/' + encodeURIComponent(h) + '/' + amt0; if (k === 'venmo') return 'https://venmo.com/u/' + encodeURIComponent(h); if (k === 'cashapp') return 'https://cash.app/$' + encodeURIComponent(h) + '/' + amt0; return ''; };
        var short = function (w) { return w.length > 16 ? w.slice(0, 6) + '…' + w.slice(-5) : w; };
        var isBank = s.payHow === 'bank' || s.payHow === 'wire';
        if (s.payTo) { var k0 = s.payHow || ''; var cw = s.cryptoPay && s.cryptoPay.wallet; ways.push({ k: k0, name: NAMES[k0] || k0 || 'Payout', show: isBank ? s.payTo.replace(/^SWIFT wire to /, '') : cw ? short(cw) + ' · ' + s.payTo.split(' to ')[0] : s.payTo, link: linkFor(k0, s.payTo), copy: isBank ? '' : (cw || s.payTo), pref: true, bank: isBank }); seen[k0 + String(s.payTo).toLowerCase()] = 1; }
        ['paypal', 'zelle', 'venmo', 'cashapp', 'crypto'].forEach(function (k) { var v = String(dp[k] || '').trim(); if (v && !seen[k + v.toLowerCase()]) ways.push({ k: k, name: NAMES[k], show: k === 'crypto' ? short(v) + ' · USDC (Ethereum/Base)' : v, link: linkFor(k, v), copy: v }); });
        var wl = el('div', null, 'pv-ways'); c.appendChild(wl);
        if (!ways.length) wl.appendChild(el('div', '⚠️ No payout details yet. Ask them to add them in Seller Hub.', 'small'));
        ways.forEach(function (w) {
          var row = el('div', null, 'pv-way'); var lb = el('div', null, 'pv-lab'); lb.appendChild(el('b', w.name)); if (w.pref) lb.appendChild(el('span', '★ Preferred', 'pv-pref')); row.appendChild(lb);
          row.appendChild(el('div', w.show, 'pv-val'));
          var act = el('div', null, 'pv-act');
          if (w.copy) { var cp = el('button', 'Copy', 'ghost'); cp.type = 'button'; cp.addEventListener('click', function () { try { navigator.clipboard.writeText(w.copy); cp.textContent = '✓'; setTimeout(function () { cp.textContent = 'Copy'; }, 1500); } catch (e) {} }); act.appendChild(cp); }
          if (w.link) { var op = el('a', 'Open ↗'); op.href = w.link; op.target = '_blank'; op.rel = 'noopener'; act.appendChild(op); }
          if (w.bank) { var sb = el('button', 'Show details', 'ghost'); sb.type = 'button'; var bd = el('div', '', 'pv-bank'); bd.hidden = true;
            sb.addEventListener('click', function () { if (!bd.hidden) { bd.hidden = true; sb.textContent = 'Show details'; return; } sb.disabled = true; post({ do: 'bank', slug: s.slug }).then(function (x) { sb.disabled = false; bd.textContent = ''; if (x.error || !x.bank) { bd.textContent = x.error || 'No bank details.'; } else { var k = x.bank; [['Name', k.holder], ['Bank', k.bank], ['Routing', k.routing], ['Account', k.account || k.iban], ['Type', k.type], ['SWIFT', k.swift], ['Country', k.country], ['Address', k.address]].forEach(function (f) { if (!f[1]) return; var r2 = el('div'); r2.appendChild(el('span', f[0], 'dim')); r2.appendChild(el('b', String(f[1]))); var c2 = el('button', 'Copy', 'ghost'); c2.type = 'button'; c2.addEventListener('click', function () { try { navigator.clipboard.writeText(String(f[1])); c2.textContent = '✓'; setTimeout(function () { c2.textContent = 'Copy'; }, 1500); } catch (e) {} }); r2.appendChild(c2); bd.appendChild(r2); }); } bd.hidden = false; sb.textContent = 'Hide'; }); });
            act.appendChild(sb); row.appendChild(act); wl.appendChild(row); wl.appendChild(bd); return; }
          row.appendChild(act); wl.appendChild(row);
        });
        // Mark as paid right here: amount and how, one tap.
        var mk = el('div', null, 'pv-mark');
        var mw = el('label', null, 'pv-money'); mw.appendChild(el('span', '$')); var ma = el('input'); ma.type = 'number'; ma.step = '0.01'; ma.min = '0.01'; ma.value = amt0; ma.inputMode = 'decimal'; mw.appendChild(ma);
        var mh = el('select'); (ways.map(function (w) { return w.name; }).concat(['Other'])).forEach(function (n) { var o = el('option', n); o.value = n; mh.appendChild(o); });
        var go = el('button', '✓ Mark as paid', 'solid'); go.type = 'button'; var gm = el('div', '', 'small'); gm.style.flexBasis = '100%';
        go.addEventListener('click', function () { if (!confirm('Record ' + money(Math.round(Number(ma.value) * 100)) + ' sent to ' + s.name + ' by ' + mh.value + '? They get an email.')) return; go.disabled = true; post({ do: 'payout', slug: s.slug, amount: ma.value, how: mh.value, note: '' }).then(function (x) { if (x.error) { go.disabled = false; gm.textContent = x.error; return; } go.textContent = '✓ Recorded'; gm.textContent = 'Saved. ' + s.name + ' got an email. Updating…'; c.classList.add('pv-done'); setTimeout(load, 900); }); });
        mk.appendChild(mw); mk.appendChild(mh); mk.appendChild(go); mk.appendChild(gm); c.appendChild(mk);
        // Sellers with Stripe payouts on: one tap sends it from your Stripe balance to theirs.
        if (s.stripe && s.stripeOn) {
          var sp = el('button', '⚡ Pay ' + money(s.totals.payNow) + ' through Stripe', 'solid'); sp.type = 'button'; sp.style.cssText = 'padding:6px 12px;min-height:0'; var spm = el('div', '', 'small'); spm.style.flexBasis = '100%'; var armed = false;
          sp.addEventListener('click', function () {
            if (!armed) { armed = true; sp.textContent = 'Tap again to send ' + money(s.totals.payNow) + ' now'; setTimeout(function () { if (armed) { armed = false; sp.textContent = '⚡ Pay ' + money(s.totals.payNow) + ' through Stripe'; } }, 6000); return; }
            armed = false; sp.disabled = true; spm.textContent = 'Sending through Stripe…';
            post({ do: 'stripe-transfer', slug: s.slug }).then(function (x) {
              if (x.error) { sp.disabled = false; sp.textContent = '⚡ Pay ' + money(s.totals.payNow) + ' through Stripe'; spm.textContent = x.error; return; }
              sp.textContent = '✓ Sent ' + money(x.payout.cents); spm.textContent = 'Sent to their Stripe and recorded as a payout. Stripe pays their bank on their schedule. ' + s.name + ' got an email.';
            });
          });
          c.appendChild(sp); c.appendChild(spm);
        }
        mList.appendChild(c);
      });
      wrap.appendChild(mList);
      var autoD = el('details'); var autoS = el('summary', 'Stripe pays these automatically (' + auto.length + ') · nothing for you to do'); autoS.style.cssText = 'cursor:pointer;font-weight:700'; autoD.appendChild(autoS); wrap.appendChild(autoD); var wrap0 = wrap; wrap = autoD;
      if (!auto.length) wrap.appendChild(el('div', 'No card sales in the last 2 weeks went straight to a seller\u2019s Stripe.', 'small dim'));
      auto.forEach(function (x) {
        var sn = (r.sellers.filter(function (s) { return s.slug === x.seller; })[0] || {}).name || x.seller, when = addBiz(x.at, 2), past = when.getTime() < Date.now();
        var c = el('div'); c.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;border:1px solid #2E4A3B;border-radius:10px;padding:10px 12px;font-size:14px';
        c.appendChild(el('span', sn + ' · order ' + x.n + ' · ' + x.product + ' · ' + money(x.net)));
        c.appendChild(el('span', (past ? 'Sent by Stripe around ' : 'Stripe sends it around ') + when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), 'small dim'));
        aList.appendChild(c);
      });
      wrap.appendChild(aList);
      if (auto.length) wrap.appendChild(el('div', 'Dates are rough: Stripe usually pays 2 business days after a sale (daily payouts). A brand-new Stripe account, or a seller on weekly payouts, can take up to about 7 days.', 'small dim'));
    })();
    // Sellers owe you: fees on sales the buyer paid straight to the seller (their Zelle, Venmo, Cash App or crypto).
    (function () {
      var owe = r.sellers.filter(function (s) { return s.totals && s.totals.feeOwed > 0; }).sort(function (a, b) { return b.totals.feeOwed - a.totals.feeOwed; });
      var sb = el('details', null, 'card'); sb.id = 'feeBox'; sb.style.gap = '10px'; if (owe.length) sb.style.borderColor = '#E5484D'; box.appendChild(sb);
      var sm = el('summary'); sm.style.cssText = 'cursor:pointer;font-weight:800;font-size:17px'; sm.textContent = '🧾 Sellers owe you' + (owe.length ? ' · ' + owe.length + ' seller' + (owe.length > 1 ? 's' : '') + ', ' + money(owe.reduce(function (t, s) { return t + s.totals.feeOwed; }, 0)) : ' · nothing due'); sb.appendChild(sm);
      var wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:12px'; sb.appendChild(wrap);
      wrap.appendChild(el('div', 'Buyers paid these sellers directly, so the seller owes you your ' + r.fee + '% fee. Crypto fee payments mark themselves paid; press Seller paid when one comes in by Zelle or another way.', 'small dim'));
      if (!owe.length) wrap.appendChild(el('div', 'No seller owes you fees right now.', 'small'));
      // Everyone else: no balance (paid up, or no sales paid to them directly).
      var clear = r.sellers.filter(function (s) { return !(s.totals && s.totals.feeOwed > 0); });
      if (clear.length) { var cd = el('details'); var cs = el('summary', 'No balance: ' + clear.length + ' seller' + (clear.length > 1 ? 's' : ''), 'small'); cs.style.cssText = 'cursor:pointer;font-weight:700'; cd.appendChild(cs);
        clear.forEach(function (s) { var t2 = s.totals || {}; cd.appendChild(el('div', s.name + ' · $0 owed' + (t2.feePaid ? ' · paid you ' + money(t2.feePaid) + ' so far' : '') + (t2.feeDue ? '' : ' · no direct sales yet'), 'small dim')); });
        wrap.appendChild(cd); }
      owe.forEach(function (s) {
        var c = el('div'); c.style.cssText = 'display:flex;flex-direction:column;gap:6px;border:1px solid #2E4A3B;border-radius:10px;padding:10px 12px';
        var hd = el('div'); hd.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px'; hd.appendChild(el('b', s.name + ' · ' + s.email)); hd.appendChild(el('b', 'Owes you ' + money(s.totals.feeOwed))); c.appendChild(hd);
        (r.sales || []).filter(function (x) { return x.seller === s.slug && x.paid && x.directPay; }).forEach(function (x) { c.appendChild(el('div', 'Order ' + x.n + ' · ' + x.product + ' · ' + new Date(x.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · buyer paid the seller ' + money(x.gross) + ' by ' + (x.pay || '?') + ' · your fee ' + money(x.fee), 'small')); });
        if (s.totals.feePaid) c.appendChild(el('div', 'Already paid you: ' + money(s.totals.feePaid), 'small dim'));
        var row = el('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
        var amt = el('input'); amt.type = 'number'; amt.step = '0.01'; amt.min = '0.01'; amt.value = (s.totals.feeOwed / 100).toFixed(2); amt.style.width = '110px';
        var how = el('select'); how.className = 'jf-sel'; ['Zelle', 'Venmo', 'Cash App', 'Crypto', 'Other'].forEach(function (h) { var o = el('option', h); o.value = h; how.appendChild(o); });
        var go = el('button', 'Seller paid', 'solid'); go.type = 'button'; go.style.cssText = 'padding:6px 12px;min-height:0'; var gm = el('span', '', 'small');
        go.addEventListener('click', function () { go.disabled = true; post({ do: 'fee-paid', slug: s.slug, amount: amt.value, how: how.value }).then(function (x) { go.disabled = false; gm.textContent = x.error || '✓ Recorded. Refresh to update.'; }); });
        row.appendChild(amt); row.appendChild(how); row.appendChild(go); row.appendChild(gm); c.appendChild(row); wrap.appendChild(c);
      });
    })();
    // What you owe, seller by seller: every sale that paid you (not their Stripe), minus labels, charges and payouts.
    var oweBox = el('section', null, 'card'); oweBox.hidden = true; oweBox.style.gap = '14px'; box.appendChild(oweBox);
    (function () {
      oweBox.appendChild(el('h2', 'What you owe sellers'));
      oweBox.appendChild(el('div', 'These sales were paid to you (Zelle, Venmo, Cash App, cash, crypto, or a card sale before the seller set up Stripe payouts). You keep your ' + r.fee + '% and send the seller the rest. Card sales paid straight to a seller\u2019s Stripe are not listed: Stripe already paid them.', 'small dim'));
      var due = r.sellers.filter(function (s) { return s.totals && s.totals.owed !== 0; }).sort(function (a, b) { return b.totals.payNow - a.totals.payNow; });
      if (!due.length) { oweBox.appendChild(el('div', 'You are all square with every seller.', 'small')); return; }
      due.forEach(function (s) {
        var st = s.totals, w = el('div'); w.style.cssText = 'display:flex;flex-direction:column;gap:8px;border:1px solid #2E4A3B;border-radius:10px;padding:12px';
        var hd = el('div'); hd.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:baseline';
        hd.appendChild(el('b', s.name)); hd.appendChild(el('b', st.payNow < 0 ? 'They owe you ' + money(-st.payNow) : 'Ready to pay now ' + money(st.payNow)));
        w.appendChild(hd);
        if (st.shipHeld) w.appendChild(el('div', '+ ' + money(st.shipHeld) + ' shipping held until it ships. It pays for the label; if they ship their own way, it goes to them once tracking is added.', 'small dim'));
        w.appendChild(el('div', 'Send to: ' + (s.payTo ? (s.payHow === 'bank' || s.payHow === 'wire' ? 'bank account (Show bank details on their card below)' : (s.payHow || '') + ' ' + s.payTo) : 'no payout details yet. Ask them to add them in Seller Hub.') + ' · ' + s.email, 'small'));
        var rows = (r.sales || []).filter(function (x) { return x.seller === s.slug && x.paid && !x.direct && !x.directPay; });
        var tb = el('div'); tb.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:14px';
        var line = function (a, b, dim) { var l = el('div'); l.style.cssText = 'display:flex;justify-content:space-between;gap:10px' + (dim ? ';opacity:.75' : ''); l.appendChild(el('span', a)); l.appendChild(el('span', b)); tb.appendChild(l); };
        rows.forEach(function (x) {
          var sh = Math.max(0, x.gross - (x.items || 0)), shipped = !!(x.tracking || x.shippedAt);
          line('Order ' + x.n + ' · ' + x.product + (x.q > 1 ? ' ×' + x.q : '') + ' · ' + new Date(x.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · paid by ' + (x.pay || '?') + ' · piece ' + money(x.items || 0) + ' − your fee ' + money(x.fee), '+' + money((x.items || 0) - x.fee));
          if (sh) line('   Shipping the buyer paid on ' + x.n + (shipped ? ' (shipped)' : ' (held until it ships)'), shipped ? '+' + money(sh) : money(sh) + ' held', !shipped);
        });
        if (st.labels) line('Shipping labels taken from their earnings', '−' + money(st.labels), true);
        (s.payouts || []).forEach(function (p) { line((p.kind === 'deduct' ? 'Charge taken: ' : 'You sent them: ') + [p.how, p.note].filter(Boolean).join(' · ') + ' · ' + new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), '−' + money(p.cents), true); });
        w.appendChild(tb);
        var go = el('button', st.payNow > 0 ? 'Record a payout to ' + s.name + ' ›' : 'Open their card ›', 'ghost'); go.type = 'button'; go.style.alignSelf = 'flex-start';
        go.addEventListener('click', function () { var t2 = box.querySelector('[data-seller="' + s.slug + '"]'); if (t2) { var hid = t2.closest('[hidden]'); if (hid) { var gb = Array.prototype.filter.call(box.querySelectorAll('button'), function (x) { return x.textContent === '▦ Gallery'; })[0]; if (gb) gb.click(); else hid.hidden = false; } t2.scrollIntoView({ behavior: 'smooth', block: 'start' }); var f2 = t2.querySelector('form input'); if (f2) setTimeout(function () { f2.focus(); }, 500); } });
        w.appendChild(go); oweBox.appendChild(w);
      });
    })();
    // The community vote: which VeeFriends series the giveaway wallet buys (see api/_giveaway.js).
    var gv = el('section', null, 'card'); gv.style.gap = '10px'; box.appendChild(gv);
    fetch('/api/market?do=giveaway', { cache: 'no-store' }).then(function (x) { return x.json(); }).then(function (g) {
      gv.appendChild(el('b', 'Giveaway vote, round ' + g.round + (g.open ? ' (open)' : ' (closed)')));
      gv.appendChild(el('div', g.choices.concat(g.other ? [g.other] : []).map(function (c) { return c + ': ' + (g.tally[c] || 0) + ' votes from ' + (g.people[c] || 0) + ' people'; }).join(' · ') + ' · wallet ' + money(g.wallet), 'small'));
      if (g.ideas && g.ideas.length) gv.appendChild(el('div', 'Typed-in ideas: ' + g.ideas.map(function (x) { return x.text + ' (' + x.votes + ')'; }).join(' · '), 'small'));
      gv.appendChild(el('div', 'Everyone with an account gets 1 vote; people with ' + g.doubleAfter + ' or more completed sales as a buyer or seller get 2 (VOTE_DOUBLE_AFTER changes this). The public page is /giveaway.html.', 'small dim'));
      var row = el('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      [[g.open ? 'Close voting' : 'Reopen voting', g.open ? 'close' : 'open'], ['Start a new round', 'new']].forEach(function (x) {
        var bt = el('button', x[0], 'ghost'); bt.type = 'button';
        bt.addEventListener('click', function () { if (x[1] === 'new' && !confirm('Start a new vote? The current results stay saved, and everyone votes again.')) return; bt.disabled = true; post({ do: 'giveaway-round', action: x[1] }).then(function (r) { if (r.error) alert(r.error); load(); }); });
        row.appendChild(bt);
      });
      gv.appendChild(row);
    }).catch(function () { gv.textContent = 'The giveaway vote did not load.'; });
    box.appendChild(el('div', 'Buyers pay JarFriends for seller pieces like any other order. You keep ' + r.fee + '% of the listing price only: never of shipping or sales tax. Card sales of sellers with Stripe payouts on go straight to them (your cut arrives in your Stripe automatically); for everything else you owe the seller the rest. Sellers ship their own orders and add tracking in their portal, so do not buy a label for a seller order from the Orders tab. The fee rate is set by PLATFORM_FEE_PERCENT in the site settings.', 'small dim'));
    if (!r.sellers.length) { box.appendChild(el('div', 'No sellers yet. Send people to /seller.html to open a shop. Sellers listed in SEED_SELLERS open by themselves the first time the site is visited.', 'card small')); return; }
    // One card per seller; the cards are shown in groups below.
    var cardOf = function (s, into) {
      var c = el('section', null, 'card'); c.style.gap = '10px'; c.setAttribute('data-seller', s.slug);
      var top = el('div'); top.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center';
      var nm = el('div'); nm.appendChild(el('b', s.name + '  ')); nm.appendChild(el('span', s.status === 'approved' ? 'OPEN' : s.status === 'pending' ? 'NEEDS YOUR OK' : 'PAUSED', 'sx-b ' + (s.status === 'approved' ? 'ok' : s.status === 'pending' ? 'wait' : 'off')));
      top.appendChild(nm);
      var acts = el('div'); acts.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      var mk = function (label, status) { var b = el('button', label, 'ghost'); b.type = 'button'; b.addEventListener('click', function () { b.disabled = true; post({ do: 'status', slug: s.slug, status: status }).then(function (x) { if (x.error) alert(x.error); load(); }); }); acts.appendChild(b); };
      if (s.status !== 'approved') mk(s.status === 'pending' ? 'Approve' : 'Re-open', 'approved');
      // Pause: write why (emailed to them and shown in their Seller Hub), then pause.
      if (s.status !== 'paused') {
        var pb = el('button', 'Pause…', 'ghost'); pb.type = 'button'; acts.appendChild(pb);
        var pf = el('div'); pf.hidden = true; pf.style.cssText = 'flex-basis:100%;display:flex;flex-direction:column;gap:8px;border:1px solid #E8A87C;border-radius:10px;padding:10px 12px';
        pf.appendChild(el('b', 'Why are you pausing ' + s.name + '? They get this by email and see it in their Seller Hub.'));
        var why = el('textarea'); why.rows = 3; why.maxLength = 800; why.placeholder = 'For example: Please add a photo of each piece and your ship-from address, then reply and we will re-open your shop.'; pf.appendChild(why);
        var pr = el('div'); pr.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
        var go2 = el('button', 'Pause and send', 'solid'); go2.type = 'button'; var cx = el('button', 'Cancel', 'ghost'); cx.type = 'button'; pr.appendChild(go2); pr.appendChild(cx); pf.appendChild(pr);
        pb.addEventListener('click', function () { pf.hidden = !pf.hidden; if (!pf.hidden) why.focus(); });
        cx.addEventListener('click', function () { pf.hidden = true; });
        go2.addEventListener('click', function () { go2.disabled = true; post({ do: 'status', slug: s.slug, status: 'paused', reason: why.value.trim() }).then(function (x) { if (x.error) { go2.disabled = false; alert(x.error); return; } load(); }); });
        acts.appendChild(pf);
      }
      if (s.status === 'paused' && s.pauseReason) acts.appendChild(el('div', 'Paused: ' + s.pauseReason, 'small dim'));
      var shop = el('a', 'Shop page'); shop.href = '/shop.html?s=' + encodeURIComponent(s.slug); shop.target = '_blank'; shop.style.alignSelf = 'center'; acts.appendChild(shop);
      var portal = el('a', 'Open their portal'); portal.href = '/seller.html?as=' + encodeURIComponent(s.slug); portal.target = '_blank'; portal.style.alignSelf = 'center'; acts.appendChild(portal);
      top.appendChild(acts);
      c.appendChild(top);
      c.appendChild(el('div', s.stripeOn ? 'Card sales: paid automatically to their Stripe' : s.stripe ? 'Card sales: Stripe payout setup not finished, so card money comes to you' : 'Card sales: no Stripe payouts yet, so card money comes to you', 'sx-b ' + (s.stripeOn ? 'ok' : 'wait')));
      // Their eBay user name: confirm it is really theirs before they can bring all their eBay listings over.
      if (s.ebayUser) {
        var er = el('div'); er.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
        er.appendChild(el('span', 'eBay: ' + s.ebayUser + (s.ebayOk ? ' · confirmed' : ' · not confirmed yet'), 'small'));
        var eo = el('a', 'See their eBay store'); eo.href = 'https://www.ebay.com/usr/' + encodeURIComponent(s.ebayUser); eo.target = '_blank'; eo.rel = 'noopener'; eo.className = 'small'; er.appendChild(eo);
        var ec = el('button', s.ebayOk ? 'Un-confirm' : 'Confirm it is theirs', 'ghost'); ec.type = 'button';
        ec.addEventListener('click', function () { ec.disabled = true; post({ do: 'ebay-ok', slug: s.slug, on: !s.ebayOk }).then(function (x) { if (x.error) alert(x.error); load(); }); });
        er.appendChild(ec); c.appendChild(er);
      }
      // Their bank account (kept encrypted): shown only when asked, to send a payout by hand.
      if (s.bankHint) {
        var bkr = el('div'); bkr.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
        var bkb = el('button', 'Show bank details', 'ghost'); bkb.type = 'button'; var bko = el('span', '', 'small');
        bkb.addEventListener('click', function () { bkb.disabled = true; post({ do: 'bank', slug: s.slug }).then(function (x) { bkb.disabled = false; if (x.error) { bko.textContent = x.error; return; } var k = x.bank; bko.textContent = k.region === 'intl' ? 'INTERNATIONAL WIRE · ' + k.holder + ' · ' + k.bank + ' (' + k.country + ') · SWIFT ' + k.swift + ' · ' + (k.iban ? 'IBAN ' + k.iban : 'account ' + k.account) + ' · holder address: ' + k.address : k.holder + ' · ' + k.type + ' · routing ' + k.routing + ' · account ' + k.account; bkb.remove(); }); });
        bkr.appendChild(bkb); bkr.appendChild(bko); c.appendChild(bkr);
      }
      c.appendChild(el('div', '🤝 Vouch: ' + (s.vouch || 'no answer (opened before this question)'), 'small'));
      c.appendChild(el('div', s.email + (s.based === 'intl' ? ' · based outside the US' + (s.country ? ' (' + s.country + ')' : '') : '') + ' · paid by ' + (s.payHow === 'bank' || s.payHow === 'wire' ? s.payTo : s.payTo ? (s.payHow || '') + ': ' + s.payTo : 'no payout details yet') + ' · ' + s.listings + ' listings · joined ' + new Date(s.at).toLocaleDateString('en-US', { dateStyle: 'medium' }), 'small dim'));
      if (s.about) c.appendChild(el('div', s.about, 'small'));
      // Rating and the verified checkmark, with a way to set it by hand.
      var vs = s.stats || {};
      var vl = el('div'); vl.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center';
      vl.appendChild(el('span', (vs.reviews ? '★ ' + vs.rating.toFixed(1) + ' (' + vs.reviews + ' reviews)' : 'No reviews') + ' · ' + (vs.completed || 0) + ' completed · ' + (vs.issues || 0) + ' issues · ' + (vs.verified ? '✓ VERIFIED' : 'not verified'), 'small'));
      var vsel = el('select'); vsel.style.cssText = 'font-family:inherit;font-size:14px;height:36px;padding:0 8px;background:#0B1A13;border:1px solid #4E7A63;color:#F7F2E6;border-radius:2px';
      [['', 'Checkmark: automatic (' + (vs.need || 10) + ' clean sales)'], ['on', 'Checkmark: always on'], ['off', 'Checkmark: off']].forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; vsel.appendChild(op); });
      vsel.value = vs.override || ''; vsel.setAttribute('aria-label', 'Verified checkmark for ' + s.name);
      vsel.addEventListener('change', function () { post({ do: 'verify', slug: s.slug, mode: vsel.value }).then(function (x) { if (x.error) alert(x.error); load(); }); });
      vl.appendChild(vsel);
      c.appendChild(vl);
      if (s.reviewList && s.reviewList.length) {
        var det = el('details'), sum = el('summary', 'Reviews (' + s.reviewList.length + ')'); sum.style.cursor = 'pointer'; det.appendChild(sum);
        s.reviewList.forEach(function (r) {
          var rr = el('div'); rr.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;justify-content:space-between;padding:8px 0;border-top:1px solid #244536';
          rr.appendChild(el('span', '★'.repeat(r.stars) + ' ' + r.name + ' · ' + r.product + (r.text ? ': ' + r.text : ''), 'small'));
          var rm = el('button', 'Remove review', 'ghost'); rm.type = 'button';
          rm.addEventListener('click', function () { if (!confirm('Remove this review? Do this only for abuse or a review that is not about the order.')) return; post({ do: 'review-remove', slug: s.slug, n: r.n }).then(function () { load(); }); });
          rr.appendChild(rm); det.appendChild(rr);
        });
        c.appendChild(det);
      }
      var st = s.totals;
      c.appendChild(el('div', st.sales + ' paid sales · sold ' + money(st.gross) + ' · your fee ' + money(st.fee) + ' · their share ' + money(st.net) + ' · paid by Stripe ' + money(st.byStripe || 0) + ' · sent by you ' + money(st.paidOut) + ' · you owe ' + money(st.owed), 'small'));
      var f = el('form', null, 'sx-pay'); f.style.maxWidth = 'none';
      var amt = el('input'); amt.type = 'number'; amt.step = '0.01'; amt.min = '0.01'; amt.placeholder = 'Amount'; amt.value = st.payNow > 0 ? (st.payNow / 100).toFixed(2) : ''; amt.style.width = '120px';
      var how = el('input'); how.placeholder = 'How (e.g. Zelle)'; how.value = s.payHow || ''; how.style.width = '140px';
      var note = el('input'); note.placeholder = 'Note (optional)'; note.style.flex = '1 1 160px';
      var go = el('button', 'Record payout', 'ghost'); go.type = 'submit';
      f.appendChild(amt); f.appendChild(how); f.appendChild(note); f.appendChild(go);
      f.addEventListener('submit', function (ev) { ev.preventDefault(); if (!confirm('Record ' + money(Math.round(Number(amt.value) * 100)) + ' sent to ' + s.name + '? They get an email.')) return; go.disabled = true; post({ do: 'payout', slug: s.slug, amount: amt.value, how: how.value, note: note.value }).then(function (x) { if (x.error) { alert(x.error); go.disabled = false; return; } load(); }); });
      c.appendChild(f);
      // Charge the seller (a USPS charge after one of their labels, say): from money held for them first, then their card.
      var cf = el('form', null, 'sx-pay'); cf.style.maxWidth = 'none';
      var camt = el('input'); camt.type = 'number'; camt.step = '0.01'; camt.min = '0.01'; camt.placeholder = 'Amount'; camt.style.width = '120px'; camt.setAttribute('aria-label', 'Amount to charge ' + s.name);
      var cnote = el('input'); cnote.placeholder = 'What for (e.g. USPS postage adjustment, order W123)'; cnote.style.flex = '1 1 240px'; cnote.setAttribute('aria-label', 'Reason');
      var cgo = el('button', 'Charge seller', 'ghost'); cgo.type = 'submit';
      cf.appendChild(camt); cf.appendChild(cnote); cf.appendChild(cgo);
      cf.addEventListener('submit', function (ev) { ev.preventDefault(); if (!confirm('Charge ' + s.name + ' ' + money(Math.round(Number(camt.value) * 100)) + '? It comes out of money held for them first, then their card. They get an email.')) return; cgo.disabled = true; post({ do: 'charge', slug: s.slug, amount: camt.value, note: cnote.value }).then(function (x) { cgo.disabled = false; if (x.error) { alert(x.error); return; } load(); }); });
      c.appendChild(cf);
      into.appendChild(c);
    };
    // Groups: shops waiting for your OK, open shops, paused shops, then the people buying.
    var group = function (title, list, empty) {
      box.appendChild(el('div', title + ' (' + list.length + ')', 'mono gold'));
      if (!list.length) { box.appendChild(el('div', empty, 'small dim')); return; }
      list.sort(function (a, b) { return b.at - a.at; }).forEach(function (x) { cardOf(x, box); });
    };
    // Active sellers: a Gallery (each shop's full card) or a List (one row per shop with its numbers). The choice is remembered.
    var sellerGroup = function (title, act, empty, vkey) {
      var hd = el('div'); hd.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between';
      hd.appendChild(el('div', title + ' (' + act.length + ')', 'mono gold'));
      var sw2 = el('div'); sw2.style.cssText = 'display:inline-flex;border:1px solid #4E7A63;border-radius:999px;padding:3px;gap:3px';
      var bG = el('button', '▦ Gallery'), bL = el('button', '☰ List'); bG.type = bL.type = 'button';
      [bG, bL].forEach(function (x) { x.style.cssText = 'border:0;border-radius:999px;padding:7px 14px;min-height:0;font-weight:800;font-size:13px;cursor:pointer'; sw2.appendChild(x); });
      hd.appendChild(sw2); box.appendChild(hd);
      if (!act.length) { sw2.hidden = true; if (empty) box.appendChild(el('div', empty, 'small dim')); return; }
      var gal = el('div'); gal.style.cssText = 'display:flex;flex-direction:column;gap:14px'; gal.setAttribute('data-noview', '1'); box.appendChild(gal);
      act.slice().sort(function (a, b) { return b.at - a.at; }).forEach(function (x) { cardOf(x, gal); });
      var lstBox = el('div'); box.appendChild(lstBox);
      (function (box) {
    // Active sellers as a list, like the buyers: every open shop with its numbers. Click a shop to jump to its card.
    act = act.slice().sort(function (a, b) { return (b.totals ? b.totals.gross : 0) - (a.totals ? a.totals.gross : 0); });
    if (!act.length) box.appendChild(el('div', 'No open shops yet.', 'small dim'));
    else {
      var sw = el('div', null, 'scroll'), stb = el('table'), sh = el('tr'); stb.setAttribute('data-noview', '1');
      var heads = ['Shop', 'Email', 'Pieces', 'Paid sales', 'Sold', 'Your fee', 'You owe', 'Card payouts', 'Rating', 'Joined'];
      heads.forEach(function (h, i) { var th2 = el('th', h); if (i >= 2 && i <= 6) th2.className = 'num'; sh.appendChild(th2); });
      var sth = el('thead'); sth.appendChild(sh); stb.appendChild(sth); var sb = el('tbody');
      act.forEach(function (x) {
        var t2 = x.totals || {}, rt = x.stats && x.stats.rating ? x.stats.rating.toFixed(1) + '★ (' + (x.stats.reviews || 0) + ')' : '-';
        var tr = el('tr'); tr.style.cursor = 'pointer'; tr.title = 'Open ' + x.name + '\u2019s card';
        [x.name + (x.stats && x.stats.verified ? ' ✔' : ''), x.email, String(x.listings || 0), String(t2.sales || 0), money(t2.gross || 0), money(t2.fee || 0), money(Math.max(0, t2.payNow != null ? t2.payNow : (t2.owed || 0))), x.stripeOn ? 'Stripe on' : x.stripe ? 'Setup unfinished' : 'Not set up', rt, x.at ? new Date(x.at).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '-'].forEach(function (v, i) { var td = el('td', v); if (i >= 2 && i <= 6) td.className = 'num'; tr.appendChild(td); });
        tr.addEventListener('click', function () { var c2 = gal.querySelector('[data-seller="' + x.slug + '"]'); if (c2) { view('gallery'); c2.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
        sb.appendChild(tr);
      });
      stb.appendChild(sb); sw.appendChild(stb); box.appendChild(sw);
    }
      })(lstBox);
      var view = function (v) {
        try { localStorage.setItem('adminSellerView-' + vkey, v); } catch (e) {}
        gal.hidden = v !== 'gallery'; lstBox.hidden = v === 'gallery';
        bG.style.background = v === 'gallery' ? '#C9A45C' : 'transparent'; bG.style.color = v === 'gallery' ? '#0B1A13' : '#F7F2E6';
        bL.style.background = v !== 'gallery' ? '#C9A45C' : 'transparent'; bL.style.color = v !== 'gallery' ? '#0B1A13' : '#F7F2E6';
      };
      bG.addEventListener('click', function () { view('gallery'); }); bL.addEventListener('click', function () { view('list'); });
      var saved = 'gallery'; try { saved = localStorage.getItem('adminSellerView-' + vkey) || 'gallery'; } catch (e) {}
      view(saved);
    };
    sellerGroup('NEEDS YOUR APPROVAL', r.sellers.filter(function (x) { return x.status === 'pending'; }), 'Nobody is waiting. New shops show up here until you approve them.', 'pending');
    sellerGroup('ACTIVE SELLERS', r.sellers.filter(function (x) { return x.status === 'approved'; }), 'No open shops yet.', 'active');
    var paused = r.sellers.filter(function (x) { return x.status !== 'pending' && x.status !== 'approved'; });
    if (paused.length) sellerGroup('PAUSED SHOPS', paused, '', 'paused');
    // Active buyers: everyone with a paid order, with how many orders and how much they spent.
    var by = {};
    (r.sales || []).forEach(function (o) { if (!o.paid || !o.email) return; var k = String(o.email).toLowerCase(); var b2 = by[k] = by[k] || { email: k, name: o.buyer || '', n: 0, spent: 0, last: 0 }; b2.n++; b2.spent += o.gross || 0; if (o.at > b2.last) { b2.last = o.at; if (o.buyer) b2.name = o.buyer; } });
    var buyers = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.last - a.last; });
    box.appendChild(el('div', 'ACTIVE BUYERS (' + buyers.length + ')', 'mono gold'));
    if (!buyers.length) box.appendChild(el('div', 'No paid orders yet. People show up here once they buy something.', 'small dim'));
    else {
      var bw = el('div', null, 'scroll'), bt = el('table'), bh = el('tr');
      ['Buyer', 'Email', 'Orders', 'Spent', 'Last order'].forEach(function (h, i) { var th2 = el('th', h); if (i === 2 || i === 3) th2.className = 'num'; bh.appendChild(th2); });
      var bth = el('thead'); bth.appendChild(bh); bt.appendChild(bth); var bb = el('tbody');
      buyers.forEach(function (x) { var tr = el('tr'); [x.name || '-', x.email, String(x.n), money(x.spent), new Date(x.last).toLocaleDateString('en-US', { dateStyle: 'medium' })].forEach(function (v, i) { var td = el('td', v); if (i === 2 || i === 3) td.className = 'num'; tr.appendChild(td); }); bb.appendChild(tr); });
      bt.appendChild(bb); bw.appendChild(bt); box.appendChild(bw);
    }
    if (r.sales.length) {
      var w = el('div', null, 'scroll'), tb = el('table'), hr = el('tr');
      ['Placed', 'Order', 'Seller', 'Piece', 'Buyer', 'Sold for', 'Your fee', 'Seller gets', 'Status', 'Issue'].forEach(function (h, i) { var th = el('th', h); if (i >= 5 && i <= 7) th.className = 'num'; hr.appendChild(th); });
      var th = el('thead'); th.appendChild(hr); tb.appendChild(th); var bd = el('tbody');
      var names = {}; r.sellers.forEach(function (s) { names[s.slug] = s.name; });
      r.sales.forEach(function (o) {
        var tr = el('tr');
        [new Date(o.at).toLocaleDateString('en-US', { dateStyle: 'medium' }), o.n, names[o.seller] || o.seller, o.product + (o.q > 1 ? ' × ' + o.q : ''), o.buyer, money(o.gross), money(o.fee), money(o.net), (!o.paid ? 'Waiting for payment' : o.tracking ? 'Shipped ' + o.tracking : 'Paid, seller to ship') + (o.direct ? ' · paid to their Stripe' : '')].forEach(function (v, i) { var td = el('td', v); if (i >= 5 && i <= 7) td.className = 'num'; tr.appendChild(td); });
        // Flag a problem with this order (or clear it). Flagged orders count against the seller's checkmark.
        var tdI = el('td'), fb = el('button', o.issue ? 'Clear issue' : 'Flag issue', 'ghost'); fb.type = 'button'; fb.style.cssText = 'padding:6px 10px;min-height:0;font-size:13px';
        if (o.issue) { fb.title = o.issue.note || ''; tdI.appendChild(el('div', '⚠ ' + (o.issue.note || 'Flagged'), 'small')); }
        fb.addEventListener('click', function () {
          var note = '';
          if (!o.issue) { note = prompt('What went wrong with order ' + o.n + '? (Shown only to you.)', ''); if (note === null) return; }
          post({ do: 'issue', n: o.n, on: !o.issue, note: note }).then(function () { load(); });
        });
        tdI.appendChild(fb); tr.appendChild(tdI);
        bd.appendChild(tr);
      });
      tb.appendChild(bd); w.appendChild(tb);
      box.appendChild(el('h2', 'Seller sales')); box.appendChild(w);
    }
  }
})();
