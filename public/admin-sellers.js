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
  var box = el('div'); box.dataset.extraTab = 'sellers'; box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:18px';
  main.insertBefore(box, $('wOrders'));
  var css = el('style'); css.textContent = '.sx-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.sx-tile{background:#11261C;border:1px solid #244536;padding:14px 16px;display:flex;flex-direction:column;gap:4px}.sx-tile b{font-family:"IBM Plex Mono",monospace;font-size:22px;font-weight:500}.sx-tile.gold{border-color:#C9A45C}.sx-tile.gold b{color:#C9A45C}.sx-b{display:inline-block;font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.1em;padding:3px 8px;border:1px solid #4E7A63}.sx-b.ok{border-color:#8FD3AE;color:#8FD3AE}.sx-b.wait{border-color:#C9A45C;color:#C9A45C}.sx-b.off{border-color:#E86A6A;color:#E86A6A}.sx-pay{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-top:8px}.sx-pay input,.sx-pay select{min-height:40px;font-size:15px;padding:6px 10px;background:#0B1A13;border:1px solid #4E7A63;color:#F7F2E6;border-radius:2px;font-family:inherit}';
  document.head.appendChild(css);
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
    [['YOUR FEES EARNED (' + r.fee + '%)', money(t.fee), 'gold'], ['GIVEAWAY WALLET (' + (r.giveaway || 2) + '% OF SALES, FROM YOUR FEE)', money(t.wallet || 0), ''], ['YOU KEEP AFTER WALLET', money((t.fee || 0) - (t.wallet || 0)), 'gold'], ['SELLER SALES (PAID)', money(t.gross), ''], ['PAID TO SELLERS BY STRIPE', money(t.byStripe || 0), ''], ['SENT BY YOU', money(t.paidOut), ''], ['YOU STILL OWE SELLERS', money(t.owed), ''], ['SELLERS', String(r.sellers.length), '']].forEach(function (x) {
      var owe = x[0] === 'YOU STILL OWE SELLERS';
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
    // What you owe, seller by seller: every sale that paid you (not their Stripe), minus labels, charges and payouts.
    var oweBox = el('section', null, 'card'); oweBox.hidden = true; oweBox.style.gap = '14px'; box.appendChild(oweBox);
    (function () {
      oweBox.appendChild(el('h2', 'What you owe sellers'));
      oweBox.appendChild(el('div', 'These sales were paid to you (Zelle, Venmo, Cash App, cash, crypto, or a card sale before the seller set up Stripe payouts). You keep your ' + r.fee + '% and send the seller the rest. Card sales paid straight to a seller\u2019s Stripe are not listed: Stripe already paid them.', 'small dim'));
      var due = r.sellers.filter(function (s) { return s.totals && s.totals.owed !== 0; }).sort(function (a, b) { return b.totals.owed - a.totals.owed; });
      if (!due.length) { oweBox.appendChild(el('div', 'You are all square with every seller.', 'small')); return; }
      due.forEach(function (s) {
        var st = s.totals, w = el('div'); w.style.cssText = 'display:flex;flex-direction:column;gap:8px;border:1px solid #2E4A3B;border-radius:10px;padding:12px';
        var hd = el('div'); hd.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:baseline';
        hd.appendChild(el('b', s.name)); hd.appendChild(el('b', (st.owed < 0 ? 'They owe you ' : 'You owe ') + money(Math.abs(st.owed))));
        w.appendChild(hd);
        w.appendChild(el('div', 'Send to: ' + (s.payTo ? (s.payHow === 'bank' || s.payHow === 'wire' ? 'bank account (Show bank details on their card below)' : (s.payHow || '') + ' ' + s.payTo) : 'no payout details yet. Ask them to add them in Seller Hub.') + ' · ' + s.email, 'small'));
        var rows = (r.sales || []).filter(function (x) { return x.seller === s.slug && x.paid && !x.direct; });
        var tb = el('div'); tb.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:14px';
        var line = function (a, b, dim) { var l = el('div'); l.style.cssText = 'display:flex;justify-content:space-between;gap:10px' + (dim ? ';opacity:.75' : ''); l.appendChild(el('span', a)); l.appendChild(el('span', b)); tb.appendChild(l); };
        rows.forEach(function (x) { line('Order ' + x.n + ' · ' + x.product + (x.q > 1 ? ' ×' + x.q : '') + ' · ' + new Date(x.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · paid by ' + (x.pay || '?') + ' · sold ' + money(x.gross) + ' − your fee ' + money(x.fee), '+' + money(x.net)); });
        if (st.labels) line('Shipping labels taken from their earnings', '−' + money(st.labels), true);
        (s.payouts || []).forEach(function (p) { line((p.kind === 'deduct' ? 'Charge taken: ' : 'You sent them: ') + [p.how, p.note].filter(Boolean).join(' · ') + ' · ' + new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), '−' + money(p.cents), true); });
        w.appendChild(tb);
        var go = el('button', st.owed > 0 ? 'Record a payout to ' + s.name + ' ›' : 'Open their card ›', 'ghost'); go.type = 'button'; go.style.alignSelf = 'flex-start';
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
      if (s.status !== 'paused') mk('Pause', 'paused');
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
      var amt = el('input'); amt.type = 'number'; amt.step = '0.01'; amt.min = '0.01'; amt.placeholder = 'Amount'; amt.value = st.owed > 0 ? (st.owed / 100).toFixed(2) : ''; amt.style.width = '120px';
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
        [x.name + (x.stats && x.stats.verified ? ' ✔' : ''), x.email, String(x.listings || 0), String(t2.sales || 0), money(t2.gross || 0), money(t2.fee || 0), money(t2.owed || 0), x.stripeOn ? 'Stripe on' : x.stripe ? 'Setup unfinished' : 'Not set up', rt, x.at ? new Date(x.at).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '-'].forEach(function (v, i) { var td = el('td', v); if (i >= 2 && i <= 6) td.className = 'num'; tr.appendChild(td); });
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
