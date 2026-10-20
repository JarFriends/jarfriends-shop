// The Wording tab of the back office: change any words on the site's pages. Each change is "where it says this,
// say that instead", for every page or just one page. nav.js swaps the words on every page as it shows them.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return setTimeout(arguments.callee, 300);
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var post = function (body) { body.ak = key(); return fetch('/api/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); };
  var PAGES = [['', 'Every page'], ['/', 'Home page'], ['/seller.html', 'Seller Hub'], ['/me.html', 'My account'], ['/order.html', 'Checkout'], ['/giveaway.html', 'Giveaway'], ['/sold.html', 'Sold prices'], ['/market.html', 'Shops and sellers'], ['/shop.html', 'A seller’s shop page'], ['/terms.html', 'Terms of Service']];
  var btn = el('button', 'Wording', 'ghost'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  tabs.insertBefore(btn, $('out'));
  var box = el('div'); box.dataset.extraTab = 'wording'; box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:16px';
  main.insertBefore(box, $('wOrders'));
  var css = el('style');
  css.textContent = '.wd-f{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:700;flex:1 1 260px}.wd-f textarea,.wd-f select,.wd-f input{font:inherit;font-weight:400;font-size:15px;padding:10px 12px;background:#0E0F13;border:1px solid #4A4F5E;color:#F7F2E6;border-radius:2px}.wd-f textarea{min-height:70px;resize:vertical;line-height:1.45}'
    + '.wd-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}.wd-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.wd-off{opacity:.55}';
  document.head.appendChild(css);
  // Hide this tab when another tab is chosen; hide the order tools while it is open.
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (b && b !== btn && b.id !== 'out') { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); } });
  btn.addEventListener('click', function () {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none', 'offerWait'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c !== box && c.dataset && c.dataset.extraTab) c.hidden = true; });
    var row = tabs.parentElement;
    Array.prototype.forEach.call(main.children, function (c) { if (c !== row && c !== box && !(c.dataset && c.dataset.extraTab) && c.id !== 'tiles' && !c.hidden) { c.hidden = true; c.dataset.wdTucked = '1'; } });
    Array.prototype.forEach.call(row.children, function (c) { if (c !== tabs && !c.hidden) { c.hidden = true; c.dataset.wdTucked = '1'; } });
    box.hidden = false; load();
  });
  tabs.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('button');
    if (!b || b === btn || b.id === 'out') return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-wd-tucked]'), function (c) { c.hidden = false; delete c.dataset.wdTucked; });
  }, true);

  var rules = [];
  function load() {
    box.textContent = 'Loading…';
    fetch('/api/market?do=wording&fresh=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) { rules = (r.rules || []).map(function (x) { return Object.assign({}, x); }); draw(); })
      .catch(function () { box.textContent = 'Could not load the wording. Try again.'; });
  }
  var msg = el('div', '', 'small'); msg.setAttribute('role', 'status');
  function draw() {
    box.textContent = '';
    var intro = el('section', null, 'card'); intro.style.gap = '8px';
    intro.appendChild(el('b', 'Change any words on the site'));
    intro.appendChild(el('div', 'Copy the words exactly as you see them on the page into "Where it says", then type what it should say instead. Pick one page or every page. Press Save all, then refresh the page to see it (give it up to a minute).', 'small'));
    intro.appendChild(el('div', 'Tips: words in a different style (bold, a link, a button) count as their own piece, so change them on their own. Leave "Say instead" empty to remove the words. Prices, names and amounts that change by themselves are best left alone.', 'small dim'));
    box.appendChild(intro);
    var list = el('div'); list.style.cssText = 'display:flex;flex-direction:column;gap:12px';
    if (!rules.length) list.appendChild(el('div', 'No changes yet. Press "Add a change" to start.', 'small dim'));
    rules.forEach(function (r, i) { list.appendChild(card(r, i)); });
    box.appendChild(list);
    var bar = el('div', null, 'wd-acts');
    var add = el('button', '+ Add a change', 'ghost'); add.type = 'button';
    add.addEventListener('click', function () { rules.push({ from: '', to: '', page: '' }); draw(); var ts = box.querySelectorAll('textarea'); if (ts.length) ts[ts.length - 2].focus(); });
    var save = el('button', 'Save all', 'solid'); save.type = 'button';
    save.addEventListener('click', function () {
      save.disabled = true; msg.textContent = 'Saving…';
      post({ do: 'wording-save', rules: rules }).then(function (r) {
        save.disabled = false;
        if (r.error) { msg.textContent = r.error; return; }
        rules = r.rules; try { sessionStorage.removeItem('v2vWording'); } catch (e) {}
        msg.textContent = 'Saved. Refresh any page to see your words (it can take up to a minute).'; draw();
      }).catch(function () { save.disabled = false; msg.textContent = 'Could not save. Try again.'; });
    });
    bar.appendChild(add); bar.appendChild(save); bar.appendChild(msg);
    box.appendChild(bar);
  }
  function card(r, i) {
    var c = el('section', null, 'card' + (r.off ? ' wd-off' : '')); c.style.gap = '10px';
    var row = el('div', null, 'wd-row');
    var f1 = el('label', null, 'wd-f'); f1.appendChild(el('span', 'Where it says')); var a = el('textarea'); a.value = r.from || ''; a.placeholder = 'Collectibles from collectors'; f1.appendChild(a);
    var f2 = el('label', null, 'wd-f'); f2.appendChild(el('span', 'Say instead')); var b = el('textarea'); b.value = r.to || ''; b.placeholder = 'Your words'; f2.appendChild(b);
    a.addEventListener('input', function () { r.from = a.value; }); b.addEventListener('input', function () { r.to = b.value; });
    row.appendChild(f1); row.appendChild(f2); c.appendChild(row);
    var acts = el('div', null, 'wd-acts');
    var pl = el('label', null, 'wd-f'); pl.style.cssText = 'flex:0 1 220px;flex-direction:row;align-items:center;gap:8px'; pl.appendChild(el('span', 'On'));
    var sel = el('select'); PAGES.forEach(function (p) { var o = el('option', p[1]); o.value = p[0]; sel.appendChild(o); });
    if (r.page && !PAGES.some(function (p) { return p[0] === r.page; })) { var o = el('option', r.page); o.value = r.page; sel.appendChild(o); }
    sel.value = r.page || ''; sel.addEventListener('change', function () { r.page = sel.value; }); pl.appendChild(sel);
    acts.appendChild(pl);
    var onoff = el('button', r.off ? 'Turn on' : 'Turn off', 'ghost'); onoff.type = 'button';
    onoff.addEventListener('click', function () { r.off = !r.off; draw(); msg.textContent = 'Press Save all to keep this.'; });
    var ai = el('button', 'Edit with AI', 'ghost'); ai.type = 'button';
    var out = el('div', '', 'small');
    ai.addEventListener('click', function () {
      var text = b.value || a.value; if (!text.trim()) { out.textContent = 'Write something first.'; return; }
      ai.disabled = true; out.textContent = 'AI is editing…';
      post({ do: 'email-ai', text: text, how: 'Keep it short and clear, the same length or shorter. It is wording on a web page.', about: 'words on the V2V collectibles marketplace website (veefam.io)' }).then(function (x) {
        ai.disabled = false;
        if (x.error) { out.textContent = x.error; return; }
        out.textContent = ''; out.appendChild(el('div', 'AI suggestion: ' + x.text));
        var use = el('button', 'Use it', 'solid'); use.type = 'button'; use.addEventListener('click', function () { b.value = x.text; r.to = x.text; out.textContent = 'Swapped in. Press Save all to keep it.'; });
        out.appendChild(use);
      }).catch(function () { ai.disabled = false; out.textContent = 'AI could not be reached. Try again.'; });
    });
    var view = el('a', 'View page', ''); view.href = r.page || '/'; view.target = '_blank'; view.rel = 'noopener'; view.className = 'small';
    var del = el('button', 'Delete', 'ghost'); del.type = 'button';
    del.addEventListener('click', function () { rules.splice(i, 1); draw(); msg.textContent = 'Removed. Press Save all to keep this.'; });
    [onoff, ai, view, del].forEach(function (x) { acts.appendChild(x); });
    c.appendChild(acts); c.appendChild(out);
    return c;
  }
})();
