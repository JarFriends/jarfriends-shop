// The Jars tab of the back office: every customer's jars, with buttons to give or take one.
// A customer earns one jar per paid order on their own. Ten jars open a locked safe early for them.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var get = function (extra) { return fetch('/api/admin?k=' + encodeURIComponent(key()) + extra, { cache: 'no-store' }).then(function (r) { return r.json(); }); };
  var btn = el('button', 'Jars', 'ghost'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  tabs.insertBefore(btn, $('out'));
  var box = el('div'); box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:16px'; box.dataset.extraTab = '1';
  main.insertBefore(box, $('wOrders'));
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (b && b !== btn && b.id !== 'out') { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); } });

  function load() {
    box.textContent = 'Loading...';
    get('&jars=1').then(function (r) { if (r.error) { box.textContent = r.error; return; } burnCfg = r.burn || { open: false }; draw(r.jars || [], r.need || 10); }, function () { box.textContent = 'Could not load. Try again.'; });
  }
  function draw(rows, need) {
    box.textContent = '';
    box.appendChild(el('div', 'Every paid order earns the customer one jar automatically. ' + need + ' jars let them open one locked Deal of the day safe early (they still pay for the piece), and those ' + need + ' are then used up. Use the buttons to give or take a jar by hand.', 'small'));
    var add = el('div'); add.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end';
    var lab = el('label', 'Give a jar to an email not listed'); lab.style.cssText = 'flex:1 1 260px';
    var inp = el('input'); inp.type = 'email'; inp.placeholder = 'name@example.com'; lab.appendChild(inp);
    var go = el('button', 'Give 1 jar', 'ghost'); go.type = 'button'; go.style.cssText = 'padding:10px 18px';
    go.addEventListener('click', function () { var v = inp.value.trim(); if (!v) return; change(v, 1, go); });
    add.appendChild(lab); add.appendChild(go); box.appendChild(add);
    box.appendChild(burnPanel(rows));
    if (!rows.length) { box.appendChild(el('div', 'No customers yet.', 'small')); return; }
    var sc = el('div', null, 'scroll'), t = el('table'), h = el('tr');
    [['Customer', ''], ['Paid orders', 'num'], ['Given by you', 'num'], ['Used', 'num'], ['Burned', 'num'], ['Jars now', 'num'], ['', '']].forEach(function (c) { h.appendChild(el('th', c[0], c[1])); });
    var th = el('thead'); th.appendChild(h); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr'), who = el('td'); who.appendChild(el('div', r.name || '')); who.appendChild(el('div', r.email, 'small')); tr.appendChild(who);
      tr.appendChild(el('td', String(r.earned), 'num')); tr.appendChild(el('td', (r.adj > 0 ? '+' : '') + r.adj, 'num')); tr.appendChild(el('td', String(r.spent), 'num')); tr.appendChild(el('td', String(r.burned || 0), 'num'));
      var now = el('td', null, 'num'), b = el('b', r.jars + ' of ' + need); if (r.jars >= need) b.style.color = '#C9A45C'; now.appendChild(b);
      if (r.opened) now.appendChild(el('div', r.opened + (r.opened === 1 ? ' safe opened' : ' safes opened'), 'small'));
      tr.appendChild(now);
      var act = el('td'); act.style.whiteSpace = 'nowrap';
      [['+1', 1], ['-1', -1]].forEach(function (x) {
        var bt = el('button', x[0], 'ghost'); bt.type = 'button'; bt.style.cssText = 'padding:6px 14px;font-size:14px;margin-right:6px';
        bt.addEventListener('click', function () { change(r.email, x[1], bt); });
        act.appendChild(bt);
      });
      var bb = el('button', 'Burn...', 'ghost'); bb.type = 'button'; bb.style.cssText = 'padding:6px 14px;font-size:14px'; bb.disabled = !(r.jars > 0);
      bb.addEventListener('click', function () {
        var n = prompt('Burn how many of ' + r.email + "'s " + r.jars + ' jars? Burned jars are gone for good.', String(r.jars));
        if (n === null) return; n = Math.floor(Number(n)); if (!(n >= 1)) return;
        var why = prompt('What is it for? (Shown to the customer on My jars)', burnCfg.title || 'Burned by JarFriends'); if (why === null) return;
        bb.disabled = true;
        get('&jarburn=' + encodeURIComponent(r.email) + '&n=' + n + '&why=' + encodeURIComponent(why)).then(function (x) { if (x.error) { bb.disabled = false; alert(x.error); return; } load(); }, function () { bb.disabled = false; alert('Could not reach the site. Try again.'); });
      });
      act.appendChild(bb);
      tr.appendChild(act); tb.appendChild(tr);
    });
    t.appendChild(tb); sc.appendChild(t); box.appendChild(sc);
  }
  // Open or close a burn: while it is open, customers burn their own jars on My jars (in groups of "each").
  var burnCfg = { open: false };
  function burnPanel(rows) {
    var c = el('section', null, 'card'); c.style.cssText = 'display:flex;flex-direction:column;gap:10px;border-color:' + (burnCfg.open ? '#E86A5C' : '#4E7A63');
    c.appendChild(el('b', burnCfg.open ? 'BURN IS OPEN: ' + (burnCfg.title || 'Burn') : 'Burn jars'));
    c.appendChild(el('div', burnCfg.open ? 'Customers can burn their jars on their My jars page right now, ' + burnCfg.each + ' at a time. Close it when you are done.' : 'Open a burn and customers can burn their own jars on their My jars page (for example for your jar NFT). They can leave a wallet address with it. You see every burn below.', 'small'));
    var row = el('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end';
    var mk = function (label, val, w, type) { var l = el('label', label); l.style.cssText = 'flex:1 1 ' + w + ';min-width:0'; var i = el(type === 'area' ? 'textarea' : 'input'); i.value = val; if (type === 'number') { i.type = 'number'; i.min = '1'; } if (type === 'area') { i.rows = 2; i.style.cssText = 'font-family:inherit;font-size:16px;padding:10px 12px;background:#0B1A13;border:1px solid #4E7A63;color:#F7F2E6;border-radius:2px;width:100%;box-sizing:border-box'; } l.appendChild(i); row.appendChild(l); return i; };
    var ti = mk('What the burn is called', burnCfg.title || 'Jar NFT burn', '240px'), ea = mk('Jars per burn', burnCfg.each || 1, '120px', 'number'), no = mk('Message customers see', burnCfg.note || 'Burn your jars to claim the JarFriends jar NFT. Leave your wallet address so we know where to send it.', '100%', 'area');
    var go = el('button', burnCfg.open ? 'Save changes' : 'Open the burn', 'solid'); go.type = 'button'; row.appendChild(go);
    if (burnCfg.open) { var st = el('button', 'Close the burn', 'ghost'); st.type = 'button'; row.appendChild(st); st.addEventListener('click', function () { save(false, st); }); }
    var save = function (open, b) { b.disabled = true; get('&burncfg=save&open=' + (open ? '1' : '0') + '&title=' + encodeURIComponent(ti.value) + '&note=' + encodeURIComponent(no.value) + '&each=' + encodeURIComponent(ea.value)).then(function (x) { if (x.error) { b.disabled = false; alert(x.error); return; } load(); }, function () { b.disabled = false; alert('Could not reach the site. Try again.'); }); };
    go.addEventListener('click', function () { if (!burnCfg.open && !confirm('Open "' + ti.value + '"? Customers can start burning their jars right away.')) return; save(true, go); });
    c.appendChild(row);
    // Every burn so far, newest first.
    var all = []; rows.forEach(function (r) { (r.burns || []).forEach(function (b) { all.push({ email: r.email, n: b.n, at: b.at, why: b.why, wallet: b.wallet, by: b.by }); }); });
    all.sort(function (a, b) { return b.at - a.at; });
    if (all.length) {
      c.appendChild(el('b', 'Burns (' + all.length + ')'));
      all.slice(0, 200).forEach(function (b) { c.appendChild(el('div', new Date(b.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' · ' + b.email + ' · ' + b.n + (b.n === 1 ? ' jar' : ' jars') + ' · ' + (b.why || '') + (b.by === 'owner' ? ' (by you)' : '') + (b.wallet ? ' · wallet ' + b.wallet : ''), 'small')); });
    }
    return c;
  }
  function change(email, by, bt) {
    bt.disabled = true;
    get('&jar=' + encodeURIComponent(email) + '&by=' + by).then(function (r) { if (r.error) { bt.disabled = false; alert(r.error); return; } load(); }, function () { bt.disabled = false; alert('Could not reach the site. Try again.'); });
  }
  btn.addEventListener('click', function () {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none', 'offerWait'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c !== box && c.dataset && c.dataset.extraTab) c.hidden = true; });
    box.hidden = false; load();
  });
})();
