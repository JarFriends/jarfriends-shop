// The Pages tab of the back office: make new pages (headings, text, pictures, buttons) shown at /p/<address>,
// edit or delete them, put them in the site menu, and turn off built-in pages the shop can do without.
(function start() {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return setTimeout(start, 300);
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var post = function (body) { body.ak = key(); return fetch('/api/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); };
  var btn = el('button', 'Pages', 'ghost'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  tabs.insertBefore(btn, $('out'));
  var box = el('div'); box.dataset.extraTab = 'pages'; box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:16px';
  main.insertBefore(box, $('wOrders'));
  var css = el('style');
  css.textContent = '.pg-f{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:700}.pg-f input,.pg-f textarea,.pg-f select{font:inherit;font-weight:400;font-size:15px;padding:10px 12px;background:#0E0F13;border:1px solid #4A4F5E;color:#F7F2E6;border-radius:2px}.pg-f textarea{min-height:110px;resize:vertical;line-height:1.5}'
    + '.pg-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.pg-blk{border:1px solid #244536;padding:12px;display:flex;flex-direction:column;gap:8px}.pg-tag{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.1em;color:#C9A45C}.pg-b{display:inline-block;font-family:"IBM Plex Mono",monospace;font-size:11px;padding:3px 8px;border:1px solid currentColor}';
  document.head.appendChild(css);
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (b && b !== btn && b.id !== 'out') { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); } });
  btn.addEventListener('click', function () {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none', 'offerWait'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c !== box && c.dataset && c.dataset.extraTab) c.hidden = true; });
    var row = tabs.parentElement;
    Array.prototype.forEach.call(main.children, function (c) { if (c !== row && c !== box && !(c.dataset && c.dataset.extraTab) && c.id !== 'tiles' && !c.hidden) { c.hidden = true; c.dataset.pgTucked = '1'; } });
    Array.prototype.forEach.call(row.children, function (c) { if (c !== tabs && !c.hidden) { c.hidden = true; c.dataset.pgTucked = '1'; } });
    box.hidden = false; load();
  });
  tabs.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('button');
    if (!b || b === btn || b.id === 'out') return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-pg-tucked]'), function (c) { c.hidden = false; delete c.dataset.pgTucked; });
  }, true);

  var D = null;
  function load() {
    box.textContent = 'Loading pages…';
    fetch('/api/market?do=pages&ak=' + encodeURIComponent(key()), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) { if (r.error) { box.textContent = r.error; return; } D = r; list(); })
      .catch(function () { box.textContent = 'Could not load the pages. Try again.'; });
  }
  var forget = function () { try { sessionStorage.removeItem('v2vPages'); } catch (e) {} };

  function list() {
    box.textContent = '';
    var top = el('div', null, 'pg-row'); top.style.justifyContent = 'space-between';
    top.appendChild(el('div', 'Make your own pages (an about page, giveaway rules, an event), put them in the site menu, and turn off pages you do not need. To change words, hide parts or add pictures on any page, use the Site editor tab.', 'small'));
    var nw = el('button', '+ New page', 'solid'); nw.type = 'button'; nw.addEventListener('click', function () { edit(null); });
    top.appendChild(nw); box.appendChild(top);

    box.appendChild(el('div', 'YOUR PAGES', 'mono gold'));
    if (!D.pages.length) box.appendChild(el('div', 'No pages yet. Press "+ New page" to make one.', 'small dim'));
    D.pages.forEach(function (p) {
      var c = el('section', null, 'card'); c.style.gap = '8px';
      var h = el('div', null, 'pg-row'); h.appendChild(el('b', p.title));
      var st = el('span', p.live ? 'PUBLISHED' : 'DRAFT', 'pg-b'); st.style.color = p.live ? '#7DD3B0' : '#E8A0A0'; h.appendChild(st);
      if (p.menu) { var mn = el('span', 'IN MENU', 'pg-b'); mn.style.color = '#C9A45C'; h.appendChild(mn); }
      c.appendChild(h);
      c.appendChild(el('div', 'veefam.io/p/' + p.slug, 'small dim'));
      var a = el('div', null, 'pg-row');
      var e = el('button', 'Edit', 'ghost'); e.type = 'button'; e.addEventListener('click', function () { edit(p); });
      var v = el('a', 'View page', 'small'); v.href = '/p/' + p.slug; v.target = '_blank'; v.rel = 'noopener';
      var d = el('button', 'Delete', 'ghost'); d.type = 'button';
      d.addEventListener('click', function () { if (!confirm('Delete the page "' + p.title + '"? This cannot be undone.')) return; post({ do: 'page-delete', slug: p.slug }).then(function () { forget(); load(); }); });
      [e, v, d].forEach(function (x) { a.appendChild(x); }); c.appendChild(a);
      box.appendChild(c);
    });

    box.appendChild(el('div', 'SITE PAGES', 'mono gold'));
    box.appendChild(el('div', 'Turn off a page to take it off the site: its links disappear and visitors who open it go to the home page. You can turn it back on any time. Pages that keep the shop working (home, checkout, accounts, Seller Hub, Terms) stay on, but you can still change them with the Site editor.', 'small'));
    var sc = el('section', null, 'card'); sc.style.gap = '10px';
    Object.keys(D.optional).forEach(function (pth) {
      var off = D.off.indexOf(pth) >= 0;
      var r = el('div', null, 'pg-row'); r.style.justifyContent = 'space-between';
      var l = el('div'); l.appendChild(el('b', D.optional[pth])); l.appendChild(el('span', '  ' + pth + (off ? ' · OFF' : ' · on'), 'small dim'));
      var acts = el('div', null, 'pg-row');
      var ed = el('a', 'Edit with Site editor', 'small'); ed.href = pth + '?edit=1'; ed.target = '_blank'; ed.rel = 'noopener';
      var t = el('button', off ? 'Turn on' : 'Turn off', off ? 'solid' : 'ghost'); t.type = 'button';
      t.addEventListener('click', function () { t.disabled = true; post({ do: 'page-off', path: pth, off: !off }).then(function (x) { if (x.error) { alert(x.error); t.disabled = false; return; } forget(); load(); }); });
      acts.appendChild(ed); acts.appendChild(t); r.appendChild(l); r.appendChild(acts); sc.appendChild(r);
    });
    box.appendChild(sc);
  }

  function edit(p) {
    var page = p ? JSON.parse(JSON.stringify(p)) : { title: '', slug: '', blocks: [{ type: 'text', text: '' }], menu: false, live: true };
    var was = p ? p.slug : '';
    box.textContent = '';
    var back = el('button', '← All pages', 'ghost'); back.type = 'button'; back.style.alignSelf = 'flex-start'; back.addEventListener('click', load); box.appendChild(back);
    box.appendChild(el('h2', p ? 'Edit page' : 'New page'));
    var c = el('section', null, 'card'); c.style.gap = '12px';
    var tl = el('label', null, 'pg-f'); tl.appendChild(el('span', 'Page title')); var ti = el('input'); ti.maxLength = 120; ti.value = page.title; ti.placeholder = 'About V2V'; tl.appendChild(ti); c.appendChild(tl);
    var sl = el('label', null, 'pg-f'); sl.appendChild(el('span', 'Address: veefam.io/p/…')); var si = el('input'); si.maxLength = 50; si.value = page.slug; si.placeholder = 'about'; sl.appendChild(si); c.appendChild(sl);
    var auto = !page.slug;
    ti.addEventListener('input', function () { page.title = ti.value; if (auto) { si.value = ti.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50); } });
    si.addEventListener('input', function () { auto = false; });
    var ck = el('div', null, 'pg-row');
    var lv = el('label', null, 'jf-check'); var lvc = el('input'); lvc.type = 'checkbox'; lvc.checked = page.live; lv.appendChild(lvc); lv.appendChild(el('span', 'Published (anyone can see it)'));
    var mn = el('label', null, 'jf-check'); var mnc = el('input'); mnc.type = 'checkbox'; mnc.checked = page.menu; mn.appendChild(mnc); mn.appendChild(el('span', 'Show it in the site menu'));
    ck.appendChild(lv); ck.appendChild(mn); c.appendChild(ck);
    box.appendChild(c);

    box.appendChild(el('div', 'WHAT IS ON THE PAGE', 'mono gold'));
    var bl = el('div'); bl.style.cssText = 'display:flex;flex-direction:column;gap:10px'; box.appendChild(bl);
    var msg = el('div', '', 'small'); msg.setAttribute('role', 'status');
    function drawBlocks() {
      bl.textContent = '';
      if (!page.blocks.length) bl.appendChild(el('div', 'Nothing on the page yet. Add a heading, text, a picture or a button below.', 'small dim'));
      page.blocks.forEach(function (b, i) {
        var w = el('div', null, 'pg-blk');
        var h = el('div', null, 'pg-row'); h.style.justifyContent = 'space-between';
        h.appendChild(el('span', { heading: 'HEADING', text: 'TEXT', image: 'PICTURE', button: 'BUTTON' }[b.type], 'pg-tag'));
        var mv = el('div', null, 'pg-row');
        var up = el('button', '↑', 'ghost'); up.type = 'button'; up.title = 'Move up'; up.disabled = i === 0; up.addEventListener('click', function () { page.blocks.splice(i - 1, 0, page.blocks.splice(i, 1)[0]); drawBlocks(); });
        var dn = el('button', '↓', 'ghost'); dn.type = 'button'; dn.title = 'Move down'; dn.disabled = i === page.blocks.length - 1; dn.addEventListener('click', function () { page.blocks.splice(i + 1, 0, page.blocks.splice(i, 1)[0]); drawBlocks(); });
        var rm = el('button', 'Remove', 'ghost'); rm.type = 'button'; rm.addEventListener('click', function () { page.blocks.splice(i, 1); drawBlocks(); });
        [up, dn, rm].forEach(function (x) { mv.appendChild(x); }); h.appendChild(mv); w.appendChild(h);
        var field = function (label, k, ta, ph) { var l = el('label', null, 'pg-f'); l.appendChild(el('span', label)); var x = el(ta ? 'textarea' : 'input'); x.value = b[k] || ''; if (ph) x.placeholder = ph; x.addEventListener('input', function () { b[k] = x.value; }); l.appendChild(x); w.appendChild(l); return x; };
        if (b.type === 'heading') field('Heading', 'text', false, 'A section title');
        if (b.type === 'text') field('Text', 'text', true, 'Write here. Press Enter for a new line.');
        if (b.type === 'button') { field('Button words', 'text', false, 'Shop now'); field('Where it goes', 'link', false, '/ or https://…'); }
        if (b.type === 'image') {
          if (b.url) { var im = el('img'); im.src = b.url; im.alt = ''; im.style.cssText = 'max-width:240px;border-radius:4px'; w.appendChild(im); }
          var fl = el('label', null, 'pg-f'); fl.appendChild(el('span', b.url ? 'Change the picture' : 'Choose a picture')); var f = el('input'); f.type = 'file'; f.accept = 'image/*'; fl.appendChild(f); w.appendChild(fl);
          f.addEventListener('change', function () { var file = f.files && f.files[0]; if (!file) return; msg.textContent = 'Uploading the picture…'; upload(file).then(function (r) { if (r.error) { msg.textContent = r.error; return; } b.url = r.url; msg.textContent = 'Picture added.'; drawBlocks(); }).catch(function () { msg.textContent = 'That picture could not be used.'; }); });
          var sz = el('label', null, 'pg-f'); sz.appendChild(el('span', 'Size')); var s = el('select'); [['full', 'Full width'], ['medium', 'Medium'], ['small', 'Small']].forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; s.appendChild(op); }); s.value = b.size || 'full'; s.addEventListener('change', function () { b.size = s.value; }); sz.appendChild(s); w.appendChild(sz);
          field('Optional: where tapping it goes', 'link', false, '/ or https://…');
          field('Optional: describe the picture', 'alt', false, 'For screen readers');
        }
        bl.appendChild(w);
      });
    }
    drawBlocks();
    var add = el('div', null, 'pg-row');
    [['heading', '+ Heading'], ['text', '+ Text'], ['image', '+ Picture'], ['button', '+ Button']].forEach(function (x) {
      var b = el('button', x[1], 'ghost'); b.type = 'button'; b.addEventListener('click', function () { page.blocks.push({ type: x[0] }); drawBlocks(); }); add.appendChild(b);
    });
    box.appendChild(add);
    var acts = el('div', null, 'pg-row');
    var sv = el('button', 'Save page', 'solid'); sv.type = 'button';
    sv.addEventListener('click', function () {
      sv.disabled = true; msg.textContent = 'Saving…';
      post({ do: 'page-save', was: was, title: ti.value, slug: si.value, live: lvc.checked, menu: mnc.checked, blocks: page.blocks.filter(function (b) { return b.type !== 'image' || b.url; }) }).then(function (r) {
        sv.disabled = false;
        if (r.error) { msg.textContent = r.error; return; }
        forget(); was = r.page.slug; si.value = r.page.slug; auto = false;
        msg.textContent = ''; msg.appendChild(document.createTextNode('Saved. ')); var v = el('a', 'View the page'); v.href = '/p/' + r.page.slug; v.target = '_blank'; v.rel = 'noopener'; msg.appendChild(v);
      }).catch(function () { sv.disabled = false; msg.textContent = 'Could not save. Try again.'; });
    });
    acts.appendChild(sv); acts.appendChild(msg); box.appendChild(acts);
  }
  // Pictures are made smaller on this device first (at most 1600 pixels, as a JPEG), then saved with the site.
  function upload(file) {
    return new Promise(function (ok, no) {
      var im = new Image(), u = URL.createObjectURL(file);
      im.onload = function () {
        var s = Math.min(1, 1600 / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * s); cv.height = Math.round(im.height * s);
        var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(u);
        post({ do: 'site-photo', data: cv.toDataURL('image/jpeg', 0.85) }).then(ok, no);
      };
      im.onerror = no; im.src = u;
    });
  }
})();
